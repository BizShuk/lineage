import type Phaser from 'phaser';

import { loadAssetManifest, type AssetManifest } from '../../content/assets';
import type { NpcDefinition } from '../../content/schema';
import type { GridRectangle } from '../../world/grid';
import { fitSpriteFrame } from './SpriteAtlas';
import {
  createIsometricProjection,
  createOrthogonalProjection,
  type WorldProjection,
} from './WorldProjection';

const ASSET_MANIFEST_REGISTRY_KEY = 'asset-manifest';
const TILE_SIZE = 16;
const TERRAIN_ATLAS_COLUMNS = 8;
const TERRAIN_ATLAS_ROWS = 8;
const ISOMETRIC_GROUND_DEPTH = -2_900;
const isometricGroundFrameKeys = [
  'grass',
  'stone',
  'road',
  'crossing',
  'grassRoadTransition',
  'stoneRoadTransition',
  'grassStoneTransition',
] as const;

type IsometricGroundFrameKey = (typeof isometricGroundFrameKeys)[number];

export interface TerrainAtlasLayout {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly tileScaleX: number;
  readonly tileScaleY: number;
}

export const terrainAtlasLayout = (
  sourceWidth: number,
  sourceHeight: number,
  tileSize = TILE_SIZE,
): TerrainAtlasLayout | null => {
  const cellWidth = Math.floor(sourceWidth / TERRAIN_ATLAS_COLUMNS);
  const cellHeight = Math.floor(sourceHeight / TERRAIN_ATLAS_ROWS);
  if (cellWidth <= 0 || cellHeight <= 0 || tileSize <= 0) return null;
  return {
    cellWidth,
    cellHeight,
    tileScaleX: tileSize / cellWidth,
    tileScaleY: tileSize / cellHeight,
  };
};

export interface TerrainRegion {
  readonly terrain: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MapAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly terrainLayer: {
    readonly defaultTerrain: string;
    readonly regions: readonly TerrainRegion[];
  };
  readonly collisionLayer: { readonly blockedRectangles: readonly GridRectangle[] };
  readonly presentationLayer?: unknown;
  readonly npcAnchors: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  }[];
}

export type NpcInteraction = 'dialogue' | 'shop' | 'warehouse' | 'settings';

export interface PresentedNpc {
  readonly id: string;
  readonly name: string;
  readonly spriteKey: string;
  readonly interaction: NpcInteraction;
  readonly x: number;
  readonly y: number;
}

export interface PresentedTerrain extends TerrainRegion {
  readonly frame: number;
}

export interface PresentedProp {
  readonly id: string;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly depthOffset: number;
}

export interface PresentedRoadRule {
  readonly axis: 'difference' | 'sum';
  readonly value: number;
  readonly minX: number | null;
  readonly maxX: number | null;
  readonly minY: number | null;
  readonly maxY: number | null;
  readonly minSum: number | null;
  readonly maxSum: number | null;
}

export interface PresentedGroundPattern {
  readonly centerX: number;
  readonly centerY: number;
  readonly plazaRadius: number;
  readonly roadHalfWidth: number;
  readonly transitionWidth: number;
  readonly roads: readonly PresentedRoadRule[];
}

export interface PresentedIsometricLayer {
  readonly atlasKey: string;
  readonly groundFrames: Readonly<Record<IsometricGroundFrameKey, number>>;
  readonly groundPattern: PresentedGroundPattern;
  readonly props: readonly PresentedProp[];
}

export interface MapPresentation {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly textureKey: string;
  readonly terrain: readonly PresentedTerrain[];
  readonly npcs: readonly PresentedNpc[];
  readonly isometric?: PresentedIsometricLayer;
}

export type NpcLookup = (
  id: string,
) => Pick<NpcDefinition, 'id' | 'name' | 'spriteKey' | 'role'>;

const terrainFrames: Readonly<Record<string, number>> = {
  grass: 0,
  forest: 1,
  dirt: 2,
  road: 3,
  stone: 1,
  sand: 2,
  'shallow-water': 3,
  'burnt-ground': 2,
  'dungeon-stone': 0,
  'damp-stone': 1,
  crypt: 2,
  'ritual-floor': 3,
};

const terrainColors: Readonly<Record<string, number>> = {
  grass: 0x334a28,
  forest: 0x1d3925,
  dirt: 0x5a4930,
  road: 0x79684c,
  stone: 0x5b5d55,
  sand: 0x8a7549,
  'shallow-water': 0x24546b,
  'burnt-ground': 0x46362d,
  'dungeon-stone': 0x272a2b,
  'damp-stone': 0x28383b,
  crypt: 0x201f25,
  'ritual-floor': 0x34263d,
};

const terrainFrame = (terrain: string): number => terrainFrames[terrain] ?? 0;

const recordValue = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const safeInteger = (value: unknown): value is number => Number.isSafeInteger(value);

const safeFrame = (value: unknown): value is number =>
  safeInteger(value) && value >= 0 && value < 16;

const optionalInteger = (value: unknown): number | null | undefined => {
  if (value === undefined) return null;
  return safeInteger(value) ? value : undefined;
};

const normalizeRoadRule = (value: unknown): PresentedRoadRule | null => {
  const road = recordValue(value);
  if (
    road === null ||
    (road.axis !== 'difference' && road.axis !== 'sum') ||
    !safeInteger(road.value)
  ) {
    return null;
  }
  const minX = optionalInteger(road.minX);
  const maxX = optionalInteger(road.maxX);
  const minY = optionalInteger(road.minY);
  const maxY = optionalInteger(road.maxY);
  const minSum = optionalInteger(road.minSum);
  const maxSum = optionalInteger(road.maxSum);
  if (
    minX === undefined ||
    maxX === undefined ||
    minY === undefined ||
    maxY === undefined ||
    minSum === undefined ||
    maxSum === undefined ||
    (minX !== null && maxX !== null && minX > maxX) ||
    (minY !== null && maxY !== null && minY > maxY) ||
    (minSum !== null && maxSum !== null && minSum > maxSum)
  ) {
    return null;
  }
  return {
    axis: road.axis,
    value: road.value,
    minX,
    maxX,
    minY,
    maxY,
    minSum,
    maxSum,
  };
};

export const terrainAt = (asset: MapAsset, x: number, y: number): string => {
  const region = [...asset.terrainLayer.regions].reverse().find(
    (candidate) =>
      x >= candidate.x &&
      y >= candidate.y &&
      x < candidate.x + candidate.width &&
      y < candidate.y + candidate.height,
  );
  return region?.terrain ?? asset.terrainLayer.defaultTerrain;
};

export const normalizeIsometricPresentation = (
  asset: MapAsset,
): PresentedIsometricLayer | null => {
  const raw = recordValue(asset.presentationLayer);
  if (
    raw?.projection !== 'isometric-2-1' ||
    typeof raw.atlasKey !== 'string' ||
    raw.atlasKey.length === 0
  ) {
    return null;
  }

  const rawFrames = recordValue(raw.groundFrames);
  if (rawFrames === null) return null;
  const groundFrames = {} as Record<IsometricGroundFrameKey, number>;
  for (const key of isometricGroundFrameKeys) {
    const frame = rawFrames[key];
    if (!safeFrame(frame)) return null;
    groundFrames[key] = frame;
  }

  const rawPattern = recordValue(raw.groundPattern);
  if (
    rawPattern === null ||
    !safeInteger(rawPattern.centerX) ||
    !safeInteger(rawPattern.centerY) ||
    !safeInteger(rawPattern.plazaRadius) ||
    !safeInteger(rawPattern.roadHalfWidth) ||
    !safeInteger(rawPattern.transitionWidth) ||
    rawPattern.centerX < 0 ||
    rawPattern.centerY < 0 ||
    rawPattern.centerX >= asset.width ||
    rawPattern.centerY >= asset.height ||
    rawPattern.plazaRadius < 0 ||
    rawPattern.roadHalfWidth < 0 ||
    rawPattern.transitionWidth <= 0 ||
    !Array.isArray(rawPattern.roads) ||
    rawPattern.roads.length === 0
  ) {
    return null;
  }
  const roads: PresentedRoadRule[] = [];
  for (const value of rawPattern.roads) {
    const road = normalizeRoadRule(value);
    if (road === null) return null;
    roads.push(road);
  }

  const seenPropIds = new Set<string>();
  const rawProps = Array.isArray(raw.props) ? raw.props : [];
  const props = rawProps.flatMap((value): PresentedProp[] => {
    const prop = recordValue(value);
    if (
      prop === null ||
      typeof prop.id !== 'string' ||
      prop.id.length === 0 ||
      seenPropIds.has(prop.id) ||
      !safeFrame(prop.frame) ||
      !safeInteger(prop.x) ||
      !safeInteger(prop.y) ||
      typeof prop.scale !== 'number' ||
      !Number.isFinite(prop.scale) ||
      typeof prop.anchorX !== 'number' ||
      !Number.isFinite(prop.anchorX) ||
      typeof prop.anchorY !== 'number' ||
      !Number.isFinite(prop.anchorY) ||
      typeof prop.depthOffset !== 'number' ||
      !Number.isFinite(prop.depthOffset) ||
      prop.x < 0 ||
      prop.y < 0 ||
      prop.x >= asset.width ||
      prop.y >= asset.height ||
      prop.scale <= 0 ||
      prop.anchorX < 0 ||
      prop.anchorX > 1 ||
      prop.anchorY < 0 ||
      prop.anchorY > 1
    ) {
      return [];
    }
    seenPropIds.add(prop.id);
    return [
      {
        id: prop.id,
        frame: prop.frame,
        x: prop.x,
        y: prop.y,
        scale: prop.scale,
        anchorX: prop.anchorX,
        anchorY: prop.anchorY,
        depthOffset: prop.depthOffset,
      },
    ];
  });

  return {
    atlasKey: raw.atlasKey,
    groundFrames: Object.freeze(groundFrames),
    groundPattern: {
      centerX: rawPattern.centerX,
      centerY: rawPattern.centerY,
      plazaRadius: rawPattern.plazaRadius,
      roadHalfWidth: rawPattern.roadHalfWidth,
      transitionWidth: rawPattern.transitionWidth,
      roads,
    },
    props,
  };
};

export const requiredIsometricFrames = (
  layer: PresentedIsometricLayer | null,
): readonly number[] =>
  layer === null
    ? []
    : [
        ...new Set([
          ...Object.values(layer.groundFrames),
          ...layer.props.map(({ frame }) => frame),
        ]),
      ].sort((left, right) => left - right);

const roadRuleApplies = (road: PresentedRoadRule, x: number, y: number): boolean => {
  const sum = x + y;
  return (
    (road.minX === null || x >= road.minX) &&
    (road.maxX === null || x <= road.maxX) &&
    (road.minY === null || y >= road.minY) &&
    (road.maxY === null || y <= road.maxY) &&
    (road.minSum === null || sum >= road.minSum) &&
    (road.maxSum === null || sum <= road.maxSum)
  );
};

export const isometricGroundFrameAt = (
  layer: PresentedIsometricLayer,
  x: number,
  y: number,
): number => {
  const pattern = layer.groundPattern;
  const plazaDistance = Math.max(
    Math.abs(x - pattern.centerX),
    Math.abs(y - pattern.centerY),
  );
  const roadDistances = pattern.roads
    .filter((road) => roadRuleApplies(road, x, y))
    .map((road) =>
      Math.abs((road.axis === 'difference' ? x - y : x + y) - road.value),
    );
  const roadCount = roadDistances.filter(
    (distance) => distance <= pattern.roadHalfWidth,
  ).length;
  if (roadCount > 1) return layer.groundFrames.crossing;
  if (roadCount === 1) return layer.groundFrames.road;
  if (
    roadDistances.some(
      (distance) =>
        distance > pattern.roadHalfWidth &&
        distance <= pattern.roadHalfWidth + pattern.transitionWidth,
    )
  ) {
    return plazaDistance <= pattern.plazaRadius
      ? layer.groundFrames.stoneRoadTransition
      : layer.groundFrames.grassRoadTransition;
  }
  if (plazaDistance <= pattern.plazaRadius) return layer.groundFrames.stone;
  if (plazaDistance <= pattern.plazaRadius + pattern.transitionWidth) {
    return layer.groundFrames.grassStoneTransition;
  }
  return layer.groundFrames.grass;
};

export const npcInteractionForRole = (role: NpcDefinition['role']): NpcInteraction => {
  if (role === 'shop') return 'shop';
  if (role === 'warehouse') return 'warehouse';
  if (role === 'inn') return 'settings';
  return 'dialogue';
};

export const normalizeMapPresentation = (
  asset: MapAsset,
  npcLookup: NpcLookup,
): MapPresentation => {
  const isometric = normalizeIsometricPresentation(asset);
  return {
    id: asset.id,
    width: asset.width,
    height: asset.height,
    textureKey: `map-${asset.id}`,
    terrain: [
      {
        terrain: asset.terrainLayer.defaultTerrain,
        frame: terrainFrame(asset.terrainLayer.defaultTerrain),
        x: 0,
        y: 0,
        width: asset.width,
        height: asset.height,
      },
      ...asset.terrainLayer.regions.map((region) => ({
        ...region,
        frame: terrainFrame(region.terrain),
      })),
    ],
    npcs: asset.npcAnchors.map((anchor) => {
      const npc = npcLookup(anchor.id);
      return {
        id: npc.id,
        name: npc.name,
        spriteKey: npc.spriteKey,
        interaction: npcInteractionForRole(npc.role),
        x: anchor.x,
        y: anchor.y,
      };
    }),
    ...(isometric === null ? {} : { isometric }),
  };
};

export const nearestNpcId = (
  npcs: readonly PresentedNpc[],
  x: number,
  y: number,
): string | null => {
  const adjacent = npcs
    .map((npc) => ({ npc, distance: Math.max(Math.abs(npc.x - x), Math.abs(npc.y - y)) }))
    .filter(({ distance }) => distance <= 1)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.npc.id.localeCompare(right.npc.id, 'en'),
    );
  return adjacent[0]?.npc.id ?? null;
};

export class MapPresenter {
  readonly #scene: Phaser.Scene;
  readonly #assets: ReadonlyMap<string, MapAsset>;
  readonly #npcLookup: NpcLookup;
  readonly #manifest: AssetManifest;
  readonly #objects: Phaser.GameObjects.GameObject[] = [];
  #presentation: MapPresentation | null = null;
  #projection: WorldProjection | null = null;

  constructor(
    scene: Phaser.Scene,
    assets: ReadonlyMap<string, MapAsset>,
    npcLookup: NpcLookup,
  ) {
    this.#scene = scene;
    this.#assets = assets;
    this.#npcLookup = npcLookup;
    this.#manifest =
      (scene.registry.get(ASSET_MANIFEST_REGISTRY_KEY) as AssetManifest | undefined) ??
      loadAssetManifest();
  }

  get projection(): WorldProjection | null {
    return this.#projection;
  }

  render(mapId: string): void {
    if (this.#presentation?.id === mapId) return;
    this.#clear();
    const asset = this.#assets.get(mapId);
    if (asset === undefined) return;
    const presentation = normalizeMapPresentation(asset, this.#npcLookup);
    const isometric = presentation.isometric;
    const projection =
      isometric === undefined
        ? null
        : createIsometricProjection(asset.width, asset.height, 128);
    const entry = isometric === undefined ? undefined : this.#manifest[isometric.atlasKey];
    const texture =
      entry === undefined || !this.#scene.textures.exists(entry.group)
        ? null
        : this.#scene.textures.get(entry.group);
    const ready =
      isometric !== undefined &&
      projection !== null &&
      entry !== undefined &&
      texture !== null &&
      requiredIsometricFrames(isometric).every((frame) =>
        texture.has(`${isometric.atlasKey}:frame:${String(frame)}`),
      );

    if (ready) {
      this.#renderIsometric(asset, isometric, projection, entry.group);
      this.#projection = projection;
    } else {
      presentation.terrain.forEach((terrain, index) => {
        this.#renderTerrain(presentation.textureKey, terrain, index);
      });
      this.#projection = createOrthogonalProjection(asset.width, asset.height);
    }
    const activeProjection = this.#projection;
    if (activeProjection !== null) {
      presentation.npcs.forEach((npc) => {
        this.#renderNpc(npc, activeProjection);
      });
    }
    this.#presentation = presentation;
  }

  nearestNpc(x: number, y: number): string | null {
    return this.#presentation === null ? null : nearestNpcId(this.#presentation.npcs, x, y);
  }

  interactionForNpc(id: string): NpcInteraction | null {
    return this.#presentation?.npcs.find((npc) => npc.id === id)?.interaction ?? null;
  }

  destroy(): void {
    this.#clear();
  }

  #renderIsometric(
    asset: MapAsset,
    layer: PresentedIsometricLayer,
    projection: WorldProjection,
    textureKey: string,
  ): void {
    for (let y = 0; y < asset.height; y += 1) {
      for (let x = 0; x < asset.width; x += 1) {
        const point = projection.gridToScreen({ x, y });
        const frame = isometricGroundFrameAt(layer, x, y);
        const tile = this.#scene.add
          .image(
            point.x,
            point.y,
            textureKey,
            `${layer.atlasKey}:frame:${String(frame)}`,
          )
          .setOrigin(0.5)
          .setScale(0.25)
          .setDepth(ISOMETRIC_GROUND_DEPTH + x + y);
        this.#objects.push(tile);
      }
    }
    for (const prop of layer.props) {
      const point = projection.gridToScreen(prop);
      const image = this.#scene.add
        .image(
          point.x,
          point.y,
          textureKey,
          `${layer.atlasKey}:frame:${String(prop.frame)}`,
        )
        .setOrigin(prop.anchorX, prop.anchorY)
        .setScale(prop.scale)
        .setDepth(projection.depthFor(prop, prop.depthOffset));
      image.setData('presentation-id', prop.id);
      this.#objects.push(image);
    }
  }

  #renderTerrain(textureKey: string, terrain: PresentedTerrain, index: number): void {
    const x = terrain.x * TILE_SIZE;
    const y = terrain.y * TILE_SIZE;
    const width = terrain.width * TILE_SIZE;
    const height = terrain.height * TILE_SIZE;
    const depth = -2_000 + index * 2;
    const base = this.#scene.add
      .rectangle(x, y, width, height, terrainColors[terrain.terrain] ?? 0x303833)
      .setOrigin(0)
      .setDepth(depth)
      .setAlpha(index === 0 ? 1 : 0.5);
    this.#objects.push(base);

    if (index > 0) return;

    const entry = this.#manifest[textureKey];
    if (entry === undefined || !this.#scene.textures.exists(entry.group)) return;
    const texture = this.#scene.textures.get(entry.group);
    const source = texture.getSourceImage() as { width: number; height: number };
    const layout = terrainAtlasLayout(source.width, source.height);
    if (layout === null) return;
    const cellX = (entry.frame % TERRAIN_ATLAS_COLUMNS) * layout.cellWidth;
    const cellY = Math.floor(entry.frame / TERRAIN_ATLAS_COLUMNS) * layout.cellHeight;
    const frame = `${textureKey}:map-cell`;
    if (!texture.has(frame)) {
      texture.add(
        frame,
        0,
        cellX,
        cellY,
        layout.cellWidth,
        layout.cellHeight,
      );
    }
    if (!texture.has(frame)) return;
    const tiles = this.#scene.add
      .tileSprite(x, y, width, height, entry.group, frame)
      .setOrigin(0)
      .setDepth(depth + 1)
      .setAlpha(0.88)
      .setTileScale(layout.tileScaleX, layout.tileScaleY);
    this.#objects.push(tiles);
  }

  #renderNpc(npc: PresentedNpc, projection: WorldProjection): void {
    const entry = this.#manifest[npc.spriteKey];
    const frame = `${npc.spriteKey}:frame:0`;
    let visual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
    let labelY = -19;
    if (
      entry !== undefined &&
      this.#scene.textures.exists(entry.group) &&
      this.#scene.textures.get(entry.group).has(frame)
    ) {
      const sprite = this.#scene.add.sprite(0, 0, entry.group, frame);
      if (projection.mode === 'isometric-2-1') {
        const fit = fitSpriteFrame(sprite.frame.realWidth, sprite.frame.realHeight, 44, 52);
        if (fit !== null) sprite.setDisplaySize(fit.width, fit.height);
        sprite.setOrigin(0.5, 1);
        labelY = -sprite.displayHeight - 2;
      } else {
        sprite.setDisplaySize(28, 36);
      }
      visual = sprite;
    } else {
      visual = this.#scene.add.rectangle(0, 0, 14, 18, 0xc29b62).setStrokeStyle(1, 0x17120d);
    }
    const label = this.#scene.add
      .text(0, labelY, npc.name, {
        color: '#ffe8b0',
        fontSize: '9px',
        stroke: '#17120d',
        strokeThickness: projection.mode === 'isometric-2-1' ? 2 : 0,
      })
      .setOrigin(0.5, 1);
    const point = projection.gridToScreen(npc);
    const container = this.#scene.add
      .container(point.x, point.y, [visual, label])
      .setDepth(projection.depthFor(npc, 20))
      .setSize(projection.mode === 'isometric-2-1' ? 32 : TILE_SIZE, 36)
      .setInteractive();
    container.setData('target-kind', 'npc');
    container.setData('target-id', npc.id);
    this.#objects.push(container);
  }

  #clear(): void {
    this.#objects.forEach((object) => {
      object.destroy();
    });
    this.#objects.length = 0;
    this.#presentation = null;
    this.#projection = null;
  }
}
