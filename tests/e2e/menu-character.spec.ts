import { expect, test } from '@playwright/test';

const classes = [
  ['王族', 'prince'],
  ['騎士', 'knight'],
  ['妖精', 'elf'],
  ['法師', 'wizard'],
] as const;

for (const [label, classId] of classes) {
  test(`creates ${label} in a separate browser context`, async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.getByRole('button', { name: '開始新遊戲' }).click();
    await page.getByLabel('角色名稱').fill(`測試${label}`);
    await page.getByRole('radio', { name: label }).check();

    await expect(page.getByTestId('attribute-preview')).toContainText('力量');
    await page.getByRole('button', { name: '建立角色' }).click();

    await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'world');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('width', '640');
    await expect(canvas).toHaveAttribute('height', '480');

    const stored = await page.evaluate(async () => {
      const request = indexedDB.open('talking-island-saves', 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('無法開啟測試存檔資料庫'));
        };
      });
      const transaction = database.transaction('saves', 'readonly');
      const saveRequest = transaction.objectStore('saves').get(1);
      const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
        saveRequest.onsuccess = () => {
          resolve(saveRequest.result as Record<string, unknown>);
        };
        saveRequest.onerror = () => {
          reject(saveRequest.error ?? new Error('無法讀取測試存檔'));
        };
      });
      database.close();
      return save;
    });

    expect(stored).toMatchObject({
      schemaVersion: 1,
      gameVersion: '0.1.0',
      slot: 1,
      character: { name: `測試${label}`, classId },
      world: { player: { mapId: 'talking-island-village' } },
    });
    expect(stored.checksum).toEqual(expect.any(String));
  });
}

test('rejects names outside 2–12 visible characters', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();

  await page.getByLabel('角色名稱').fill('測');
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByRole('alert')).toHaveText('角色名稱必須包含 2–12 個可見字元');
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'character-create');

  await page.getByLabel('角色名稱').fill('一二三四五六七八九十一二三');
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByRole('alert')).toHaveText('角色名稱必須包含 2–12 個可見字元');
});

test('counts joined Unicode graphemes as visible characters', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('👨‍👩‍👧‍👦👩‍👩‍👦‍👦');
  await page.getByRole('button', { name: '建立角色' }).click();

  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'world');
});

test('rejects a duplicate character name in another save slot', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('同名勇者');
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'world');

  await page.reload();
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('同名勇者');
  await page.getByRole('button', { name: '建立角色' }).click();

  await expect(page.getByRole('alert')).toHaveText('角色名稱已存在於其他存檔欄');
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'character-create');
});

test('shows a Traditional Chinese boot error and creates no save when content is invalid', async ({
  page,
}) => {
  await page.goto('/?e2e=1&contentError=1');

  await expect(page.getByRole('alert')).toContainText('遊戲內容驗證失敗');
  await expect(page.getByRole('button', { name: '開始新遊戲' })).toHaveCount(0);
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'menu-error');

  const hasSavedData = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const metadata = databases.find(({ name }) => name === 'talking-island-saves');
    if (metadata === undefined) return false;

    const request = indexedDB.open('talking-island-saves', 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('無法開啟測試存檔資料庫'));
      };
    });
    if (!database.objectStoreNames.contains('saves')) {
      database.close();
      return false;
    }
    const transaction = database.transaction('saves', 'readonly');
    const countRequest = transaction.objectStore('saves').count();
    const count = await new Promise<number>((resolve, reject) => {
      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };
      countRequest.onerror = () => {
        reject(countRequest.error ?? new Error('無法計算測試存檔數量'));
      };
    });
    database.close();
    return count > 0;
  });
  expect(hasSavedData).toBe(false);
});
