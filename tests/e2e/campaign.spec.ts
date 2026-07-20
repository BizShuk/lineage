import { expect, test } from '@playwright/test';

import { CampaignDriver } from '../helpers/CampaignDriver';

test('exposes only a read-only campaign snapshot after real character creation', async ({ page }) => {
  await page.goto('/?e2e=campaign&seed=20260717');
  await page.getByRole('button', { name: '開始新遊戲' }).click();
  await page.getByLabel('角色名稱').fill('遠征騎士');
  await page.getByRole('radio', { name: '騎士' }).check();
  await page.getByRole('button', { name: '建立角色' }).click();

  await expect(page.getByTestId('game-root')).toHaveAttribute('data-scene', 'world');
  await page.waitForFunction(() => '__lineageCampaignE2E' in window);

  const probe = await page.evaluate(() => {
    const campaign = (
      window as Window & {
        readonly __lineageCampaignE2E?: {
          readonly mode: string;
          readonly seed: number;
          readonly snapshot: () => { readonly character: { readonly classId: string } };
        };
      }
    ).__lineageCampaignE2E;

    if (campaign === undefined) return null;
    return {
      keys: Object.keys(campaign).sort(),
      frozen: Object.isFrozen(campaign),
      mode: campaign.mode,
      seed: campaign.seed,
      classId: campaign.snapshot().character.classId,
    };
  });

  expect(probe).toEqual({
    keys: ['mode', 'seed', 'snapshot'],
    frozen: true,
    mode: 'campaign',
    seed: 20260717,
    classId: 'knight',
  });
  await expect(page.getByTestId('world-state')).toHaveCount(0);
});

test('drives a knight through the seven-stage production campaign and restores the save', async ({
  page,
}) => {
  // The complete 3–5 hour simulated campaign uses only production UI input and
  // performs real projected movement across all seven maps.
  test.setTimeout(300_000);
  const campaign = new CampaignDriver(page);

  await campaign.startKnight();
  await campaign.equipStartingGear();
  await campaign.completeTraining();
  await campaign.completeVillageRegistration();
  await campaign.exerciseCommerce();
  await campaign.completeKnightGuidance();
  await campaign.completeFieldSupplies();
  await campaign.completeBlackKnightAssault();
  await campaign.completeDungeonSeal();
  await campaign.completeEnding();

  const completed = await campaign.snapshot();
  expect(completed.quests.claimedRewards).toEqual(
    expect.arrayContaining([
      'scarecrow-training',
      'village-registration',
      'knight-guidance',
      'field-supplies',
      'black-knight-assault',
      'dungeon-seal',
      'baphomet-ending',
    ]),
  );
  expect(completed.character.level).toBeGreaterThanOrEqual(12);
  expect(completed.character.level).toBeLessThanOrEqual(15);
  expect(completed.equipment).toMatchObject({ weapon: 'long-sword', shield: 'large-shield' });
  expect(completed.world.defeatedBosses).toContain('baphomet');
  expect(completed.world.flags).toMatchObject({
    baphometDefeated: true,
    finalReportComplete: true,
  });
  expect(completed.endingComplete).toBe(true);

  const exploring = await campaign.saveReloadAndFreeExplore();
  expect(exploring.player).toEqual({ mapId: 'north-field', x: 90, y: 45 });
  expect(exploring.endingComplete).toBe(true);
});
