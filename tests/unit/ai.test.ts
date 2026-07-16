import { describe, expect, it } from 'vitest';

import { SeededRng } from '../../src/core/rng';
import type { MapDefinition, MonsterDefinition } from '../../src/content/schema';
import {
  respawnEligibleMonsters,
  spawnMonsters,
  tickMonsterAI,
  type MonsterWorldState,
} from '../../src/world/ai';
import { TileGrid } from '../../src/world/grid';
import {
  monsterAt,
  openGrid,
  playerAt,
  worldWithDefeatedBoss,
} from '../helpers/worldFixtures';

describe('tickMonsterAI', () => {
  it('uses one tick to leave idle and waits before patrolling', () => {
    const monster = monsterAt({ x: 5, y: 5 });

    const result = tickMonsterAI(
      monster,
      playerAt(20, 20),
      openGrid(24, 24),
      100,
      new SeededRng(3),
    );

    expect(result.monster.aiState).toBe('patrol');
    expect(result.intent).toEqual({ type: 'wait' });
  });

  it('patrols deterministically without leaving its home radius', () => {
    const monster = monsterAt(
      { x: 5, y: 5 },
      { aiState: 'patrol', homeX: 5, homeY: 5, patrolRadius: 2 },
    );

    const first = tickMonsterAI(
      monster,
      playerAt(20, 20),
      openGrid(24, 24),
      100,
      new SeededRng(9),
    );
    const second = tickMonsterAI(
      monster,
      playerAt(20, 20),
      openGrid(24, 24),
      100,
      new SeededRng(9),
    );

    expect(first).toEqual(second);
    expect(first.intent.type).toBe('move');
    if (first.intent.type === 'move') {
      const distanceSquared =
        (first.intent.x - monster.homeX) ** 2 + (first.intent.y - monster.homeY) ** 2;
      expect(distanceSquared).toBeLessThanOrEqual(monster.patrolRadius ** 2);
    }
  });

  it('alerts at the inclusive squared-radius boundary', () => {
    const monster = monsterAt({ x: 5, y: 5 }, { aiState: 'patrol', alertRadius: 5 });

    const result = tickMonsterAI(
      monster,
      playerAt(8, 9),
      openGrid(16, 16),
      100,
      new SeededRng(1),
    );

    expect(result.monster.aiState).toBe('chase');
    expect(result.intent).toEqual({ type: 'wait' });
  });

  it('chases the player by one path step', () => {
    const monster = monsterAt({ x: 5, y: 5 }, { aiState: 'chase' });

    const result = tickMonsterAI(
      monster,
      playerAt(8, 5),
      openGrid(16, 16),
      100,
      new SeededRng(1),
    );

    expect(result.monster.aiState).toBe('chase');
    expect(result.intent).toEqual({ type: 'move', x: 6, y: 5 });
  });

  it('uses one tick to enter attack state without attacking immediately', () => {
    const monster = monsterAt({ x: 5, y: 5 }, { aiState: 'chase' });

    const result = tickMonsterAI(
      monster,
      playerAt(6, 5),
      openGrid(16, 16),
      100,
      new SeededRng(1),
    );

    expect(result.monster.aiState).toBe('attack');
    expect(result.intent).toEqual({ type: 'wait' });
  });

  it('waits for attack cooldown and attacks exactly when it expires', () => {
    const monster = monsterAt(
      { x: 5, y: 5 },
      { aiState: 'attack', nextAttackAtMs: 1_000 },
    );
    const player = playerAt(6, 5);
    const grid = openGrid(16, 16);

    const coolingDown = tickMonsterAI(monster, player, grid, 999, new SeededRng(1));
    const ready = tickMonsterAI(monster, player, grid, 1_000, new SeededRng(1));

    expect(coolingDown.intent).toEqual({ type: 'wait' });
    expect(coolingDown.monster.nextAttackAtMs).toBe(1_000);
    expect(ready.intent).toEqual({ type: 'attack', targetId: 'player' });
    expect(ready.monster.nextAttackAtMs).toBe(2_000);
  });

  it('returns a monster home after the player exceeds leash range', () => {
    const monster = monsterAt(
      { x: 5, y: 5 },
      { aiState: 'chase', homeX: 0, homeY: 0, leashRange: 10 },
    );

    const result = tickMonsterAI(
      monster,
      playerAt(20, 20),
      openGrid(24, 24),
      100,
      new SeededRng(3),
    );

    expect(result.monster.aiState).toBe('return');
    expect(result.intent.type).toBe('move');
  });

  it('waits instead of crossing a blocked path while chasing', () => {
    const monster = monsterAt({ x: 0, y: 0 }, { aiState: 'chase', leashRange: 10 });
    const grid = TileGrid.fromRows(['...', '###', '...']);

    const result = tickMonsterAI(
      monster,
      playerAt(2, 2),
      grid,
      100,
      new SeededRng(3),
    );

    expect(result.monster.aiState).toBe('chase');
    expect(result.intent).toEqual({ type: 'wait' });
  });

  it('heals fully and idles only after reaching home', () => {
    const monster = monsterAt(
      { x: 5, y: 5 },
      { aiState: 'return', homeX: 5, homeY: 5, hp: 3, maxHP: 14 },
    );

    const result = tickMonsterAI(
      monster,
      playerAt(20, 20),
      openGrid(24, 24),
      100,
      new SeededRng(3),
    );

    expect(result.monster).toMatchObject({ aiState: 'idle', hp: 14 });
    expect(result.intent).toEqual({ type: 'wait' });
  });

  it('despawns dead monsters without another action', () => {
    const monster = monsterAt({ x: 5, y: 5 }, { aiState: 'dead', hp: 0 });

    const result = tickMonsterAI(
      monster,
      playerAt(5, 5),
      openGrid(16, 16),
      100,
      new SeededRng(1),
    );

    expect(result.monster.aiState).toBe('dead');
    expect(result.intent).toEqual({ type: 'despawn' });
  });
});

describe('monster spawning and respawning', () => {
  const goblin = {
    id: 'goblin',
    rank: 'normal',
    hp: 14,
  } as MonsterDefinition;
  const map = {
    id: 'north-field',
    spawns: [{ monsterId: 'goblin', x: 4, y: 6, count: 2, respawnSeconds: 20 }],
  } as MapDefinition;

  it('spawns the content-defined count with stable unique IDs and timers', () => {
    const spawnGrid = openGrid(12, 12);
    const monsters = spawnMonsters(map, [goblin], spawnGrid);

    expect(monsters).toHaveLength(2);
    expect(monsters.map(({ id }) => id)).toEqual([
      'north-field:goblin:0:0',
      'north-field:goblin:0:1',
    ]);
    expect(monsters[0]).toMatchObject({
      monsterId: 'goblin',
      rank: 'normal',
      hp: 14,
      maxHP: 14,
      homeX: 4,
      homeY: 6,
      respawnDelayMs: 20_000,
    });
    expect(monsters.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 4, y: 6 },
      { x: 4, y: 5 },
    ]);
  });

  it('forms deterministic non-overlapping groups on walkable tiles', () => {
    const crowdedMap = {
      id: 'north-field',
      spawns: [
        { monsterId: 'goblin', x: 2, y: 2, count: 2, respawnSeconds: 20 },
        { monsterId: 'goblin', x: 2, y: 2, count: 2, respawnSeconds: 20 },
      ],
    } as MapDefinition;
    const spawnGrid = TileGrid.fromRows([
      '.....',
      '..#..',
      '.....',
      '.....',
      '.....',
    ]);

    const first = spawnMonsters(crowdedMap, [goblin], spawnGrid);
    const second = spawnMonsters(crowdedMap, [goblin], spawnGrid);
    const positions = first.map(({ x, y }) => `${String(x)},${String(y)}`);

    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(new Set(positions)).toHaveLength(4);
    expect(first.every((monster) => spawnGrid.isWalkable(monster))).toBe(true);
    expect(first.every(({ x, y }) => Math.max(Math.abs(x - 2), Math.abs(y - 2)) <= 1)).toBe(
      true,
    );
  });

  it('returns a deterministic short formation when the grid has too few free tiles', () => {
    const blockedGrid = TileGrid.fromRows(['.#', '##']);

    const monsters = spawnMonsters(map, [goblin], blockedGrid);

    expect(monsters).toHaveLength(1);
    expect(monsters[0]).toMatchObject({ x: 0, y: 0, homeX: 0, homeY: 0 });
  });

  it('respawns a normal monster only when its timer is due', () => {
    const dead = monsterAt(
      { x: 8, y: 8 },
      {
        aiState: 'dead',
        hp: 0,
        homeX: 4,
        homeY: 6,
        defeatedAtMs: 1_000,
        respawnDelayMs: 20_000,
      },
    );
    const world: MonsterWorldState = {
      player: { mapId: 'north-field', x: 1, y: 1 },
      defeatedBosses: [],
      flags: {},
      worldTimeMs: 0,
      mapEntryCounts: { 'north-field': 1 },
      monsters: [dead],
    };

    expect(respawnEligibleMonsters(world, 20_999)).toEqual([]);
    expect(respawnEligibleMonsters(world, 21_000)).toEqual([
      expect.objectContaining({
        id: dead.id,
        aiState: 'idle',
        hp: dead.maxHP,
        x: dead.homeX,
        y: dead.homeY,
        defeatedAtMs: null,
      }),
    ]);
  });

  it('respawns an elite only after leaving and re-entering its map', () => {
    const elite = monsterAt(
      { x: 7, y: 7 },
      {
        rank: 'elite',
        aiState: 'dead',
        hp: 0,
        defeatedAtMs: 1_000,
        defeatedMapEntry: 2,
      },
    );
    const world: MonsterWorldState = {
      player: { mapId: 'north-field', x: 1, y: 1 },
      defeatedBosses: [],
      flags: {},
      worldTimeMs: 0,
      mapEntryCounts: { 'north-field': 2 },
      monsters: [elite],
    };

    expect(respawnEligibleMonsters(world, 600_000)).toEqual([]);
    expect(
      respawnEligibleMonsters(
        { ...world, mapEntryCounts: { 'north-field': 3 } },
        600_000,
      ),
    ).toEqual([expect.objectContaining({ id: elite.id, aiState: 'idle', hp: elite.maxHP })]);
  });

  it('does not respawn Baphomet after the ending flag is saved', () => {
    expect(
      respawnEligibleMonsters(worldWithDefeatedBoss('baphomet'), 600_000),
    ).not.toContainEqual(expect.objectContaining({ monsterId: 'baphomet' }));
  });
});
