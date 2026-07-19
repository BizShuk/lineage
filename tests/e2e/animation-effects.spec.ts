import { expect, test } from '@playwright/test';

const pngPaths = [
  '/assets/sprites/player-prince.png',
  '/assets/sprites/player-knight.png',
  '/assets/sprites/player-elf.png',
  '/assets/sprites/player-wizard.png',
  '/assets/sprites/monsters-surface.png',
  '/assets/sprites/monsters-undead.png',
  '/assets/sprites/black-knight.png',
  '/assets/sprites/baphomet.png',
  '/assets/sprites/npcs.png',
  '/assets/sprites/items.png',
  '/assets/sprites/effects.png',
  '/assets/maps/tiles-overworld.png',
  '/assets/maps/tiles-dungeon.png',
  '/assets/maps/isometric-village-v1.png',
  '/assets/ui/classic-frame.png',
] as const;

const classes = ['class-prince', 'class-knight', 'class-elf', 'class-wizard'] as const;
const states = ['idle', 'walk', 'attack', 'hit', 'cast', 'death'] as const;
const effects = ['melee', 'projectile', 'spell', 'damage', 'level-up', 'loot'] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/?e2e=1&animationTest=1');
  await expect(page.getByTestId('animation-diagnostics')).toHaveAttribute('data-ready', 'true');
});

test('loads every planned PNG with nonzero natural dimensions', async ({ page }) => {
  const dimensions = await page.evaluate(async (paths) =>
    Promise.all(
      paths.map(
        (path) =>
          new Promise<{ path: string; width: number; height: number }>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              resolve({ path, width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = () => {
              reject(new Error(`無法載入 ${path}`));
            };
            image.src = path;
          }),
      ),
    ),
  pngPaths);

  expect(dimensions).toHaveLength(15);
  expect(dimensions.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
  await expect(page.getByTestId('asset-load-failures')).toHaveText('0');
});

test('plays all six states for every player class', async ({ page }) => {
  const preview = page.getByTestId('animation-preview-state');
  for (const classKey of classes) {
    for (const state of states) {
      const animationKey = `${classKey}:${state}:s`;
      await page.getByTestId(`play-${animationKey}`).click();
      await expect(preview).toHaveAttribute('data-animation', animationKey);
      await expect(preview).toHaveAttribute('data-cycle-complete', 'true');
      expect(Number(await preview.getAttribute('data-frame-count'))).toBeGreaterThan(0);
    }
  }
});

test('Baphomet death reaches its registered final real frame', async ({ page }) => {
  const key = 'monster-baphomet:death:s';
  const preview = page.getByTestId('animation-preview-state');

  await page.getByTestId(`play-${key}`).click();
  await expect(preview).toHaveAttribute('data-cycle-complete', 'true');
  expect(Number(await preview.getAttribute('data-frame-count'))).toBeGreaterThan(1);
  await expect(preview).toHaveAttribute('data-current-frame', /monster-baphomet:frame:\d+/);
  await expect(preview).toHaveAttribute(
    'data-current-frame',
    await preview.getAttribute('data-final-frame') ?? '',
  );
});

test('plays complete row-based goblin poses instead of atlas fragments', async ({ page }) => {
  const preview = page.getByTestId('animation-preview-state');
  for (const state of ['idle', 'attack', 'death'] as const) {
    const key = `monster-goblin:${state}:s`;
    await page.getByTestId(`play-${key}`).click();
    await expect(preview).toHaveAttribute('data-cycle-complete', 'true');
    await expect(preview).toHaveAttribute('data-current-frame', /monster-goblin:frame:[0-4]/);
  }
});

test('plays every registered combat effect to completion', async ({ page }) => {
  const preview = page.getByTestId('animation-preview-state');
  for (const effect of effects) {
    const key = `effect:${effect}`;
    await page.getByTestId(`play-${key}`).click();
    await expect(preview).toHaveAttribute('data-animation', key);
    await expect(preview).toHaveAttribute('data-cycle-complete', 'true');
  }
});
