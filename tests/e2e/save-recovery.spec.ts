import { expect, test, type Page } from '@playwright/test';

const createCharacter = async (page: Page, name: string): Promise<void> => {
  await page.goto('/?e2e=1');
  await expect(page.getByTestId('save-panel')).toBeVisible();
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill(name);
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
};

const moveOneStep = async (page: Page): Promise<string> => {
  const player = page.getByTestId('player-state');
  const before = await player.getAttribute('data-x');
  await page.getByTestId('ground-target').click();
  await page.getByTestId('simulation-step').click();
  await expect(player).not.toHaveAttribute('data-x', before ?? '');
  return (await player.getAttribute('data-x')) ?? '';
};

const returnToMenu = async (page: Page): Promise<void> => {
  await page.getByTestId('return-menu').click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'menu');
  await expect(page.getByTestId('save-panel')).toBeVisible();
};

test('exports a real save, changes progress, then imports and reloads the exported snapshot', async ({
  page,
}) => {
  await createCharacter(page, '匯出復原騎士');
  const exportedX = await moveOneStep(page);
  await page.getByTestId('manual-save').click();
  await expect(page.getByTestId('autosave-status')).toHaveText('已儲存目前進度。');
  await returnToMenu(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-export-1').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('talking-island-slot-1.json');
  const exportPath = await download.path();

  await page.getByTestId('save-load-1').click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
  const changedX = await moveOneStep(page);
  expect(changedX).not.toBe(exportedX);
  await page.getByTestId('manual-save').click();
  await returnToMenu(page);

  await page.getByTestId('save-import-file-1').setInputFiles(exportPath);
  await expect(page.getByTestId('save-import-preview-1')).toContainText('匯出復原騎士');
  await page.getByTestId('save-import-confirm-1').click();
  await page.getByTestId('save-load-1').click();
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', exportedX);

  await page.reload();
  await expect(page.getByTestId('save-panel')).toContainText('匯出復原騎士');
  await page.getByTestId('save-load-1').click();
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', exportedX);
});

test('rejects bad JSON without changing the slot and restores the previous backup', async ({
  page,
}) => {
  await createCharacter(page, '備份復原騎士');
  const initialX = await page.getByTestId('player-state').getAttribute('data-x');
  await moveOneStep(page);
  await returnToMenu(page);

  await expect(page.getByTestId('save-backup-1')).toContainText('目前');
  await expect(page.getByTestId('save-backup-1')).not.toContainText('備份 無');
  const summaryBefore = await page.getByTestId('save-slot-1').textContent();
  await page.getByTestId('save-import-file-1').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not-json'),
  });
  await expect(page.getByTestId('save-status')).toHaveText('匯入檔案不是有效的 JSON。');
  await expect(page.getByTestId('save-slot-1')).toHaveText(summaryBefore ?? '');

  await page.reload();
  await expect(page.getByTestId('save-slot-1')).toContainText('備份復原騎士');
  await page.getByTestId('save-restore-1').click();
  await page.getByTestId('save-load-1').click();
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', initialX ?? '');
});

test('requires the exact character name before deleting the current save and backup', async ({
  page,
}) => {
  await createCharacter(page, '刪除確認騎士');
  await returnToMenu(page);

  await page.getByTestId('save-delete-name-1').fill('刪除確認騎士 ');
  await page.getByTestId('save-delete-1').click();
  await expect(page.getByTestId('save-status')).toContainText('請輸入完整角色名稱');
  await expect(page.getByTestId('save-slot-1')).toContainText('刪除確認騎士');

  await page.getByTestId('save-delete-name-1').fill('刪除確認騎士');
  await page.getByTestId('save-delete-1').click();
  await expect(page.getByTestId('save-slot-1')).toContainText('空存檔欄');
  await expect(page.getByTestId('save-restore-1')).toBeDisabled();
});

test('captures a renderer exception, autosaves, and presents all recovery actions', async ({
  page,
}) => {
  await createCharacter(page, '錯誤復原騎士');
  const savedX = await moveOneStep(page);

  await page.getByTestId('trigger-renderer-error').click();

  const recovery = page.getByTestId('runtime-recovery');
  await expect(recovery).toContainText('遊戲發生錯誤');
  await expect(recovery).toContainText('返回主選單');
  await expect(recovery).toContainText('載入最近存檔');
  const diagnosticPromise = page.waitForEvent('download');
  await page.getByTestId('recovery-export-diagnostic').click();
  const diagnostic = await diagnosticPromise;
  expect(diagnostic.suggestedFilename()).toMatch(/^talking-island-diagnostic-/);

  await page.getByTestId('recovery-load-latest').click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-x', savedX);
});
