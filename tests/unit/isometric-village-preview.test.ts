import { describe, expect, it } from 'vitest';

import {
  previewDepth,
  previewGridToScreen,
  previewTerrainFrame,
} from '../../src/game/systems/IsometricVillagePreview';

describe('isometric village first-frame preview', () => {
  it('projects the village center through a fixed 32x16 diamond', () => {
    expect(previewGridToScreen(32, 32)).toEqual({ x: 1024, y: 576 });
    expect(previewGridToScreen(33, 32)).toEqual({ x: 1040, y: 584 });
    expect(previewGridToScreen(32, 33)).toEqual({ x: 1008, y: 584 });
  });

  it('selects road over plaza and plaza over grass', () => {
    expect(previewTerrainFrame(32, 32)).toBe(2);
    expect(previewTerrainFrame(24, 24)).toBe(1);
    expect(previewTerrainFrame(18, 18)).toBe(0);
  });

  it('orders feet by projected row and explicit offset', () => {
    expect(previewDepth(33, 32)).toBeGreaterThan(previewDepth(32, 32));
    expect(previewDepth(32, 32, 10)).toBe(previewDepth(32, 32) + 10);
  });
});
