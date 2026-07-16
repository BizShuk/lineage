import { describe, expect, it } from 'vitest';

import {
  nearestNpcId,
  normalizeMapPresentation,
  npcInteractionForRole,
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
