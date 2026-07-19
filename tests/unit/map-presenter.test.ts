import { describe, expect, it } from 'vitest';

import {
  isometricGroundFrameAt,
  nearestNpcId,
  normalizeIsometricPresentation,
  normalizeMapPresentation,
  npcInteractionForRole,
  requiredIsometricFrames,
  terrainAt,
  terrainAtlasLayout,
  type MapAsset,
  type PresentedNpc,
} from '../../src/game/systems/MapPresenter';

const asset: MapAsset = {
  id: 'test-map',
  width: 20,
  height: 16,
  terrainLayer: {
    defaultTerrain: 'grass',
    regions: [
      { terrain: 'forest', x: 1, y: 2, width: 5, height: 4 },
      { terrain: 'road', x: 8, y: 0, width: 3, height: 16 },
    ],
  },
  collisionLayer: { blockedRectangles: [] },
  npcAnchors: [
    { id: 'merchant', x: 6, y: 5 },
    { id: 'keeper', x: 12, y: 9 },
  ],
};

const npcLookup = (id: string) => {
  if (id === 'merchant') {
    return { id, name: '測試商人', spriteKey: 'npc-merchant', role: 'shop' as const };
  }
  if (id === 'keeper') {
    return { id, name: '測試倉管', spriteKey: 'npc-keeper', role: 'warehouse' as const };
  }
  throw new Error(`Unknown NPC: ${id}`);
};

describe('MapPresenter contracts', () => {
  it('normalizes default terrain, regions, and NPC anchors deterministically', () => {
    const presentation = normalizeMapPresentation(asset, npcLookup);

    expect(presentation).toEqual({
      id: 'test-map',
      width: 20,
      height: 16,
      textureKey: 'map-test-map',
      terrain: [
        { terrain: 'grass', frame: 0, x: 0, y: 0, width: 20, height: 16 },
        { terrain: 'forest', frame: 1, x: 1, y: 2, width: 5, height: 4 },
        { terrain: 'road', frame: 3, x: 8, y: 0, width: 3, height: 16 },
      ],
      npcs: [
        {
          id: 'merchant',
          name: '測試商人',
          spriteKey: 'npc-merchant',
          interaction: 'shop',
          x: 6,
          y: 5,
        },
        {
          id: 'keeper',
          name: '測試倉管',
          spriteKey: 'npc-keeper',
          interaction: 'warehouse',
          x: 12,
          y: 9,
        },
      ],
    });
  });

  it('routes NPC roles to the supported interaction panels', () => {
    expect(npcInteractionForRole('shop')).toBe('shop');
    expect(npcInteractionForRole('warehouse')).toBe('warehouse');
    expect(npcInteractionForRole('inn')).toBe('settings');
    for (const role of ['trainer', 'quest', 'guide', 'healer', 'guard'] as const) {
      expect(npcInteractionForRole(role)).toBe('dialogue');
    }
  });

  it('selects only an adjacent NPC and uses deterministic nearest distance', () => {
    const npcs: readonly PresentedNpc[] = [
      {
        id: 'far',
        name: '遠方 NPC',
        spriteKey: 'npc-far',
        interaction: 'dialogue',
        x: 8,
        y: 8,
      },
      {
        id: 'near',
        name: '鄰近 NPC',
        spriteKey: 'npc-near',
        interaction: 'dialogue',
        x: 5,
        y: 6,
      },
    ];

    expect(nearestNpcId(npcs, 5, 5)).toBe('near');
    expect(nearestNpcId(npcs, 1, 1)).toBeNull();
  });
});

describe('terrain atlas layout', () => {
  it('maps a 1024px 8x8 atlas to 16px world tiles', () => {
    expect(terrainAtlasLayout(1024, 1024)).toEqual({
      cellWidth: 128,
      cellHeight: 128,
      tileScaleX: 0.125,
      tileScaleY: 0.125,
    });
  });

  it('keeps non-square source dimensions independently scaled', () => {
    expect(terrainAtlasLayout(1536, 1024)).toEqual({
      cellWidth: 192,
      cellHeight: 128,
      tileScaleX: 16 / 192,
      tileScaleY: 0.125,
    });
  });

  it('rejects an empty or undersized source image', () => {
    expect(terrainAtlasLayout(0, 1024)).toBeNull();
    expect(terrainAtlasLayout(1024, 0)).toBeNull();
    expect(terrainAtlasLayout(7, 7)).toBeNull();
  });
});

describe('isometric village presentation', () => {
  const validLayer = {
    projection: 'isometric-2-1',
    atlasKey: 'map-test-map',
    groundFrames: {
      grass: 0,
      stone: 1,
      road: 2,
      crossing: 3,
      grassRoadTransition: 4,
      stoneRoadTransition: 5,
      grassStoneTransition: 6,
    },
    groundPattern: {
      centerX: 10,
      centerY: 8,
      plazaRadius: 3,
      roadHalfWidth: 1,
      transitionWidth: 1,
      roads: [
        {
          axis: 'difference',
          value: 0,
          minSum: 8,
          maxSum: 28,
        },
        {
          axis: 'sum',
          value: 18,
          minX: 6,
          maxX: 13,
          minY: 5,
          maxY: 12,
        },
      ],
    },
    props: [
      {
        id: 'cottage',
        frame: 8,
        x: 6,
        y: 5,
        scale: 0.5,
        anchorX: 0.5,
        anchorY: 0.88,
        depthOffset: 0,
      },
    ],
  } as const;

  const isometricAsset: MapAsset = {
    ...asset,
    presentationLayer: validLayer,
  };

  it('normalizes all approved ground frames and in-bounds props', () => {
    const layer = normalizeIsometricPresentation(isometricAsset);
    expect(layer).not.toBeNull();
    expect(layer?.atlasKey).toBe('map-test-map');
    expect(layer?.props.map(({ id }) => id)).toEqual(['cottage']);
    expect(requiredIsometricFrames(layer)).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
  });

  it('rejects a missing semantic ground frame and filters invalid props', () => {
    expect(
      normalizeIsometricPresentation({
        ...isometricAsset,
        presentationLayer: {
          ...validLayer,
          groundFrames: {
            grass: 0,
            stone: 1,
            road: 2,
            crossing: 3,
            grassRoadTransition: 4,
            stoneRoadTransition: 5,
          },
        },
      }),
    ).toBeNull();
    expect(
      normalizeIsometricPresentation({
        ...isometricAsset,
        presentationLayer: {
          ...validLayer,
          props: [
            {
              id: 'outside',
              frame: 8,
              x: 99,
              y: 99,
              scale: 0.5,
              anchorX: 0.5,
              anchorY: 0.88,
              depthOffset: 0,
            },
          ],
        },
      })?.props,
    ).toEqual([]);
  });

  it('reproduces the approved compact plaza, crossed roads, and transition tiles', () => {
    const villageAsset: MapAsset = {
      ...isometricAsset,
      width: 64,
      height: 64,
      presentationLayer: {
        ...validLayer,
        groundPattern: {
          centerX: 32,
          centerY: 29,
          plazaRadius: 5,
          roadHalfWidth: 1,
          transitionWidth: 1,
          roads: [
            { axis: 'difference', value: 0, minSum: 48, maxSum: 84 },
            {
              axis: 'sum',
              value: 60,
              minX: 24,
              maxX: 38,
              minY: 22,
              maxY: 36,
            },
          ],
        },
      },
    };
    const layer = normalizeIsometricPresentation(villageAsset);
    expect(layer).not.toBeNull();
    if (layer === null) return;

    expect(isometricGroundFrameAt(layer, 32, 32)).toBe(2);
    expect(isometricGroundFrameAt(layer, 30, 30)).toBe(3);
    expect(isometricGroundFrameAt(layer, 27, 30)).toBe(1);
    expect(isometricGroundFrameAt(layer, 28, 30)).toBe(5);
    expect(isometricGroundFrameAt(layer, 24, 26)).toBe(4);
    expect(isometricGroundFrameAt(layer, 26, 29)).toBe(6);
    expect(isometricGroundFrameAt(layer, 23, 40)).toBe(0);
  });

  it('uses the last gameplay terrain region over the default terrain', () => {
    expect(terrainAt(asset, 2, 3)).toBe('forest');
    expect(terrainAt(asset, 9, 3)).toBe('road');
    expect(terrainAt(asset, 19, 15)).toBe('grass');
  });
});
