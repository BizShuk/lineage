import { describe, expect, it } from 'vitest';

import type { CharacterClass } from '../../src/core/model';
import { endingIsUnlocked, PlaythroughDriver } from '../helpers/PlaythroughDriver';

const classes = ['prince', 'knight', 'elf', 'wizard'] as const satisfies readonly CharacterClass[];

describe('complete Talking Island playthrough', () => {
  for (const classId of classes) {
    it(`${classId} completes the campaign and continues exploring`, () => {
      const game = PlaythroughDriver.newGame(classId, 20260717);

      game.completeTraining();
      game.completeVillageRegistration();
      game.completeClassGuidance();
      game.completeFieldSupplies();
      game.completeBlackKnightAssault();
      game.completeDungeonSeal();
      game.defeatBaphomet();
      game.completeFinalReport();
      game.travelTo('north-field');

      expect(endingIsUnlocked(game)).toBe(true);
      expect(game.state.character.level).toBeGreaterThanOrEqual(12);
      expect(game.state.character.level).toBeLessThanOrEqual(15);
      expect(game.maxNormalKillsInOneStage()).toBeLessThanOrEqual(25);
      expect(game.state.world.player.mapId).toBe('north-field');
      if (classId === 'elf') expect(game.state.equipment.weapon).toBe('bow');
      if (classId === 'knight') {
        expect(game.state.equipment.shield).toBe('large-shield');
        expect(game.state.equipment.weapon).not.toBe('two-handed-sword');
      }
    });
  }
});
