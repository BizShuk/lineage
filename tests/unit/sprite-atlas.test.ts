import { describe, expect, it } from 'vitest';

import {
  classIsometricIdleFrame,
  fitSpriteFrame,
  isometricVillageAtlasFrame,
  npcAtlasFrame,
  rowMonsterAtlasFrame,
} from '../../src/game/systems/SpriteAtlas';

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

describe('isometric village atlas layout', () => {
  it('cuts exact 4x4 cells from the approved 1024px atlas', () => {
    expect(isometricVillageAtlasFrame(1024, 1024, 0)).toEqual({
      x: 0,
      y: 0,
      width: 256,
      height: 256,
    });
    expect(isometricVillageAtlasFrame(1024, 1024, 15)).toEqual({
      x: 768,
      y: 768,
      width: 256,
      height: 256,
    });
  });

  it('rejects invalid village atlas indexes and dimensions', () => {
    expect(isometricVillageAtlasFrame(0, 1024, 0)).toBeNull();
    expect(isometricVillageAtlasFrame(1024, 0, 0)).toBeNull();
    expect(isometricVillageAtlasFrame(1024, 1024, -1)).toBeNull();
    expect(isometricVillageAtlasFrame(1024, 1024, 16)).toBeNull();
  });

  it('fits actor frames without changing aspect ratio', () => {
    expect(fitSpriteFrame(96, 204, 44, 52)).toEqual({
      width: 96 * (52 / 204),
      height: 52,
      scale: 52 / 204,
    });
    expect(fitSpriteFrame(0, 204, 44, 52)).toBeNull();
  });

  it('selects one complete front-facing class pose for the isometric world', () => {
    expect(classIsometricIdleFrame(1536, 1024)).toEqual({
      x: 768,
      y: 0,
      width: 192,
      height: 170,
    });
    expect(classIsometricIdleFrame(0, 1024)).toBeNull();
  });
});

describe('row-based monster atlas layout', () => {
  it('cuts complete five-pose rows instead of quadrant fragments', () => {
    expect(rowMonsterAtlasFrame(1536, 1024, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 307,
      height: 170,
    });
    expect(rowMonsterAtlasFrame(1536, 1024, 3, 4)).toEqual({
      x: 1228,
      y: 510,
      width: 307,
      height: 170,
    });
  });

  it('rejects rows and poses outside the generated sheet', () => {
    expect(rowMonsterAtlasFrame(0, 1024, 0, 0)).toBeNull();
    expect(rowMonsterAtlasFrame(1536, 0, 0, 0)).toBeNull();
    expect(rowMonsterAtlasFrame(1536, 1024, -1, 0)).toBeNull();
    expect(rowMonsterAtlasFrame(1536, 1024, 6, 0)).toBeNull();
    expect(rowMonsterAtlasFrame(1536, 1024, 0, 5)).toBeNull();
  });
});
