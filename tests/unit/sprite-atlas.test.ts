import { describe, expect, it } from 'vitest';

import { npcAtlasFrame } from '../../src/game/systems/SpriteAtlas';

describe('NPC sprite atlas layout', () => {
  it('keeps the four horizontal poses inside a 16-column, 5-row sheet', () => {
    expect(npcAtlasFrame(1536, 1024, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 96,
      height: 204,
    });
    expect(npcAtlasFrame(1536, 1024, 1, 0)).toEqual({
      x: 384,
      y: 0,
      width: 96,
      height: 204,
    });
    expect(npcAtlasFrame(1536, 1024, 4, 0)).toEqual({
      x: 0,
      y: 204,
      width: 96,
      height: 204,
    });
    expect(npcAtlasFrame(1536, 1024, 16, 3)).toEqual({
      x: 288,
      y: 816,
      width: 96,
      height: 204,
    });
  });

  it('rejects invalid dimensions and pose indexes', () => {
    expect(npcAtlasFrame(0, 1024, 0, 0)).toBeNull();
    expect(npcAtlasFrame(1536, 0, 0, 0)).toBeNull();
    expect(npcAtlasFrame(1536, 1024, -1, 0)).toBeNull();
    expect(npcAtlasFrame(1536, 1024, 20, 0)).toBeNull();
    expect(npcAtlasFrame(1536, 1024, 0, 4)).toBeNull();
  });
});
