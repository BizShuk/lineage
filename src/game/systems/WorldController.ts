import type { GameContent } from '../../content/catalog';
import {
  applyAbilityEffect,
  castAbility,
  resolveAttack,
  type AbilityDefinition as CombatAbilityDefinition,
  type AbilityFailureReason,
  type Combatant,
  type StatusEffect,
} from '../../core/combat';
import type { DomainEvent } from '../../core/events';
import {
  addItem,
  consumeAmmunition,
  type EquipmentState,
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
  readonly world: SaveGameV1['world'];
  readonly character: SaveGameV1['character'];
  readonly inventory: InventoryState;
  readonly equipment: EquipmentState;
  readonly quests: SaveGameV1['quests'];
  readonly monsters: readonly MonsterState[];
  readonly groundLoot: readonly GroundLoot[];
  readonly worldTimeMs: number;
  readonly autoAttackTargetId: string | null;
  readonly playerStatuses: readonly StatusEffect[];
}

export type WorldPersistenceEvent = 'map-change' | 'quest-stage' | 'death-respawn';

export type WorldActionFailureReason =
  | AbilityFailureReason
  | 'ability-not-found'
  | 'target-not-found'
  | 'invalid-target'
  | 'required-equipment';

export type WorldActionResult =
  | { readonly ok: true; readonly events: readonly DomainEvent[] }
  | {
      readonly ok: false;
      readonly reason: WorldActionFailureReason;
      readonly events: readonly DomainEvent[];
    };

const distance = (
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): number => Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

const openGridFor = (content: GameContent, mapId: string): TileGrid => {
  const map = content.map(mapId);
  return TileGrid.fromBlockedRectangles(map.width, map.height, []);
};

const combatAbility = (
  ability: GameContent['abilities'][number],
  powerBonus = 0,
): CombatAbilityDefinition => ({
  id: ability.id,
  allowedClasses: ability.allowedClasses,
  minLevel: ability.unlockLevel,
  mpCost: ability.manaCost,
  range: ability.target === 'self' ? 0 : 8,
  cooldownMs: ability.cooldownMs,
  ...(ability.reagentItemId === undefined
    ? {}
    : { requiredItemId: ability.reagentItemId }),
  effect:
    ability.id === 'cure-poison'
      ? { type: 'cleanse' }
      : ability.kind === 'attack'
        ? {
            type: 'damage',
            damage: [
              Math.round(ability.power + powerBonus),
              Math.round(ability.power + powerBonus),
            ],
          }
      : ability.kind === 'heal'
        ? {
            type: 'heal',
            healing: [
              Math.round(ability.power + powerBonus),
              Math.round(ability.power + powerBonus),
            ],
          }
        : {
            type: ability.kind === 'control' ? 'control' : 'buff',
            statusId: ability.id,
            durationMs: ability.durationMs ?? 1_000,
            power: ability.power,
          },
});

const activeStatuses = (
  statuses: readonly StatusEffect[],
  nowMs: number,
): readonly StatusEffect[] => statuses.filter(({ expiresAt }) => expiresAt > nowMs);

const statusPower = (
  statuses: readonly StatusEffect[],
  ids: ReadonlySet<string>,
): number =>
  statuses.reduce(
    (total, status) => total + (ids.has(status.id) ? (status.power ?? 0) : 0),
    0,
  );

const DEFENSE_STATUS_IDS = new Set(['shield', 'blessed-armor', 'guarded-stance']);
const HIT_STATUS_IDS = new Set(['royal-rally']);
const WEAPON_STATUS_IDS = new Set(['enchanted-weapon', 'holy-weapon']);
const SPELL_STATUS_IDS = new Set(['mana-focus']);
const VULNERABILITY_STATUS_IDS = new Set(['royal-command', 'elemental-fall-down']);

const vulnerabilityPower = (statuses: readonly StatusEffect[]): number =>
  statuses.reduce((total, status) => {
    if (!VULNERABILITY_STATUS_IDS.has(status.id)) return total;
    return total + (status.id === 'elemental-fall-down' ? Math.max(1, status.power ?? 0) : (status.power ?? 0));
  }, 0);

export class WorldController {
  readonly #content: GameContent;
  readonly #grids: ReadonlyMap<string, TileGrid>;
  readonly #rng: SeededRng;
  readonly #dropRng: SeededRng;
  readonly #questCatalog: QuestCatalog;
  #character: SaveGameV1['character'];
  #inventory: InventoryState;
  #equipment: EquipmentState;
  #quests: SaveGameV1['quests'];
  #player: SaveGameV1['world']['player'];
  #defeatedBosses: readonly string[];
  #flags: Readonly<Record<string, boolean>>;
  #monsters: MonsterState[];
  #groundLoot: GroundLoot[] = [];
  #events: DomainEvent[] = [];
  #persistenceEvents: WorldPersistenceEvent[] = [];
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
  #playerCooldowns: Readonly<Record<string, number>> = {};
  #playerStatuses: readonly StatusEffect[] = [];

  constructor(options: WorldControllerOptions) {
    this.#content = options.content;
    this.#character = { ...options.save.character };
    this.#inventory = {
      ...options.save.inventory,
      stacks: options.save.inventory.stacks.map((stack) => ({ ...stack })),
    };
    this.#equipment = { ...options.save.equipment };
    this.#quests = options.save.quests;
    this.#player = { ...options.save.world.player };
    this.#defeatedBosses = [...options.save.world.defeatedBosses];
    this.#flags = { ...options.save.world.flags };
    this.#worldTimeMs = options.save.world.worldTimeMs;
    this.#grids = options.grids ?? new Map();
    this.#dropRng = new SeededRng(options.seed ?? 7);
    this.#rng = new SeededRng(options.seed ?? 20260717);
    this.#questCatalog = Object.fromEntries(
      options.content.quests.map((quest) => [quest.id, quest]),
    );
    const map = options.content.map(this.#player.mapId);
    const grid = options.grids?.get(map.id) ?? openGridFor(options.content, map.id);
    this.#monsters = [
      ...(options.monsters ?? spawnMonsters(map, options.content.monsters, grid)),
    ].map((monster) => ({ ...monster }));
  }

  get fixedStepCount(): number {
    return this.#fixedStepCount;
  }

  get snapshot(): WorldSnapshot {
    const player = { ...this.#player };
    const playerStatuses = activeStatuses(this.#playerStatuses, this.#worldTimeMs).map(
      (status) => ({ ...status }),
    );
    return {
      player,
      world: {
        player,
        defeatedBosses: [...this.#defeatedBosses],
        flags: { ...this.#flags },
        worldTimeMs: this.#worldTimeMs,
      },
      character: { ...this.#character, attributes: { ...this.#character.attributes } },
      inventory: {
        ...this.#inventory,
        stacks: this.#inventory.stacks.map((stack) => ({ ...stack })),
      },
      equipment: { ...this.#equipment },
      quests: {
        active: Object.fromEntries(
          Object.entries(this.#quests.active).map(([id, progress]) => [
            id,
            { ...progress, counters: { ...progress.counters } },
          ]),
        ),
        completed: [...this.#quests.completed],
        claimedRewards: [...this.#quests.claimedRewards],
      },
      monsters: this.#monsters.map((monster) => ({
        ...monster,
        statuses: (monster.statuses ?? []).map((status) => ({ ...status })),
      })),
      groundLoot: this.#groundLoot.map((loot) => ({ ...loot })),
      worldTimeMs: this.#worldTimeMs,
      autoAttackTargetId: this.#autoAttackTargetId,
      playerStatuses,
    };
  }

  syncSerializableState(
    state: Pick<SaveGameV1, 'character' | 'inventory' | 'quests'> & {
      readonly equipment?: EquipmentState;
    },
  ): void {
    this.#character = { ...state.character, attributes: { ...state.character.attributes } };
    this.#inventory = {
      ...state.inventory,
      stacks: state.inventory.stacks.map((stack) => ({ ...stack })),
    };
    this.#quests = {
      active: Object.fromEntries(
        Object.entries(state.quests.active).map(([id, progress]) => [
          id,
          { ...progress, counters: { ...progress.counters } },
        ]),
      ),
      completed: [...state.quests.completed],
      claimedRewards: [...state.quests.claimedRewards],
    };
    if (state.equipment !== undefined) this.#equipment = { ...state.equipment };
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

  cast(abilityId: string, targetId: string): WorldActionResult {
    const ability = this.#content.abilities.find(({ id }) => id === abilityId);
    if (ability === undefined) {
      return { ok: false, reason: 'ability-not-found', events: [] };
    }
    if (
      ability.reagentItemId !== undefined &&
      this.#content.item(ability.reagentItemId).kind === 'ammunition' &&
      this.#equipment.weapon !== 'bow'
    ) {
      return { ok: false, reason: 'required-equipment', events: [] };
    }

    this.#playerStatuses = activeStatuses(this.#playerStatuses, this.#worldTimeMs);
    const stats = deriveStats(this.#character);
    const defensePower = statusPower(this.#playerStatuses, DEFENSE_STATUS_IDS);
    const hitPower = statusPower(this.#playerStatuses, HIT_STATUS_IDS);
    const spellPower = statusPower(this.#playerStatuses, SPELL_STATUS_IDS);
    const caster: Combatant = {
      id: this.#character.id,
      hp: this.#character.hp,
      maxHP: stats.maxHP,
      mp: this.#character.mp,
      maxMP: stats.maxMP,
      ac: stats.ac - defensePower,
      hitBonus: stats.hitBonus + hitPower,
      damage: [Math.max(1, stats.damageBonus), Math.max(1, stats.damageBonus + 3)],
      classId: this.#character.classId,
      level: this.#character.level,
      statuses: this.#playerStatuses,
      cooldowns: this.#playerCooldowns,
    };
    const targetsPlayer =
      ability.target === 'self' ||
      ability.target === 'ally' ||
      (ability.kind === 'utility' && ability.target === 'area');
    if (
      (targetsPlayer && targetId !== this.#character.id) ||
      (!targetsPlayer && targetId === this.#character.id)
    ) {
      return { ok: false, reason: 'invalid-target', events: [] };
    }
    const monster = targetsPlayer
      ? undefined
      : this.#monsters.find(
          (candidate) =>
            candidate.id === targetId &&
            candidate.mapId === this.#player.mapId &&
            candidate.hp > 0,
        );
    if (!targetsPlayer && monster === undefined) {
      return { ok: false, reason: 'target-not-found', events: [] };
    }
    const monsterDefinition =
      monster === undefined ? undefined : this.#content.monster(monster.monsterId);
    const monsterStatuses =
      monster === undefined
        ? []
        : activeStatuses(monster.statuses ?? [], this.#worldTimeMs);
    const target: Combatant =
      monster === undefined || monsterDefinition === undefined
        ? caster
        : {
            id: monster.id,
            hp: monster.hp,
            maxHP: monster.maxHP,
            ac: monsterDefinition.ac,
            hitBonus: monsterDefinition.level,
            damage: [monsterDefinition.attack, monsterDefinition.attack],
            statuses: monsterStatuses,
          };
    const definition = combatAbility(
      ability,
      spellPower + (ability.kind === 'attack' ? vulnerabilityPower(monsterStatuses) : 0),
    );
    const result = castAbility(
      caster,
      target,
      definition,
      {
        distance: monster === undefined ? 0 : distance(this.#player, monster),
        nowMs: this.#worldTimeMs,
        availableItemIds: this.#inventory.stacks
          .filter(({ quantity }) => quantity > 0)
          .map(({ itemId }) => itemId),
      },
      this.#rng,
    );
    if (!result.ok) return result;

    this.#character = {
      ...this.#character,
      hp: Math.max(1, result.caster.hp - ability.hpCost),
      mp: result.caster.mp ?? this.#character.mp,
    };
    this.#playerCooldowns = result.caster.cooldowns ?? this.#playerCooldowns;
    this.#playerStatuses = result.caster.statuses ?? this.#playerStatuses;
    if (ability.reagentItemId !== undefined) {
      this.#inventory = consumeAmmunition(this.#inventory, ability.reagentItemId);
      this.#character = {
        ...this.#character,
        carriedWeight: this.#inventory.carriedWeight,
      };
    }
    let actionEvents = result.events;
    if (monster !== undefined) {
      const affected =
        ability.kind === 'attack' && ability.target === 'area'
          ? this.#monsters.filter(
              (candidate) =>
                candidate.mapId === monster.mapId &&
                candidate.hp > 0 &&
                distance(candidate, monster) <= 2,
            )
          : [monster];
      const effects = affected.map((candidate) => {
        if (candidate.id === monster.id) {
          return { monster: candidate, target: result.target, events: result.events };
        }
        const candidateDefinition = this.#content.monster(candidate.monsterId);
        const candidateStatuses = activeStatuses(
          candidate.statuses ?? [],
          this.#worldTimeMs,
        );
        const effect = applyAbilityEffect(
          result.caster,
          {
            id: candidate.id,
            hp: candidate.hp,
            maxHP: candidate.maxHP,
            ac: candidateDefinition.ac,
            hitBonus: candidateDefinition.level,
            damage: [candidateDefinition.attack, candidateDefinition.attack],
            statuses: candidateStatuses,
          },
          combatAbility(
            ability,
            spellPower + vulnerabilityPower(candidateStatuses),
          ),
          this.#worldTimeMs,
          this.#rng,
        );
        return { monster: candidate, ...effect };
      });
      actionEvents = effects.flatMap(({ events }) => events);
      for (const effect of effects) {
        this.#monsters = this.#monsters.map((candidate) =>
          candidate.id === effect.monster.id
            ? {
                ...candidate,
                hp: effect.target.hp,
                statuses: effect.target.statuses ?? [],
              }
            : candidate,
        );
        if (effect.target.hp === 0) this.#defeatMonster(effect.monster);
      }
    } else {
      this.#character = {
        ...this.#character,
        hp: Math.max(1, result.target.hp - ability.hpCost),
      };
    }
    if (ability.id === 'teleport') {
      const entry = this.#content.map(this.#player.mapId).entry;
      this.#player = { mapId: this.#player.mapId, ...entry };
      this.#autoAttackTargetId = null;
      this.#movementPath = [];
      this.#pendingExit = null;
    }
    this.#events.push(...actionEvents);
    return { ok: true, events: actionEvents };
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

  drainPersistenceEvents(): WorldPersistenceEvent[] {
    const events = this.#persistenceEvents;
    this.#persistenceEvents = [];
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
    this.#playerStatuses = activeStatuses(this.#playerStatuses, this.#worldTimeMs);
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
    this.#playerStatuses = [];
    this.#monsters = [
      ...spawnMonsters(
        this.#content.map(exit.targetMapId),
        this.#content.monsters,
        targetGrid,
      ),
    ];
    const quests = advanceQuest(
      this.#quests,
      { type: 'area-entered', mapId: exit.targetMapId },
      this.#questCatalog,
    );
    this.#persistenceEvents.push('map-change');
    if (quests !== this.#quests) this.#persistenceEvents.push('quest-stage');
    this.#quests = quests;
  }

  #attackMonster(monster: MonsterState): void {
    this.#playerStatuses = activeStatuses(this.#playerStatuses, this.#worldTimeMs);
    const stats = deriveStats(this.#character);
    const definition = this.#content.monster(monster.monsterId);
    const weapon =
      this.#equipment.weapon === undefined
        ? undefined
        : this.#content.items.find(({ id }) => id === this.#equipment.weapon);
    const ammunition =
      weapon?.id === 'bow'
        ? this.#inventory.stacks.find(
            ({ itemId, quantity }) =>
              quantity > 0 && this.#content.item(itemId).kind === 'ammunition',
          )?.itemId
        : undefined;
    if (weapon?.id === 'bow' && ammunition === undefined) return;
    const weaponDamage = weapon?.damageSmall ?? 0;
    const weaponStatusPower = statusPower(this.#playerStatuses, WEAPON_STATUS_IDS);
    const monsterStatuses = activeStatuses(monster.statuses ?? [], this.#worldTimeMs);
    const damageBonus =
      Math.max(1, stats.damageBonus) +
      weaponStatusPower +
      vulnerabilityPower(monsterStatuses);
    const attacker: Combatant = {
      id: this.#character.id,
      hp: this.#character.hp,
      maxHP: stats.maxHP,
      ac: stats.ac,
      hitBonus: stats.hitBonus + statusPower(this.#playerStatuses, HIT_STATUS_IDS),
      damage: [
        Math.max(1, weaponDamage + damageBonus - 2),
        Math.max(1, weaponDamage + damageBonus),
      ],
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
    if (
      ammunition !== undefined &&
      result.events.some((event) => event.type === 'damage')
    ) {
      this.#inventory = consumeAmmunition(this.#inventory, ammunition);
      this.#character = {
        ...this.#character,
        carriedWeight: this.#inventory.carriedWeight,
      };
    }
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
    const drops = rollDrops(definition.drops, this.#dropRng);
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
    const quests = advanceQuest(
      this.#quests,
      { type: 'monster-defeated', monsterId: monster.monsterId, count: 1 },
      this.#questCatalog,
    );
    if (quests !== this.#quests) this.#persistenceEvents.push('quest-stage');
    this.#quests = quests;
    if (monster.monsterId === 'baphomet') {
      this.#defeatedBosses = [...new Set([...this.#defeatedBosses, 'baphomet'])];
      this.#flags = { ...this.#flags, baphometDefeated: true };
    }
  }

  #stepMonsters(): void {
    const grid = this.#grid();
    let attackCommitted = false;
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
      if (result.intent.type === 'attack') {
        if (attackCommitted) {
          return { ...result.monster, nextAttackAtMs: monster.nextAttackAtMs };
        }
        attackCommitted = true;
        this.#attackPlayer(result.monster);
      }
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
        ac: stats.ac - statusPower(this.#playerStatuses, DEFENSE_STATUS_IDS),
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
    this.#playerStatuses = [];
    this.#autoAttackTargetId = null;
    this.#movementPath = [];
    this.#pendingExit = null;
    this.#persistenceEvents.push('death-respawn');
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
    const quests = advanceQuest(
      this.#quests,
      { type: 'item-acquired', itemId: loot.itemId, count: loot.quantity },
      this.#questCatalog,
    );
    if (quests !== this.#quests) this.#persistenceEvents.push('quest-stage');
    this.#quests = quests;
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
