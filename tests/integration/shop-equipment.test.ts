import { describe, expect, it } from 'vitest';

import {
  buyItem,
  equipItem,
  replaceEquipment,
  sellItem,
  type ItemDefinition,
} from '../../src/core/inventory';
import {
  emptyEquipment,
  inventoryWith,
  item,
  knight,
} from '../helpers/inventoryFixtures';

const equipmentItemLookup = (itemId: string): ItemDefinition => {
  if (itemId === 'iron-sword') return item('iron-sword');
  if (itemId === 'wizard-staff') return item('wizard-staff');
  throw new Error(`Unknown test item: ${itemId}`);
};

describe('shop and equipment integration', () => {
  it('rejects a purchase with insufficient Adena without adding stock', () => {
    const inventory = inventoryWith([], { adena: 19 });

    const result = buyItem(inventory, item('healing-potion'), 1);

    expect(result).toMatchObject({ ok: false, reason: 'insufficient-adena' });
    expect(result.inventory).toBe(inventory);
  });

  it('charges the buy price and pays the lower sell price', () => {
    const inventory = inventoryWith([], { adena: 100 });

    const purchase = buyItem(inventory, item('healing-potion'), 1);
    expect(purchase.ok).toBe(true);
    expect(purchase.inventory.adena).toBe(80);

    const sale = sellItem(purchase.inventory, item('healing-potion'), 1);
    expect(sale.ok).toBe(true);
    expect(sale.inventory.adena).toBe(87);
    expect(sale.inventory.stacks).toEqual([]);
  });

  it('does not deduct Adena when any part of a multi-item purchase is invalid', () => {
    const inventory = inventoryWith(
      { itemId: 'healing-potion', quantity: 19 },
      { adena: 100 },
    );

    const result = buyItem(inventory, item('healing-potion'), 2);

    expect(result).toMatchObject({ ok: false, reason: 'invalid-quantity' });
    expect(result.inventory).toBe(inventory);
    expect(result.inventory.adena).toBe(100);
    expect(result.inventory.stacks).toEqual([
      { itemId: 'healing-potion', quantity: 19 },
    ]);
  });

  it('does not pay Adena when the full sale quantity is unavailable', () => {
    const inventory = inventoryWith(
      { itemId: 'healing-potion', quantity: 1 },
      { adena: 10 },
    );

    const result = sellItem(inventory, item('healing-potion'), 2);

    expect(result).toMatchObject({ ok: false, reason: 'missing-item' });
    expect(result.inventory).toBe(inventory);
    expect(result.inventory.adena).toBe(10);
  });

  it('rejects selling a quest item without removing it', () => {
    const inventory = inventoryWith({ itemId: 'heavy-stone', quantity: 1 });

    const result = sellItem(inventory, item('heavy-stone'), 1);

    expect(result).toMatchObject({ ok: false, reason: 'quest-item' });
    expect(result.inventory).toBe(inventory);
  });

  it('buys and equips an item through immutable transactions', () => {
    const initial = inventoryWith([], { adena: 150 });

    const purchase = buyItem(initial, item('iron-sword'), 1);
    expect(purchase.ok).toBe(true);

    const equipped = equipItem(
      purchase.inventory,
      emptyEquipment(),
      knight(),
      item('iron-sword'),
    );

    expect(equipped.ok).toBe(true);
    expect(equipped.inventory).toEqual({
      ...initial,
      adena: 50,
      carriedWeight: 0,
    });
    expect(equipped.equipment).toEqual({ weapon: 'iron-sword' });
    expect(initial).toEqual(inventoryWith([], { adena: 150 }));
  });

  it('atomically swaps held equipment without losing or duplicating either item', () => {
    const inventory = inventoryWith({ itemId: 'iron-sword', quantity: 1 });
    const equipment = { weapon: 'wizard-staff' } as const;

    const result = replaceEquipment(
      inventory,
      equipment,
      knight(),
      equipmentItemLookup,
      'weapon',
      item('iron-sword'),
    );

    expect(result.ok).toBe(true);
    expect(result.inventory.stacks).toEqual([{ itemId: 'wizard-staff', quantity: 1 }]);
    expect(result.inventory.carriedWeight).toBe(15);
    expect(result.equipment).toEqual({ weapon: 'iron-sword' });
    expect(inventory.stacks).toEqual([{ itemId: 'iron-sword', quantity: 1 }]);
    expect(equipment).toEqual({ weapon: 'wizard-staff' });
  });
});
