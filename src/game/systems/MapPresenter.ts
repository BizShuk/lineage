import type Phaser from 'phaser';

import { loadAssetManifest, type AssetManifest } from '../../content/assets';
import type { NpcDefinition } from '../../content/schema';
import type { GridRectangle } from '../../world/grid';

const ASSET_MANIFEST_REGISTRY_KEY = 'asset-manifest';
const TILE_SIZE = 16;

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

export interface MapPresentation {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly textureKey: string;
  readonly terrain: readonly PresentedTerrain[];
  readonly npcs: readonly PresentedNpc[];
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

export const npcInteractionForRole = (role: NpcDefinition['role']): NpcInteraction => {
  if (role === 'shop') return 'shop';
  if (role === 'warehouse') return 'warehouse';
  if (role === 'inn') return 'settings';
  return 'dialogue';
};

export const normalizeMapPresentation = (
  asset: MapAsset,
  npcLookup: NpcLookup,
): MapPresentation => ({
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
});

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

  render(mapId: string): void {
    if (this.#presentation?.id === mapId) return;
    this.#clear();
    const asset = this.#assets.get(mapId);
    if (asset === undefined) return;
    const presentation = normalizeMapPresentation(asset, this.#npcLookup);
    presentation.terrain.forEach((terrain, index) => {
      this.#renderTerrain(presentation.textureKey, terrain, index);
    });
    presentation.npcs.forEach((npc) => {
      this.#renderNpc(npc);
    });
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
    const cellWidth = Math.floor(source.width / 8);
    const cellHeight = Math.floor(source.height / 8);
    const frame = `${textureKey}:map-cell`;
    if (!texture.has(frame) && cellWidth > 0 && cellHeight > 0) {
      texture.add(
        frame,
        0,
        (entry.frame % 8) * cellWidth,
        Math.floor(entry.frame / 8) * cellHeight,
        cellWidth,
        cellHeight,
      );
    }
    if (!texture.has(frame)) return;
    const tiles = this.#scene.add
      .tileSprite(x, y, width, height, entry.group, frame)
      .setOrigin(0)
      .setDepth(depth + 1)
      .setAlpha(0.88);
    this.#objects.push(tiles);
  }

  #renderNpc(npc: PresentedNpc): void {
    const entry = this.#manifest[npc.spriteKey];
    const frame = `${npc.spriteKey}:frame:0`;
    let visual: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
    if (
      entry !== undefined &&
      this.#scene.textures.exists(entry.group) &&
      this.#scene.textures.get(entry.group).has(frame)
    ) {
      visual = this.#scene.add.sprite(0, 0, entry.group, frame).setDisplaySize(28, 36);
    } else {
      visual = this.#scene.add.rectangle(0, 0, 14, 18, 0xc29b62).setStrokeStyle(1, 0x17120d);
    }
    const label = this.#scene.add
      .text(0, -19, npc.name, { color: '#ffe8b0', fontSize: '9px' })
      .setOrigin(0.5, 1);
    const container = this.#scene.add
      .container(npc.x * TILE_SIZE + TILE_SIZE / 2, npc.y * TILE_SIZE + TILE_SIZE / 2, [
        visual,
        label,
      ])
      .setDepth(npc.y * TILE_SIZE)
      .setSize(TILE_SIZE, TILE_SIZE)
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
  }
}
