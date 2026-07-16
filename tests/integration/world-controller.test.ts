import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';
import { WorldController } from '../../src/game/systems/WorldController';
import { TileGrid } from '../../src/world/grid';
import { completeSave } from '../helpers/saveFixtures';
import { monsterAt } from '../helpers/worldFixtures';

const content = loadBundledContent();
const grid = TileGrid.fromRows(Array.from({ length: 16 }, () => '.'.repeat(16)));

const createController = (monsterHp = 14): WorldController =>
  new WorldController({
    content,
    save: {
      ...completeSave({ slot: 1 }),
      world: {
        player: { mapId: 'north-field', x: 2, y: 2 },
        defeatedBosses: [],
        flags: {},
        worldTimeMs: 0,
      },
    },
    grids: new Map([['north-field', grid]]),
    monsters: [
      monsterAt(
        { x: 5, y: 2 },
        {
          id: 'goblin-1',
          mapId: 'north-field',
          hp: monsterHp,
          maxHP: monsterHp,
          alertRadius: 0,
          aiState: 'idle',
        },
      ),
    ],
    seed: 7,
  });

describe('WorldController', () => {
  it('uses 50ms fixed steps and caps one update at 250ms', () => {
    const controller = createController();
    controller.dispatch({ type: 'move', x: 4, y: 2 });

    controller.update(49);
    expect(controller.snapshot.player).toMatchObject({ x: 2, y: 2 });
    expect(controller.fixedStepCount).toBe(0);
    controller.update(1);
    expect(controller.snapshot.player).toMatchObject({ x: 3, y: 2 });
    expect(controller.fixedStepCount).toBe(1);

    controller.update(1_000);
    expect(controller.fixedStepCount).toBe(6);
    expect(controller.snapshot.worldTimeMs).toBe(300);
  });

  it('does not advance while paused', () => {
    const controller = createController();
    controller.dispatch({ type: 'move', x: 4, y: 2 });
    controller.setPaused(true);
    controller.update(250);
    expect(controller.snapshot.player).toMatchObject({ x: 2, y: 2 });
    expect(controller.snapshot.worldTimeMs).toBe(0);
    controller.setPaused(false);
    controller.update(50);
    expect(controller.snapshot.player).toMatchObject({ x: 3, y: 2 });
  });

  it('changes maps only after an explicit move onto a known exit', () => {
    const largeGrid = TileGrid.fromRows(Array.from({ length: 96 }, () => '.'.repeat(96)));
    const controller = new WorldController({
      content,
      save: {
        ...completeSave({ slot: 1 }),
        world: {
          player: { mapId: 'north-field', x: 93, y: 48 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      grids: new Map([
        ['north-field', largeGrid],
        ['talking-island-village', largeGrid],
      ]),
      monsters: [],
    });

    controller.dispatch({ type: 'move', x: 94, y: 48 });
    controller.update(50);

    expect(controller.snapshot.player).toEqual({
      mapId: 'talking-island-village',
      x: 2,
      y: 20,
    });
  });

  it('approaches an attack target, emits damage, and movement cancels auto-attack', () => {
    const controller = createController();
    controller.dispatch({ type: 'attack', targetId: 'goblin-1' });

    controller.update(250);
    expect(controller.snapshot.player).toMatchObject({ x: 4, y: 2 });
    expect(controller.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'damage', targetId: 'goblin-1' }),
    );

    controller.dispatch({ type: 'move', x: 3, y: 3 });
    expect(controller.snapshot.autoAttackTargetId).toBeNull();
  });

  it('turns monster death into deterministic ground loot and picks it up through inventory rules', () => {
    const controller = createController(1);
    controller.dispatch({ type: 'attack', targetId: 'goblin-1' });
    controller.update(250);

    expect(controller.snapshot.monsters[0]).toMatchObject({ hp: 0, aiState: 'dead' });
    expect(controller.snapshot.groundLoot).toContainEqual(
      expect.objectContaining({ itemId: 'wooden-club', x: 5, y: 2 }),
    );
    const loot = controller.snapshot.groundLoot[0];
    expect(loot).toBeDefined();
    if (loot === undefined) return;

    controller.dispatch({ type: 'interact', targetId: loot.id });
    expect(controller.snapshot.groundLoot).toHaveLength(0);
    expect(controller.snapshot.inventory.stacks).toContainEqual({
      itemId: 'wooden-club',
      quantity: 1,
    });
  });
});
