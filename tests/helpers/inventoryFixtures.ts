import type { CharacterState } from '../../src/core/model';
import type {
  EquipmentState,
  InventoryStack,
  InventoryState,
  ItemDefinition,
} from '../../src/core/inventory';
import { createCharacter } from '../../src/core/stats';

const ITEMS = {
  'wizard-staff': {
    id: 'wizard-staff',
    name: '法師之杖',
    kind: 'weapon',
    weight: 15,
    stackLimit: 1,
    buyPrice: 120,
    sellPrice: 45,
    allowedClasses: ['wizard'],
    equipmentSlot: 'weapon',
  },
  'iron-sword': {
    id: 'iron-sword',
    name: '鐵劍',
    kind: 'weapon',
    weight: 30,
    stackLimit: 1,
    buyPrice: 100,
    sellPrice: 35,
    allowedClasses: ['prince', 'knight', 'elf'],
    equipmentSlot: 'weapon',
  },
  'iron-armor': {
    id: 'iron-armor',
    name: '鐵甲',
    kind: 'armor',
    weight: 50,
    stackLimit: 1,
    buyPrice: 250,
    sellPrice: 90,
    allowedClasses: ['prince', 'knight'],
    equipmentSlot: 'armor',
  },
  'healing-potion': {
    id: 'healing-potion',
    name: '治癒藥水',
    kind: 'consumable',
    weight: 2,
    stackLimit: 20,
    buyPrice: 20,
    sellPrice: 7,
    allowedClasses: ['prince', 'knight', 'elf', 'wizard'],
    healAmount: 20,
  },
  'wooden-arrow': {
    id: 'wooden-arrow',
    name: '木箭',
    kind: 'ammunition',
    weight: 1,
    stackLimit: 100,
    buyPrice: 2,
    sellPrice: 1,
    allowedClasses: ['prince', 'knight', 'elf', 'wizard'],
  },
  'heavy-stone': {
    id: 'heavy-stone',
    name: '沉重的石頭',
    kind: 'quest',
    weight: 60,
    stackLimit: 10,
    buyPrice: 0,
    sellPrice: 0,
    allowedClasses: ['prince', 'knight', 'elf', 'wizard'],
  },
} as const satisfies Readonly<Record<string, ItemDefinition>>;

export function item(id: keyof typeof ITEMS): ItemDefinition {
  return ITEMS[id];
}

export function inventoryWith(
  stacks: InventoryStack | readonly InventoryStack[] = [],
  options: { adena?: number; weightLimit?: number } = {},
): InventoryState {
  const normalizedStacks: readonly InventoryStack[] =
    'itemId' in stacks ? [stacks] : stacks;
  const carriedWeight = normalizedStacks.reduce(
    (total, stack) => total + item(stack.itemId as keyof typeof ITEMS).weight * stack.quantity,
    0,
  );

  return {
    stacks: normalizedStacks.map((stack) => ({ ...stack })),
    adena: options.adena ?? 0,
    carriedWeight,
    weightLimit: options.weightLimit ?? 500,
  };
}

export function emptyEquipment(): EquipmentState {
  return {};
}

export function knight(): CharacterState {
  return createCharacter('測試騎士', 'knight');
}
