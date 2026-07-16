import type { GameContent } from '../../content/catalog';
import { resolveAttack, type Combatant } from '../../core/combat';
import type { DomainEvent } from '../../core/events';
import {
  addItem,
  type InventoryState,
  type ItemDefinition,
} from '../../core/inventory';
import { applyDeathPenalty, applyExperience } from '../../core/progression';
import { advanceQuest, type QuestCatalog } from '../../core/quests';
import { SeededRng } from '../../core/rng';
import { deriveStats } from '../../core/stats';
import type { SaveGameV1 } from '../../storage/saveSchema';
import {
  respawnEligibleMonsters,
  rollDrops,
  spawnMonsters,
  tickMonsterAI,
  type GroundLoot,
  type MonsterState,
  type MonsterWorldState,
} from '../../world/ai';
import { TileGrid } from '../../world/grid';
import { findPath } from '../../world/pathfinding';
import type { PlayerCommand } from './InputController';

const FIXED_STEP_MS = 50;
const MAX_FRAME_DELTA_MS = 250;
const PLAYER_ATTACK_COOLDOWN_MS = 500;
const MONSTER_AI_INTERVAL_MS = 500;

export interface WorldControllerOptions {
  readonly content: GameContent;
  readonly save: SaveGameV1;
  readonly grids?: ReadonlyMap<string, TileGrid>;
  readonly monsters?: readonly MonsterState[];
  readonly seed?: number;
}

export interface WorldSnapshot {
  readonly player: SaveGameV1['world']['player'];
  readonly character: SaveGameV1['character'];
  readonly inventory: InventoryState;
  readonly quests: SaveGameV1['quests'];
  readonly monsters: readonly MonsterState[];
  readonly groundLoot: readonly GroundLoot[];
  readonly worldTimeMs: number;
  readonly autoAttackTargetId: string | null;
}

const distance = (
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): number => Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

const openGridFor = (content: GameContent, mapId: string): TileGrid => {
  const map = content.map(mapId);
  return TileGrid.fromBlockedRectangles(map.width, map.height, []);
};

export class WorldController {
  readonly #content: GameContent;
  readonly #grids: ReadonlyMap<string, TileGrid>;
  readonly #rng: SeededRng;
  readonly #dropSeed: number;
  readonly #questCatalog: QuestCatalog;
  #character: SaveGameV1['character'];
  #inventory: InventoryState;
  #quests: SaveGameV1['quests'];
  #player: SaveGameV1['world']['player'];
  #defeatedBosses: readonly string[];
  #flags: Readonly<Record<string, boolean>>;
  #monsters: MonsterState[];
  #groundLoot: GroundLoot[] = [];
  #events: DomainEvent[] = [];
  #movementPath: readonly { readonly x: number; readonly y: number }[] = [];
  #pendingExit: {
    readonly x: number;
    readonly y: number;
    readonly targetMapId: string;
    readonly targetX: number;
    readonly targetY: number;
  } | null = null;
  #autoAttackTargetId: string | null = null;
  #accumulatorMs = 0;
  #worldTimeMs: number;
  #nextPlayerAttackAtMs = 0;
  #nextMonsterAITickAtMs = MONSTER_AI_INTERVAL_MS;
  #paused = false;
  #fixedStepCount = 0;

  constructor(options: WorldControllerOptions) {
    this.#content = options.content;
    this.#character = { ...options.save.character };
    this.#inventory = {
      ...options.save.inventory,
      stacks: options.save.inventory.stacks.map((stack) => ({ ...stack })),
    };
    this.#quests = options.save.quests;
    this.#player = { ...options.save.world.player };
    this.#defeatedBosses = [...options.save.world.defeatedBosses];
    this.#flags = { ...options.save.world.flags };
    this.#worldTimeMs = options.save.world.worldTimeMs;
    this.#grids = options.grids ?? new Map();
    this.#dropSeed = options.seed ?? 7;
    this.#rng = new SeededRng(options.seed ?? 20260717);
    this.#questCatalog = Object.fromEntries(
      options.content.quests.map((quest) => [quest.id, quest]),
    );
    const map = options.content.map(this.#player.mapId);
    this.#monsters = [
      ...(options.monsters ?? spawnMonsters(map, options.content.monsters)),
    ].map((monster) => ({ ...monster }));
  }

  get fixedStepCount(): number {
    return this.#fixedStepCount;
  }

  get snapshot(): WorldSnapshot {
    return {
      player: { ...this.#player },
      character: { ...this.#character, attributes: { ...this.#character.attributes } },
      inventory: {
        ...this.#inventory,
        stacks: this.#inventory.stacks.map((stack) => ({ ...stack })),
      },
      quests: this.#quests,
      monsters: this.#monsters.map((monster) => ({ ...monster })),
      groundLoot: this.#groundLoot.map((loot) => ({ ...loot })),
      worldTimeMs: this.#worldTimeMs,
      autoAttackTargetId: this.#autoAttackTargetId,
    };
  }

  setPaused(paused: boolean): void {
    this.#paused = paused;
    if (paused) this.#accumulatorMs = 0;
  }

  dispatch(command: PlayerCommand): void {
    switch (command.type) {
      case 'move':
        this.#autoAttackTargetId = null;
        this.#pendingExit =
          this.#content
            .map(this.#player.mapId)
            .exits.find(({ x, y }) => x === command.x && y === command.y) ?? null;
        this.#movementPath = this.#pathTo(command);
        break;
      case 'attack':
        this.#autoAttackTargetId = command.targetId;
        this.#movementPath = [];
        this.#pendingExit = null;
        break;
      case 'interact':
        this.#pickUp(command.targetId);
        break;
      case 'toggle-target':
        this.#toggleTarget();
        break;
      case 'use-quick-slot':
      case 'toggle-panel':
      case 'escape':
      case 'adjust-scale':
        break;
    }
  }

  update(deltaMs: number): void {
    if (this.#paused || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.#accumulatorMs += Math.min(deltaMs, MAX_FRAME_DELTA_MS);
    while (this.#accumulatorMs >= FIXED_STEP_MS) {
      this.#accumulatorMs -= FIXED_STEP_MS;
      this.#step();
    }
  }

  drainEvents(): DomainEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  #grid(): TileGrid {
    return this.#grids.get(this.#player.mapId) ?? openGridFor(this.#content, this.#player.mapId);
  }

  #pathTo(target: Readonly<{ x: number; y: number }>): readonly { x: number; y: number }[] {
    const map = this.#content.map(this.#player.mapId);
    const path = findPath(this.#grid(), this.#player, target).slice(1);
    if (this.#pendingExit !== null) return path;
    const exitIndex = path.findIndex((point) =>
      map.exits.some(({ x, y }) => x === point.x && y === point.y),
    );
    return exitIndex < 0 ? path : path.slice(0, exitIndex);
  }

  #step(): void {
    this.#fixedStepCount += 1;
    this.#worldTimeMs += FIXED_STEP_MS;
    this.#stepPlayer();
    if (this.#worldTimeMs >= this.#nextMonsterAITickAtMs) {
      this.#nextMonsterAITickAtMs = this.#worldTimeMs + MONSTER_AI_INTERVAL_MS;
      this.#stepMonsters();
    }
    this.#respawnMonsters();
  }

  #stepPlayer(): void {
    if (this.#autoAttackTargetId === null) {
      this.#moveOneStep();
      return;
    }

    const target = this.#monsters.find(
      (monster) => monster.id === this.#autoAttackTargetId && monster.hp > 0,
    );
    if (target === undefined || target.mapId !== this.#player.mapId) {
      this.#autoAttackTargetId = null;
      return;
    }
    if (distance(this.#player, target) > 1) {
      const path = findPath(this.#grid(), this.#player, target);
      const next = path[1];
      if (next !== undefined && path.length > 2) this.#player = { ...this.#player, ...next };
      return;
    }
    if (this.#worldTimeMs < this.#nextPlayerAttackAtMs) return;
    this.#nextPlayerAttackAtMs = this.#worldTimeMs + PLAYER_ATTACK_COOLDOWN_MS;
    this.#attackMonster(target);
  }

  #moveOneStep(): void {
    const next = this.#movementPath[0];
    if (next === undefined) return;
    this.#player = { ...this.#player, ...next };
    this.#movementPath = this.#movementPath.slice(1);
    if (
      this.#movementPath.length === 0 &&
      this.#pendingExit?.x === this.#player.x &&
      this.#pendingExit.y === this.#player.y
    ) {
      this.#transitionThroughPendingExit();
    }
  }

  #transitionThroughPendingExit(): void {
    const exit = this.#pendingExit;
    this.#pendingExit = null;
    if (exit === null) return;
    const targetGrid =
      this.#grids.get(exit.targetMapId) ?? openGridFor(this.#content, exit.targetMapId);
    if (!targetGrid.isWalkable({ x: exit.targetX, y: exit.targetY })) return;
    this.#player = {
      mapId: exit.targetMapId,
      x: exit.targetX,
      y: exit.targetY,
    };
    this.#monsters = [
      ...spawnMonsters(this.#content.map(exit.targetMapId), this.#content.monsters),
    ];
    this.#quests = advanceQuest(
      this.#quests,
      { type: 'area-entered', mapId: exit.targetMapId },
      this.#questCatalog,
    );
  }

  #attackMonster(monster: MonsterState): void {
    const stats = deriveStats(this.#character);
    const definition = this.#content.monster(monster.monsterId);
    const damageBonus = Math.max(1, stats.damageBonus);
    const attacker: Combatant = {
      id: this.#character.id,
      hp: this.#character.hp,
      maxHP: stats.maxHP,
      ac: stats.ac,
      hitBonus: stats.hitBonus,
      damage: [damageBonus, damageBonus + 3],
    };
    const target: Combatant = {
      id: monster.id,
      hp: monster.hp,
      maxHP: monster.maxHP,
      ac: definition.ac,
      hitBonus: definition.level,
      damage: [definition.attack, definition.attack],
    };
    const result = resolveAttack(attacker, target, this.#rng);
    this.#events.push(...result.events);
    this.#monsters = this.#monsters.map((candidate) =>
      candidate.id === monster.id ? { ...candidate, hp: result.target.hp } : candidate,
    );
    if (result.target.hp === 0) this.#defeatMonster(monster);
  }

  #defeatMonster(monster: MonsterState): void {
    const definition = this.#content.monster(monster.monsterId);
    this.#monsters = this.#monsters.map((candidate) =>
      candidate.id === monster.id
        ? {
            ...candidate,
            hp: 0,
            aiState: 'dead',
            defeatedAtMs: this.#worldTimeMs,
            defeatedMapEntry: 0,
          }
        : candidate,
    );
    this.#autoAttackTargetId = null;
    const drops = rollDrops(definition.drops, new SeededRng(this.#dropSeed));
    this.#groundLoot.push(
      ...drops.map((drop, index) => ({
        ...drop,
        id: `${monster.id}:loot:${String(index)}:${drop.itemId}`,
        mapId: monster.mapId,
        x: monster.x,
        y: monster.y,
      })),
    );
    const progression = applyExperience(this.#character, definition.experience);
    this.#character = progression.character;
    this.#events.push(...progression.events);
    this.#quests = advanceQuest(
      this.#quests,
      { type: 'monster-defeated', monsterId: monster.monsterId, count: 1 },
      this.#questCatalog,
    );
    if (monster.monsterId === 'baphomet') {
      this.#defeatedBosses = [...new Set([...this.#defeatedBosses, 'baphomet'])];
      this.#flags = { ...this.#flags, baphometDefeated: true };
    }
  }

  #stepMonsters(): void {
    const grid = this.#grid();
    const playerTarget = {
      id: this.#character.id,
      x: this.#player.x,
      y: this.#player.y,
      hp: this.#character.hp,
    };
    this.#monsters = this.#monsters.map((monster) => {
      if (monster.mapId !== this.#player.mapId) return monster;
      const result = tickMonsterAI(monster, playerTarget, grid, this.#worldTimeMs, this.#rng);
      if (result.intent.type === 'move') {
        return { ...result.monster, x: result.intent.x, y: result.intent.y };
      }
      if (result.intent.type === 'attack') this.#attackPlayer(result.monster);
      return result.monster;
    });
  }

  #attackPlayer(monster: MonsterState): void {
    const definition = this.#content.monster(monster.monsterId);
    const stats = deriveStats(this.#character);
    const result = resolveAttack(
      {
        id: monster.id,
        hp: monster.hp,
        maxHP: monster.maxHP,
        ac: definition.ac,
        hitBonus: definition.level,
        damage: [definition.attack, definition.attack],
      },
      {
        id: this.#character.id,
        hp: this.#character.hp,
        maxHP: stats.maxHP,
        ac: stats.ac,
        hitBonus: stats.hitBonus,
        damage: [1, 1],
      },
      this.#rng,
    );
    this.#character = { ...this.#character, hp: result.target.hp };
    this.#events.push(...result.events);
    if (result.target.hp === 0) this.#respawnPlayer();
  }

  #respawnPlayer(): void {
    const map = this.#content.map(this.#player.mapId);
    const penalized = applyDeathPenalty(this.#character);
    this.#character = { ...penalized, hp: deriveStats(penalized).maxHP };
    this.#player = { mapId: map.id, x: map.entry.x, y: map.entry.y };
    this.#autoAttackTargetId = null;
    this.#movementPath = [];
    this.#pendingExit = null;
  }

  #respawnMonsters(): void {
    const world: MonsterWorldState = {
      player: this.#player,
      defeatedBosses: this.#defeatedBosses,
      flags: this.#flags,
      worldTimeMs: this.#worldTimeMs,
      monsters: this.#monsters,
      mapEntryCounts: { [this.#player.mapId]: 1 },
    };
    const eligible = new Map(
      respawnEligibleMonsters(world, this.#worldTimeMs).map((monster) => [monster.id, monster]),
    );
    if (eligible.size > 0) {
      this.#monsters = this.#monsters.map((monster) => eligible.get(monster.id) ?? monster);
    }
  }

  #pickUp(targetId: string): void {
    const loot = this.#groundLoot.find(({ id }) => id === targetId);
    if (loot === undefined || loot.mapId !== this.#player.mapId || distance(loot, this.#player) > 1) {
      return;
    }
    const contentItem = this.#content.item(loot.itemId);
    const item: ItemDefinition = {
      id: contentItem.id,
      name: contentItem.name,
      kind: contentItem.kind,
      weight: contentItem.weight,
      stackLimit: contentItem.stackLimit,
      buyPrice: contentItem.buyPrice,
      sellPrice: contentItem.sellPrice,
      allowedClasses: contentItem.allowedClasses,
      ...(contentItem.equipmentSlot === undefined
        ? {}
        : { equipmentSlot: contentItem.equipmentSlot }),
      ...(contentItem.healAmount === undefined ? {} : { healAmount: contentItem.healAmount }),
    };
    const result = addItem(this.#inventory, item, loot.quantity);
    if (!result.ok) return;
    this.#inventory = result.inventory;
    this.#character = { ...this.#character, carriedWeight: result.inventory.carriedWeight };
    this.#groundLoot = this.#groundLoot.filter(({ id }) => id !== targetId);
  }

  #toggleTarget(): void {
    const living = this.#monsters
      .filter((monster) => monster.mapId === this.#player.mapId && monster.hp > 0)
      .sort((left, right) => distance(this.#player, left) - distance(this.#player, right));
    if (living.length === 0) {
      this.#autoAttackTargetId = null;
      return;
    }
    const current = living.findIndex(({ id }) => id === this.#autoAttackTargetId);
    this.#autoAttackTargetId = living[(current + 1) % living.length]?.id ?? null;
  }
}
