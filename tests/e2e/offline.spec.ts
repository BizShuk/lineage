import { execFileSync, spawn, type ChildProcess } from 'node:child_process';

import { expect, test } from '@playwright/test';

const previewUrl = 'http://127.0.0.1:4174';
let preview: ChildProcess | undefined;

const waitForPreview = async (): Promise<void> => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(previewUrl);
      if (response.ok) return;
    } catch {
      // Production preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('production preview did not start within 20 seconds');
};

test.beforeAll(async () => {
  execFileSync('npm', ['run', 'build'], { cwd: process.cwd(), stdio: 'pipe' });
  preview = spawn(
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4174'],
    { cwd: process.cwd(), stdio: 'pipe' },
  );
  await waitForPreview();
});

test.afterAll(() => {
  preview?.kill('SIGTERM');
});

test('warm-loads the production cache, then reloads and starts play while offline', async ({
  context,
  page,
}) => {
  await page.goto(`${previewUrl}/`);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(
    true,
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'menu');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('離線遊玩騎士');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'world');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('canvas').focus();
  await page.keyboard.press('KeyS');
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-last-command', 'move');
  await context.setOffline(false);
});
