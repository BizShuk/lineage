import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';
import { createCharacter, deriveStats } from '../../src/core/stats';
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

const createBowController = (seed: number, arrowQuantity: number): WorldController => {
  const save = completeSave({ slot: 1 });
  const character = createCharacter('弓箭測試', 'elf');
  const stacks =
    arrowQuantity === 0 ? [] : [{ itemId: 'wooden-arrow', quantity: arrowQuantity }];
  return new WorldController({
    content,
    save: {
      ...save,
      character: { ...character, carriedWeight: arrowQuantity },
      inventory: {
        stacks,
        adena: 0,
        carriedWeight: arrowQuantity,
        weightLimit: deriveStats(character).weightLimit,
      },
      equipment: { weapon: 'bow' },
      quests: { active: {}, completed: [], claimedRewards: [] },
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
        { x: 3, y: 2 },
        { id: 'arrow-target', mapId: 'north-field', hp: 14, maxHP: 14, alertRadius: 0 },
      ),
    ],
    seed,
  });
};

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
    expect(controller.drainPersistenceEvents()).toEqual(['map-change']);
  });

  it('exposes complete authoritative save state and accepts transactional UI state', () => {
    const save = completeSave({ slot: 1 });
    const controller = new WorldController({
      content,
      save: {
        ...save,
        world: {
          player: { mapId: 'north-field', x: 2, y: 2 },
          defeatedBosses: ['baphomet'],
          flags: { baphometDefeated: true },
          worldTimeMs: 1_250,
        },
      },
      grids: new Map([['north-field', grid]]),
      monsters: [],
    });

    expect(controller.snapshot.world).toEqual({
      player: { mapId: 'north-field', x: 2, y: 2 },
      defeatedBosses: ['baphomet'],
      flags: { baphometDefeated: true },
      worldTimeMs: 1_250,
    });

    controller.syncSerializableState({
      character: { ...save.character, level: 9 },
      inventory: { ...save.inventory, adena: 777 },
      quests: {
        ...save.quests,
        completed: ['village-registration'],
      },
    });

    expect(controller.snapshot.character.level).toBe(9);
    expect(controller.snapshot.inventory.adena).toBe(777);
    expect(controller.snapshot.quests.completed).toEqual(['village-registration']);
    expect(controller.snapshot.world.flags).toEqual({ baphometDefeated: true });
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

  it('keeps one deterministic drop stream long enough to collect field-supplies hides', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('掉落測試', 'wizard'), level: 4 };
    const legalHideSpawns = content.maps
      .filter(({ id }) => id === 'north-field' || id === 'coast')
      .flatMap((map) =>
        map.spawns.flatMap((spawn, spawnIndex) =>
          ['orc', 'kobold', 'spider'].includes(spawn.monsterId)
            ? Array.from({ length: spawn.count }, (_, index) =>
                monsterAt(
                  { x: 3, y: 2 },
                  {
                    id: `${map.id}-${String(spawnIndex)}-${spawn.monsterId}-${String(index)}`,
                    monsterId: spawn.monsterId,
                    mapId: 'north-field',
                    hp: 1,
                    maxHP: 1,
                    alertRadius: 0,
                    patrolRadius: 0,
                  },
                ),
              )
            : [],
        ),
      );
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
        inventory: {
          ...save.inventory,
          weightLimit: deriveStats(character).weightLimit,
        },
        world: {
          player: { mapId: 'north-field', x: 2, y: 2 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      grids: new Map([['north-field', grid]]),
      monsters: legalHideSpawns,
      seed: 20_260_717,
    });

    let defeated = 0;
    for (const monster of legalHideSpawns) {
      const hideQuantity =
        controller.snapshot.inventory.stacks.find(({ itemId }) => itemId === 'animal-hide')
          ?.quantity ?? 0;
      if (hideQuantity >= 4) break;

      const cast = controller.cast('fire-arrow', monster.id);
      expect(cast.ok, cast.ok ? undefined : cast.reason).toBe(true);
      defeated += 1;
      const hide = controller.snapshot.groundLoot.find(
        ({ itemId }) => itemId === 'animal-hide',
      );
      if (hide !== undefined) controller.dispatch({ type: 'interact', targetId: hide.id });
      for (let tick = 0; tick < 4; tick += 1) controller.update(250);
    }

    expect(
      controller.snapshot.inventory.stacks.find(({ itemId }) => itemId === 'animal-hide')
        ?.quantity ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(defeated).toBeLessThanOrEqual(legalHideSpawns.length);
  });

  it('consumes one arrow after a successful bow hit but not after a miss', () => {
    const hit = createBowController(7, 2);
    hit.dispatch({ type: 'attack', targetId: 'arrow-target' });
    hit.update(250);
    expect(hit.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'damage', targetId: 'arrow-target' }),
    );
    expect(hit.snapshot.inventory.stacks).toContainEqual({
      itemId: 'wooden-arrow',
      quantity: 1,
    });

    const miss = createBowController(4, 2);
    miss.dispatch({ type: 'attack', targetId: 'arrow-target' });
    miss.update(250);
    expect(miss.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'miss', targetId: 'arrow-target' }),
    );
    expect(miss.snapshot.inventory.stacks).toContainEqual({
      itemId: 'wooden-arrow',
      quantity: 2,
    });
  });

  it('does not damage a target when a bow has no ammunition', () => {
    const controller = createBowController(7, 0);

    controller.dispatch({ type: 'attack', targetId: 'arrow-target' });
    controller.update(250);

    expect(controller.snapshot.monsters[0]?.hp).toBe(14);
    expect(controller.drainEvents()).toEqual([]);
  });

  it('advances collect objectives only after nearby ground loot enters inventory', () => {
    const save = completeSave({ slot: 1 });
    const controller = new WorldController({
      content,
      save: {
        ...save,
        quests: {
          active: {
            'dungeon-seal': {
              stage: 'in-progress',
              counters: { 'in-progress:0': 1 },
            },
          },
          completed: [],
          claimedRewards: [],
        },
        world: {
          player: { mapId: 'talking-island-dungeon-1', x: 2, y: 2 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      grids: new Map([['talking-island-dungeon-1', grid]]),
      monsters: [
        monsterAt(
          { x: 3, y: 2 },
          {
            id: 'loot-skeleton',
            monsterId: 'skeleton',
            mapId: 'talking-island-dungeon-1',
            hp: 1,
            maxHP: 1,
            alertRadius: 0,
          },
        ),
      ],
      seed: 7,
    });

    controller.dispatch({ type: 'attack', targetId: 'loot-skeleton' });
    controller.update(250);
    const loot = controller.snapshot.groundLoot.find(({ itemId }) => itemId === 'bone-piece');
    expect(loot).toBeDefined();
    expect(controller.snapshot.quests.active['dungeon-seal']?.counters).not.toHaveProperty(
      'in-progress:2',
    );
    if (loot === undefined) return;

    controller.dispatch({ type: 'interact', targetId: loot.id });

    expect(controller.snapshot.quests.active['dungeon-seal']?.counters).toMatchObject({
      'in-progress:2': 1,
    });
    expect(controller.drainPersistenceEvents()).toContain('quest-stage');
  });

  it('emits quest-stage persistence only when combat changes quest progress', () => {
    const save = completeSave({ slot: 1 });
    const controller = new WorldController({
      content,
      save: {
        ...save,
        quests: {
          active: {
            'scarecrow-training': {
              stage: 'in-progress',
              counters: { 'in-progress:0': 1, 'in-progress:1': 3 },
            },
          },
          completed: [],
          claimedRewards: [],
        },
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
          { x: 3, y: 2 },
          { id: 'quest-goblin', mapId: 'north-field', hp: 1, maxHP: 1, alertRadius: 0 },
        ),
      ],
      seed: 7,
    });

    controller.dispatch({ type: 'attack', targetId: 'quest-goblin' });
    controller.update(250);

    expect(controller.snapshot.quests.completed).toContain('scarecrow-training');
    expect(controller.drainPersistenceEvents()).toContain('quest-stage');
  });

  it('emits death-respawn persistence after a lethal monster transaction', () => {
    const save = completeSave({ slot: 1 });
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character: { ...save.character, hp: 1 },
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
          { x: 3, y: 2 },
          {
            id: 'lethal-goblin',
            mapId: 'north-field',
            alertRadius: 8,
            attackCooldownMs: 50,
          },
        ),
      ],
      seed: 7,
    });

    for (let step = 0; step < 100; step += 1) {
      controller.update(250);
      if (controller.snapshot.character.hp > 1) break;
    }

    expect(controller.snapshot.character.hp).toBeGreaterThan(1);
    expect(controller.drainPersistenceEvents()).toContain('death-respawn');
  });
});
