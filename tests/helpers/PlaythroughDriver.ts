import blackKnightArea from '../../public/assets/maps/black-knight-area.map.json';
import coast from '../../public/assets/maps/coast.map.json';
import dungeonFloor1 from '../../public/assets/maps/dungeon-floor-1.map.json';
import dungeonFloor2 from '../../public/assets/maps/dungeon-floor-2.map.json';
import northField from '../../public/assets/maps/north-field.map.json';
import scarecrowField from '../../public/assets/maps/scarecrow-field.map.json';
import village from '../../public/assets/maps/village.map.json';
import { loadBundledContent, type GameContent } from '../../src/content/loadContent';
import {
  castAbility,
  resolveAttack,
  type AbilityDefinition as CombatAbilityDefinition,
  type Combatant,
} from '../../src/core/combat';
import {
  addItem,
  buyItem,
  equipItem,
  removeItem,
  replaceEquipment,
  sellItem,
  useItem,
  type EquipmentState,
  type InventoryState,
  type ItemDefinition,
} from '../../src/core/inventory';
import type { CharacterClass, CharacterState } from '../../src/core/model';
import { applyExperience } from '../../src/core/progression';
import {
  advanceQuest,
  chooseDialogue,
  claimReward,
  createQuestState,
  isEndingUnlocked,
  startQuest,
  type DialogueNode,
  type QuestCatalog,
  type QuestSignal,
  type QuestState,
} from '../../src/core/quests';
import { SeededRng } from '../../src/core/rng';
import { createCharacter, deriveStats } from '../../src/core/stats';
import { rollDrops } from '../../src/world/ai';
import { TileGrid, type GridRectangle } from '../../src/world/grid';
import { findPath } from '../../src/world/pathfinding';
import {
  transitionEntity,
  type WorldMap,
  type WorldState,
} from '../../src/world/world';

type MainStage =
  | 'new-game'
  | 'training'
  | 'village-registration'
  | 'class-guidance'
  | 'field-supplies'
  | 'black-knight-assault'
  | 'dungeon-seal'
  | 'baphomet'
  | 'final-report'
  | 'free-explore';

interface MapAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly collisionLayer: { readonly blockedRectangles: readonly GridRectangle[] };
  readonly exits: readonly {
    readonly x: number;
    readonly y: number;
    readonly targetMapId: string;
    readonly targetX: number;
    readonly targetY: number;
  }[];
}

export interface PlaythroughState {
  readonly character: CharacterState;
  readonly inventory: InventoryState;
  readonly equipment: EquipmentState;
  readonly quests: QuestState;
  readonly abilityIds: readonly string[];
  readonly world: WorldState;
}

export class PlaythroughBlockedError extends Error {
  constructor(
    readonly stage: MainStage,
    readonly action: string,
    readonly reason: string,
    detail: string,
  ) {
    super(`[${stage}] ${action} blocked (${reason}): ${detail}`);
    this.name = 'PlaythroughBlockedError';
  }
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

const itemDefinition = (content: GameContent, itemId: string): ItemDefinition => {
  const item = content.item(itemId);
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    weight: item.weight,
    stackLimit: item.stackLimit,
    buyPrice: item.buyPrice,
    sellPrice: item.sellPrice,
    allowedClasses: item.allowedClasses,
    ...(item.equipmentSlot === undefined ? {} : { equipmentSlot: item.equipmentSlot }),
    ...(item.healAmount === undefined ? {} : { healAmount: item.healAmount }),
  };
};

const buildMaps = (): ReadonlyMap<string, WorldMap> =>
  new Map(
    mapAssets.map((asset) => [
      asset.id,
      {
        id: asset.id,
        grid: TileGrid.fromBlockedRectangles(
          asset.width,
          asset.height,
          asset.collisionLayer.blockedRectangles,
        ),
        exits: asset.exits,
      },
    ]),
  );

const quantityOf = (inventory: InventoryState, itemId: string): number =>
  inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;

const mapRoute = (
  content: GameContent,
  from: string,
  to: string,
): readonly string[] => {
  const queue: { readonly id: string; readonly route: readonly string[] }[] = [
    { id: from, route: [from] },
  ];
  const visited = new Set([from]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current.id === to) return current.route;
    for (const exit of content.map(current.id).exits) {
      if (visited.has(exit.targetMapId)) continue;
      visited.add(exit.targetMapId);
      queue.push({ id: exit.targetMapId, route: [...current.route, exit.targetMapId] });
    }
  }
  return [];
};

export class PlaythroughDriver {
  readonly #content = loadBundledContent();
  readonly #maps = buildMaps();
  readonly #rng: SeededRng;
  readonly #questCatalog: QuestCatalog;
  readonly #items: Readonly<Record<string, ItemDefinition>>;
  readonly #killCounts = new Map<string, number>();
  readonly #usedSpawns = new Map<string, number>();
  readonly #bossSignals = new Set<string>();
  #cooldowns: Readonly<Record<string, number>> = {};
  #stage: MainStage = 'new-game';
  #character: CharacterState;
  #inventory: InventoryState;
  #equipment: EquipmentState = {};
  #quests = createQuestState();
  #abilityIds: string[];
  #world: WorldState;

  private constructor(classId: CharacterClass, seed: number) {
    this.#rng = new SeededRng(seed);
    this.#questCatalog = Object.fromEntries(
      this.#content.quests.map((quest) => [quest.id, quest]),
    );
    this.#items = Object.fromEntries(
      this.#content.items.map((item) => [item.id, itemDefinition(this.#content, item.id)]),
    );
    this.#character = createCharacter(`測試-${classId}`, classId);
    const stats = deriveStats(this.#character);
    this.#inventory = {
      stacks: [],
      adena: 0,
      carriedWeight: 0,
      weightLimit: stats.weightLimit,
    };
    this.#abilityIds = [];
    const classDefinition = this.#content.classes.find(({ id }) => id === classId);
    if (classDefinition === undefined) {
      throw new PlaythroughBlockedError('new-game', 'create', 'missing-class', classId);
    }
    for (const itemId of classDefinition.startingItemIds) this.#acquireItem(itemId, 1);
    this.#abilityIds.push(...classDefinition.abilityIds.filter((id) =>
      this.#content.ability(id).unlockLevel <= 1,
    ));
    const start = this.#content.map('talking-island-village').entry;
    this.#world = {
      player: { mapId: 'talking-island-village', x: start.x, y: start.y },
      defeatedBosses: [],
      flags: {},
      worldTimeMs: 0,
    };
    for (const itemId of classDefinition.startingItemIds) {
      const item = this.#content.item(itemId);
      if (item.equipmentSlot !== undefined) this.equip(itemId);
    }
  }

  static newGame(classId: CharacterClass, seed: number): PlaythroughDriver {
    return new PlaythroughDriver(classId, seed);
  }

  get state(): PlaythroughState {
    const baphometDefeated = this.#bossSignals.has('baphomet');
    const finalReportComplete = this.#quests.claimedRewards.includes('baphomet-ending');
    return {
      character: this.#character,
      inventory: this.#inventory,
      equipment: this.#equipment,
      quests: this.#quests,
      abilityIds: this.#abilityIds,
      world: {
        ...this.#world,
        defeatedBosses: baphometDefeated ? ['baphomet'] : [],
        flags: {
          ...this.#world.flags,
          baphometDefeated,
          finalReportComplete,
        },
      },
    };
  }

  completeTraining(): void {
    this.#stage = 'training';
    this.acceptQuest('scarecrow-training');
    this.interact('scarecrow-instructor');
    this.#kill('goblin', 4);
    this.#claim('scarecrow-training');
  }

  completeVillageRegistration(): void {
    this.#stage = 'village-registration';
    this.acceptQuest('village-registration');
    for (const npcId of ['pandora', 'dorin', 'gereng']) this.interact(npcId);
    this.#claim('village-registration');
  }

  completeClassGuidance(): void {
    this.#stage = 'class-guidance';
    this.#buyHealingSupplies();
    const route = {
      prince: { questId: 'prince-guidance', monsterId: 'orc', count: 5, npcId: 'gunther' },
      knight: { questId: 'knight-guidance', monsterId: 'dwarf', count: 5, npcId: 'village-guard' },
      elf: { questId: 'elf-guidance', monsterId: 'spider', count: 5, npcId: 'injured-fisher' },
      wizard: { questId: 'wizard-guidance', monsterId: 'zombie', count: 4, npcId: 'gereng' },
    } as const;
    const guidance = route[this.#character.classId];
    this.acceptQuest(guidance.questId);
    this.#kill(guidance.monsterId, guidance.count);
    this.interact(guidance.npcId);
    this.#claim(guidance.questId);
    if (this.#character.classId === 'prince') this.equip('long-sword');
    if (this.#character.classId === 'knight') {
      this.equip('long-sword');
      this.equip('large-shield');
    }
    if (this.#character.classId === 'elf' || this.#character.classId === 'wizard') {
      this.equip('protection-cloak');
    }
  }

  completeFieldSupplies(): void {
    this.#stage = 'field-supplies';
    this.#buyHealingSupplies();
    this.acceptQuest('field-supplies');
    this.#signal({ type: 'area-entered', mapId: this.#world.player.mapId });
    const startingHides = quantityOf(this.#inventory, 'animal-hide');
    const requiredHides = startingHides + 4;
    this.#kill('dwarf', 3);
    for (const monsterId of ['orc', 'kobold', 'spider']) {
      while (
        quantityOf(this.#inventory, 'animal-hide') < requiredHides &&
        this.#hasUnusedSpawn(monsterId)
      ) {
        this.#kill(monsterId, 1);
      }
    }
    if (quantityOf(this.#inventory, 'animal-hide') < requiredHides) {
      this.#blocked(
        'collect animal-hide',
        'drop-shortage',
        `deterministic public drops produced ${String(quantityOf(this.#inventory, 'animal-hide') - startingHides)}/4 new hides`,
      );
    }
    this.#claim('field-supplies');
  }

  completeBlackKnightAssault(): void {
    this.#stage = 'black-knight-assault';
    this.acceptQuest('black-knight-assault');
    this.#buyHealingSupplies();
    this.#kill('black-knight', 6);
    this.#kill('kurt', 1);
    this.#claim('black-knight-assault');
  }

  completeDungeonSeal(): void {
    this.#stage = 'dungeon-seal';
    this.#buyHealingSupplies();
    this.acceptQuest('dungeon-seal');
    this.#signal({ type: 'area-entered', mapId: this.#world.player.mapId });
    this.#kill('skeleton', 8);
    if (quantityOf(this.#inventory, 'bone-piece') < 6) {
      this.#blocked('collect bone-piece', 'drop-shortage', 'all legal skeleton spawns exhausted');
    }
    this.#claim('dungeon-seal');
  }

  defeatBaphomet(): void {
    this.#stage = 'baphomet';
    this.#buyHealingSupplies();
    this.acceptQuest('baphomet-ending');
    this.travelTo('talking-island-dungeon-2');
    this.#signal({ type: 'area-entered', mapId: 'talking-island-dungeon-2' });
    this.#kill('baphomet', 1);
  }

  completeFinalReport(): void {
    this.#stage = 'final-report';
    this.interact('gunther');
    this.#claim('baphomet-ending');
    this.#stage = 'free-explore';
  }

  move(x: number, y: number): void {
    const map = this.#maps.get(this.#world.player.mapId);
    if (map === undefined) this.#blocked('move', 'unknown-map', this.#world.player.mapId);
    const path = findPath(map.grid, this.#world.player, { x, y });
    if (path.length === 0) this.#blocked('move', 'unreachable', `${String(x)},${String(y)}`);
    for (const point of path.slice(1)) {
      this.#world = { ...this.#world, player: { ...this.#world.player, ...point } };
      this.#world = { ...this.#world, worldTimeMs: this.#world.worldTimeMs + 50 };
    }
  }

  interact(npcId: string): void {
    const npc = this.#content.npc(npcId);
    this.travelTo(npc.mapId);
    this.move(npc.x, npc.y);
    this.#signal({ type: 'npc-talked', npcId });
  }

  attack(monsterId: string): void {
    this.#kill(monsterId, 1);
  }

  cast(abilityId: string, monsterId: string): void {
    if (!this.#abilityIds.includes(abilityId)) {
      this.#blocked('cast', 'ability-locked', abilityId);
    }
    const monster = this.#content.monster(monsterId);
    this.#castAtTarget(abilityId, {
      id: monster.id,
      hp: monster.hp,
      maxHP: monster.hp,
      ac: monster.ac,
      hitBonus: monster.level,
      damage: [monster.attack, monster.attack],
    });
  }

  use(itemId: string): void {
    const contentItem = this.#content.item(itemId);
    if (contentItem.manaAmount !== undefined) {
      const item = itemDefinition(this.#content, itemId);
      const removed = removeItem(this.#inventory, item, 1);
      if (!removed.ok) this.#blocked('use item', removed.reason, itemId);
      this.#inventory = removed.inventory;
      this.#character = {
        ...this.#character,
        mp: Math.min(deriveStats(this.#character).maxMP, this.#character.mp + contentItem.manaAmount),
        carriedWeight: removed.inventory.carriedWeight,
      };
      return;
    }
    const result = useItem(this.#inventory, this.#character, itemDefinition(this.#content, itemId));
    if (!result.ok) this.#blocked('use item', result.reason, itemId);
    this.#inventory = result.inventory;
    this.#character = result.character;
  }

  equip(itemId: string): void {
    const item = itemDefinition(this.#content, itemId);
    const result = item.equipmentSlot !== undefined && this.#equipment[item.equipmentSlot] !== undefined
      ? replaceEquipment(
          this.#inventory,
          this.#equipment,
          this.#character,
          (equippedItemId) => itemDefinition(this.#content, equippedItemId),
          item.equipmentSlot,
          item,
        )
      : equipItem(this.#inventory, this.#equipment, this.#character, item);
    if (!result.ok) this.#blocked('equip', result.reason, itemId);
    this.#inventory = result.inventory;
    this.#equipment = result.equipment;
    this.#character = {
      ...this.#character,
      carriedWeight: result.inventory.carriedWeight,
      equipmentAC: Object.values(result.equipment).reduce(
        (ac, equippedId) => ac + (this.#content.item(equippedId).acModifier ?? 0),
        0,
      ),
    };
  }

  buy(npcId: string, itemId: string, quantity: number): void {
    const npc = this.#content.npc(npcId);
    if (!npc.shopItemIds.includes(itemId)) this.#blocked('buy', 'not-sold-here', itemId);
    this.interact(npcId);
    const result = buyItem(this.#inventory, itemDefinition(this.#content, itemId), quantity);
    if (!result.ok) this.#blocked('buy', result.reason, itemId);
    this.#inventory = result.inventory;
  }

  sell(npcId: string, itemId: string, quantity: number): void {
    this.interact(npcId);
    const result = sellItem(this.#inventory, itemDefinition(this.#content, itemId), quantity);
    if (!result.ok) this.#blocked('sell', result.reason, itemId);
    this.#inventory = result.inventory;
  }

  deposit(): never {
    return this.#blocked('deposit', 'missing-public-operation', 'warehouse reducer is UI-local');
  }

  withdraw(): never {
    return this.#blocked('withdraw', 'missing-public-operation', 'warehouse reducer is UI-local');
  }

  acceptQuest(questId: string): void {
    const quest = this.#content.quest(questId);
    this.interact(quest.giverNpcId);
    const next = startQuest(this.#quests, questId, this.#character.classId, this.#questCatalog);
    if (next === this.#quests) this.#blocked('accept quest', 'quest-unavailable', questId);
    this.#quests = next;
  }

  chooseDialogue(node: DialogueNode, choiceId: string): void {
    const result = chooseDialogue(node, choiceId);
    if (!result.ok) this.#blocked('choose dialogue', result.reason, choiceId);
    if (result.choice.signal !== undefined) this.#signal(result.choice.signal);
  }

  exitTransition(targetMapId: string): void {
    const current = this.#content.map(this.#world.player.mapId);
    const exit = current.exits.find(({ targetMapId: target }) => target === targetMapId);
    if (exit === undefined) this.#blocked('exit transition', 'missing-exit', targetMapId);
    this.move(exit.x, exit.y);
    const result = transitionEntity(this.#world, this.#maps);
    if (!result.ok) this.#blocked('exit transition', result.reason, targetMapId);
    this.#world = result.state;
    this.#signal({ type: 'area-entered', mapId: targetMapId });
  }

  travelTo(targetMapId: string): void {
    const route = mapRoute(this.#content, this.#world.player.mapId, targetMapId);
    if (route.length === 0) this.#blocked('travel', 'unreachable-map', targetMapId);
    for (const nextMapId of route.slice(1)) this.exitTransition(nextMapId);
  }

  canEnter(mapId: string): boolean {
    return mapRoute(this.#content, this.#world.player.mapId, mapId).length > 0;
  }

  maxNormalKillsInOneStage(): number {
    return Math.max(0, ...this.#killCounts.values());
  }

  #kill(monsterId: string, count: number): void {
    for (let index = 0; index < count; index += 1) this.#fightOne(monsterId);
  }

  #fightOne(monsterId: string): void {
    const spawn = this.#nextSpawn(monsterId);
    this.travelTo(spawn.mapId);
    this.#moveAdjacent(spawn.x, spawn.y);
    const definition = this.#content.monster(monsterId);
    let target: Combatant = {
      id: `${spawn.mapId}:${monsterId}:${String(this.#usedSpawns.get(`${spawn.mapId}:${monsterId}`) ?? 0)}`,
      hp: definition.hp,
      maxHP: definition.hp,
      ac: definition.ac,
      hitBonus: definition.level,
      damage: [definition.attack, definition.attack],
    };
    while (target.hp > 0) {
      let abilityId = this.#availableAttackAbility(definition.rank);
      if (
        abilityId === undefined &&
        this.#shouldUseAttackAbilities(definition.rank) &&
        (this.#character.classId === 'wizard' || this.#character.classId === 'elf') &&
        this.#character.mp < (this.#character.classId === 'wizard' ? 2 : 1) &&
        quantityOf(this.#inventory, 'blue-potion') > 0
      ) {
        this.use('blue-potion');
        abilityId = this.#availableAttackAbility(definition.rank);
      }
      if (abilityId === undefined) {
        target = resolveAttack(this.#playerCombatant(), target, this.#rng).target;
      } else {
        target = this.#castAtTarget(abilityId, target);
      }
      if (target.hp <= 0) break;
      this.#healBeforeCounterattack(definition.attack);
      const counter = resolveAttack(target, this.#playerCombatant(), this.#rng);
      this.#character = { ...this.#character, hp: counter.target.hp };
      this.#world = { ...this.#world, worldTimeMs: this.#world.worldTimeMs + 500 };
      if (this.#character.hp <= 0) {
        this.#blocked(
          `attack ${monsterId}`,
          'combat-survival',
          `level ${String(this.#character.level)} ${this.#character.classId} died with legal equipment/items`,
        );
      }
    }
    const progression = applyExperience(this.#character, definition.experience);
    this.#character = progression.character;
    this.#recordKill(definition.rank === 'normal' ? monsterId : `${monsterId}:non-normal`);
    if (monsterId === 'baphomet') {
      this.#signal({ type: 'boss-defeated', monsterId });
    } else {
      this.#signal({ type: 'monster-defeated', monsterId, count: 1 });
    }
    for (const drop of rollDrops(definition.drops, this.#rng)) {
      this.#pickUpOptionalDrop(drop.itemId, drop.quantity);
    }
  }

  #playerCombatant(): Combatant {
    const stats = deriveStats(this.#character);
    const weaponId = this.#equipment.weapon;
    const weaponDamage = weaponId === undefined
      ? 2
      : (this.#content.item(weaponId).damageSmall ?? 2);
    return {
      id: this.#character.id,
      hp: this.#character.hp,
      maxHP: stats.maxHP,
      mp: this.#character.mp,
      maxMP: stats.maxMP,
      ac: stats.ac,
      hitBonus: stats.hitBonus,
      damage: [Math.max(1, weaponDamage + stats.damageBonus - 2), weaponDamage + stats.damageBonus],
      classId: this.#character.classId,
      level: this.#character.level,
      cooldowns: this.#cooldowns,
    };
  }

  #availableAttackAbility(rank: string): string | undefined {
    if (!this.#shouldUseAttackAbilities(rank)) return undefined;
    return this.#abilityIds
      .map((abilityId) => this.#content.ability(abilityId))
      .filter((ability) =>
        ability.kind === 'attack' &&
        ability.unlockLevel <= this.#character.level &&
        ability.manaCost <= this.#character.mp &&
        (this.#cooldowns[ability.id] ?? 0) <= this.#world.worldTimeMs &&
        (ability.id !== 'rapid-shot' || this.#equipment.weapon === 'bow') &&
        (ability.reagentItemId === undefined || quantityOf(this.#inventory, ability.reagentItemId) > 0),
      )
      .sort((left, right) => right.power - left.power)[0]?.id;
  }

  #shouldUseAttackAbilities(rank: string): boolean {
    return rank !== 'normal' ||
      this.#character.classId === 'elf' ||
      (this.#character.classId === 'wizard' && this.#stage === 'dungeon-seal');
  }

  #castAtTarget(abilityId: string, target: Combatant): Combatant {
    const contentAbility = this.#content.ability(abilityId);
    const definition: CombatAbilityDefinition = {
      id: contentAbility.id,
      allowedClasses: contentAbility.allowedClasses,
      minLevel: contentAbility.unlockLevel,
      mpCost: contentAbility.manaCost,
      range: 8,
      cooldownMs: contentAbility.cooldownMs,
      ...(contentAbility.reagentItemId === undefined
        ? {}
        : { requiredItemId: contentAbility.reagentItemId }),
      effect: contentAbility.kind === 'heal'
        ? { type: 'heal', healing: [contentAbility.power, contentAbility.power] }
        : { type: 'damage', damage: [contentAbility.power, contentAbility.power] },
    };
    const result = castAbility(
      this.#playerCombatant(),
      target,
      definition,
      {
        distance: 1,
        nowMs: this.#world.worldTimeMs,
        availableItemIds: this.#inventory.stacks.map(({ itemId }) => itemId),
      },
      this.#rng,
    );
    if (!result.ok) this.#blocked('cast', result.reason, abilityId);
    this.#character = {
      ...this.#character,
      hp: Math.max(1, result.caster.hp - contentAbility.hpCost),
      mp: result.caster.mp ?? this.#character.mp,
    };
    this.#cooldowns = result.caster.cooldowns ?? this.#cooldowns;
    if (contentAbility.reagentItemId !== undefined) {
      const reagent = itemDefinition(this.#content, contentAbility.reagentItemId);
      const removed = removeItem(this.#inventory, reagent, 1);
      if (!removed.ok) this.#blocked('consume reagent', removed.reason, reagent.id);
      this.#inventory = removed.inventory;
    }
    return result.target;
  }

  #healBeforeCounterattack(incomingDamage: number): void {
    while (this.#character.hp <= incomingDamage) {
      const stats = deriveStats(this.#character);
      const candidates = this.#inventory.stacks
        .map(({ itemId }) => this.#content.item(itemId))
        .filter((item) => item.kind === 'consumable' && item.healAmount !== undefined)
        .sort((left, right) => (left.healAmount ?? 0) - (right.healAmount ?? 0));
      const potion = candidates.find(({ healAmount }) =>
        this.#character.hp + (healAmount ?? 0) > incomingDamage,
      ) ?? candidates.at(-1);
      if (potion === undefined || this.#character.hp >= stats.maxHP) return;
      this.use(potion.id);
    }
  }

  #acquireItem(itemId: string, quantity: number): void {
    const result = addItem(this.#inventory, itemDefinition(this.#content, itemId), quantity);
    if (!result.ok) this.#blocked('pick up', result.reason, `${itemId} x${String(quantity)}`);
    this.#inventory = result.inventory;
    this.#character = { ...this.#character, carriedWeight: result.inventory.carriedWeight };
    this.#signal({ type: 'item-acquired', itemId, count: quantity });
  }

  #pickUpOptionalDrop(itemId: string, quantity: number): void {
    const item = this.#content.item(itemId);
    if (item.equipmentSlot !== undefined) {
      if (quantity !== 1 || !item.allowedClasses.includes(this.#character.classId)) return;
      if (
        (this.#character.classId === 'elf' && item.equipmentSlot === 'weapon' && item.id !== 'bow') ||
        (item.id === 'two-handed-sword' && this.#equipment.shield !== undefined)
      ) return;
      const equippedId = this.#equipment[item.equipmentSlot];
      const equipped = equippedId === undefined ? undefined : this.#content.item(equippedId);
      const newScore = item.equipmentSlot === 'weapon'
        ? (item.damageSmall ?? 0)
        : -(item.acModifier ?? 0);
      const equippedScore = equipped === undefined
        ? -1
        : item.equipmentSlot === 'weapon'
          ? (equipped.damageSmall ?? 0)
          : -(equipped.acModifier ?? 0);
      if (newScore <= equippedScore) return;
    }
    const result = addItem(this.#inventory, itemDefinition(this.#content, itemId), quantity);
    if (!result.ok) return;
    this.#inventory = result.inventory;
    this.#character = { ...this.#character, carriedWeight: result.inventory.carriedWeight };
    this.#signal({ type: 'item-acquired', itemId, count: quantity });
    if (item.equipmentSlot !== undefined) this.equip(itemId);
  }

  #claim(questId: string): void {
    this.interact(this.#content.quest(questId).giverNpcId);
    const result = claimReward(
      this.#quests,
      questId,
      {
        inventory: this.#inventory,
        experience: this.#character.experience,
        abilityIds: this.#abilityIds,
      },
      this.#questCatalog,
      this.#items,
    );
    if (!result.ok) this.#blocked('claim quest', result.reason, questId);
    this.#quests = result.state;
    this.#inventory = result.target.inventory;
    const gainedExperience = result.target.experience - this.#character.experience;
    this.#character = applyExperience(this.#character, gainedExperience).character;
    this.#abilityIds = [...result.target.abilityIds];
  }

  #signal(signal: QuestSignal): void {
    if (signal.type === 'boss-defeated') this.#bossSignals.add(signal.monsterId);
    this.#quests = advanceQuest(this.#quests, signal, this.#questCatalog);
  }

  #nextSpawn(monsterId: string): { readonly mapId: string; readonly x: number; readonly y: number } {
    for (const map of this.#content.maps) {
      for (const spawn of map.spawns) {
        if (spawn.monsterId !== monsterId) continue;
        const key = `${map.id}:${monsterId}`;
        const used = this.#usedSpawns.get(key) ?? 0;
        if (used >= spawn.count) continue;
        this.#usedSpawns.set(key, used + 1);
        return { mapId: map.id, x: spawn.x, y: spawn.y };
      }
    }
    return this.#blocked('attack', 'spawn-exhausted', monsterId);
  }

  #hasUnusedSpawn(monsterId: string): boolean {
    return this.#content.maps.some((map) =>
      map.spawns.some((spawn) =>
        spawn.monsterId === monsterId &&
        (this.#usedSpawns.get(`${map.id}:${monsterId}`) ?? 0) < spawn.count,
      ),
    );
  }

  #moveAdjacent(x: number, y: number): void {
    const map = this.#maps.get(this.#world.player.mapId);
    if (map === undefined) this.#blocked('move adjacent', 'unknown-map', this.#world.player.mapId);
    const candidates = [
      { x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 },
      { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
      { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 },
    ].filter((point) => map.grid.isWalkable(point));
    const reachable = candidates
      .map((point) => ({ point, path: findPath(map.grid, this.#world.player, point) }))
      .filter(({ path }) => path.length > 0)
      .sort((left, right) => left.path.length - right.path.length)[0];
    if (reachable === undefined) this.#blocked('move adjacent', 'unreachable', `${String(x)},${String(y)}`);
    this.move(reachable.point.x, reachable.point.y);
  }

  #recordKill(monsterId: string): void {
    const key = `${this.#stage}:${monsterId}`;
    this.#killCounts.set(key, (this.#killCounts.get(key) ?? 0) + 1);
  }

  #buyHealingSupplies(): void {
    this.travelTo('talking-island-village');
    if (this.#character.classId === 'elf') {
      const arrow = this.#content.item('wooden-arrow');
      const desired = Math.max(0, 30 - quantityOf(this.#inventory, arrow.id));
      const affordable = Math.floor(this.#inventory.adena / arrow.buyPrice);
      const quantity = Math.min(desired, affordable);
      if (quantity > 0) this.buy('pandora', arrow.id, quantity);
    }
    const quantity = Math.floor(this.#inventory.adena / this.#content.item('red-potion').buyPrice);
    if (quantity > 0) this.buy('pandora', 'red-potion', quantity);
  }

  #blocked(action: string, reason: string, detail: string): never {
    throw new PlaythroughBlockedError(this.#stage, action, reason, detail);
  }
}

export const endingIsUnlocked = (driver: PlaythroughDriver): boolean =>
  isEndingUnlocked(driver.state.world.flags);
