import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundledContent } from '../../src/content/loadContent';
import { TileGrid, type GridPoint } from '../../src/world/grid';
import { isReachable } from '../../src/world/pathfinding';

interface Rectangle extends GridPoint {
  width: number;
  height: number;
}

interface MapAnchor extends GridPoint {
  id: string;
}

interface MapExit extends GridPoint {
  id: string;
  targetMapId: string;
  targetX: number;
  targetY: number;
}

interface CollisionMap {
  id: string;
  width: number;
  height: number;
  terrainLayer: {
    defaultTerrain: string;
    regions: readonly (Rectangle & { terrain: string })[];
  };
  collisionLayer: {
    blockedRectangles: readonly Rectangle[];
  };
  entry: GridPoint;
  exits: readonly MapExit[];
  npcAnchors: readonly MapAnchor[];
  monsterSpawnZones: readonly (Rectangle & { id: string; monsterIds: readonly string[] })[];
  questObjectives: readonly MapAnchor[];
  bossAnchors: readonly MapAnchor[];
  encounterSafeTiles: readonly GridPoint[];
}

const mapDirectory = join(process.cwd(), 'public/assets/maps');

const loadMaps = (): readonly CollisionMap[] =>
  readdirSync(mapDirectory)
    .filter((fileName) => fileName.endsWith('.map.json'))
    .sort()
    .map((fileName) =>
      JSON.parse(readFileSync(join(mapDirectory, fileName), 'utf8')) as CollisionMap,
    );

const createGrid = (map: CollisionMap): TileGrid =>
  TileGrid.fromBlockedRectangles(map.width, map.height, map.collisionLayer.blockedRectangles);

const rectanglePoints = (rectangle: Rectangle): readonly GridPoint[] => {
  const points: GridPoint[] = [];
  for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
    for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
      points.push({ x, y });
    }
  }
  return points;
};

const reachableMapIds = (
  mapsById: ReadonlyMap<string, CollisionMap>,
  startMapId: string,
): ReadonlySet<string> => {
  const visited = new Set<string>();
  const queue = [startMapId];
  while (queue.length > 0) {
    const mapId = queue.shift();
    if (mapId === undefined || visited.has(mapId)) {
      continue;
    }
    visited.add(mapId);
    const map = mapsById.get(mapId);
    map?.exits.forEach(({ targetMapId }) => {
      if (!visited.has(targetMapId)) {
        queue.push(targetMapId);
      }
    });
  }
  return visited;
};

describe('bundled collision maps', () => {
  it('defines the seven required regions at their planned dimensions', () => {
    const maps = loadMaps();
    const sizes = Object.fromEntries(maps.map(({ id, width, height }) => [id, [width, height]]));

    expect(sizes).toEqual({
      'black-knight-area': [96, 96],
      coast: [96, 96],
      'north-field': [96, 96],
      'scarecrow-field': [96, 96],
      'talking-island-dungeon-1': [72, 72],
      'talking-island-dungeon-2': [72, 72],
      'talking-island-village': [64, 64],
    });
    for (const map of maps) {
      expect(map.terrainLayer.defaultTerrain, `${map.id} terrain layer`).toBeTruthy();
      expect(map.collisionLayer.blockedRectangles.length, `${map.id} collision layer`).toBeGreaterThan(
        0,
      );
      expect(map.monsterSpawnZones, `${map.id} spawn zones`).toBeInstanceOf(Array);
      expect(map.encounterSafeTiles.length, `${map.id} safe tiles`).toBeGreaterThan(0);
    }
  });

  it('keeps every exit, NPC, quest objective, boss, spawn tile, and safe tile reachable', () => {
    for (const map of loadMaps()) {
      const grid = createGrid(map);
      const requiredPoints = [
        ...map.exits,
        ...map.npcAnchors,
        ...map.questObjectives,
        ...map.bossAnchors,
        ...map.encounterSafeTiles,
        ...map.monsterSpawnZones.flatMap(rectanglePoints),
      ];

      expect(grid.isWalkable(map.entry), `${map.id} entry`).toBe(true);
      for (const point of requiredPoints) {
        expect(
          grid.isWalkable(point),
          `${map.id} (${String(point.x)}, ${String(point.y)})`,
        ).toBe(true);
        expect(
          isReachable(grid, map.entry, point),
          `${map.id} entry -> (${String(point.x)}, ${String(point.y)})`,
        ).toBe(true);
      }
    }
  });

  it('connects every region to every other region as a directed graph', () => {
    const maps = loadMaps();
    const mapsById = new Map(maps.map((map) => [map.id, map]));

    for (const map of maps) {
      expect(reachableMapIds(mapsById, map.id), map.id).toEqual(new Set(mapsById.keys()));
      for (const exit of map.exits) {
        const target = mapsById.get(exit.targetMapId);
        expect(target, `${map.id}.${exit.id} target`).toBeDefined();
        if (target !== undefined) {
          const targetGrid = createGrid(target);
          expect(
            targetGrid.isWalkable({ x: exit.targetX, y: exit.targetY }),
            `${map.id}.${exit.id} target tile`,
          ).toBe(true);
        }
      }
    }
  });

  it('matches GameContent dimensions, entries, exits, NPCs, and spawn anchors', () => {
    const content = loadBundledContent();
    const assetsById = new Map(loadMaps().map((map) => [map.id, map]));

    expect(new Set(content.maps.map(({ id }) => id))).toEqual(new Set(assetsById.keys()));
    for (const definition of content.maps) {
      const asset = assetsById.get(definition.id);
      expect(asset, definition.id).toBeDefined();
      if (asset === undefined) {
        continue;
      }

      expect(
        { width: definition.width, height: definition.height, entry: definition.entry },
        `${definition.id} dimensions and entry`,
      ).toEqual({ width: asset.width, height: asset.height, entry: asset.entry });
      expect(
        definition.exits,
        `${definition.id} exits`,
      ).toEqual(
        asset.exits.map(({ x, y, targetMapId, targetX, targetY }) => ({
          x,
          y,
          targetMapId,
          targetX,
          targetY,
        })),
      );
      expect([...definition.npcIds].sort(), `${definition.id} NPC IDs`).toEqual(
        asset.npcAnchors.map(({ id }) => id).sort(),
      );

      for (const npcId of definition.npcIds) {
        const npc = content.npc(npcId);
        const anchor = asset.npcAnchors.find(({ id }) => id === npcId);
        expect(anchor, `${definition.id}.${npcId} anchor`).toBeDefined();
        if (anchor !== undefined) {
          expect({ x: npc.x, y: npc.y }, `${definition.id}.${npcId} position`).toEqual({
            x: anchor.x,
            y: anchor.y,
          });
        }
      }

      for (const spawn of definition.spawns) {
        const bossAnchor = asset.bossAnchors.find(({ id }) => id === spawn.monsterId);
        if (bossAnchor !== undefined) {
          expect(
            { x: spawn.x, y: spawn.y },
            `${definition.id}.${spawn.monsterId} boss anchor`,
          ).toEqual({ x: bossAnchor.x, y: bossAnchor.y });
          continue;
        }
        const matchingZone = asset.monsterSpawnZones.find(
          (zone) =>
            zone.monsterIds.includes(spawn.monsterId) &&
            spawn.x >= zone.x &&
            spawn.x < zone.x + zone.width &&
            spawn.y >= zone.y &&
            spawn.y < zone.y + zone.height,
        );
        expect(matchingZone, `${definition.id}.${spawn.monsterId} spawn zone`).toBeDefined();
      }
    }
  });

  it('places the chapter bosses on reachable tiles', () => {
    const bosses = loadMaps().flatMap(({ id: mapId, bossAnchors }) =>
      bossAnchors.map(({ id, x, y }) => ({ id, mapId, x, y })),
    );

    expect(bosses).toContainEqual({
      id: 'kurt',
      mapId: 'black-knight-area',
      x: 72,
      y: 48,
    });
    expect(bosses).toContainEqual({
      id: 'baphomet',
      mapId: 'talking-island-dungeon-2',
      x: 52,
      y: 52,
    });
  });
});
