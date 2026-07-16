import type {
  AbilityDefinition,
  ClassDefinition,
  ItemDefinition,
  MapDefinition,
  MonsterDefinition,
  NpcDefinition,
  ParsedGameContent,
  QuestDefinition,
} from './schema';
import type { ItemDefinition as DomainItemDefinition } from '../core/inventory';

type Definition = { id: string };

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
};

const createIndex = <T extends Definition>(definitions: readonly T[]): Readonly<Record<string, T>> =>
  Object.freeze(Object.fromEntries(definitions.map((definition) => [definition.id, definition])));

const normalizeDomainItem = (item: ItemDefinition): ItemDefinition & DomainItemDefinition => {
  const { equipmentSlot, healAmount, ...definition } = item;

  return {
    ...definition,
    ...(equipmentSlot === undefined ? {} : { equipmentSlot }),
    ...(healAmount === undefined ? {} : { healAmount }),
  };
};

const requiredLookup = <T>(index: Readonly<Record<string, T>>, kind: string, id: string): T => {
  const definition = index[id];
  if (definition === undefined) {
    throw new Error(`找不到${kind}內容：${id}`);
  }
  return definition;
};

export interface GameContent {
  readonly classes: readonly ClassDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly abilities: readonly AbilityDefinition[];
  readonly monsters: readonly MonsterDefinition[];
  readonly npcs: readonly NpcDefinition[];
  readonly quests: readonly QuestDefinition[];
  readonly maps: readonly MapDefinition[];
  readonly item: (id: string) => ItemDefinition;
  readonly ability: (id: string) => AbilityDefinition;
  readonly monster: (id: string) => MonsterDefinition;
  readonly npc: (id: string) => NpcDefinition;
  readonly quest: (id: string) => QuestDefinition;
  readonly map: (id: string) => MapDefinition;
}

export const createGameContent = (parsed: ParsedGameContent): GameContent => {
  const classes = deepFreeze(parsed.classes);
  const items = deepFreeze(parsed.items.map(normalizeDomainItem));
  const abilities = deepFreeze(parsed.abilities);
  const monsters = deepFreeze(parsed.monsters);
  const npcs = deepFreeze(parsed.npcs);
  const quests = deepFreeze(parsed.quests);
  const maps = deepFreeze(parsed.maps);
  const itemIndex = createIndex(items);
  const abilityIndex = createIndex(abilities);
  const monsterIndex = createIndex(monsters);
  const npcIndex = createIndex(npcs);
  const questIndex = createIndex(quests);
  const mapIndex = createIndex(maps);

  return Object.freeze({
    classes,
    items,
    abilities,
    monsters,
    npcs,
    quests,
    maps,
    item: (id: string) => requiredLookup(itemIndex, '物品', id),
    ability: (id: string) => requiredLookup(abilityIndex, '能力', id),
    monster: (id: string) => requiredLookup(monsterIndex, '怪物', id),
    npc: (id: string) => requiredLookup(npcIndex, 'NPC', id),
    quest: (id: string) => requiredLookup(questIndex, '任務', id),
    map: (id: string) => requiredLookup(mapIndex, '地圖', id),
  });
};
