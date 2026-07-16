import { expect, test } from '@playwright/test';

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
