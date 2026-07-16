import { z } from 'zod';

export const contentId = z.string().regex(/^[a-z][a-z0-9-]*$/, '必須是小寫 kebab-case ID');
export const sourceTierSchema = z.enum(['A', 'B', 'C', 'S']);
export const characterClassSchema = z.enum(['prince', 'knight', 'elf', 'wizard']);

const sourcedDefinition = {
  id: contentId,
  name: z.string().min(1),
  description: z.string().min(1),
  sourceTier: sourceTierSchema,
  sourceNotes: z.string().min(1),
};

const attributesSchema = z
  .object({
    str: z.int().min(1).max(30),
    dex: z.int().min(1).max(30),
    con: z.int().min(1).max(30),
    int: z.int().min(1).max(30),
    wis: z.int().min(1).max(30),
    cha: z.int().min(1).max(30),
  })
  .strict();

export const classSchema = z
  .object({
    ...sourcedDefinition,
    id: characterClassSchema,
    spriteKey: contentId,
    baseAttributes: attributesSchema,
    startingHP: z.int().positive(),
    startingMP: z.int().nonnegative(),
    startingItemIds: z.array(contentId).min(1),
    abilityIds: z.array(contentId).min(1),
  })
  .strict();

export const itemSchema = z
  .object({
    ...sourcedDefinition,
    kind: z.enum(['weapon', 'armor', 'consumable', 'spellbook', 'ammunition', 'quest']),
    assetKey: contentId,
    weight: z.number().nonnegative(),
    stackLimit: z.int().positive(),
    buyPrice: z.int().nonnegative(),
    sellPrice: z.int().nonnegative(),
    allowedClasses: z.array(characterClassSchema).min(1),
    equipmentSlot: z
      .enum(['weapon', 'shield', 'helmet', 'armor', 'cloak', 'gloves', 'boots', 'amulet', 'ring'])
      .optional(),
    damageSmall: z.int().nonnegative().optional(),
    damageLarge: z.int().nonnegative().optional(),
    acModifier: z.int().max(0).optional(),
    healAmount: z.int().positive().optional(),
    manaAmount: z.int().positive().optional(),
    speedMultiplier: z.number().positive().optional(),
    grantsAbilityId: contentId.optional(),
  })
  .strict();

export const abilitySchema = z
  .object({
    ...sourcedDefinition,
    kind: z.enum(['attack', 'heal', 'buff', 'utility', 'control']),
    assetKey: contentId,
    allowedClasses: z.array(characterClassSchema).min(1),
    unlockLevel: z.int().min(1).max(15),
    manaCost: z.int().nonnegative(),
    hpCost: z.int().nonnegative(),
    cooldownMs: z.int().nonnegative(),
    target: z.enum(['self', 'ally', 'enemy', 'area']),
    power: z.number().nonnegative(),
    durationMs: z.int().positive().optional(),
    reagentItemId: contentId.optional(),
  })
  .strict();

export const dropSchema = z
  .object({
    itemId: contentId,
    chance: z.number().min(0).max(1),
    min: z.int().positive(),
    max: z.int().positive(),
  })
  .strict()
  .refine(({ min, max }) => min <= max, { message: 'min 不得高於 max', path: ['max'] });

export const monsterSchema = z
  .object({
    ...sourcedDefinition,
    rank: z.enum(['normal', 'elite', 'event', 'boss']),
    spriteKey: contentId,
    level: z.int().min(1).max(60),
    hp: z.int().positive(),
    mp: z.int().nonnegative(),
    ac: z.int().min(-100).max(20),
    attack: z.int().positive(),
    experience: z.int().positive(),
    abilityIds: z.array(contentId),
    drops: z.array(dropSchema),
  })
  .strict();

export const npcSchema = z
  .object({
    ...sourcedDefinition,
    role: z.enum(['shop', 'warehouse', 'inn', 'trainer', 'quest', 'guide', 'healer', 'guard']),
    spriteKey: contentId,
    mapId: contentId,
    x: z.int().nonnegative(),
    y: z.int().nonnegative(),
    shopItemIds: z.array(contentId),
    questIds: z.array(contentId),
    taughtAbilityIds: z.array(contentId),
  })
  .strict();

const killObjectiveSchema = z
  .object({ type: z.literal('kill'), monsterId: contentId, count: z.int().positive() })
  .strict();
const defeatObjectiveSchema = z
  .object({ type: z.literal('defeat'), monsterId: contentId, count: z.literal(1) })
  .strict();
const collectObjectiveSchema = z
  .object({ type: z.literal('collect'), itemId: contentId, count: z.int().positive() })
  .strict();
const talkObjectiveSchema = z
  .object({ type: z.literal('talk'), npcId: contentId, count: z.literal(1) })
  .strict();
const reachObjectiveSchema = z
  .object({ type: z.literal('reach'), mapId: contentId, count: z.literal(1) })
  .strict();

export const questObjectiveSchema = z.discriminatedUnion('type', [
  killObjectiveSchema,
  defeatObjectiveSchema,
  collectObjectiveSchema,
  talkObjectiveSchema,
  reachObjectiveSchema,
]);

const itemRewardSchema = z
  .object({ itemId: contentId, quantity: z.int().positive() })
  .strict();

const questRewardSchema = z
  .object({
    experience: z.int().nonnegative(),
    adena: z.int().nonnegative(),
    itemRewards: z.array(itemRewardSchema),
    abilityIds: z.array(contentId),
  })
  .strict();

export const questSchema = z
  .object({
    ...sourcedDefinition,
    kind: z.enum(['main', 'class', 'side']),
    giverNpcId: contentId,
    allowedClasses: z.array(characterClassSchema).min(1),
    prerequisiteQuestIds: z.array(contentId),
    objectives: z.array(questObjectiveSchema).min(1),
    rewards: questRewardSchema,
  })
  .strict();

export const mapExitSchema = z
  .object({
    x: z.int().nonnegative(),
    y: z.int().nonnegative(),
    targetMapId: contentId,
    targetX: z.int().nonnegative(),
    targetY: z.int().nonnegative(),
  })
  .strict();

export const spawnSchema = z
  .object({
    monsterId: contentId,
    x: z.int().nonnegative(),
    y: z.int().nonnegative(),
    count: z.int().positive(),
    respawnSeconds: z.int().nonnegative(),
  })
  .strict();

export const mapSchema = z
  .object({
    ...sourcedDefinition,
    assetKey: contentId,
    width: z.int().positive(),
    height: z.int().positive(),
    safeZone: z.boolean(),
    entry: z.object({ x: z.int().nonnegative(), y: z.int().nonnegative() }).strict(),
    npcIds: z.array(contentId),
    exits: z.array(mapExitSchema),
    spawns: z.array(spawnSchema),
  })
  .strict();

export const gameContentSchema = z
  .object({
    classes: z.array(classSchema).min(1),
    items: z.array(itemSchema).min(1),
    abilities: z.array(abilitySchema).min(1),
    monsters: z.array(monsterSchema).min(1),
    npcs: z.array(npcSchema).min(1),
    quests: z.array(questSchema).min(1),
    maps: z.array(mapSchema).min(1),
  })
  .strict();

export class ContentLoadError extends Error {
  constructor(readonly issues: string[]) {
    super(`內容驗證失敗：${issues.join('；')}`);
    this.name = 'ContentLoadError';
  }
}

export type ClassDefinition = z.infer<typeof classSchema>;
export type ItemDefinition = z.infer<typeof itemSchema>;
export type AbilityDefinition = z.infer<typeof abilitySchema>;
export type MonsterDefinition = z.infer<typeof monsterSchema>;
export type NpcDefinition = z.infer<typeof npcSchema>;
export type QuestDefinition = z.infer<typeof questSchema>;
export type MapDefinition = z.infer<typeof mapSchema>;
export type ParsedGameContent = z.infer<typeof gameContentSchema>;
