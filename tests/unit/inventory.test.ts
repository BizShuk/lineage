import { describe, expect, it } from 'vitest';

import {
  addItem,
  consumeAmmunition,
  equipItem,
  removeItem,
  useItem,
} from '../../src/core/inventory';
import { deriveStats } from '../../src/core/stats';
import {
  emptyEquipment,
  inventoryWith,
  item,
  knight,
} from '../helpers/inventoryFixtures';

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
