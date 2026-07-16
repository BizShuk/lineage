import { calculateSaveChecksum } from '../../src/storage/checksum';
import type { SaveGameV1, SaveSlot } from '../../src/storage/saveSchema';

interface SaveFixtureOverrides {
  readonly slot?: SaveSlot;
  readonly level?: number;
  readonly baphometDefeated?: boolean;
  readonly finalReportComplete?: boolean;
  readonly updatedAt?: string;
}

export function completeSave(overrides: SaveFixtureOverrides = {}): SaveGameV1 {
  const save: SaveGameV1 = {
    schemaVersion: 1,
    gameVersion: '0.1.0',
    slot: overrides.slot ?? 1,
    updatedAt: overrides.updatedAt ?? '2026-07-17T00:00:00.000Z',
    checksum: '',
    character: {
      id: 'hero-1',
      name: '測試騎士',
      classId: 'knight',
      level: overrides.level ?? 8,
      experience: 12_500,
      attributes: { str: 16, dex: 12, con: 16, int: 8, wis: 9, cha: 10 },
      hp: 120,
      mp: 24,
      alignment: 100,
      carriedWeight: 34,
      equipmentAC: -5,
    },
    inventory: {
      stacks: [
        { itemId: 'healing-potion', quantity: 5 },
        { itemId: 'escape-scroll', quantity: 1 },
      ],
      adena: 2_400,
      carriedWeight: 34,
      weightLimit: 640,
    },
    equipment: { weapon: 'iron-sword', armor: 'leather-armor' },
    quests: {
      active: {
        'main-story': { stage: 'investigate-dungeon', counters: { goblins: 3 } },
      },
      completed: ['training'],
      claimedRewards: ['training'],
    },
    world: {
      player: { mapId: 'talking-island-village', x: 12, y: 9 },
      defeatedBosses: overrides.baphometDefeated ? ['baphomet'] : [],
      flags: {
        baphometDefeated: overrides.baphometDefeated ?? false,
        blackKnightEventComplete: true,
        finalReportComplete: overrides.finalReportComplete ?? false,
      },
      worldTimeMs: 86_400_000,
    },
    quickSlots: ['healing-potion', null, 'escape-scroll', null, null, null, null, null],
    settings: { music: 0.7, ambient: 0.5, effects: 0.8, muted: false, scale: 2 },
  };

  return { ...save, checksum: calculateSaveChecksum(save) };
}
