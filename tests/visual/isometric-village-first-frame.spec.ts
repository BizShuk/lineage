import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

test('captures the approved isometric village through the normal game path', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await page.goto('/?e2e=1&firstFrame=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('視覺測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();

  const root = page.getByTestId('game-root');
  const state = page.getByTestId('world-state');
  await expect(state).toHaveAttribute('data-ready', 'true');
  await expect(state).toHaveAttribute('data-projection', 'isometric-2-1');
  await expect(state).toHaveAttribute('data-camera-viewport', '640x384');
  await expect(root).toHaveAttribute('data-first-frame-preview', 'true');

  const background = await root.locator('.hud-bottom-bar').evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(background.startsWith('url(')).toBe(true);

  const hudBox = await page.getByTestId('hud-root').boundingBox();
  const canvasBox = await root.locator('canvas').boundingBox();
  const worldViewportBox = await page.getByTestId('world-viewport').boundingBox();
  const controlsBox = await page.locator('.save-controls').boundingBox();
  const quickSlotsBox = await page.getByTestId('hud-quick-slots').boundingBox();
  expect(hudBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(worldViewportBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(quickSlotsBox).not.toBeNull();
  if (hudBox !== null && canvasBox !== null && worldViewportBox !== null) {
    expect(hudBox.width).toBeCloseTo(canvasBox.width, 0);
    expect(hudBox.height).toBeCloseTo(canvasBox.height, 0);
    expect(worldViewportBox.width).toBeCloseTo(canvasBox.width, 0);
    expect(worldViewportBox.height).toBeCloseTo(canvasBox.height * (384 / 480), 0);
  }
  if (hudBox !== null && controlsBox !== null) {
    expect(controlsBox.x).toBeGreaterThanOrEqual(hudBox.x);
    expect(controlsBox.y).toBeGreaterThanOrEqual(hudBox.y);
    expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(hudBox.x + hudBox.width);
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(hudBox.y + hudBox.height);
  }
  if (controlsBox !== null && quickSlotsBox !== null) {
    const overlapsQuickSlots =
      controlsBox.x < quickSlotsBox.x + quickSlotsBox.width &&
      controlsBox.x + controlsBox.width > quickSlotsBox.x &&
      controlsBox.y < quickSlotsBox.y + quickSlotsBox.height &&
      controlsBox.y + controlsBox.height > quickSlotsBox.y;
    expect(overlapsQuickSlots).toBe(false);
  }

  await page.getByTestId('world-state').evaluate((element) => {
    element.style.display = 'none';
  });
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

  const screenshotPath = testInfo.outputPath('isometric-village-first-frame.png');
  await root.screenshot({ path: screenshotPath, animations: 'disabled' });
  await testInfo.attach('isometric-village-first-frame', {
    path: screenshotPath,
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
