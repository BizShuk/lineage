import type { GridPoint } from '../../world/grid';

const ORTHOGONAL_TILE_SIZE = 16;
const ISOMETRIC_HALF_WIDTH = 16;
const ISOMETRIC_HALF_HEIGHT = 8;

export type ProjectionMode = 'orthogonal' | 'isometric-2-1';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorldProjection {
  readonly mode: ProjectionMode;
  readonly bounds: ProjectionBounds;
  readonly gridToScreen: (point: GridPoint) => ScreenPoint;
  readonly screenToGrid: (point: ScreenPoint) => GridPoint | null;
  readonly depthFor: (point: GridPoint, offset?: number) => number;
}

const inside = (point: GridPoint, width: number, height: number): boolean =>
  point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;

export const projectedBounds = (
  width: number,
  height: number,
  padding: number,
): ProjectionBounds | null => {
  if (width <= 0 || height <= 0 || padding < 0) return null;
  return {
    x: 0,
    y: 0,
    width: (width + height) * ISOMETRIC_HALF_WIDTH + padding * 2,
    height: (width + height) * ISOMETRIC_HALF_HEIGHT + padding * 2,
  };
};

export const createIsometricProjection = (
  width: number,
  height: number,
  padding = 128,
): WorldProjection | null => {
  const bounds = projectedBounds(width, height, padding);
  if (bounds === null) return null;
  const originX = height * ISOMETRIC_HALF_WIDTH + padding;
  const originY = padding;
  const gridToScreen = (point: GridPoint): ScreenPoint => ({
    x: originX + (point.x - point.y) * ISOMETRIC_HALF_WIDTH,
    y: originY + (point.x + point.y) * ISOMETRIC_HALF_HEIGHT,
  });
  return {
    mode: 'isometric-2-1',
    bounds,
    gridToScreen,
    screenToGrid: (point) => {
      const horizontal = (point.x - originX) / ISOMETRIC_HALF_WIDTH;
      const vertical = (point.y - originY) / ISOMETRIC_HALF_HEIGHT;
      const candidate = {
        x: Math.round((horizontal + vertical) / 2),
        y: Math.round((vertical - horizontal) / 2),
      };
      return inside(candidate, width, height) ? candidate : null;
    },
    depthFor: (point, offset = 0) => (point.x + point.y) * 100 + offset,
  };
};

export const createOrthogonalProjection = (
  width: number,
  height: number,
): WorldProjection | null => {
  if (width <= 0 || height <= 0) return null;
  return {
    mode: 'orthogonal',
    bounds: {
      x: 0,
      y: 0,
      width: width * ORTHOGONAL_TILE_SIZE,
      height: height * ORTHOGONAL_TILE_SIZE,
    },
    gridToScreen: (point) => ({
      x: point.x * ORTHOGONAL_TILE_SIZE + ORTHOGONAL_TILE_SIZE / 2,
      y: point.y * ORTHOGONAL_TILE_SIZE + ORTHOGONAL_TILE_SIZE / 2,
    }),
    screenToGrid: (point) => {
      const candidate = {
        x: Math.floor(point.x / ORTHOGONAL_TILE_SIZE),
        y: Math.floor(point.y / ORTHOGONAL_TILE_SIZE),
      };
      return inside(candidate, width, height) ? candidate : null;
    },
    depthFor: (point, offset = 0) => point.y * ORTHOGONAL_TILE_SIZE + offset,
  };
};
