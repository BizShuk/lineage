import { describe, expect, it } from 'vitest';

import {
  addItem,
  consumeAmmunition,
  equipItem,
  removeItem,
  replaceEquipment,
  unequipItem,
  useItem,
  type InventoryState,
  type ItemDefinition,
} from '../../src/core/inventory';
import { deriveStats } from '../../src/core/stats';
import {
  emptyEquipment,
  inventoryWith,
  item,
  knight,
} from '../helpers/inventoryFixtures';

const stackableRing: ItemDefinition = {
  id: 'stackable-ring',
  name: '測試戒指',
  kind: 'armor',
  weight: 5,
  stackLimit: 2,
  buyPrice: 20,
  sellPrice: 10,
  allowedClasses: ['prince', 'knight', 'elf', 'wizard'],
  equipmentSlot: 'ring',
};

const replacementRing: ItemDefinition = {
  ...stackableRing,
  id: 'replacement-ring',
  name: '替換戒指',
};

const equipmentItemLookup = (itemId: string): ItemDefinition => {
  if (itemId === stackableRing.id) return stackableRing;
  if (itemId === replacementRing.id) return replacementRing;
  if (itemId === 'iron-sword') return item('iron-sword');
  if (itemId === 'wizard-staff') return item('wizard-staff');
  if (itemId === 'iron-armor') return item('iron-armor');
  throw new Error(`Unknown test item: ${itemId}`);
};

const ringInventory = (quantity: number, weightLimit: number): InventoryState => ({
  stacks: [{ itemId: stackableRing.id, quantity }],
  adena: 0,
  carriedWeight: stackableRing.weight * quantity,
  weightLimit,
});

describe('inventory stacks and weight', () => {
  it('adds to an existing stack up to its definition limit', () => {
    const inventory = inventoryWith({ itemId: 'wooden-arrow', quantity: 99 });

    const result = addItem(inventory, item('wooden-arrow'), 1);

    expect(result.ok).toBe(true);
    expect(result.inventory).toEqual({
      ...inventory,
      carriedWeight: 100,
      stacks: [{ itemId: 'wooden-arrow', quantity: 100 }],
    });
    expect(inventory.stacks).toEqual([{ itemId: 'wooden-arrow', quantity: 99 }]);
  });

  it('rejects a quantity that would exceed the stack limit atomically', () => {
    const inventory = inventoryWith({ itemId: 'wooden-arrow', quantity: 99 });

    const result = addItem(inventory, item('wooden-arrow'), 2);

    expect(result).toMatchObject({ ok: false, reason: 'invalid-quantity' });
    expect(result.inventory).toBe(inventory);
  });

  it('rejects an item that would exceed the weight limit atomically', () => {
    const inventory = inventoryWith([], { weightLimit: 50 });

    const result = addItem(inventory, item('heavy-stone'), 1);

    expect(result).toMatchObject({ ok: false, reason: 'overweight' });
    expect(result.inventory).toBe(inventory);
  });

  it('removes a stack and updates carried weight without mutating the input', () => {
    const inventory = inventoryWith({ itemId: 'wooden-arrow', quantity: 2 });

    const result = removeItem(inventory, item('wooden-arrow'), 2);

    expect(result.ok).toBe(true);
    expect(result.inventory).toEqual({ ...inventory, stacks: [], carriedWeight: 0 });
    expect(inventory.stacks).toEqual([{ itemId: 'wooden-arrow', quantity: 2 }]);
  });

  it('rejects removing unavailable stock without a partial removal', () => {
    const inventory = inventoryWith({ itemId: 'wooden-arrow', quantity: 1 });

    const result = removeItem(inventory, item('wooden-arrow'), 2);

    expect(result).toMatchObject({ ok: false, reason: 'missing-item' });
    expect(result.inventory).toBe(inventory);
  });
});

describe('equipment and consumables', () => {
  it('rejects unequipping an empty slot without creating new state', () => {
    const inventory = inventoryWith();
    const equipment = emptyEquipment();

    const result = unequipItem(inventory, equipment, equipmentItemLookup, 'weapon');

    expect(result).toMatchObject({ ok: false, reason: 'invalid-quantity' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('unequips an item into inventory without mutating either input', () => {
    const inventory = inventoryWith();
    const equipment = { weapon: 'iron-sword' } as const;

    const result = unequipItem(inventory, equipment, equipmentItemLookup, 'weapon');

    expect(result.ok).toBe(true);
    expect(result.inventory.stacks).toEqual([{ itemId: 'iron-sword', quantity: 1 }]);
    expect(result.inventory.carriedWeight).toBe(30);
    expect(result.equipment).toEqual({});
    expect(inventory.stacks).toEqual([]);
    expect(equipment).toEqual({ weapon: 'iron-sword' });
  });

  it('merges an unequipped item into its existing stack', () => {
    const inventory = ringInventory(1, 100);
    const equipment = { ring: stackableRing.id } as const;

    const result = unequipItem(inventory, equipment, equipmentItemLookup, 'ring');

    expect(result.ok).toBe(true);
    expect(result.inventory.stacks).toEqual([{ itemId: stackableRing.id, quantity: 2 }]);
    expect(result.inventory.carriedWeight).toBe(10);
    expect(result.equipment).toEqual({});
  });

  it('rolls unequip back when the destination stack is full', () => {
    const inventory = ringInventory(2, 100);
    const equipment = { ring: stackableRing.id } as const;

    const result = unequipItem(inventory, equipment, equipmentItemLookup, 'ring');

    expect(result).toMatchObject({ ok: false, reason: 'invalid-quantity' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('rolls unequip back when the returned item would exceed weight capacity', () => {
    const inventory = ringInventory(1, 5);
    const equipment = { weapon: 'iron-sword' } as const;

    const result = unequipItem(inventory, equipment, equipmentItemLookup, 'weapon');

    expect(result).toMatchObject({ ok: false, reason: 'overweight' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('rejects replacing equipment with an item for another slot atomically', () => {
    const inventory = inventoryWith({ itemId: 'iron-sword', quantity: 1 });
    const equipment = { armor: 'iron-armor' } as const;

    const result = replaceEquipment(
      inventory,
      equipment,
      knight(),
      equipmentItemLookup,
      'armor',
      item('iron-sword'),
    );

    expect(result).toMatchObject({ ok: false, reason: 'invalid-quantity' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('rejects replacing equipment with a class-incompatible item atomically', () => {
    const inventory = inventoryWith({ itemId: 'wizard-staff', quantity: 1 });
    const equipment = { weapon: 'iron-sword' } as const;

    const result = replaceEquipment(
      inventory,
      equipment,
      knight(),
      equipmentItemLookup,
      'weapon',
      item('wizard-staff'),
    );

    expect(result).toMatchObject({ ok: false, reason: 'wrong-class' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('rolls replacement back when unequipping into a full stack fails', () => {
    const inventory: InventoryState = {
      stacks: [
        { itemId: stackableRing.id, quantity: 2 },
        { itemId: replacementRing.id, quantity: 1 },
      ],
      adena: 0,
      carriedWeight: 15,
      weightLimit: 100,
    };
    const equipment = { ring: stackableRing.id } as const;

    const result = replaceEquipment(
      inventory,
      equipment,
      knight(),
      equipmentItemLookup,
      'ring',
      replacementRing,
    );

    expect(result).toMatchObject({ ok: false, reason: 'invalid-quantity' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('rolls replacement back when the new item is missing after unequip', () => {
    const inventory = inventoryWith();
    const equipment = { weapon: 'wizard-staff' } as const;

    const result = replaceEquipment(
      inventory,
      equipment,
      knight(),
      equipmentItemLookup,
      'weapon',
      item('iron-sword'),
    );

    expect(result).toMatchObject({ ok: false, reason: 'missing-item' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('rejects class-incompatible equipment without losing the item', () => {
    const inventory = inventoryWith({ itemId: 'wizard-staff', quantity: 1 });
    const equipment = emptyEquipment();

    const result = equipItem(inventory, equipment, knight(), item('wizard-staff'));

    expect(result).toMatchObject({ ok: false, reason: 'wrong-class' });
    expect(result.inventory).toBe(inventory);
    expect(result.equipment).toBe(equipment);
  });

  it('equips compatible equipment and removes it from inventory', () => {
    const inventory = inventoryWith({ itemId: 'iron-sword', quantity: 1 });
    const equipment = emptyEquipment();

    const result = equipItem(inventory, equipment, knight(), item('iron-sword'));

    expect(result.ok).toBe(true);
    expect(result.inventory.stacks).toEqual([]);
    expect(result.inventory.carriedWeight).toBe(0);
    expect(result.equipment).toEqual({ weapon: 'iron-sword' });
    expect(equipment).toEqual({});
  });

  it('caps potion healing at the character maximum and consumes one potion', () => {
    const character = knight();
    const maxHP = deriveStats(character).maxHP;
    const wounded = { ...character, hp: maxHP - 5 };
    const inventory = inventoryWith({ itemId: 'healing-potion', quantity: 2 });

    const result = useItem(inventory, wounded, item('healing-potion'));

    expect(result.ok).toBe(true);
    expect(result.character.hp).toBe(maxHP);
    expect(result.inventory.stacks).toEqual([
      { itemId: 'healing-potion', quantity: 1 },
    ]);
    expect(wounded.hp).toBe(maxHP - 5);
  });

  it('consumes one arrow only after a successful bow attack command', () => {
    const inventory = inventoryWith({ itemId: 'wooden-arrow', quantity: 2 });

    const result = consumeAmmunition(inventory, 'wooden-arrow');

    expect(result.stacks).toContainEqual({ itemId: 'wooden-arrow', quantity: 1 });
    expect(result.carriedWeight).toBe(1);
    expect(inventory.stacks).toContainEqual({ itemId: 'wooden-arrow', quantity: 2 });
  });

  it('preserves inventory when an attack has no required ammunition', () => {
    const inventory = inventoryWith();

    expect(consumeAmmunition(inventory, 'wooden-arrow')).toBe(inventory);
  });
});
