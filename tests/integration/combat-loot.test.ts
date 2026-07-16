import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';
import { resolveAttack, type Combatant } from '../../src/core/combat';
import type { InventoryState } from '../../src/core/inventory';
import { SeededRng } from '../../src/core/rng';
import { rollDrops, storeOrDropLoot } from '../../src/world/ai';

const emptyInventory = (weightLimit = 500): InventoryState => ({
  stacks: [],
  adena: 0,
  carriedWeight: 0,
  weightLimit,
});

describe('combat to loot integration', () => {
  it('turns a real combat death into deterministic content-defined drops', () => {
    const content = loadBundledContent();
    const baphomet = content.monster('baphomet');
    const hero: Combatant = {
      id: 'hero',
      hp: 100,
      maxHP: 100,
      ac: 0,
      hitBonus: 1_000,
      damage: [1, 1],
    };
    const target: Combatant = {
      id: baphomet.id,
      hp: 1,
      maxHP: baphomet.hp,
      ac: baphomet.ac,
      hitBonus: 0,
      damage: [baphomet.attack, baphomet.attack],
    };

    const combat = resolveAttack(hero, target, new SeededRng(7));
    expect(combat.events).toContainEqual({ type: 'death', entityId: 'baphomet' });

    const first = rollDrops(baphomet.drops, new SeededRng(3));
    const second = rollDrops(baphomet.drops, new SeededRng(3));

    expect(first).toEqual(second);
    expect(first).toEqual([
      { itemId: 'plate-mail', quantity: 1 },
      { itemId: 'wisdom-potion', quantity: 1 },
      { itemId: 'clear-potion', quantity: 3 },
    ]);
  });

  it('adds carried drops through inventory rules', () => {
    const content = loadBundledContent();
    const result = storeOrDropLoot(
      emptyInventory(),
      [{ itemId: 'red-potion', quantity: 2 }],
      content.item,
      { mapId: 'north-field', x: 5, y: 7 },
    );

    expect(result.inventory.stacks).toEqual([{ itemId: 'red-potion', quantity: 2 }]);
    expect(result.inventory.carriedWeight).toBe(4);
    expect(result.groundLoot).toEqual([]);
  });

  it('emits deterministic ground loot when inventory capacity rejects a drop', () => {
    const content = loadBundledContent();
    const inventory = emptyInventory(0);

    const result = storeOrDropLoot(
      inventory,
      [{ itemId: 'clear-potion', quantity: 3 }],
      content.item,
      { mapId: 'talking-island-dungeon-2', x: 52, y: 52 },
    );

    expect(result.inventory).toBe(inventory);
    expect(result.groundLoot).toEqual([
      {
        id: 'talking-island-dungeon-2:52:52:0:clear-potion',
        itemId: 'clear-potion',
        quantity: 3,
        mapId: 'talking-island-dungeon-2',
        x: 52,
        y: 52,
      },
    ]);
  });
});
