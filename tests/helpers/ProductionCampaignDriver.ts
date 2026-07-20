import blackKnightArea from '../../public/assets/maps/black-knight-area.map.json';
import coast from '../../public/assets/maps/coast.map.json';
import dungeonFloor1 from '../../public/assets/maps/dungeon-floor-1.map.json';
import dungeonFloor2 from '../../public/assets/maps/dungeon-floor-2.map.json';
import northField from '../../public/assets/maps/north-field.map.json';
import scarecrowField from '../../public/assets/maps/scarecrow-field.map.json';
import village from '../../public/assets/maps/village.map.json';
import { loadBundledContent, type GameContent } from '../../src/content/loadContent';
import type { CharacterClass } from '../../src/core/model';
import { createQuestState } from '../../src/core/quests';
import { createCharacter, deriveStats } from '../../src/core/stats';
import {
  GameSession,
  type GameSessionSnapshot,
  type PlayerAction,
} from '../../src/game/systems/GameSession';
import { GAME_VERSION } from '../../src/app/version';
import { sealSaveV1, type SaveGameV1 } from '../../src/storage/saveSchema';
import { TileGrid, type GridRectangle } from '../../src/world/grid';

interface MapAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly collisionLayer: { readonly blockedRectangles: readonly GridRectangle[] };
}

const mapAssets = [
  village,
  scarecrowField,
  northField,
  coast,
  blackKnightArea,
  dungeonFloor1,
  dungeonFloor2,
] as readonly MapAsset[];

const grids = new Map(
  mapAssets.map((asset) => [
    asset.id,
    TileGrid.fromBlockedRectangles(
      asset.width,
      asset.height,
      asset.collisionLayer.blockedRectangles,
    ),
  ]),
);

const quantityOf = (snapshot: GameSessionSnapshot, itemId: string): number =>
  snapshot.inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;

const createInitialSave = (content: GameContent, classId: CharacterClass): SaveGameV1 => {
  const character = createCharacter(`production-${classId}`, classId);
  const classDefinition = content.classes.find(({ id }) => id === classId);
  if (classDefinition === undefined) throw new Error(`missing class: ${classId}`);
  const stacks = classDefinition.startingItemIds.map((itemId) => ({ itemId, quantity: 1 }));
  const carriedWeight = stacks.reduce(
    (total, stack) => total + content.item(stack.itemId).weight * stack.quantity,
    0,
  );
  const entry = content.map('scarecrow-field').entry;
  return sealSaveV1({
    schemaVersion: 1,
    gameVersion: GAME_VERSION,
    slot: 1,
    updatedAt: '2026-07-17T00:00:00.000Z',
    checksum: '',
    character: { ...character, carriedWeight },
    inventory: {
      stacks,
      adena: 0,
      carriedWeight,
      weightLimit: deriveStats(character).weightLimit,
    },
    equipment: {},
    quests: createQuestState(),
    world: {
      player: { mapId: 'scarecrow-field', ...entry },
      defeatedBosses: [],
      flags: {},
      worldTimeMs: 0,
    },
    quickSlots: [null, null, null, null, null, null, null, null],
    settings: { music: 0.7, ambient: 0.5, effects: 0.8, muted: false, scale: 2 },
  });
};

export class ProductionCampaignBlockedError extends Error {
  constructor(
    readonly stage: string,
    readonly action: string,
    readonly detail: string,
  ) {
    super(`[${stage}] ${action}: ${detail}`);
    this.name = 'ProductionCampaignBlockedError';
  }
}

export class ProductionCampaignDriver {
  readonly content = loadBundledContent();
  readonly session: GameSession;
  readonly audit = new Set<string>();
  #stage = 'new-game';

  private constructor(classId: CharacterClass, seed: number) {
    this.session = new GameSession({
      content: this.content,
      save: createInitialSave(this.content, classId),
      grids,
      seed,
    });
  }

  static newKnight(seed: number): ProductionCampaignDriver {
    return new ProductionCampaignDriver('knight', seed);
  }

  get snapshot(): GameSessionSnapshot {
    return this.session.snapshot;
  }

  completeCampaign(): void {
    this.#equipStartingGear();
    this.#completeTraining();
    this.#completeVillageRegistration();
    this.#exerciseCommerce();
    this.#completeKnightGuidance();
    this.#completeFieldSupplies();
    this.#completeBlackKnightAssault();
    this.#completeDungeonSeal();
    this.#completeEnding();
    this.#stage = 'free-explore';
    this.travelTo('north-field');
    this.moveTo(90, 45);
    this.audit.add('free-explore');
  }

  moveTo(x: number, y: number): void {
    this.session.dispatch({ type: 'move', x, y });
    for (let step = 0; step < 5_000; step += 1) {
      const beforeMap = this.snapshot.player.mapId;
      this.session.update(50);
      this.#useHealingPotionWhenNeeded();
      const player = this.snapshot.player;
      if (player.mapId !== beforeMap || (player.x === x && player.y === y)) return;
    }
    this.#blocked('move', `cannot reach ${String(x)},${String(y)} from ${this.#position()}`);
  }

  travelTo(targetMapId: string): void {
    const route = this.#mapRoute(this.snapshot.player.mapId, targetMapId);
    if (route.length === 0) this.#blocked('travel', `no route to ${targetMapId}`);
    for (const nextMapId of route.slice(1)) {
      const map = this.content.map(this.snapshot.player.mapId);
      const exit = map.exits.find(({ targetMapId: id }) => id === nextMapId);
      if (exit === undefined) this.#blocked('travel', `missing exit to ${nextMapId}`);
      if (this.snapshot.player.x === exit.x && this.snapshot.player.y === exit.y) {
        this.#stepAwayFromExit();
      }
      this.moveTo(exit.x, exit.y);
      if (this.snapshot.player.mapId !== nextMapId) {
        this.#blocked('travel', `exit did not enter ${nextMapId}; at ${this.#position()}`);
      }
    }
  }

  #equipStartingGear(): void {
    for (const itemId of ['dagger', 'leather-jacket']) {
      this.#perform({ type: 'equip', itemId });
    }
    this.audit.add('equip');
  }

  #completeTraining(): void {
    this.#stage = 'training';
    this.#accept('scarecrow-training');
    this.#interact('scarecrow-instructor');
    this.#fightMany('goblin', 4);
    this.#claim('scarecrow-training');
  }

  #completeVillageRegistration(): void {
    this.#stage = 'village-registration';
    this.#accept('village-registration');
    for (const npcId of ['pandora', 'dorin', 'gereng']) this.#interact(npcId);
    this.#claim('village-registration');
  }

  #exerciseCommerce(): void {
    this.#stage = 'commerce';
    this.#approachNpc('pandora');
    this.#perform({ type: 'buy', npcId: 'pandora', itemId: 'meat', quantity: 1 });
    this.#perform({ type: 'sell', npcId: 'pandora', itemId: 'meat', quantity: 1 });
    this.#perform({ type: 'buy', npcId: 'pandora', itemId: 'red-potion', quantity: 6 });
    this.audit.add('buy');
    this.audit.add('sell');
  }

  #completeKnightGuidance(): void {
    this.#stage = 'knight-guidance';
    this.#accept('knight-guidance');
    this.#fightMany('dwarf', 5);
    this.#interact('village-guard');
    this.#claim('knight-guidance');
    this.#perform({ type: 'equip', itemId: 'long-sword' });
    this.#perform({ type: 'equip', itemId: 'large-shield' });
  }

  #completeFieldSupplies(): void {
    this.#stage = 'field-supplies';
    this.#accept('field-supplies');
    this.travelTo('talking-island-village');
    this.travelTo('north-field');
    this.#fightMany('dwarf', 3);
    while (quantityOf(this.snapshot, 'animal-hide') < 4) {
      this.#fightOne('orc');
      if (this.#normalKillCount('orc') > 25) {
        this.#blocked('collect', 'animal-hide did not drop within 25 legal orc kills');
      }
    }
    this.#claim('field-supplies');
    this.#buyRedPotions(10);
  }

  #completeBlackKnightAssault(): void {
    this.#stage = 'black-knight-assault';
    this.#accept('black-knight-assault');
    this.#fightMany('black-knight', 6);
    this.#fightOne('kurt');
    this.#claim('black-knight-assault');
    this.#buyRedPotions(15);
  }

  #completeDungeonSeal(): void {
    this.#stage = 'dungeon-seal';
    this.#accept('dungeon-seal');
    this.travelTo('black-knight-area');
    this.travelTo('talking-island-dungeon-1');
    this.#fightMany('skeleton', 8);
    this.#claim('dungeon-seal');
    this.#buyRedPotions(20);
  }

  #completeEnding(): void {
    this.#stage = 'baphomet-ending';
    this.#accept('baphomet-ending');
    this.travelTo('talking-island-dungeon-2');
    this.#fightOne('baphomet');
    this.#interact('gunther');
    this.#claim('baphomet-ending');
  }

  #accept(questId: string): void {
    const quest = this.content.quest(questId);
    this.#approachNpc(quest.giverNpcId);
    this.#perform({ type: 'accept-quest', npcId: quest.giverNpcId, questId });
  }

  #claim(questId: string): void {
    const quest = this.content.quest(questId);
    this.#approachNpc(quest.giverNpcId);
    this.#perform({ type: 'interact', targetId: quest.giverNpcId });
    this.#perform({ type: 'claim-reward', npcId: quest.giverNpcId, questId });
  }

  #interact(npcId: string): void {
    this.#approachNpc(npcId);
    this.#perform({ type: 'interact', targetId: npcId });
  }

  #approachNpc(npcId: string): void {
    const npc = this.content.npc(npcId);
    this.travelTo(npc.mapId);
    this.moveTo(npc.x, npc.y);
  }

  #fightMany(monsterId: string, count: number): void {
    for (let index = 0; index < count; index += 1) this.#fightOne(monsterId);
  }

  readonly #kills = new Map<string, number>();

  #normalKillCount(monsterId: string): number {
    return this.#kills.get(monsterId) ?? 0;
  }

  #activeQuestProgress(): number {
    return Object.values(this.snapshot.quests.active).reduce(
      (total, progress) =>
        total + Object.values(progress.counters).reduce((sum, value) => sum + value, 0),
      0,
    );
  }

  #fightOne(monsterId: string): void {
    const spawnMap = this.content.maps.find((map) =>
      map.spawns.some((spawn) => spawn.monsterId === monsterId),
    );
    if (spawnMap === undefined) this.#blocked('fight', `no spawn for ${monsterId}`);
    this.travelTo(spawnMap.id);
    const livingTargets = this.snapshot.monsters.filter(
      (monster) => monster.monsterId === monsterId && monster.hp > 0,
    );
    let target =
      livingTargets[monsterId === 'black-knight' ? this.#normalKillCount(monsterId) : 0];
    if (target === undefined) {
      this.#refreshCurrentMap();
      target = this.snapshot.monsters.find(
        (monster) => monster.monsterId === monsterId && monster.hp > 0,
      );
    }
    if (target === undefined) this.#blocked('fight', `no living ${monsterId}`);
    const startingExperience = this.snapshot.character.experience;
    const startingQuestProgress = this.#activeQuestProgress();
    this.session.dispatch({ type: 'attack', targetId: target.id });
    for (let tick = 0; tick < 8_000; tick += 1) {
      this.session.update(50);
      this.#useHealingPotionWhenNeeded();
      const current = this.snapshot.monsters.find(({ id }) => id === target.id);
      if (
        target.rank === 'elite' &&
        (this.snapshot.character.experience > startingExperience ||
          this.#activeQuestProgress() > startingQuestProgress)
      ) {
        this.#kills.set(monsterId, this.#normalKillCount(monsterId) + 1);
        return;
      }
      if (current?.hp === 0) {
        this.#kills.set(monsterId, this.#normalKillCount(monsterId) + 1);
        this.#collectNearbyLoot();
        return;
      }
      if (
        current !== undefined &&
        current.rank !== 'normal' &&
        this.snapshot.unlockedAbilityIds.includes('power-strike')
      ) {
        this.session.perform({ type: 'cast', abilityId: 'power-strike', targetId: current.id });
      }
      if (this.snapshot.autoAttackTargetId === null && current !== undefined && current.hp > 0) {
        this.session.dispatch({ type: 'attack', targetId: current.id });
      }
    }
    const stalled = this.snapshot.monsters.find(({ id }) => id === target.id);
    this.#blocked(
      'fight',
      `${monsterId} did not die; target=${JSON.stringify(stalled)} autoTarget=${String(this.snapshot.autoAttackTargetId)} ${this.#characterSummary()}`,
    );
  }

  #collectNearbyLoot(): void {
    const currentMapId = this.snapshot.player.mapId;
    for (const loot of this.snapshot.groundLoot.filter(({ mapId }) => mapId === currentMapId)) {
      this.moveTo(loot.x, loot.y);
      const before = quantityOf(this.snapshot, loot.itemId);
      this.session.dispatch({ type: 'interact', targetId: loot.id });
      if (quantityOf(this.snapshot, loot.itemId) > before) this.audit.add('loot');
    }
  }

  #buyRedPotions(requested: number): void {
    this.#approachNpc('pandora');
    const price = this.content.item('red-potion').buyPrice;
    const quantity = Math.min(requested, Math.floor(this.snapshot.inventory.adena / price));
    if (quantity <= 0) this.#blocked('buy', 'cannot afford red-potion');
    this.#perform({ type: 'buy', npcId: 'pandora', itemId: 'red-potion', quantity });
  }

  #refreshCurrentMap(): void {
    const currentMapId = this.snapshot.player.mapId;
    const exit = this.content.map(currentMapId).exits[0];
    if (exit === undefined) this.#blocked('refresh', `map ${currentMapId} has no exit`);
    this.travelTo(exit.targetMapId);
    this.travelTo(currentMapId);
  }

  #useHealingPotionWhenNeeded(): void {
    const snapshot = this.snapshot;
    const maxHP = deriveStats(snapshot.character).maxHP;
    if (snapshot.character.hp > Math.max(15, Math.floor(maxHP * 0.45))) return;
    const potion = snapshot.inventory.stacks
      .filter(({ quantity }) => quantity > 0)
      .map(({ itemId }) => this.content.item(itemId))
      .filter((item) => item.healAmount !== undefined)
      .sort((left, right) => (left.healAmount ?? 0) - (right.healAmount ?? 0))[0];
    if (potion === undefined) return;
    const result = this.session.perform({ type: 'use', itemId: potion.id });
    if (!result.ok) this.#blocked('heal', `${potion.id}: ${result.reason}`);
    this.audit.add('use-potion');
  }

  #perform(action: PlayerAction): void {
    const result = this.session.perform(action);
    if (!result.ok) this.#blocked(action.type, result.reason);
  }

  #mapRoute(from: string, to: string): readonly string[] {
    const queue: { readonly mapId: string; readonly route: readonly string[] }[] = [
      { mapId: from, route: [from] },
    ];
    const visited = new Set([from]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (current.mapId === to) return current.route;
      for (const exit of this.content.map(current.mapId).exits) {
        if (visited.has(exit.targetMapId)) continue;
        visited.add(exit.targetMapId);
        queue.push({ mapId: exit.targetMapId, route: [...current.route, exit.targetMapId] });
      }
    }
    return [];
  }

  #stepAwayFromExit(): void {
    const snapshot = this.snapshot;
    const map = this.content.map(snapshot.player.mapId);
    const grid = grids.get(map.id);
    if (grid === undefined) this.#blocked('travel', `missing grid for ${map.id}`);
    const candidate = [
      { x: snapshot.player.x + 1, y: snapshot.player.y },
      { x: snapshot.player.x - 1, y: snapshot.player.y },
      { x: snapshot.player.x, y: snapshot.player.y + 1 },
      { x: snapshot.player.x, y: snapshot.player.y - 1 },
    ].find(
      (point) =>
        grid.isWalkable(point) &&
        !map.exits.some(({ x, y }) => x === point.x && y === point.y),
    );
    if (candidate === undefined) this.#blocked('travel', `cannot step away from ${this.#position()}`);
    this.moveTo(candidate.x, candidate.y);
  }

  #position(): string {
    const { mapId, x, y } = this.snapshot.player;
    return `${mapId}:${String(x)},${String(y)}`;
  }

  #characterSummary(): string {
    const { level, hp, experience } = this.snapshot.character;
    return `level=${String(level)} hp=${String(hp)} exp=${String(experience)} at ${this.#position()}`;
  }

  #blocked(action: string, detail: string): never {
    throw new ProductionCampaignBlockedError(this.#stage, action, detail);
  }
}
