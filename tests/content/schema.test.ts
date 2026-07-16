import { describe, expect, it } from 'vitest';

import { loadContent } from '../../src/content/loadContent';
import { ContentLoadError } from '../../src/content/schema';

const validRawContent = () => ({
  classes: [
    {
      id: 'prince',
      name: '王族',
      description: '以領導力與近戰為主的王室後裔。',
      sourceTier: 'S',
      sourceNotes: '單機版將多人領導能力改為自我強化。',
      spriteKey: 'class-prince',
      baseAttributes: { str: 13, dex: 10, con: 10, int: 10, wis: 11, cha: 13 },
      startingHP: 30,
      startingMP: 8,
      startingItemIds: ['training-sword'],
      abilityIds: ['royal-rally'],
    },
  ],
  items: [
    {
      id: 'training-sword',
      name: '練習用短劍',
      description: '訓練時使用的短劍。',
      kind: 'weapon',
      sourceTier: 'S',
      sourceNotes: '教學流程專用。',
      assetKey: 'item-training-sword',
      weight: 20,
      stackLimit: 1,
      buyPrice: 20,
      sellPrice: 10,
      allowedClasses: ['prince'],
      equipmentSlot: 'weapon',
      damageSmall: 4,
      damageLarge: 3,
    },
  ],
  abilities: [
    {
      id: 'royal-rally',
      name: '王族鼓舞',
      description: '短時間提高自己的命中。',
      kind: 'buff',
      sourceTier: 'S',
      sourceNotes: '由早期血盟領導定位改寫成單機能力。',
      assetKey: 'ability-royal-rally',
      allowedClasses: ['prince'],
      unlockLevel: 1,
      manaCost: 4,
      hpCost: 0,
      cooldownMs: 12_000,
      target: 'self',
      power: 2,
    },
  ],
  monsters: [
    {
      id: 'goblin',
      name: '哥布林',
      description: '村外常見的弱小敵人。',
      rank: 'normal',
      sourceTier: 'A',
      sourceNotes: '官方說話之島野外怪物。',
      spriteKey: 'monster-goblin',
      level: 2,
      hp: 12,
      mp: 0,
      ac: 10,
      attack: 3,
      experience: 8,
      abilityIds: [],
      drops: [{ itemId: 'training-sword', chance: 0.01, min: 1, max: 1 }],
    },
  ],
  npcs: [
    {
      id: 'village-guide',
      name: '村莊嚮導',
      description: '向新來的冒險者介紹村莊。',
      role: 'guide',
      sourceTier: 'S',
      sourceNotes: '單機教學用角色。',
      spriteKey: 'npc-village-guide',
      mapId: 'talking-island-village',
      x: 2,
      y: 2,
      shopItemIds: [],
      questIds: ['arrival'],
      taughtAbilityIds: [],
    },
  ],
  quests: [
    {
      id: 'arrival',
      name: '初到說話之島',
      description: '向村莊嚮導報到。',
      kind: 'main',
      sourceTier: 'S',
      sourceNotes: '以歷史場景重新編排的單機主線。',
      giverNpcId: 'village-guide',
      allowedClasses: ['prince'],
      prerequisiteQuestIds: [],
      objectives: [{ type: 'talk', npcId: 'village-guide', count: 1 }],
      rewards: { experience: 10, adena: 5, itemRewards: [], abilityIds: [] },
    },
  ],
  maps: [
    {
      id: 'talking-island-village',
      name: '說話之島村',
      description: '冒險者整備與休息的安全據點。',
      sourceTier: 'A',
      sourceNotes: '官方資料確認村莊與港口。',
      assetKey: 'map-talking-island-village',
      width: 10,
      height: 10,
      safeZone: true,
      entry: { x: 1, y: 1 },
      npcIds: ['village-guide'],
      exits: [],
      spawns: [{ monsterId: 'goblin', x: 8, y: 8, count: 1, respawnSeconds: 30 }],
    },
  ],
});

describe('loadContent schema validation', () => {
  it('parses strict content and exposes frozen lookup results', () => {
    const content = loadContent(validRawContent());

    expect(content.item('training-sword').name).toBe('練習用短劍');
    expect(content.map('talking-island-village').safeZone).toBe(true);
    expect(Object.isFrozen(content.items)).toBe(true);
    expect(Object.isFrozen(content.item('training-sword'))).toBe(true);
  });

  it('rejects malformed IDs and unknown fields', () => {
    const raw = validRawContent();
    raw.items[0] = { ...raw.items[0], id: 'Bad_ID', legacyClaim: true } as never;

    expect(() => loadContent(raw)).toThrow(ContentLoadError);
    expect(() => loadContent(raw)).toThrow(/items.*Bad_ID|items.*格式|legacyClaim/u);
  });

  it('collects duplicate and cross-reference errors in one failure', () => {
    const raw = validRawContent();
    const mutable = raw as unknown as {
      items: Array<Record<string, unknown>>;
      npcs: Array<{ shopItemIds: string[] }>;
      maps: Array<{
        exits: Array<{
          x: number;
          y: number;
          targetMapId: string;
          targetX: number;
          targetY: number;
        }>;
      }>;
    };
    mutable.items.push({ ...mutable.items[0] });
    mutable.npcs[0]?.shopItemIds.push('missing-item');
    mutable.maps[0]?.exits.push({
      x: 1,
      y: 1,
      targetMapId: 'missing-map',
      targetX: 0,
      targetY: 0,
    });

    try {
      loadContent(raw);
      throw new Error('預期內容載入失敗');
    } catch (error) {
      expect(error).toBeInstanceOf(ContentLoadError);
      const issues = (error as ContentLoadError).issues.join('\n');
      expect(issues).toContain('重複 ID');
      expect(issues).toContain('missing-item');
      expect(issues).toContain('missing-map');
    }
  });
});
