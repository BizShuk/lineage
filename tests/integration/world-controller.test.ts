import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';
import { createCharacter, deriveStats } from '../../src/core/stats';
import { WorldController } from '../../src/game/systems/WorldController';
import { TileGrid } from '../../src/world/grid';
import { completeSave } from '../helpers/saveFixtures';
import { monsterAt, openGrid } from '../helpers/worldFixtures';

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

  it('damages every living monster within two tiles of an area target once', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('範圍測試', 'wizard'), level: 12, mp: 60 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
        world: {
          player: { mapId: 'north-field', x: 2, y: 5 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      grids: new Map([['north-field', grid]]),
      monsters: [
        monsterAt({ x: 5, y: 5 }, { id: 'area-anchor', hp: 30, maxHP: 30, alertRadius: 0 }),
        monsterAt({ x: 7, y: 6 }, { id: 'area-nearby', hp: 30, maxHP: 30, alertRadius: 0 }),
        monsterAt({ x: 8, y: 5 }, { id: 'area-outside', hp: 30, maxHP: 30, alertRadius: 0 }),
        monsterAt(
          { x: 6, y: 5 },
          { id: 'area-dead', hp: 0, maxHP: 30, aiState: 'dead', alertRadius: 0 },
        ),
      ],
      seed: 7,
    });

    const result = controller.cast('frozen-cloud', 'area-anchor');

    expect(result.ok).toBe(true);
    expect(controller.snapshot.character.mp).toBe(40);
    expect(
      Object.fromEntries(controller.snapshot.monsters.map(({ id, hp }) => [id, hp])),
    ).toMatchObject({
      'area-anchor': 10,
      'area-nearby': 10,
      'area-outside': 30,
      'area-dead': 0,
    });
    expect(
      result.events
        .filter((event) => event.type === 'damage')
        .map(({ targetId }) => targetId),
    ).toEqual(['area-anchor', 'area-nearby']);
  });

  it('uses royal-rally power as a player hit bonus', () => {
    const createRallyController = (buffed: boolean): WorldController => {
      const save = completeSave({ slot: 1 });
      const character = createCharacter('命中測試', 'prince');
      const controller = new WorldController({
        content,
        save: {
          ...save,
          character,
          world: {
            player: { mapId: 'north-field', x: 2, y: 2 },
            defeatedBosses: [],
            flags: {},
            worldTimeMs: 0,
          },
        },
        grids: new Map([['north-field', grid]]),
        monsters: [
          monsterAt({ x: 3, y: 2 }, { id: 'rally-target', hp: 50, maxHP: 50, alertRadius: 0 }),
        ],
        seed: 17,
      });
      if (buffed) {
        expect(controller.cast('royal-rally', character.id).ok).toBe(true);
      }
      controller.dispatch({ type: 'attack', targetId: 'rally-target' });
      controller.update(50);
      return controller;
    };

    const normal = createRallyController(false);
    const rallied = createRallyController(true);

    expect(normal.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'miss', targetId: 'rally-target' }),
    );
    expect(rallied.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'damage', targetId: 'rally-target' }),
    );
  });

  it('uses enchanted-weapon power as a weapon damage bonus', () => {
    const attackDamage = (buffed: boolean): number => {
      const save = completeSave({ slot: 1 });
      const character = { ...createCharacter('武器測試', 'wizard'), level: 8 };
      const controller = new WorldController({
        content,
        save: {
          ...save,
          character,
          equipment: { weapon: 'dagger' },
          world: {
            player: { mapId: 'north-field', x: 2, y: 2 },
            defeatedBosses: [],
            flags: {},
            worldTimeMs: 0,
          },
        },
        grids: new Map([['north-field', grid]]),
        monsters: [
          monsterAt({ x: 3, y: 2 }, { id: 'weapon-target', hp: 50, maxHP: 50, alertRadius: 0 }),
        ],
        seed: 7,
      });
      if (buffed) {
        expect(controller.cast('enchanted-weapon', character.id).ok).toBe(true);
      }
      controller.dispatch({ type: 'attack', targetId: 'weapon-target' });
      controller.update(50);
      const damage = controller
        .drainEvents()
        .find((event) => event.type === 'damage' && event.targetId === 'weapon-target');
      expect(damage).toBeDefined();
      return damage?.type === 'damage' ? damage.amount : 0;
    };

    expect(attackDamage(true)).toBe(attackDamage(false) + 2);
  });

  it('uses guarded-stance power as defense until the status expires', () => {
    const createDefenseController = (buffed: boolean): WorldController => {
      const save = completeSave({ slot: 1 });
      const character = createCharacter('防禦測試', 'knight');
      const controller = new WorldController({
        content,
        save: {
          ...save,
          character,
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
            { id: 'defense-attacker', aiState: 'attack', nextAttackAtMs: 0 },
          ),
        ],
        seed: 13,
      });
      if (buffed) {
        expect(controller.cast('guarded-stance', character.id).ok).toBe(true);
      }
      controller.update(250);
      controller.update(250);
      return controller;
    };

    const normal = createDefenseController(false);
    const guarded = createDefenseController(true);

    expect(normal.snapshot.character.hp).toBeLessThan(deriveStats(normal.snapshot.character).maxHP);
    expect(guarded.snapshot.character.hp).toBe(deriveStats(guarded.snapshot.character).maxHP);
    expect(guarded.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'miss', sourceId: 'defense-attacker' }),
    );
  });

  it('uses mana-focus power for spells and stops after expiry', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('魔力測試', 'wizard'), level: 4, mp: 40 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
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
          { id: 'focused-target', hp: 50, maxHP: 50, alertRadius: 0, patrolRadius: 0 },
        ),
        monsterAt(
          { x: 3, y: 2 },
          { id: 'expired-target', hp: 50, maxHP: 50, alertRadius: 0, patrolRadius: 0 },
        ),
      ],
      seed: 7,
    });

    expect(controller.cast('mana-focus', character.id).ok).toBe(true);
    expect(controller.cast('fire-arrow', 'focused-target').ok).toBe(true);
    expect(controller.snapshot.monsters.find(({ id }) => id === 'focused-target')?.hp).toBe(29);
    expect(controller.snapshot.playerStatuses).toContainEqual(
      expect.objectContaining({ id: 'mana-focus', power: 3, expiresAt: 8_000 }),
    );

    for (let tick = 0; tick < 32; tick += 1) controller.update(250);

    expect(controller.snapshot.playerStatuses).not.toContainEqual(
      expect.objectContaining({ id: 'mana-focus' }),
    );
    expect(controller.cast('fire-arrow', 'expired-target').ok).toBe(true);
    expect(controller.snapshot.monsters.find(({ id }) => id === 'expired-target')?.hp).toBe(32);
  });

  it('keeps light and detection as observable time-limited player utility statuses', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('工具測試', 'wizard'), level: 8 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
        world: {
          player: { mapId: 'north-field', x: 2, y: 2 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      grids: new Map([['north-field', grid]]),
      monsters: [],
      seed: 7,
    });

    expect(controller.cast('light', character.id).ok).toBe(true);
    expect(controller.cast('detect-invisible', character.id).ok).toBe(true);

    expect(controller.snapshot.playerStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'light', expiresAt: 600_000 }),
        expect.objectContaining({ id: 'detect-invisible', expiresAt: 1_000 }),
      ]),
    );
  });

  it('teleports to the current map entry and maps cure-poison to a cleanse action', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('傳送測試', 'wizard'), level: 8, mp: 60 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
        world: {
          player: { mapId: 'north-field', x: 20, y: 20 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      monsters: [],
      seed: 7,
    });

    expect(controller.cast('teleport', character.id).ok).toBe(true);
    expect(controller.snapshot.player).toEqual({
      mapId: 'north-field',
      ...content.map('north-field').entry,
    });
    expect(controller.cast('cure-poison', character.id)).toMatchObject({
      ok: true,
      events: [],
    });
  });

  it('persists blind on a monster and blocks its attacks until expiry', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('闇盲測試', 'wizard'), level: 12, mp: 60 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
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
          { id: 'blind-target', aiState: 'attack', nextAttackAtMs: 0 },
        ),
      ],
      seed: 7,
    });

    expect(controller.cast('blind', 'blind-target').ok).toBe(true);
    expect(controller.snapshot.monsters[0]?.statuses ?? []).toContainEqual(
      expect.objectContaining({ id: 'blind', kind: 'control', power: 3, expiresAt: 8_000 }),
    );

    for (let tick = 0; tick < 30; tick += 1) controller.update(250);
    expect(controller.snapshot.character.hp).toBe(character.hp);

    controller.update(250);
    controller.update(250);

    expect(controller.snapshot.monsters[0]?.statuses).not.toContainEqual(
      expect.objectContaining({ id: 'blind' }),
    );
    expect(controller.snapshot.character.hp).toBeLessThan(character.hp);
  });

  it('uses royal-command power as damage vulnerability on its target', () => {
    const attackDamage = (commanded: boolean): number => {
      const save = completeSave({ slot: 1 });
      const character = { ...createCharacter('號令測試', 'prince'), level: 6 };
      const controller = new WorldController({
        content,
        save: {
          ...save,
          character,
          world: {
            player: { mapId: 'north-field', x: 2, y: 2 },
            defeatedBosses: [],
            flags: {},
            worldTimeMs: 0,
          },
        },
        grids: new Map([['north-field', grid]]),
        monsters: [
          monsterAt({ x: 3, y: 2 }, { id: 'command-target', hp: 50, maxHP: 50, alertRadius: 0 }),
        ],
        seed: 7,
      });
      if (commanded) {
        expect(controller.cast('royal-command', 'command-target').ok).toBe(true);
        expect(controller.snapshot.monsters[0]?.statuses ?? []).toContainEqual(
          expect.objectContaining({ id: 'royal-command', power: 3 }),
        );
      }
      controller.dispatch({ type: 'attack', targetId: 'command-target' });
      controller.update(50);
      const damage = controller
        .drainEvents()
        .find((event) => event.type === 'damage' && event.targetId === 'command-target');
      expect(damage).toBeDefined();
      return damage?.type === 'damage' ? damage.amount : 0;
    };

    expect(attackDamage(true)).toBe(attackDamage(false) + 3);
  });

  it('makes elemental-fall-down an observable one-point damage vulnerability', () => {
    const spellDamage = (marked: boolean): number => {
      const save = completeSave({ slot: 1 });
      const character = { ...createCharacter('能量測試', 'wizard'), level: 12, mp: 60 };
      const controller = new WorldController({
        content,
        save: {
          ...save,
          character,
          world: {
            player: { mapId: 'north-field', x: 2, y: 2 },
            defeatedBosses: [],
            flags: {},
            worldTimeMs: 0,
          },
        },
        grids: new Map([['north-field', grid]]),
        monsters: [
          monsterAt({ x: 3, y: 2 }, { id: 'element-target', hp: 50, maxHP: 50, alertRadius: 0 }),
        ],
        seed: 7,
      });
      if (marked) {
        expect(controller.cast('elemental-fall-down', 'element-target').ok).toBe(true);
        expect(controller.snapshot.monsters[0]?.statuses ?? []).toContainEqual(
          expect.objectContaining({ id: 'elemental-fall-down', expiresAt: 1_000 }),
        );
      }
      const result = controller.cast('fire-arrow', 'element-target');
      const damage = result.events.find((event) => event.type === 'damage');
      expect(damage).toBeDefined();
      return damage?.type === 'damage' ? damage.amount : 0;
    };

    expect(spellDamage(true)).toBe(spellDamage(false) + 1);
  });

  it('clears runtime statuses on player death and monster respawn', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('重生測試', 'knight'), hp: 1 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
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
          { id: 'lethal-attacker', aiState: 'attack', nextAttackAtMs: 0 },
        ),
        monsterAt(
          { x: 8, y: 8 },
          {
            id: 'status-respawn',
            aiState: 'dead',
            hp: 0,
            defeatedAtMs: 0,
            respawnDelayMs: 0,
            statuses: [
              { id: 'blind', sourceId: character.id, kind: 'control', expiresAt: 8_000 },
            ],
          },
        ),
      ],
      seed: 7,
    });

    expect(controller.cast('guarded-stance', character.id).ok).toBe(true);
    controller.update(250);
    controller.update(250);

    expect(controller.snapshot.playerStatuses).toEqual([]);
    const respawned = controller.snapshot.monsters.find(({ id }) => id === 'status-respawn');
    expect(respawned?.hp).toBe(respawned?.maxHP);
    expect(respawned?.statuses).toEqual([]);
  });

  it('clears player runtime statuses after a real map transition', () => {
    const largeGrid = TileGrid.fromRows(Array.from({ length: 96 }, () => '.'.repeat(96)));
    const save = completeSave({ slot: 1 });
    const character = createCharacter('換圖測試', 'prince');
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
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
      seed: 7,
    });

    expect(controller.cast('royal-rally', character.id).ok).toBe(true);
    expect(controller.snapshot.playerStatuses).not.toEqual([]);
    controller.dispatch({ type: 'move', x: 94, y: 48 });
    controller.update(50);

    expect(controller.snapshot.player.mapId).toBe('talking-island-village');
    expect(controller.snapshot.playerStatuses).toEqual([]);
  });

  it('commits at most one monster attack per AI interval', () => {
    const save = completeSave({ slot: 1 });
    const character = { ...createCharacter('群攻測試', 'knight'), hp: 200 };
    const controller = new WorldController({
      content,
      save: {
        ...save,
        character,
        world: {
          player: { mapId: 'black-knight-area', x: 48, y: 48 },
          defeatedBosses: [],
          flags: {},
          worldTimeMs: 0,
        },
      },
      grids: new Map([['black-knight-area', openGrid(96, 96)]]),
      monsters: Array.from({ length: 6 }, (_, index) =>
        monsterAt(
          { x: 49, y: 48 },
          {
            id: `interval-knight-${String(index)}`,
            monsterId: 'black-knight',
            rank: 'elite',
            mapId: 'black-knight-area',
            hp: 90,
            maxHP: 90,
            aiState: 'attack',
            nextAttackAtMs: 0,
          },
        ),
      ),
      seed: 7,
    });

    controller.update(250);
    controller.update(250);

    expect(
      controller
        .drainEvents()
        .filter(
          (event) =>
            (event.type === 'damage' || event.type === 'miss') &&
            event.sourceId.startsWith('interval-knight-'),
        ),
    ).toHaveLength(1);
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
