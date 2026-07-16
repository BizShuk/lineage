import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';
import { createQuestState, type QuestState } from '../../src/core/quests';
import { createCharacter, deriveStats } from '../../src/core/stats';
import { GameSession } from '../../src/game/systems/GameSession';
import {
  sealSaveV1,
  validateSaveV1,
  type SaveGameV1,
} from '../../src/storage/saveSchema';
import { monsterAt } from '../helpers/worldFixtures';

const content = loadBundledContent();

type SaveOverrides = {
  readonly classId?: SaveGameV1['character']['classId'];
  readonly level?: number;
  readonly hp?: number;
  readonly mp?: number;
  readonly mapId?: string;
  readonly x?: number;
  readonly y?: number;
  readonly stacks?: SaveGameV1['inventory']['stacks'];
  readonly adena?: number;
  readonly equipment?: SaveGameV1['equipment'];
  readonly quests?: QuestState;
  readonly defeatedBosses?: readonly string[];
  readonly flags?: Readonly<Record<string, boolean>>;
  readonly quickSlots?: SaveGameV1['quickSlots'];
  readonly settings?: SaveGameV1['settings'];
};

const inventoryWeight = (stacks: SaveGameV1['inventory']['stacks']): number =>
  stacks.reduce(
    (total, stack) => total + content.item(stack.itemId).weight * stack.quantity,
    0,
  );

const sessionSave = (overrides: SaveOverrides = {}): SaveGameV1 => {
  const classId = overrides.classId ?? 'knight';
  const base = createCharacter(`測試-${classId}`, classId);
  const leveled = { ...base, level: overrides.level ?? base.level };
  const leveledStats = deriveStats(leveled);
  const stacks = overrides.stacks ?? [];
  const carriedWeight = inventoryWeight(stacks);
  const character = {
    ...leveled,
    hp: overrides.hp ?? leveledStats.maxHP,
    mp: overrides.mp ?? leveledStats.maxMP,
    carriedWeight,
  };

  return sealSaveV1({
    schemaVersion: 1,
    gameVersion: '0.1.0',
    slot: 1,
    updatedAt: '2026-07-17T00:00:00.000Z',
    checksum: '',
    character,
    inventory: {
      stacks,
      adena: overrides.adena ?? 0,
      carriedWeight,
      weightLimit: deriveStats(character).weightLimit,
    },
    equipment: overrides.equipment ?? {},
    quests: overrides.quests ?? createQuestState(),
    world: {
      player: {
        mapId: overrides.mapId ?? 'talking-island-village',
        x: overrides.x ?? 32,
        y: overrides.y ?? 18,
      },
      defeatedBosses: overrides.defeatedBosses ?? [],
      flags: overrides.flags ?? {},
      worldTimeMs: 0,
    },
    quickSlots: overrides.quickSlots ?? [null, null, null, null, null, null, null, null],
    settings: overrides.settings ?? {
      music: 0.7,
      ambient: 0.5,
      effects: 0.8,
      muted: false,
      scale: 2,
    },
  });
};

const claimedQuestState = (questId: string): QuestState => ({
  ...createQuestState(),
  completed: [questId],
  claimedRewards: [questId],
});

describe('GameSession player actions', () => {
  it('rejects NPC interaction from another map or beyond one tile without changing quests', () => {
    const session = new GameSession({ content, save: sessionSave() });
    const before = session.snapshot.quests;

    expect(session.perform({ type: 'interact', targetId: 'gunther' })).toMatchObject({
      ok: false,
      reason: 'npc-out-of-range',
    });
    expect(session.perform({ type: 'interact', targetId: 'pandora' })).toMatchObject({
      ok: false,
      reason: 'npc-out-of-range',
    });
    expect(session.snapshot.quests).toEqual(before);
  });

  it('accepts only a nearby quest offered by its giver and enforces prerequisites', () => {
    const training = new GameSession({
      content,
      save: sessionSave({ mapId: 'scarecrow-field', x: 47, y: 12 }),
    });

    expect(
      training.perform({
        type: 'accept-quest',
        npcId: 'scarecrow-instructor',
        questId: 'scarecrow-training',
      }),
    ).toMatchObject({ ok: true });
    expect(training.snapshot.quests.active).toHaveProperty('scarecrow-training');
    expect(training.drainPersistenceEvents()).toContain('quest-stage');

    const blocked = new GameSession({
      content,
      save: sessionSave({ x: 31, y: 18 }),
    });
    expect(
      blocked.perform({
        type: 'accept-quest',
        npcId: 'village-elder-jered',
        questId: 'village-registration',
      }),
    ).toMatchObject({ ok: false, reason: 'quest-unavailable' });
    expect(
      blocked.perform({
        type: 'accept-quest',
        npcId: 'village-elder-jered',
        questId: 'knight-guidance',
      }),
    ).toMatchObject({ ok: false, reason: 'quest-not-offered' });
  });

  it('buys only stock sold by the nearby NPC and preserves state when rejected', () => {
    const session = new GameSession({
      content,
      save: sessionSave({ x: 41, y: 32, adena: 500 }),
    });

    expect(
      session.perform({ type: 'buy', npcId: 'pandora', itemId: 'bow', quantity: 1 }),
    ).toMatchObject({ ok: false, reason: 'item-not-sold' });
    expect(session.snapshot.inventory).toMatchObject({ adena: 500, stacks: [] });

    expect(
      session.perform({ type: 'buy', npcId: 'pandora', itemId: 'red-potion', quantity: 2 }),
    ).toMatchObject({ ok: true });
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'red-potion',
      quantity: 2,
    });
    expect(session.snapshot.inventory.adena).toBe(
      500 - content.item('red-potion').buyPrice * 2,
    );
  });

  it('sells ordinary inventory only to a nearby merchant and rejects quest items', () => {
    const merchant = new GameSession({
      content,
      save: sessionSave({
        x: 41,
        y: 32,
        stacks: [
          { itemId: 'red-potion', quantity: 2 },
          { itemId: 'animal-hide', quantity: 1 },
        ],
      }),
    });
    expect(
      merchant.perform({ type: 'sell', npcId: 'pandora', itemId: 'red-potion', quantity: 1 }),
    ).toMatchObject({ ok: true });
    expect(merchant.snapshot.inventory.adena).toBe(content.item('red-potion').sellPrice);
    expect(
      merchant.perform({ type: 'sell', npcId: 'pandora', itemId: 'animal-hide', quantity: 1 }),
    ).toMatchObject({ ok: false, reason: 'quest-item' });

    const warehouse = new GameSession({
      content,
      save: sessionSave({
        x: 31,
        y: 38,
        stacks: [{ itemId: 'red-potion', quantity: 1 }],
      }),
    });
    expect(
      warehouse.perform({ type: 'sell', npcId: 'dorin', itemId: 'red-potion', quantity: 1 }),
    ).toMatchObject({ ok: false, reason: 'not-a-merchant' });
  });

  it('replaces equipped items through inventory rules and recalculates equipment AC', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        stacks: [{ itemId: 'plate-mail', quantity: 1 }],
        equipment: { armor: 'leather-jacket' },
      }),
    });

    expect(session.perform({ type: 'equip', itemId: 'plate-mail' })).toMatchObject({
      ok: true,
    });
    expect(session.snapshot.equipment).toEqual({ armor: 'plate-mail' });
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'leather-jacket',
      quantity: 1,
    });
    expect(session.snapshot.character.equipmentAC).toBe(
      content.item('plate-mail').acModifier,
    );
  });

  it('equips a weapon without corrupting numeric equipment AC', () => {
    const session = new GameSession({
      content,
      save: sessionSave({ stacks: [{ itemId: 'long-sword', quantity: 1 }] }),
    });

    expect(session.perform({ type: 'equip', itemId: 'long-sword' })).toMatchObject({
      ok: true,
    });
    expect(session.snapshot.equipment.weapon).toBe('long-sword');
    expect(session.snapshot.character.equipmentAC).toBe(0);
  });

  it('uses HP and MP consumables for an allowed class and consumes exactly one item', () => {
    const wizard = createCharacter('測試-wizard', 'wizard');
    const session = new GameSession({
      content,
      save: sessionSave({
        classId: 'wizard',
        hp: wizard.hp - 5,
        mp: wizard.mp - 5,
        stacks: [
          { itemId: 'red-potion', quantity: 2 },
          { itemId: 'blue-potion', quantity: 2 },
        ],
      }),
    });

    expect(session.perform({ type: 'use', itemId: 'red-potion' })).toMatchObject({
      ok: true,
    });
    expect(session.snapshot.character.hp).toBe(wizard.hp);
    expect(session.perform({ type: 'use', itemId: 'blue-potion' })).toMatchObject({
      ok: true,
    });
    expect(session.snapshot.character.mp).toBe(wizard.mp);
    expect(session.snapshot.inventory.stacks).toEqual([
      { itemId: 'red-potion', quantity: 1 },
      { itemId: 'blue-potion', quantity: 1 },
    ]);
  });

  it('casts through authoritative combat, consumes MP and one reagent, then enforces cooldown', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        classId: 'elf',
        mapId: 'north-field',
        x: 2,
        y: 2,
        stacks: [{ itemId: 'wooden-arrow', quantity: 2 }],
        equipment: { weapon: 'bow' },
        quests: claimedQuestState('elf-guidance'),
      }),
      monsters: [
        monsterAt(
          { x: 3, y: 2 },
          { id: 'rapid-shot-target', mapId: 'north-field', hp: 30, maxHP: 30, alertRadius: 0 },
        ),
      ],
      seed: 7,
    });
    const startingMP = session.snapshot.character.mp;

    expect(
      session.perform({
        type: 'cast',
        abilityId: 'rapid-shot',
        targetId: 'rapid-shot-target',
      }),
    ).toMatchObject({
      ok: true,
      events: [expect.objectContaining({ type: 'damage', targetId: 'rapid-shot-target' })],
    });
    expect(session.snapshot.character.mp).toBe(startingMP - 1);
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'wooden-arrow',
      quantity: 1,
    });
    expect(session.snapshot.monsters[0]?.hp).toBe(16);
    expect(session.drainEvents()).toContainEqual(
      expect.objectContaining({ type: 'damage', targetId: 'rapid-shot-target' }),
    );
    expect(session.drainEvents()).toEqual([]);

    expect(
      session.perform({
        type: 'cast',
        abilityId: 'rapid-shot',
        targetId: 'rapid-shot-target',
      }),
    ).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'wooden-arrow',
      quantity: 1,
    });
  });

  it('requires a bow and ammunition for an arrow ability', () => {
    const withoutBow = new GameSession({
      content,
      save: sessionSave({
        classId: 'elf',
        mapId: 'north-field',
        x: 2,
        y: 2,
        stacks: [{ itemId: 'wooden-arrow', quantity: 1 }],
        quests: claimedQuestState('elf-guidance'),
      }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'equipment-target', alertRadius: 0 })],
    });
    expect(
      withoutBow.perform({
        type: 'cast',
        abilityId: 'rapid-shot',
        targetId: 'equipment-target',
      }),
    ).toMatchObject({ ok: false, reason: 'required-equipment' });

    const withoutArrow = new GameSession({
      content,
      save: sessionSave({
        classId: 'elf',
        mapId: 'north-field',
        x: 2,
        y: 2,
        equipment: { weapon: 'bow' },
        quests: claimedQuestState('elf-guidance'),
      }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'reagent-target', alertRadius: 0 })],
    });
    expect(
      withoutArrow.perform({
        type: 'cast',
        abilityId: 'rapid-shot',
        targetId: 'reagent-target',
      }),
    ).toMatchObject({ ok: false, reason: 'required-item' });
  });

  it('validates ability class, level, MP, and range before changing combat state', () => {
    const wrongClass = new GameSession({
      content,
      save: sessionSave({ mapId: 'north-field', x: 2, y: 2, level: 4 }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'class-target', alertRadius: 0 })],
    });
    expect(
      wrongClass.perform({ type: 'cast', abilityId: 'fire-arrow', targetId: 'class-target' }),
    ).toMatchObject({ ok: false, reason: 'ability-locked' });

    const lowLevel = new GameSession({
      content,
      save: sessionSave({
        classId: 'wizard',
        mapId: 'north-field',
        x: 2,
        y: 2,
        quests: claimedQuestState('wizard-guidance'),
      }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'level-target', alertRadius: 0 })],
    });
    expect(
      lowLevel.perform({ type: 'cast', abilityId: 'fire-arrow', targetId: 'level-target' }),
    ).toMatchObject({ ok: false, reason: 'level' });

    const noMP = new GameSession({
      content,
      save: sessionSave({
        classId: 'wizard',
        level: 4,
        mp: 0,
        mapId: 'north-field',
        x: 2,
        y: 2,
        quests: claimedQuestState('wizard-guidance'),
      }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'mp-target', alertRadius: 0 })],
    });
    expect(
      noMP.perform({ type: 'cast', abilityId: 'fire-arrow', targetId: 'mp-target' }),
    ).toMatchObject({ ok: false, reason: 'mp' });

    const far = new GameSession({
      content,
      save: sessionSave({
        classId: 'wizard',
        level: 4,
        mapId: 'north-field',
        x: 2,
        y: 2,
        quests: claimedQuestState('wizard-guidance'),
      }),
      monsters: [monsterAt({ x: 12, y: 2 }, { id: 'far-target', alertRadius: 0 })],
    });
    expect(
      far.perform({ type: 'cast', abilityId: 'fire-arrow', targetId: 'far-target' }),
    ).toMatchObject({ ok: false, reason: 'range' });
    expect(far.snapshot.monsters[0]?.hp).toBe(14);
  });

  it('derives Baphomet defeat only from a successful authoritative combat action', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        classId: 'wizard',
        level: 4,
        mapId: 'talking-island-dungeon-2',
        x: 50,
        y: 50,
        quests: claimedQuestState('wizard-guidance'),
      }),
      monsters: [
        monsterAt(
          { x: 51, y: 50 },
          {
            id: 'boss-target',
            monsterId: 'baphomet',
            rank: 'boss',
            mapId: 'talking-island-dungeon-2',
            hp: 1,
            maxHP: 1,
            alertRadius: 0,
          },
        ),
      ],
      seed: 7,
    });

    expect(session.snapshot.world.flags.baphometDefeated).not.toBe(true);
    expect(
      session.perform({ type: 'cast', abilityId: 'fire-arrow', targetId: 'boss-target' }),
    ).toMatchObject({ ok: true });
    expect(session.snapshot.world.flags.baphometDefeated).toBe(true);
    expect(session.snapshot.world.defeatedBosses).toContain('baphomet');
  });

  it('keeps quest reward abilities locked until their class quest reward is claimed', () => {
    const elf = new GameSession({
      content,
      save: sessionSave({
        classId: 'elf',
        mapId: 'north-field',
        x: 2,
        y: 2,
        stacks: [{ itemId: 'wooden-arrow', quantity: 1 }],
        equipment: { weapon: 'bow' },
      }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'locked-elf-target', alertRadius: 0 })],
    });
    const wizard = new GameSession({
      content,
      save: sessionSave({ classId: 'wizard', level: 4, mapId: 'north-field', x: 2, y: 2 }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'locked-wizard-target', alertRadius: 0 })],
    });

    expect(elf.snapshot.unlockedAbilityIds).not.toContain('rapid-shot');
    expect(
      elf.perform({ type: 'cast', abilityId: 'rapid-shot', targetId: 'locked-elf-target' }),
    ).toMatchObject({ ok: false, reason: 'ability-locked' });
    expect(wizard.snapshot.unlockedAbilityIds).not.toContain('fire-arrow');
    expect(
      wizard.perform({ type: 'cast', abilityId: 'fire-arrow', targetId: 'locked-wizard-target' }),
    ).toMatchObject({ ok: false, reason: 'ability-locked' });
  });

  it('enforces self, ally, enemy, and area target contracts without player-id bypass', () => {
    const knight = new GameSession({
      content,
      save: sessionSave({
        level: 4,
        mapId: 'north-field',
        x: 2,
        y: 2,
        quests: claimedQuestState('knight-guidance'),
      }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'knight-target', alertRadius: 0 })],
    });
    expect(
      knight.perform({ type: 'cast', abilityId: 'guarded-stance', targetId: 'knight-target' }),
    ).toMatchObject({ ok: false, reason: 'invalid-target' });
    expect(
      knight.perform({
        type: 'cast',
        abilityId: 'power-strike',
        targetId: knight.snapshot.character.id,
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-target' });

    const healer = new GameSession({
      content,
      save: sessionSave({ classId: 'wizard', level: 4, mapId: 'north-field', x: 2, y: 2 }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'heal-target', alertRadius: 0 })],
    });
    expect(
      healer.perform({ type: 'cast', abilityId: 'lesser-heal', targetId: 'heal-target' }),
    ).toMatchObject({ ok: false, reason: 'invalid-target' });
    expect(
      healer.perform({
        type: 'cast',
        abilityId: 'lesser-heal',
        targetId: healer.snapshot.character.id,
      }),
    ).toMatchObject({ ok: true });

    const areaCaster = new GameSession({
      content,
      save: sessionSave({ classId: 'wizard', level: 12, mapId: 'north-field', x: 2, y: 2 }),
      monsters: [monsterAt({ x: 3, y: 2 }, { id: 'area-target', alertRadius: 0 })],
    });
    expect(
      areaCaster.perform({
        type: 'cast',
        abilityId: 'frozen-cloud',
        targetId: areaCaster.snapshot.character.id,
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-target' });
    expect(
      areaCaster.perform({ type: 'cast', abilityId: 'frozen-cloud', targetId: 'area-target' }),
    ).toMatchObject({ ok: true });
  });

  it('reports and claims the ending only beside Gunther after every formal objective', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        mapId: 'north-field',
        x: 81,
        y: 48,
        defeatedBosses: ['baphomet'],
        flags: { baphometDefeated: true },
        quests: {
          active: {
            'baphomet-ending': {
              stage: 'in-progress',
              counters: { 'in-progress:0': 1, 'in-progress:1': 1 },
            },
          },
          completed: [],
          claimedRewards: [],
        },
      }),
    });
    const startingExperience = session.snapshot.character.experience;

    expect(session.snapshot.world.flags.finalReportComplete).toBe(false);
    expect(session.snapshot.endingComplete).toBe(false);
    expect(session.perform({ type: 'interact', targetId: 'gunther' })).toMatchObject({
      ok: true,
    });
    expect(session.snapshot.quests.completed).toContain('baphomet-ending');
    expect(
      session.perform({ type: 'claim-reward', npcId: 'gunther', questId: 'baphomet-ending' }),
    ).toMatchObject({ ok: true });

    expect(session.snapshot.quests.claimedRewards).toContain('baphomet-ending');
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'magic-cloak',
      quantity: 1,
    });
    expect(session.snapshot.character.experience).toBeGreaterThan(startingExperience);
    expect(session.snapshot.world.flags.finalReportComplete).toBe(true);
    expect(session.snapshot.endingComplete).toBe(true);
  });

  it('rejects remote or premature final reports without creating an ending flag', () => {
    const remote = new GameSession({
      content,
      save: sessionSave({
        mapId: 'talking-island-village',
        x: 32,
        y: 18,
        defeatedBosses: ['baphomet'],
        flags: { baphometDefeated: true },
        quests: {
          active: {},
          completed: ['baphomet-ending'],
          claimedRewards: [],
        },
      }),
    });
    expect(
      remote.perform({ type: 'claim-reward', npcId: 'gunther', questId: 'baphomet-ending' }),
    ).toMatchObject({ ok: false, reason: 'npc-out-of-range' });
    expect(remote.snapshot.world.flags.finalReportComplete).toBe(false);

    const premature = new GameSession({
      content,
      save: sessionSave({
        mapId: 'north-field',
        x: 81,
        y: 48,
        quests: {
          active: {
            'baphomet-ending': {
              stage: 'in-progress',
              counters: { 'in-progress:0': 1 },
            },
          },
          completed: [],
          claimedRewards: [],
        },
      }),
    });
    premature.perform({ type: 'interact', targetId: 'gunther' });
    expect(
      premature.perform({
        type: 'claim-reward',
        npcId: 'gunther',
        questId: 'baphomet-ending',
      }),
    ).toMatchObject({ ok: false, reason: 'not-completed' });
    expect(premature.snapshot.world.flags.finalReportComplete).toBe(false);
  });

  it('serializes the authoritative snapshot with derived flags and a valid checksum', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        mapId: 'north-field',
        x: 81,
        y: 48,
        defeatedBosses: ['baphomet'],
        flags: { baphometDefeated: true, finalReportComplete: true },
        equipment: { armor: 'leather-jacket' },
        quests: {
          active: {},
          completed: ['baphomet-ending'],
          claimedRewards: [],
        },
      }),
    });
    expect(session.snapshot.world.flags.finalReportComplete).toBe(false);

    const serialized = session.serialize('2026-07-17T08:30:00.000Z');

    expect(serialized.updatedAt).toBe('2026-07-17T08:30:00.000Z');
    expect(serialized.character).toEqual(session.snapshot.character);
    expect(serialized.inventory).toEqual(session.snapshot.inventory);
    expect(serialized.equipment).toEqual(session.snapshot.equipment);
    expect(serialized.quests).toEqual(session.snapshot.quests);
    expect(serialized.world).toEqual(session.snapshot.world);
    expect(validateSaveV1(serialized)).toEqual(serialized);
  });

  it('assigns only owned items or unlocked abilities to valid quick slots and serializes them', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        stacks: [{ itemId: 'red-potion', quantity: 1 }],
        quests: claimedQuestState('knight-guidance'),
      }),
    });

    expect(
      session.perform({
        type: 'assign-quick-slot',
        contentId: 'red-potion',
        slot: 0,
      }),
    ).toMatchObject({ ok: true });
    expect(
      session.perform({
        type: 'assign-quick-slot',
        contentId: 'guarded-stance',
        slot: 1,
      }),
    ).toMatchObject({ ok: true });
    expect(
      session.perform({
        type: 'assign-quick-slot',
        contentId: 'orange-potion',
        slot: 2,
      }),
    ).toMatchObject({ ok: false, reason: 'content-not-owned' });
    expect(
      session.perform({
        type: 'assign-quick-slot',
        contentId: 'fire-arrow',
        slot: 3,
      }),
    ).toMatchObject({ ok: false, reason: 'content-not-owned' });
    expect(
      session.perform({ type: 'assign-quick-slot', contentId: 'red-potion', slot: 8 }),
    ).toMatchObject({ ok: false, reason: 'invalid-quick-slot' });
    expect(session.snapshot.quickSlots.slice(0, 4)).toEqual([
      'red-potion',
      'guarded-stance',
      null,
      null,
    ]);
    expect(session.serialize('2026-07-17T09:00:00.000Z').quickSlots).toEqual(
      session.snapshot.quickSlots,
    );
  });

  it('validates settings, mutates session meta, and serializes the current values', () => {
    const session = new GameSession({ content, save: sessionSave() });
    const settings = {
      music: 0.2,
      ambient: 0.3,
      effects: 0.4,
      muted: true,
      scale: 3 as const,
    };

    expect(session.perform({ type: 'update-settings', settings })).toMatchObject({ ok: true });
    expect(session.snapshot.settings).toEqual(settings);
    expect(session.serialize('2026-07-17T09:05:00.000Z').settings).toEqual(settings);
    expect(
      session.perform({ type: 'update-settings', settings: { ...settings, music: 1.1 } }),
    ).toMatchObject({ ok: false, reason: 'settings-invalid' });
    expect(session.snapshot.settings).toEqual(settings);
  });

  it('applies local warehouse deposit and withdrawal through authoritative inventory actions', () => {
    const session = new GameSession({
      content,
      save: sessionSave({
        x: 31,
        y: 38,
        stacks: [{ itemId: 'red-potion', quantity: 2 }],
      }),
    });

    expect(
      session.perform({
        type: 'warehouse-deposit',
        npcId: 'dorin',
        itemId: 'red-potion',
        quantity: 1,
      }),
    ).toMatchObject({ ok: true });
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'red-potion',
      quantity: 1,
    });
    expect(
      session.perform({
        type: 'warehouse-withdraw',
        npcId: 'dorin',
        itemId: 'red-potion',
        quantity: 1,
      }),
    ).toMatchObject({ ok: true });
    expect(session.snapshot.inventory.stacks).toContainEqual({
      itemId: 'red-potion',
      quantity: 2,
    });
    expect(
      session.perform({
        type: 'warehouse-deposit',
        npcId: 'dorin',
        itemId: 'red-potion',
        quantity: 3,
      }),
    ).toMatchObject({ ok: false, reason: 'missing-item' });
  });

  it('keeps warehouse failures atomic when the keeper is remote or has the wrong role', () => {
    const session = new GameSession({
      content,
      save: sessionSave({ stacks: [{ itemId: 'red-potion', quantity: 2 }] }),
    });
    const before = session.snapshot.inventory;

    expect(
      session.perform({
        type: 'warehouse-deposit',
        npcId: 'dorin',
        itemId: 'red-potion',
        quantity: 1,
      }),
    ).toMatchObject({ ok: false, reason: 'npc-out-of-range' });
    expect(
      session.perform({
        type: 'warehouse-withdraw',
        npcId: 'village-elder-jered',
        itemId: 'red-potion',
        quantity: 1,
      }),
    ).toMatchObject({ ok: false, reason: 'not-a-warehouse' });
    expect(session.snapshot.inventory).toEqual(before);
  });

  it('preserves the WorldScene pause contract while GameSession owns simulation', () => {
    const session = new GameSession({ content, save: sessionSave() });
    const start = session.snapshot.player;
    session.dispatch({ type: 'move', x: start.x + 1, y: start.y });

    session.setPaused(true);
    session.update(50);
    expect(session.snapshot.player).toEqual(start);

    session.setPaused(false);
    session.update(50);
    expect(session.snapshot.player.x).toBe(start.x + 1);
  });
});
