import { expect, type Page } from '@playwright/test';

export const fixtureScreens = [
  'menu',
  'character-create',
  'village',
  'north-field',
  'black-knight-area',
  'dungeon-1',
  'dungeon-2',
  'inventory',
  'spells',
  'shop',
  'settings',
] as const;

export type FixtureScreen = (typeof fixtureScreens)[number];

const worldScreens = new Set<FixtureScreen>(fixtureScreens.slice(2));

const settleFrame = async (page: Page): Promise<void> => {
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
};

export const openFixture = async (page: Page, screen: FixtureScreen): Promise<void> => {
  await page.goto(`/?e2e=1&fixture=${screen}`);
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'menu');
  if (screen === 'menu') {
    await settleFrame(page);
    return;
  }

  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'character-create');
  if (screen === 'character-create') {
    await settleFrame(page);
    return;
  }

  if (!worldScreens.has(screen)) throw new Error(`Unsupported world fixture: ${screen}`);
  await page.getByLabel('角色名稱').fill('視覺測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('hud-root')).toBeVisible();

  if (screen === 'inventory') await page.keyboard.press('KeyI');
  if (screen === 'spells') await page.keyboard.press('Shift+KeyS');
  if (screen === 'shop') await page.getByTestId('open-shop').click();
  if (screen === 'settings') await page.getByTestId('open-settings').click();

  await page.getByTestId('world-state').evaluate((element) => {
    element.style.display = 'none';
  });
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; caret-color: transparent !important; }',
  });
  await settleFrame(page);
};
