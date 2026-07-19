import { describe, expect, it } from 'vitest';

import {
  createIsometricProjection,
  createOrthogonalProjection,
  projectedBounds,
} from '../../src/game/systems/WorldProjection';

describe('world presentation projection', () => {
  it('round-trips representative isometric village points', () => {
    const projection = createIsometricProjection(64, 64, 128);
    expect(projection).not.toBeNull();
    if (projection === null) return;
    for (const point of [{ x: 0, y: 0 }, { x: 32, y: 32 }, { x: 63, y: 63 }]) {
      expect(projection.screenToGrid(projection.gridToScreen(point))).toEqual(point);
    }
  });

  it('computes nonnegative projected bounds and stable depth', () => {
    expect(projectedBounds(64, 64, 128)).toEqual({
      x: 0,
      y: 0,
      width: 2_304,
      height: 1_280,
    });
    const projection = createIsometricProjection(64, 64, 128);
    expect(projection?.gridToScreen({ x: 32, y: 32 })).toEqual({ x: 1_152, y: 640 });
    expect(projection?.depthFor({ x: 33, y: 32 })).toBeGreaterThan(
      projection?.depthFor({ x: 32, y: 32 }) ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('keeps the existing orthogonal center and rejects invalid inputs', () => {
    const orthogonal = createOrthogonalProjection(64, 64);
    expect(orthogonal?.gridToScreen({ x: 1, y: 2 })).toEqual({ x: 24, y: 40 });
    expect(orthogonal?.screenToGrid({ x: -1, y: 8 })).toBeNull();
    expect(createIsometricProjection(0, 64, 128)).toBeNull();
    expect(createIsometricProjection(64, 0, 128)).toBeNull();
    expect(createIsometricProjection(64, 64, -1)).toBeNull();
  });
});
