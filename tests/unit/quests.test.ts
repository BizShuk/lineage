import { describe, expect, it } from 'vitest';

import type { ItemDefinition } from '../../src/core/inventory';
import {
  advanceQuest,
  canSellItem,
  chooseDialogue,
  claimReward,
  createQuestState,
  startQuest,
  type QuestCatalog,
} from '../../src/core/quests';
import { inventoryWith, item } from '../helpers/inventoryFixtures';

const QUESTS = {
  'knight-guide': {
    id: 'knight-guide',
    allowedClasses: ['knight'],
    prerequisiteQuestIds: [],
    objectives: [{ type: 'talk', npcId: 'knight-trainer', count: 1 }],
    rewards: {
      experience: 50,
      adena: 25,
      itemRewards: [{ itemId: 'healing-potion', quantity: 2 }],
      abilityIds: ['power-strike'],
    },
  },
} as const satisfies QuestCatalog;

describe('quest state reducer', () => {
  it('advances the black-knight event only after every required defeat', () => {
    const started = startQuest(createQuestState(), 'black-knight-assault');
    const partial = advanceQuest(started, {
      type: 'monster-defeated',
      monsterId: 'black-knight',
      count: 4,
    });

    expect(partial.active['black-knight-assault']?.stage).toBe('defeat-patrol');

    const complete = advanceQuest(partial, {
      type: 'monster-defeated',
      monsterId: 'black-knight',
      count: 1,
    });

    expect(complete.active['black-knight-assault']?.stage).toBe(
      'report-to-guard-captain',
    );
  });

  it('clamps progress and never regresses after duplicate signals', () => {
    const started = startQuest(createQuestState(), 'black-knight-assault');
    const reported = advanceQuest(
      advanceQuest(started, {
        type: 'monster-defeated',
        monsterId: 'black-knight',
        count: 9,
      }),
      { type: 'npc-talked', npcId: 'guard-captain' },
    );

    const duplicate = advanceQuest(reported, {
      type: 'monster-defeated',
      monsterId: 'black-knight',
      count: 5,
    });

    expect(reported.completed).toContain('black-knight-assault');
    expect(duplicate).toBe(reported);
  });

  it('returns the identical state for an unrelated signal', () => {
    const started = startQuest(createQuestState(), 'black-knight-assault');

    expect(
      advanceQuest(started, { type: 'area-entered', mapId: 'coast' }),
    ).toBe(started);
  });

  it('rejects a class guide for the wrong class without changing state', () => {
    const initial = createQuestState();

    expect(startQuest(initial, 'knight-guide', 'wizard', QUESTS)).toBe(initial);
    expect(startQuest(initial, 'knight-guide', 'knight', QUESTS)).not.toBe(initial);
  });
});

describe('dialogue, rewards, and item guards', () => {
  it('chooses a declared dialogue branch and rejects an unknown choice', () => {
    const node = {
      id: 'guard-greeting',
      text: '準備好回報了嗎？',
      choices: [
        { id: 'report', text: '回報戰況', nextNodeId: 'guard-thanks' },
        { id: 'leave', text: '稍後再說' },
      ],
    } as const;

    expect(chooseDialogue(node, 'report')).toEqual({
      ok: true,
      choice: node.choices[0],
      nextNodeId: 'guard-thanks',
    });
    expect(chooseDialogue(node, 'missing')).toEqual({
      ok: false,
      node,
      reason: 'unknown-choice',
    });
  });

  it('grants a completed reward once and makes a retry a no-op', () => {
    const started = startQuest(createQuestState(), 'knight-guide', 'knight', QUESTS);
    const completed = advanceQuest(
      started,
      { type: 'npc-talked', npcId: 'knight-trainer' },
      QUESTS,
    );
    const target = {
      inventory: inventoryWith([], { adena: 10 }),
      experience: 100,
      abilityIds: [] as readonly string[],
    };
    const items: Readonly<Record<string, ItemDefinition>> = {
      'healing-potion': item('healing-potion'),
    };

    const claimed = claimReward(completed, 'knight-guide', target, QUESTS, items);
    expect(claimed).toMatchObject({ ok: true, granted: true });
    if (!claimed.ok) throw new Error('expected reward claim to succeed');
    expect(claimed.target).toMatchObject({ experience: 150, abilityIds: ['power-strike'] });
    expect(claimed.target.inventory).toMatchObject({
      adena: 35,
      stacks: [{ itemId: 'healing-potion', quantity: 2 }],
    });

    const retried = claimReward(
      claimed.state,
      'knight-guide',
      claimed.target,
      QUESTS,
      items,
    );
    expect(retried).toEqual({
      ok: true,
      granted: false,
      state: claimed.state,
      target: claimed.target,
    });
  });

  it('never allows quest items to be sold', () => {
    expect(canSellItem(item('heavy-stone'))).toBe(false);
    expect(canSellItem(item('healing-potion'))).toBe(true);
  });
});
