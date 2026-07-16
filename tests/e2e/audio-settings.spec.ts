import { expect, test, type Page } from '@playwright/test';

interface AudioCommand {
  readonly type: string;
  readonly channel?: string;
  readonly to?: string;
  readonly sound?: string;
  readonly value?: number;
}

interface AudioDebug {
  readonly commands: readonly AudioCommand[];
  hidden: boolean | null;
  readonly activeSettings: {
    readonly music: number;
    readonly ambient: number;
    readonly effects: number;
    readonly muted: boolean;
    readonly scale: number;
  } | null;
  readonly routeRegion: ((region: string) => void) | null;
}

type AudioDebugWindow = Window & { readonly __lineageAudioE2E?: AudioDebug };

const commands = async (page: Page): Promise<readonly AudioCommand[]> =>
  page.evaluate(() =>
    [...((window as AudioDebugWindow).__lineageAudioE2E?.commands ?? [])],
  );

const enterWorld = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/?e2e=1&audio=recording${query}`);
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('音訊測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
};

test('resumes on the first gesture and routes region loops without duplicates', async ({
  page,
}) => {
  await page.goto('/?e2e=1&audio=recording');
  await expect(page.getByRole('button', { name: '開始新遊戲' })).toBeVisible();

  expect((await commands(page)).filter(({ type }) => type === 'resume')).toHaveLength(0);
  expect(
    (await commands(page)).filter(
      ({ type, to }) => type === 'crossfade' && to === 'title-theme',
    ),
  ).toHaveLength(1);

  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('音訊測試');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');

  await page.locator('canvas').dispatchEvent('pointerdown');
  await page.evaluate(() => {
    const debug = (window as AudioDebugWindow).__lineageAudioE2E;
    debug?.routeRegion?.('north-field');
    debug?.routeRegion?.('north-field');
    debug?.routeRegion?.('scarecrow-field');
    debug?.routeRegion?.('coast');
  });

  const recorded = await commands(page);
  expect(recorded.filter(({ type }) => type === 'resume')).toHaveLength(1);
  expect(
    recorded.filter(
      ({ type, to }) => type === 'crossfade' && to === 'surface-theme',
    ),
  ).toHaveLength(1);
  expect(
    recorded.filter(
      ({ type, sound }) => type === 'start-ambient' && sound === 'forest-insects',
    ),
  ).toHaveLength(1);
  expect(
    recorded.filter(
      ({ type, sound }) => type === 'start-ambient' && sound === 'coast-wind',
    ),
  ).toHaveLength(1);
});

test('applies audio settings live, stores them, and follows page visibility', async ({
  page,
}) => {
  await enterWorld(page);
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-music').fill('0.2');
  await page.getByTestId('settings-ambient').fill('0.3');
  await page.getByTestId('settings-effects').fill('0.4');

  const liveCommands = await commands(page);
  expect(liveCommands).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'set-gain', channel: 'music', value: 0.2 }),
      expect.objectContaining({ type: 'set-gain', channel: 'ambient', value: 0.3 }),
      expect.objectContaining({ type: 'set-gain', channel: 'effects', value: 0.4 }),
    ]),
  );

  await page.getByTestId('settings-muted').check();
  await page.getByTestId('settings-scale').selectOption('3');
  await page.getByTestId('settings-save').click();
  expect(
    await page.evaluate(
      () => (window as AudioDebugWindow).__lineageAudioE2E?.activeSettings,
    ),
  ).toEqual({ music: 0.2, ambient: 0.3, effects: 0.4, muted: true, scale: 3 });

  const mutedCommands = await commands(page);
  for (const channel of ['music', 'ambient', 'effects']) {
    expect(
      mutedCommands.some(
        (command) =>
          command.type === 'set-gain' && command.channel === channel && command.value === 0,
      ),
    ).toBe(true);
  }

  await page.evaluate(() => {
    const debug = (window as AudioDebugWindow).__lineageAudioE2E;
    if (debug !== undefined) debug.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    const debug = (window as AudioDebugWindow).__lineageAudioE2E;
    if (debug !== undefined) debug.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const lifecycleCommands = await commands(page);
  expect(lifecycleCommands.filter(({ type }) => type === 'suspend')).toHaveLength(1);
  expect(lifecycleCommands.filter(({ type }) => type === 'resume')).toHaveLength(2);
});

test('continues the game with a nonblocking message when audio cannot start', async ({
  page,
}) => {
  await enterWorld(page, '&audioFailure=resume');

  await expect(page.getByTestId('audio-status')).toHaveText(
    '音訊無法啟用，遊戲將以靜音模式繼續。',
  );
  await expect(page.getByTestId('world-state')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('hud-root')).toBeVisible();
});
