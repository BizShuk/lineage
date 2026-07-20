import { expect, test } from '@playwright/test';

test('starts in training and clicking the visible goblin body locks the monster', async ({
  page,
}) => {
  await page.goto('/?e2e=1&visual=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('畫面戰鬥測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();

  const state = page.getByTestId('world-state');
  await expect(state).toHaveAttribute('data-ready', 'true');
  await expect(state).toHaveAttribute('data-projection', 'orthogonal');
  await expect(page.getByTestId('monster-goblin')).toBeVisible();

  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) return;

  // New characters start at (48, 2). The first content goblin is at (38, 20),
  // so its screen-space center is (160, 328) after the clamped camera offset.
  // Click the visible right side of its body, beyond the old 16x16 feet-only hit area.
  await canvas.click({
    position: {
      x: 185 * (bounds.width / 640),
      y: 328 * (bounds.height / 480),
    },
  });

  await expect(state).not.toHaveAttribute('data-auto-attack', '');
  await page.getByTestId('simulation-step').click({ clickCount: 4 });
  await expect(page.getByTestId('combat-feedback')).toContainText('傷害');

  await page.keyboard.press('KeyD');
  await expect(state).toHaveAttribute('data-auto-attack', '');
  await page.keyboard.press('Space');
  await expect(state).not.toHaveAttribute('data-auto-attack', '');
});

test('moves, approaches, attacks, cancels, kills, and picks up loot', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('戰鬥測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');

  const player = page.getByTestId('player-state');
  const startX = await player.getAttribute('data-x');
  await page.getByTestId('ground-target').click();
  await page.getByTestId('simulation-step').click();
  await expect(player).not.toHaveAttribute('data-x', startX ?? '');

  await page.getByTestId('monster-goblin').click();
  await page.getByTestId('simulation-step').click({ clickCount: 4 });
  await expect(page.getByTestId('combat-feedback')).toContainText('傷害');

  await page.keyboard.press('KeyA');
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-auto-attack', '');

  await page.getByTestId('monster-goblin').click();
  for (let step = 0; step < 30; step += 1) {
    if ((await page.getByTestId('monster-goblin').getAttribute('data-dead')) === 'true') break;
    await page.getByTestId('simulation-step').click();
  }
  await expect(page.getByTestId('monster-goblin')).toHaveAttribute('data-dead', 'true');

  const loot = page.getByTestId('ground-loot').first();
  await expect(loot).toBeVisible();
  await loot.click();
  await expect(page.getByTestId('ground-loot')).toHaveCount(0);
  await expect(page.getByTestId('inventory-state')).toContainText('wooden-club');
});
