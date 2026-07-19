import { describe, expect, it } from 'vitest';

import {
  previewDepth,
  previewGridToScreen,
  previewKnightFrame,
  previewTerrainFrame,
} from '../../src/game/systems/IsometricVillagePreview';

describe('isometric village first-frame preview', () => {
  it('projects the village center through a fixed 32x16 diamond', () => {
    expect(previewGridToScreen(32, 32)).toEqual({ x: 1024, y: 576 });
    expect(previewGridToScreen(33, 32)).toEqual({ x: 1040, y: 584 });
    expect(previewGridToScreen(32, 33)).toEqual({ x: 1008, y: 584 });
  });

  it('keeps the plaza compact and blends narrow roads through transitions', () => {
    expect(previewTerrainFrame(32, 32)).toBe(2);
    expect(previewTerrainFrame(30, 30)).toBe(3);
    expect(previewTerrainFrame(27, 30)).toBe(1);
    expect(previewTerrainFrame(28, 30)).toBe(5);
    expect(previewTerrainFrame(26, 29)).toBe(6);
    expect(previewTerrainFrame(23, 40)).toBe(0);
    expect(previewTerrainFrame(18, 18)).toBe(0);
  });

  it('selects one complete 8x6 knight pose for the preview', () => {
    expect(previewKnightFrame(1_536, 1_024)).toEqual({
      x: 768,
      y: 0,
      width: 192,
      height: 170,
    });
    expect(previewKnightFrame(0, 1_024)).toBeNull();
  });

  it('orders feet by projected row and explicit offset', () => {
    expect(previewDepth(33, 32)).toBeGreaterThan(previewDepth(32, 32));
    expect(previewDepth(32, 32, 10)).toBe(previewDepth(32, 32) + 10);
  });
});
