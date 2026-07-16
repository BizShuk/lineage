import type {
  ItemDefinition as ContentItemDefinition,
  MapDefinition,
  MonsterDefinition,
} from '../content/schema';
import {
  addItem,
  type InventoryState,
  type ItemDefinition,
} from '../core/inventory';
import type { SeededRng } from '../core/rng';
import type { GridPoint, TileGrid } from './grid';
import { findPath } from './pathfinding';
import type { WorldState } from './world';

export type MonsterAIState = 'idle' | 'patrol' | 'chase' | 'attack' | 'return' | 'dead';

export type MonsterIntent =
  | { readonly type: 'wait' }
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'attack'; readonly targetId: string }
  | { readonly type: 'despawn' };

export interface PlayerTarget extends GridPoint {
  readonly id: string;
  readonly hp: number;
}

export interface MonsterState extends GridPoint {
  readonly id: string;
  readonly monsterId: string;
  readonly rank: MonsterDefinition['rank'];
  readonly mapId: string;
  readonly homeX: number;
  readonly homeY: number;
  readonly hp: number;
  readonly maxHP: number;
  readonly aiState: MonsterAIState;
  readonly alertRadius: number;
  readonly leashRange: number;
  readonly patrolRadius: number;
  readonly attackRange: number;
  readonly attackCooldownMs: number;
  readonly nextAttackAtMs: number;
  readonly respawnDelayMs: number;
  readonly defeatedAtMs: number | null;
  readonly defeatedMapEntry: number | null;
}

export interface MonsterWorldState extends WorldState {
  readonly monsters: readonly MonsterState[];
  readonly mapEntryCounts: Readonly<Record<string, number>>;
}

export interface MonsterAITickResult {
  readonly monster: MonsterState;
  readonly intent: MonsterIntent;
}

export interface RolledDrop {
  readonly itemId: string;
  readonly quantity: number;
}

export interface GroundLoot extends RolledDrop, GridPoint {
  readonly id: string;
  readonly mapId: string;
}

export interface LootDistributionResult {
  readonly inventory: InventoryState;
  readonly groundLoot: readonly GroundLoot[];
}

type LootItemDefinition = ItemDefinition | ContentItemDefinition;

const WAIT: MonsterIntent = { type: 'wait' };

const patrolDirections: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

const distanceSquared = (from: GridPoint, to: GridPoint): number =>
  (from.x - to.x) ** 2 + (from.y - to.y) ** 2;

const withinRange = (from: GridPoint, to: GridPoint, range: number): boolean =>
  distanceSquared(from, to) <= range ** 2;

const moveToward = (
  monster: MonsterState,
  target: GridPoint,
  grid: TileGrid,
): MonsterIntent => {
  const next = findPath(grid, monster, target)[1];
  return next === undefined ? WAIT : { type: 'move', x: next.x, y: next.y };
};

const shouldReturnHome = (monster: MonsterState, player: PlayerTarget): boolean =>
  !withinRange({ x: monster.homeX, y: monster.homeY }, player, monster.leashRange);

const returnHome = (monster: MonsterState, grid: TileGrid): MonsterAITickResult => ({
  monster: { ...monster, aiState: 'return' },
  intent: moveToward(monster, { x: monster.homeX, y: monster.homeY }, grid),
});

const patrol = (
  monster: MonsterState,
  grid: TileGrid,
  rng: SeededRng,
): MonsterAITickResult => {
  const direction = patrolDirections[rng.int(0, patrolDirections.length - 1)];
  if (direction === undefined) {
    return { monster, intent: WAIT };
  }

  const target = { x: monster.x + direction.x, y: monster.y + direction.y };
  const home = { x: monster.homeX, y: monster.homeY };
  if (!grid.isWalkable(target) || !withinRange(home, target, monster.patrolRadius)) {
    return { monster, intent: WAIT };
  }

  return { monster, intent: { type: 'move', ...target } };
};

export const tickMonsterAI = (
  monster: MonsterState,
  player: PlayerTarget,
  grid: TileGrid,
  nowMs: number,
  rng: SeededRng,
): MonsterAITickResult => {
  if (monster.hp <= 0 || monster.aiState === 'dead') {
    return {
      monster: { ...monster, hp: 0, aiState: 'dead' },
      intent: { type: 'despawn' },
    };
  }

  switch (monster.aiState) {
    case 'idle':
      if (withinRange(monster, player, monster.alertRadius)) {
        return { monster: { ...monster, aiState: 'chase' }, intent: WAIT };
      }
      return { monster: { ...monster, aiState: 'patrol' }, intent: WAIT };

    case 'patrol':
      if (withinRange(monster, player, monster.alertRadius)) {
        return { monster: { ...monster, aiState: 'chase' }, intent: WAIT };
      }
      return patrol(monster, grid, rng);

    case 'chase':
      if (shouldReturnHome(monster, player)) {
        return returnHome(monster, grid);
      }
      if (withinRange(monster, player, monster.attackRange)) {
        return { monster: { ...monster, aiState: 'attack' }, intent: WAIT };
      }
      return { monster, intent: moveToward(monster, player, grid) };

    case 'attack':
      if (shouldReturnHome(monster, player)) {
        return returnHome(monster, grid);
      }
      if (!withinRange(monster, player, monster.attackRange)) {
        return { monster: { ...monster, aiState: 'chase' }, intent: WAIT };
      }
      if (nowMs < monster.nextAttackAtMs) {
        return { monster, intent: WAIT };
      }
      return {
        monster: {
          ...monster,
          nextAttackAtMs: nowMs + monster.attackCooldownMs,
        },
        intent: { type: 'attack', targetId: player.id },
      };

    case 'return':
      if (monster.x === monster.homeX && monster.y === monster.homeY) {
        return {
          monster: { ...monster, aiState: 'idle', hp: monster.maxHP },
          intent: WAIT,
        };
      }
      return {
        monster,
        intent: moveToward(monster, { x: monster.homeX, y: monster.homeY }, grid),
      };

  }
};

const requiredMonster = (
  definitions: ReadonlyMap<string, MonsterDefinition>,
  monsterId: string,
): MonsterDefinition => {
  const definition = definitions.get(monsterId);
  if (definition === undefined) {
    throw new Error(`找不到生成怪物內容：${monsterId}`);
  }
  return definition;
};

export const spawnMonsters = (
  map: Pick<MapDefinition, 'id' | 'spawns'>,
  monsterDefinitions: readonly MonsterDefinition[],
  grid: TileGrid,
): readonly MonsterState[] => {
  const definitions = new Map(
    monsterDefinitions.map((definition) => [definition.id, definition]),
  );
  const occupied = new Set<string>();

  const positionKey = ({ x, y }: GridPoint): string => `${String(x)},${String(y)}`;
  const formation = (origin: GridPoint, count: number): readonly GridPoint[] => {
    const positions: GridPoint[] = [];
    const visited = new Set<string>();
    const queue: GridPoint[] = grid.isWalkable(origin) ? [origin] : [];

    while (queue.length > 0 && positions.length < count) {
      const point = queue.shift();
      if (point === undefined) break;
      const key = positionKey(point);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!occupied.has(key)) positions.push(point);
      for (const direction of patrolDirections) {
        const candidate = { x: point.x + direction.x, y: point.y + direction.y };
        if (grid.isWalkable(candidate) && !visited.has(positionKey(candidate))) {
          queue.push(candidate);
        }
      }
    }

    for (let y = 0; y < grid.height && positions.length < count; y += 1) {
      for (let x = 0; x < grid.width && positions.length < count; x += 1) {
        const point = { x, y };
        const key = positionKey(point);
        const selected = positions.some((position) => positionKey(position) === key);
        if (grid.isWalkable(point) && !occupied.has(key) && !selected) {
          positions.push(point);
        }
      }
    }

    positions.forEach((position) => occupied.add(positionKey(position)));
    return positions;
  };

  return map.spawns.flatMap((spawn, spawnIndex) => {
    const definition = requiredMonster(definitions, spawn.monsterId);
    return formation(spawn, spawn.count).map((position, monsterIndex): MonsterState => ({
      id: `${map.id}:${spawn.monsterId}:${String(spawnIndex)}:${String(monsterIndex)}`,
      monsterId: spawn.monsterId,
      rank: definition.rank,
      mapId: map.id,
      x: position.x,
      y: position.y,
      homeX: position.x,
      homeY: position.y,
      hp: definition.hp,
      maxHP: definition.hp,
      aiState: 'idle',
      alertRadius: 5,
      leashRange: 10,
      patrolRadius: 3,
      attackRange: 1,
      attackCooldownMs: 1_000,
      nextAttackAtMs: 0,
      respawnDelayMs: spawn.respawnSeconds * 1_000,
      defeatedAtMs: null,
      defeatedMapEntry: null,
    }));
  });
};

const respawn = (monster: MonsterState): MonsterState => ({
  ...monster,
  x: monster.homeX,
  y: monster.homeY,
  hp: monster.maxHP,
  aiState: 'idle',
  nextAttackAtMs: 0,
  defeatedAtMs: null,
  defeatedMapEntry: null,
});

const baphometDefeated = (world: MonsterWorldState): boolean =>
  world.flags.baphometDefeated === true || world.defeatedBosses.includes('baphomet');

export const respawnEligibleMonsters = (
  world: MonsterWorldState,
  nowMs: number,
): readonly MonsterState[] =>
  world.monsters.flatMap((monster) => {
    if (monster.aiState !== 'dead' || monster.defeatedAtMs === null) {
      return [];
    }
    if (monster.monsterId === 'baphomet' && baphometDefeated(world)) {
      return [];
    }
    if (monster.rank === 'elite') {
      const currentMapEntry = world.mapEntryCounts[monster.mapId] ?? 0;
      return monster.defeatedMapEntry !== null && currentMapEntry > monster.defeatedMapEntry
        ? [respawn(monster)]
        : [];
    }
    if (monster.rank !== 'normal') {
      return [];
    }
    return nowMs >= monster.defeatedAtMs + monster.respawnDelayMs
      ? [respawn(monster)]
      : [];
  });

export const rollDrops = (
  drops: MonsterDefinition['drops'],
  rng: SeededRng,
): readonly RolledDrop[] => {
  const rolled: RolledDrop[] = [];
  for (const drop of drops) {
    if (rng.next() >= drop.chance) {
      continue;
    }
    rolled.push({
      itemId: drop.itemId,
      quantity: drop.min === drop.max ? drop.min : rng.int(drop.min, drop.max),
    });
  }
  return rolled;
};

export const storeOrDropLoot = (
  inventory: InventoryState,
  drops: readonly RolledDrop[],
  itemLookup: (id: string) => LootItemDefinition,
  position: Readonly<{ mapId: string; x: number; y: number }>,
): LootDistributionResult => {
  let nextInventory = inventory;
  const groundLoot: GroundLoot[] = [];

  drops.forEach((drop, index) => {
    const lookedUpItem = itemLookup(drop.itemId);
    const { equipmentSlot, healAmount, ...requiredItemFields } = lookedUpItem;
    const item: ItemDefinition = {
      ...requiredItemFields,
      ...(equipmentSlot === undefined ? {} : { equipmentSlot }),
      ...(healAmount === undefined ? {} : { healAmount }),
    };
    const added = addItem(nextInventory, item, drop.quantity);
    if (added.ok) {
      nextInventory = added.inventory;
      return;
    }
    groundLoot.push({
      id: `${position.mapId}:${String(position.x)}:${String(position.y)}:${String(index)}:${drop.itemId}`,
      ...drop,
      ...position,
    });
  });

  return { inventory: nextInventory, groundLoot };
};
