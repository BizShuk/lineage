import { describe, expect, it } from 'vitest';

import {
  advanceQuest,
  createQuestState,
  isEndingUnlocked,
  startQuest,
} from '../../src/core/quests';

describe('black-knight event and ending', () => {
  it('requires five black knights before accepting the guard report', () => {
    const started = startQuest(createQuestState(), 'black-knight-assault');
    const fourDefeated = advanceQuest(started, {
      type: 'monster-defeated',
      monsterId: 'black-knight',
      count: 4,
    });
    const earlyReport = advanceQuest(fourDefeated, {
      type: 'npc-talked',
      npcId: 'guard-captain',
    });

    expect(earlyReport).toBe(fourDefeated);

    const fiveDefeated = advanceQuest(earlyReport, {
      type: 'monster-defeated',
      monsterId: 'black-knight',
      count: 1,
    });
    const reported = advanceQuest(fiveDefeated, {
      type: 'npc-talked',
      npcId: 'guard-captain',
    });

    expect(reported.completed).toContain('black-knight-assault');
  });

  it('unlocks the ending only after Baphomet and the village report', () => {
    expect(
      isEndingUnlocked({ baphometDefeated: true, finalReportComplete: false }),
    ).toBe(false);
    expect(
      isEndingUnlocked({ baphometDefeated: false, finalReportComplete: true }),
    ).toBe(false);
    expect(
      isEndingUnlocked({ baphometDefeated: true, finalReportComplete: true }),
    ).toBe(true);
  });
});
