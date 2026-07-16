import { describe, expect, it } from 'vitest';
import { TileGrid } from '../../src/world/grid';
import { findPath, isReachable } from '../../src/world/pathfinding';

const pathCost = (path: readonly { x: number; y: number }[]): number =>
  path.slice(1).reduce((cost, point, index) => {
    const previous = path[index];
    if (previous === undefined) {
      throw new Error('路徑缺少前一個座標');
    }
    return cost + (previous.x !== point.x && previous.y !== point.y ? 14 : 10);
  }, 0);

describe('findPath', () => {
  it('finds an eight-direction path without cutting blocked corners', () => {
    const grid = TileGrid.fromRows(['....', '.##.', '....']);

    const path = findPath(grid, { x: 0, y: 0 }, { x: 3, y: 2 });

    expect(path.at(0)).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 3, y: 2 });
    expect(path).not.toContainEqual({ x: 1, y: 1 });
    expect(pathCost(path)).toBe(50);
  });

  it('rejects a diagonal move when either adjacent orthogonal tile is blocked', () => {
    const grid = TileGrid.fromRows(['.#', '#.']);

    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([]);
    expect(isReachable(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('uses a deterministic route when equal-cost alternatives exist', () => {
    const grid = TileGrid.fromRows(['.....', '..#..', '.....']);

    const first = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 });
    const second = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 });

    expect(first).toEqual(second);
    expect(first).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 1 },
    ]);
  });

  it('returns no path for blocked, out-of-bounds, or unreachable endpoints', () => {
    const grid = TileGrid.fromRows(['...', '###', '...']);

    expect(findPath(grid, { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([]);
    expect(findPath(grid, { x: -1, y: 0 }, { x: 2, y: 0 })).toEqual([]);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([]);
  });
});
