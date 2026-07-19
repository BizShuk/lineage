import { expect, test, type Page } from '@playwright/test';

const enterWorld = async (page: Page, shopActions = false): Promise<void> => {
  await page.goto(`/?e2e=1${shopActions ? '&shopActions=1' : ''}`);
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('介面測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
};

test('shows live HUD values and preserves S movement beside panel shortcuts', async ({ page }) => {
  await enterWorld(page);

  await expect(page.getByTestId('hud-root')).toBeVisible();
  await expect(page.getByTestId('hud-hp')).toContainText('42 / 42');
  await expect(page.getByTestId('hud-mp')).toContainText('19 / 19');
  await expect(page.getByTestId('hud-exp')).toContainText('經驗 0%');
  await expect(page.getByTestId('hud-target')).toHaveText('目標：無');
  await expect(page.getByTestId('hud-vitals')).toBeVisible();
  await expect(page.getByTestId('hud-messages')).toBeVisible();
  await expect(page.getByTestId('hud-quick-slots')).toBeVisible();
  await expect(page.getByTestId('hud-vitals')).toHaveCSS('display', 'grid');
  await expect(page.getByTestId('hud-root')).toHaveCSS('image-rendering', 'pixelated');
  const bottomBackground = await page.locator('.hud-bottom-bar').evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(bottomBackground.startsWith('url(')).toBe(true);
  await expect(page.getByTestId('hud-system-controls').getByTestId('manual-save')).toBeVisible();
  await expect(page.getByTestId('hud-system-controls').getByTestId('return-menu')).toBeVisible();
  await expect(page.getByTestId('hud-stats')).toContainText('等級 1');
  await expect(page.getByTestId('hud-stats')).toContainText('經驗 0%');
  await expect(page.getByTestId('hud-stats')).toContainText('防禦 6');
  await expect(page.getByTestId('hud-stats')).toContainText('負重 46 / 330');
  await expect(page.getByTestId('hud-stats')).toContainText('正義 0');

  const player = page.getByTestId('player-state');
  const startY = await player.getAttribute('data-y');
  await page.locator('canvas').focus();
  await page.keyboard.press('KeyS');
  await page.getByTestId('simulation-step').click();
  await expect(player).not.toHaveAttribute('data-y', startY ?? '');

  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('inventory-panel')).toBeVisible();
  await expect(page.getByTestId('inventory-item-leather-jacket')).toHaveAttribute(
    'data-ui-kind',
    'item-slot',
  );
  await page.getByTestId('inventory-quick-red-potion').click();
  await expect(page.getByTestId('hud-quick-slots')).toContainText('紅色藥水 ×3');

  await page.getByTestId('inventory-item-dagger').click();
  await expect(page.getByTestId('inventory-item-dagger')).toHaveCount(0);
  await page.getByTestId('inventory-item-leather-jacket').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inventory-item-leather-jacket')).toHaveCount(0);
  await expect(page.getByTestId('hud-stats')).toContainText('防禦 5');
  await expect(page.getByTestId('hud-stats')).toContainText('負重 6 / 330');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inventory-panel')).toBeHidden();

  await page.keyboard.press('Shift+KeyS');
  await expect(page.getByTestId('spells-panel')).toBeVisible();
  await expect(page.getByTestId('spell-guarded-stance')).toHaveAttribute(
    'data-ui-kind',
    'spell-slot',
  );
  await expect(page.getByTestId('spell-guarded-stance')).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.keyboard.press('KeyC');
  await expect(page.getByTestId('character-panel')).toContainText('介面測試');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('quests-panel')).toBeVisible();
  await page.getByTestId('quest-scarecrow-training').click();
  await expect(page.getByTestId('quests-status')).toHaveText('請先靠近相關 NPC');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('map-panel')).toContainText('說話之島村');
  await page.locator('canvas').focus();
  await page.keyboard.press('F5');
  await expect(page.getByTestId('hud-quick-slots')).toContainText('紅色藥水 ×2');
});

test('keeps display-only HUD regions pass-through for world clicks', async ({ page }) => {
  await enterWorld(page);

  const hit = await page.getByTestId('hud-exp').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return {
      tagName: target?.tagName ?? null,
      testId: target?.getAttribute('data-testid') ?? null,
    };
  });

  expect(hit).toEqual({ tagName: 'CANVAS', testId: null });
});

test('uses production transactional panels for commerce, storage, dialogue, and settings', async ({
  page,
}) => {
  await enterWorld(page, true);

  await page.getByTestId('open-shop').click();
  await expect(page.getByTestId('shop-panel').locator('.trade-list')).toBeVisible();
  await expect(page.getByTestId('shop-adena')).toContainText('500');
  await page.getByTestId('shop-buy-helmet').click();
  await expect(page.getByTestId('shop-adena')).toContainText('350');
  await page.getByTestId('shop-sell-red-potion').click();
  await expect(page.getByTestId('shop-adena')).toContainText('362');
  await page.keyboard.press('Escape');

  await page.keyboard.press('KeyI');
  await page.getByTestId('inventory-item-helmet').dragTo(
    page.getByTestId('inventory-equipment-target'),
  );
  await expect(page.getByTestId('inventory-item-helmet')).toHaveCount(0);
  await expect(page.getByTestId('hud-stats')).toContainText('防禦 5');
  await page.keyboard.press('Escape');

  await page.locator('canvas').focus();
  for (const code of [...Array<string>(10).fill('KeyD'), ...Array<string>(6).fill('KeyS')]) {
    await page.keyboard.press(code);
    await page.getByTestId('simulation-step').click();
  }
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', '31');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-y', '38');

  await page.getByTestId('open-warehouse').click();
  await expect(page.getByTestId('warehouse-panel').locator('.warehouse-list')).toBeVisible();
  await expect(page.getByTestId('warehouse-panel')).toContainText('紅色藥水 / 身上 2／倉庫 0');
  await page.getByTestId('warehouse-deposit-red-potion').click();
  await expect(page.getByTestId('warehouse-panel')).toContainText('紅色藥水 / 身上 1／倉庫 1');
  await page.getByTestId('warehouse-withdraw-red-potion').click();
  await expect(page.getByTestId('warehouse-panel')).toContainText('紅色藥水 / 身上 2／倉庫 0');
  await page.keyboard.press('Escape');

  await page.getByTestId('open-dialogue').click();
  await expect(page.getByTestId('dialogue-panel').locator('.dialogue-box')).toBeVisible();
  await expect(page.getByTestId('dialogue-panel')).toContainText('歡迎來到說話之島。');
  await page.getByTestId('dialogue-choice-continue').click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('先到村莊補給，再前往訓練場。');

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-panel').locator('.settings-form')).toBeVisible();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await expect(page.getByTestId('dialogue-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-panel')).toBeHidden();
  await expect(page.getByTestId('dialogue-panel')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-music')).toHaveCSS(
    'accent-color',
    'rgb(213, 181, 111)',
  );
  await expect(page.getByTestId('settings-muted')).toHaveCSS(
    'accent-color',
    'rgb(213, 181, 111)',
  );
  await page.getByTestId('settings-music').fill('0.2');
  await page.getByTestId('settings-ambient').fill('0.3');
  await page.getByTestId('settings-effects').fill('0.4');
  await page.getByTestId('settings-muted').check();
  await page.getByTestId('settings-scale').selectOption('3');
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-status')).toHaveText('');
  await expect(page.getByTestId('settings-music')).toHaveValue('0.2');
  await expect(page.getByTestId('settings-ambient')).toHaveValue('0.3');
  await expect(page.getByTestId('settings-effects')).toHaveValue('0.4');
  await expect(page.getByTestId('settings-muted')).toBeChecked();
  await expect(page.getByTestId('settings-scale')).toHaveValue('3');
});
