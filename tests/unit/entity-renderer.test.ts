import { describe, expect, it, vi } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';

vi.mock('../../src/game/scenes/BootScene', () => ({
  ASSET_MANIFEST_REGISTRY_KEY: 'asset-manifest',
  CONTENT_REGISTRY_KEY: 'game-content',
  entityAnimationKey: () => 'animation-key',
}));

describe('EntityRenderer labels', () => {
  it('resolves monster and loot IDs to Traditional Chinese content names', async () => {
    const rendererModule = await import('../../src/game/systems/EntityRenderer');
    expect(rendererModule).toHaveProperty('entityDisplayLabel');

    const entityDisplayLabel = (
      rendererModule as unknown as {
        entityDisplayLabel: (
          content: ReturnType<typeof loadBundledContent>,
          kind: 'monster' | 'loot',
          contentId: string,
        ) => string;
      }
    ).entityDisplayLabel;
    const content = loadBundledContent();

    expect(entityDisplayLabel(content, 'monster', 'goblin')).toBe('哥布林');
    expect(entityDisplayLabel(content, 'loot', 'wooden-club')).toBe('木棒');
  });
});
