import 'fake-indexeddb/auto';

import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

import { SaveRepository } from '../../src/storage/SaveRepository';
import { SaveCorruptionError, type SaveGameV1 } from '../../src/storage/saveSchema';
import { completeSave } from '../helpers/saveFixtures';

let databaseSequence = 0;

function databaseName(label: string): string {
  databaseSequence += 1;
  return `save-repository-${label}-${String(databaseSequence)}`;
}

describe('SaveRepository', () => {
  it('round-trips a complete save without losing world flags', async () => {
    const repository = new SaveRepository(databaseName('round-trip'));
    const save = completeSave({ slot: 1, baphometDefeated: true });

    await repository.put(save);

    expect(await repository.get(1)).toEqual(save);
  });

  it('supports exactly slots 1 through 3 and lists their summaries in slot order', async () => {
    const repository = new SaveRepository(databaseName('slots'));
    await repository.put(completeSave({ slot: 3, level: 13 }));
    await repository.put(completeSave({ slot: 1, level: 5 }));
    await repository.put(completeSave({ slot: 2, level: 9 }));

    expect((await repository.list()).map(({ slot, level }) => [slot, level])).toEqual([
      [1, 5],
      [2, 9],
      [3, 13],
    ]);
    await expect(repository.get(0)).rejects.toThrow(/slot/i);
    await expect(repository.get(4)).rejects.toThrow(/slot/i);
  });

  it('marks the ending complete only after Baphomet is defeated and reported', async () => {
    const repository = new SaveRepository(databaseName('ending-summary'));
    await repository.put(completeSave({ slot: 1, baphometDefeated: true }));
    await repository.put(
      completeSave({
        slot: 2,
        baphometDefeated: true,
        finalReportComplete: true,
      }),
    );

    expect((await repository.list()).map(({ endingComplete }) => endingComplete)).toEqual([
      false,
      true,
    ]);
  });

  it('detects checksum corruption when reading the real IndexedDB store', async () => {
    const name = databaseName('corruption');
    const repository = new SaveRepository(name);
    const save = completeSave({ slot: 1, level: 8 });
    await repository.put(save);

    const database = await openDB(name, 1);
    const corrupted = { ...save, character: { ...save.character, level: 15 } };
    await database.put('saves', corrupted, 1);
    database.close();

    await expect(repository.get(1)).rejects.toBeInstanceOf(SaveCorruptionError);
  });

  it('backs up the previous save atomically before an import replacement', async () => {
    const repository = new SaveRepository(databaseName('backup'));
    await repository.put(completeSave({ slot: 2, level: 8 }));

    await repository.import(2, JSON.stringify(completeSave({ slot: 2, level: 9 })));

    expect((await repository.get(2))?.character.level).toBe(9);
    expect((await repository.restoreBackup(2)).character.level).toBe(8);
    expect((await repository.get(2))?.character.level).toBe(8);
    expect((await repository.restoreBackup(2)).character.level).toBe(8);
  });

  it('reads backup summaries without restoring or mutating either copy', async () => {
    const repository = new SaveRepository(databaseName('backup-summary'));
    const previous = completeSave({
      slot: 2,
      level: 8,
      updatedAt: '2026-07-17T08:00:00.000Z',
    });
    const current = completeSave({
      slot: 2,
      level: 9,
      updatedAt: '2026-07-17T09:00:00.000Z',
    });

    expect(await repository.getBackupSummary(2)).toBeNull();
    await repository.put(previous);
    await repository.put(current);

    expect(await repository.getBackupSummary(2)).toMatchObject({
      slot: 2,
      level: 8,
      updatedAt: '2026-07-17T08:00:00.000Z',
    });
    expect((await repository.get(2))?.character.level).toBe(9);
    expect((await repository.getBackupSummary(2))?.level).toBe(8);
  });

  it('validates and migrates an import before forcing and resealing its target slot', async () => {
    const repository = new SaveRepository(databaseName('migration-import'));
    const source = completeSave({ slot: 1, level: 11 });
    const legacy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
    legacy.schemaVersion = 0;
    delete legacy.checksum;

    const imported = await repository.import(
      3,
      JSON.stringify(legacy),
    );

    expect(imported).toMatchObject({ schemaVersion: 1, slot: 3, character: { level: 11 } });
    expect(await repository.get(1)).toBeNull();
    expect(await repository.get(3)).toEqual(imported);
  });

  it('preserves current data and creates no backup when import validation fails', async () => {
    const repository = new SaveRepository(databaseName('invalid-import'));
    const current = completeSave({ slot: 1, level: 8 });
    await repository.put(current);

    await expect(repository.import(1, '{not-json')).rejects.toBeInstanceOf(
      SaveCorruptionError,
    );
    await expect(
      repository.import(
        1,
        JSON.stringify({
          ...completeSave({ slot: 1, level: 9 }),
          schemaVersion: 99,
        }),
      ),
    ).rejects.toBeInstanceOf(SaveCorruptionError);

    expect(await repository.get(1)).toEqual(current);
    await expect(repository.restoreBackup(1)).rejects.toThrow(/backup/i);
  });

  it('requires the current character name before deleting a slot and its backup', async () => {
    const repository = new SaveRepository(databaseName('delete'));
    await repository.put(completeSave({ slot: 3, level: 7 }));
    await repository.put(completeSave({ slot: 3, level: 8 }));

    await expect(repository.delete(3, '別人')).resolves.toBe(false);
    expect(await repository.get(3)).not.toBeNull();

    await expect(repository.delete(3, '測試騎士')).resolves.toBe(true);
    expect(await repository.get(3)).toBeNull();
    await expect(repository.restoreBackup(3)).rejects.toThrow(/backup/i);
  });

  it('exports pretty JSON that can be imported without changing stable state', async () => {
    const repository = new SaveRepository(databaseName('export'));
    const save = completeSave({ slot: 2, baphometDefeated: true });
    await repository.put(save);

    const exported = await repository.export(2);

    expect(exported).toContain('\n  "schemaVersion": 1');
    expect(JSON.parse(exported) as unknown).toEqual(save);
  });

  it('rejects transient presentation state instead of storing it', async () => {
    const repository = new SaveRepository(databaseName('transient'));
    const save = completeSave({ slot: 1 });
    const withTransientState = {
      ...save,
      phaserSprite: { texture: 'hero', animationFrame: 4 },
    } as SaveGameV1;

    await expect(repository.put(withTransientState)).rejects.toBeInstanceOf(
      SaveCorruptionError,
    );
    expect(await repository.get(1)).toBeNull();
  });
});
