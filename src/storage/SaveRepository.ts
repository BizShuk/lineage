import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { isEndingUnlocked } from '../core/quests';
import { migrateSave } from './migrations';
import {
  SaveCorruptionError,
  sealSaveV1,
  type SaveGameV1,
  type SaveSlot,
  type SaveSummary,
} from './saveSchema';

interface SaveDatabase extends DBSchema {
  readonly saves: {
    readonly key: SaveSlot;
    readonly value: SaveGameV1;
  };
  readonly backups: {
    readonly key: SaveSlot;
    readonly value: SaveGameV1;
  };
}

function requireSlot(slot: number): SaveSlot {
  if (slot !== 1 && slot !== 2 && slot !== 3) {
    throw new RangeError(`Save slot must be 1, 2, or 3; received ${String(slot)}`);
  }
  return slot;
}

function summaryOf(save: SaveGameV1): SaveSummary {
  return {
    slot: save.slot,
    name: save.character.name,
    classId: save.character.classId,
    level: save.character.level,
    mapId: save.world.player.mapId,
    updatedAt: save.updatedAt,
    endingComplete: isEndingUnlocked(save.world.flags),
  };
}

export class SaveRepository {
  readonly #database: Promise<IDBPDatabase<SaveDatabase>>;

  constructor(databaseName: string) {
    this.#database = openDB<SaveDatabase>(databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('saves')) {
          database.createObjectStore('saves');
        }
        if (!database.objectStoreNames.contains('backups')) {
          database.createObjectStore('backups');
        }
      },
    });
  }

  async list(): Promise<SaveSummary[]> {
    const database = await this.#database;
    const saves = await database.getAll('saves');
    return saves
      .map((save) => summaryOf(migrateSave(save)))
      .sort((left, right) => left.slot - right.slot);
  }

  async get(slot: number): Promise<SaveGameV1 | null> {
    const validSlot = requireSlot(slot);
    const database = await this.#database;
    const save = await database.get('saves', validSlot);
    return save === undefined ? null : migrateSave(save);
  }

  async getBackupSummary(slot: number): Promise<SaveSummary | null> {
    const validSlot = requireSlot(slot);
    const database = await this.#database;
    const backup = await database.get('backups', validSlot);
    return backup === undefined ? null : summaryOf(migrateSave(backup));
  }

  async put(save: SaveGameV1): Promise<void> {
    const validated = migrateSave(save);
    const slot = requireSlot(validated.slot);
    const database = await this.#database;
    const transaction = database.transaction(['saves', 'backups'], 'readwrite');
    const current = await transaction.objectStore('saves').get(slot);

    if (current !== undefined) {
      await transaction.objectStore('backups').put(current, slot);
    }
    await transaction.objectStore('saves').put(validated, slot);
    await transaction.done;
  }

  async delete(slot: number, characterNameConfirmation: string): Promise<boolean> {
    const validSlot = requireSlot(slot);
    const database = await this.#database;
    const transaction = database.transaction(['saves', 'backups'], 'readwrite');
    const current = await transaction.objectStore('saves').get(validSlot);

    if (current === undefined || current.character.name !== characterNameConfirmation) {
      transaction.abort();
      try {
        await transaction.done;
      } catch {
        // An intentional abort guarantees that a failed confirmation writes nothing.
      }
      return false;
    }

    await transaction.objectStore('saves').delete(validSlot);
    await transaction.objectStore('backups').delete(validSlot);
    await transaction.done;
    return true;
  }

  async export(slot: number): Promise<string> {
    const save = await this.get(slot);
    if (save === null) {
      throw new SaveCorruptionError(`Cannot export empty save slot ${String(slot)}`);
    }
    return JSON.stringify(save, null, 2);
  }

  async import(slot: number, serialized: string): Promise<SaveGameV1> {
    const validSlot = requireSlot(slot);
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized) as unknown;
    } catch (error) {
      throw new SaveCorruptionError('Imported save is not valid JSON', { cause: error });
    }

    const migrated = migrateSave(parsed);
    const targeted = sealSaveV1({
      ...migrated,
      slot: validSlot,
      checksum: '',
    });

    await this.put(targeted);
    return targeted;
  }

  async restoreBackup(slot: number): Promise<SaveGameV1> {
    const validSlot = requireSlot(slot);
    const database = await this.#database;
    const transaction = database.transaction(['saves', 'backups'], 'readwrite');
    const backup = await transaction.objectStore('backups').get(validSlot);

    if (backup === undefined) {
      transaction.abort();
      try {
        await transaction.done;
      } catch {
        // The abort keeps both stores unchanged when no backup is available.
      }
      throw new SaveCorruptionError(`No backup exists for save slot ${String(validSlot)}`);
    }

    const validated = migrateSave(backup);
    await transaction.objectStore('saves').put(validated, validSlot);
    await transaction.done;
    return validated;
  }
}
