import { z } from 'zod';

import type { EquipmentState, InventoryState } from '../core/inventory';
import type { CharacterState } from '../core/model';
import type { QuestState } from '../core/quests';
import type { WorldState } from '../world/world';
import { calculateSaveChecksum } from './checksum';

export type SaveSlot = 1 | 2 | 3;

export interface SaveSettings {
  readonly music: number;
  readonly ambient: number;
  readonly effects: number;
  readonly muted: boolean;
  readonly scale: 1 | 2 | 3;
}

export interface SaveGameV1 {
  readonly schemaVersion: 1;
  readonly gameVersion: string;
  readonly slot: SaveSlot;
  readonly updatedAt: string;
  readonly checksum: string;
  readonly character: CharacterState;
  readonly inventory: InventoryState;
  readonly equipment: EquipmentState;
  readonly quests: QuestState;
  readonly world: WorldState;
  readonly quickSlots: readonly (string | null)[];
  readonly settings: SaveSettings;
}

export interface SaveSummary {
  readonly slot: SaveSlot;
  readonly name: string;
  readonly classId: CharacterState['classId'];
  readonly level: number;
  readonly mapId: string;
  readonly updatedAt: string;
  readonly endingComplete: boolean;
}

export class SaveCorruptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SaveCorruptionError';
  }
}

const finiteNumber = z.number();
const nonnegativeInteger = z.number().int().nonnegative();
const identifier = z.string().min(1);

const attributesSchema = z
  .object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  })
  .strict();

const characterSchema = z
  .object({
    id: identifier,
    name: z.string().min(1),
    classId: z.enum(['prince', 'knight', 'elf', 'wizard']),
    level: z.number().int().min(1).max(15),
    experience: nonnegativeInteger,
    attributes: attributesSchema,
    hp: nonnegativeInteger,
    mp: nonnegativeInteger,
    alignment: z.number().int(),
    carriedWeight: finiteNumber.nonnegative(),
    equipmentAC: z.number().int(),
  })
  .strict();

const inventorySchema = z
  .object({
    stacks: z.array(
      z.object({ itemId: identifier, quantity: z.number().int().positive() }).strict(),
    ),
    adena: nonnegativeInteger,
    carriedWeight: finiteNumber.nonnegative(),
    weightLimit: finiteNumber.nonnegative(),
  })
  .strict();

const equipmentSchema = z
  .object({
    weapon: identifier.optional(),
    shield: identifier.optional(),
    helmet: identifier.optional(),
    armor: identifier.optional(),
    cloak: identifier.optional(),
    gloves: identifier.optional(),
    boots: identifier.optional(),
    amulet: identifier.optional(),
    ring: identifier.optional(),
  })
  .strict();

const activeQuestSchema = z
  .object({
    stage: identifier,
    counters: z.record(z.string(), nonnegativeInteger),
  })
  .strict();

const questsSchema = z
  .object({
    active: z.record(z.string(), activeQuestSchema),
    completed: z.array(identifier),
    claimedRewards: z.array(identifier),
  })
  .strict();

const worldSchema = z
  .object({
    player: z
      .object({ mapId: identifier, x: z.number().int(), y: z.number().int() })
      .strict(),
    defeatedBosses: z.array(identifier),
    flags: z.record(z.string(), z.boolean()),
    worldTimeMs: nonnegativeInteger,
  })
  .strict();

const settingsSchema = z
  .object({
    music: finiteNumber.min(0).max(1),
    ambient: finiteNumber.min(0).max(1),
    effects: finiteNumber.min(0).max(1),
    muted: z.boolean(),
    scale: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

const savePayloadShape = {
  gameVersion: identifier,
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  updatedAt: z.iso.datetime({ offset: true }),
  character: characterSchema,
  inventory: inventorySchema,
  equipment: equipmentSchema,
  quests: questsSchema,
  world: worldSchema,
  quickSlots: z.array(identifier.nullable()),
  settings: settingsSchema,
} as const;

const saveGameV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    checksum: z.string(),
    ...savePayloadShape,
  })
  .strict();

export const saveGameV0Schema = z
  .object({ schemaVersion: z.literal(0), ...savePayloadShape })
  .strict();

function corruption(message: string, cause?: unknown): SaveCorruptionError {
  return cause === undefined
    ? new SaveCorruptionError(message)
    : new SaveCorruptionError(message, { cause });
}

export function parseSaveV1Structure(value: unknown): SaveGameV1 {
  const result = saveGameV1Schema.safeParse(value);
  if (!result.success) {
    throw corruption('Invalid V1 save structure', result.error);
  }
  const equipment = Object.fromEntries(
    Object.entries(result.data.equipment).filter((entry): entry is [string, string] => {
      return entry[1] !== undefined;
    }),
  ) as EquipmentState;
  return { ...result.data, equipment };
}

export function sealSaveV1(value: unknown): SaveGameV1 {
  const parsed = parseSaveV1Structure(value);
  return { ...parsed, checksum: calculateSaveChecksum(parsed) };
}

export function validateSaveV1(value: unknown): SaveGameV1 {
  const parsed = parseSaveV1Structure(value);
  if (parsed.checksum !== calculateSaveChecksum(parsed)) {
    throw corruption('Save checksum mismatch');
  }
  return parsed;
}
