import { describe, expect, it } from 'vitest';

import { ProductionCampaignDriver } from '../helpers/ProductionCampaignDriver';

describe('production GameSession campaign', () => {
  it('takes a knight through the full campaign and back into free exploration', () => {
    const game = ProductionCampaignDriver.newKnight(20260717);

    game.completeCampaign();

    expect(game.snapshot.endingComplete).toBe(true);
    expect(game.snapshot.world.flags.baphometDefeated).toBe(true);
    expect(game.snapshot.world.flags.finalReportComplete).toBe(true);
    expect(game.snapshot.character.level).toBeGreaterThanOrEqual(12);
    expect(game.snapshot.character.level).toBeLessThanOrEqual(15);
    expect(game.snapshot.player.mapId).toBe('north-field');
    expect(game.snapshot.equipment).toMatchObject({ weapon: 'long-sword', shield: 'large-shield' });
    expect(game.audit).toEqual(
      expect.objectContaining(new Set(['equip', 'buy', 'sell', 'loot', 'use-potion', 'free-explore'])),
    );
  });
});
