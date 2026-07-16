import type { MonsterState, MonsterWorldState, PlayerTarget } from '../../src/world/ai';
import { TileGrid } from '../../src/world/grid';

export const openGrid = (width: number, height: number): TileGrid =>
  TileGrid.fromRows(Array.from({ length: height }, () => '.'.repeat(width)));

export const playerAt = (
  x: number,
  y: number,
  overrides: Partial<PlayerTarget> = {},
): PlayerTarget => ({
  id: 'player',
  x,
  y,
  hp: 100,
  ...overrides,
});

export const monsterAt = (
  position: Readonly<{ x: number; y: number }>,
  overrides: Partial<MonsterState> = {},
): MonsterState => ({
  id: 'north-field:goblin:0:0',
  monsterId: 'goblin',
  rank: 'normal',
  mapId: 'north-field',
  x: position.x,
  y: position.y,
  homeX: position.x,
  homeY: position.y,
  hp: 14,
  maxHP: 14,
  aiState: 'idle',
  alertRadius: 5,
  leashRange: 10,
  patrolRadius: 3,
  attackRange: 1,
  attackCooldownMs: 1_000,
  nextAttackAtMs: 0,
  respawnDelayMs: 20_000,
  defeatedAtMs: null,
  defeatedMapEntry: null,
  ...overrides,
});

export const worldWithDefeatedBoss = (monsterId: string): MonsterWorldState => ({
  player: { mapId: 'talking-island-dungeon-2', x: 50, y: 50 },
  defeatedBosses: [monsterId],
  flags: { [`${monsterId}Defeated`]: true },
  worldTimeMs: 600_000,
  mapEntryCounts: { 'talking-island-dungeon-2': 2 },
  monsters: [
    monsterAt(
      { x: 52, y: 52 },
      {
        id: `talking-island-dungeon-2:${monsterId}:0:0`,
        monsterId,
        rank: 'boss',
        mapId: 'talking-island-dungeon-2',
        homeX: 52,
        homeY: 52,
        hp: 0,
        maxHP: 900,
        aiState: 'dead',
        respawnDelayMs: 0,
        defeatedAtMs: 100_000,
        defeatedMapEntry: 1,
      },
    ),
  ],
});
