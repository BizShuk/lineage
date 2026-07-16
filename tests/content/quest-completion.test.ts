import { describe, expect, it } from 'vitest';

import {
  advanceQuest,
  createQuestState,
  startQuest,
  type QuestCatalog,
  type QuestSignal,
} from '../../src/core/quests';

const SIDE_QUESTS = {
  'goblin-menace': sideQuest('goblin-menace', {
    type: 'monster-defeated',
    monsterId: 'goblin',
    count: 3,
  }),
  'lost-necklace': sideQuest('lost-necklace', {
    type: 'item-acquired',
    itemId: 'lost-necklace',
    count: 1,
  }),
  'coast-scouting': sideQuest('coast-scouting', {
    type: 'area-entered',
    mapId: 'coast',
  }),
  'healer-message': sideQuest('healer-message', {
    type: 'npc-talked',
    npcId: 'village-healer',
  }),
  'golem-fragment': sideQuest('golem-fragment', {
    type: 'item-acquired',
    itemId: 'golem-fragment',
    count: 2,
  }),
  'dungeon-guardian': sideQuest('dungeon-guardian', {
    type: 'boss-defeated',
    monsterId: 'baphomet',
  }),
} as const satisfies QuestCatalog;

function sideQuest(id: string, signal: QuestSignal) {
  const objective =
    signal.type === 'monster-defeated'
      ? { type: 'kill' as const, monsterId: signal.monsterId, count: signal.count }
      : signal.type === 'item-acquired'
        ? { type: 'collect' as const, itemId: signal.itemId, count: signal.count }
        : signal.type === 'area-entered'
          ? { type: 'reach' as const, mapId: signal.mapId, count: 1 as const }
          : signal.type === 'npc-talked'
            ? { type: 'talk' as const, npcId: signal.npcId, count: 1 as const }
            : { type: 'defeat' as const, monsterId: signal.monsterId, count: 1 as const };
  return {
    id,
    allowedClasses: ['prince', 'knight', 'elf', 'wizard'] as const,
    prerequisiteQuestIds: [],
    objectives: [objective],
    rewards: { experience: 10, adena: 5, itemRewards: [], abilityIds: [] },
  };
}

const COMPLETION_SIGNALS: Readonly<Record<string, QuestSignal>> = {
  'goblin-menace': { type: 'monster-defeated', monsterId: 'goblin', count: 3 },
  'lost-necklace': { type: 'item-acquired', itemId: 'lost-necklace', count: 1 },
  'coast-scouting': { type: 'area-entered', mapId: 'coast' },
  'healer-message': { type: 'npc-talked', npcId: 'village-healer' },
  'golem-fragment': { type: 'item-acquired', itemId: 'golem-fragment', count: 2 },
  'dungeon-guardian': { type: 'boss-defeated', monsterId: 'baphomet' },
};

describe('side quest completion fixtures', () => {
  it('provides a mechanical completion path for all six side quests', () => {
    for (const questId of Object.keys(SIDE_QUESTS)) {
      const signal = COMPLETION_SIGNALS[questId];
      if (signal === undefined) throw new Error(`missing completion signal for ${questId}`);

      const started = startQuest(createQuestState(), questId, 'elf', SIDE_QUESTS);
      const completed = advanceQuest(started, signal, SIDE_QUESTS);

      expect(completed.completed, questId).toContain(questId);
      expect(completed.active[questId], questId).toBeUndefined();
    }
  });
});
