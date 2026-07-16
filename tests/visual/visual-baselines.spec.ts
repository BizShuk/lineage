import { expect, test } from '@playwright/test';

import { fixtureScreens, openFixture } from '../helpers/openFixture';

test.describe('visual baselines', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const screen of fixtureScreens) {
    test(`${screen} remains visually stable`, async ({ page }) => {
      await openFixture(page, screen);
      await expect(page.getByTestId('game-root')).toHaveScreenshot(`${screen}.png`, {
        animations: 'disabled',
      });
    });
  }
});

for (const viewport of [
  { width: 800, height: 600 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const) {
  test(`keeps the 640x480 logical canvas centered at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openFixture(page, 'village');
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveAttribute('width', '640');
    await expect(canvas).toHaveAttribute('height', '480');
    await expect(canvas).toHaveCSS('image-rendering', 'pixelated');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(box.y + box.height / 2).toBeCloseTo(viewport.height / 2, 0);
  });
}
