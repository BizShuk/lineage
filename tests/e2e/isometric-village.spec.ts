import { expect, test } from '@playwright/test';

test('uses the isometric projection for camera and real ground clicks', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('投影測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();

  const state = page.getByTestId('world-state');
  await expect(state).toHaveAttribute('data-ready', 'true');
  await expect(state).toHaveAttribute('data-projection', 'isometric-2-1');
  await expect(state).toHaveAttribute('data-camera-viewport', '640x384');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', '32');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-y', '32');

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  const scale = box.width / 640;
  await canvas.click({
    position: {
      x: (320 + 16) * scale,
      y: (192 + 8) * scale,
    },
  });
  await page.getByTestId('simulation-step').click();
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', '33');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-y', '32');
});
