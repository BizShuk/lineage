import { describe, expect, it } from 'vitest';

import { calculateSaveChecksum, canonicalJson } from '../../src/storage/checksum';
import { migrateSave } from '../../src/storage/migrations';
import { SaveCorruptionError } from '../../src/storage/saveSchema';
import { completeSave } from '../helpers/saveFixtures';

describe('save migrations', () => {
  it('migrates a V0 save to a checksummed V1 envelope without losing progress', () => {
    const current = completeSave({ slot: 2, level: 9, baphometDefeated: true });
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    legacy.schemaVersion = 0;
    delete legacy.checksum;

    const migrated = migrateSave(legacy);

    expect(migrated).toMatchObject({
      schemaVersion: 1,
      slot: 2,
      character: { level: 9 },
      world: { flags: { baphometDefeated: true } },
    });
    expect(migrated.checksum).toBe(calculateSaveChecksum(migrated));
  });

  it('rejects a schema version newer than this game understands', () => {
    const future = { ...completeSave(), schemaVersion: 2 };

    expect(() => migrateSave(future)).toThrow(SaveCorruptionError);
    expect(() => migrateSave(future)).toThrow(/unsupported save schema version 2/i);
  });

  it('rejects a V1 checksum mismatch instead of silently resealing it', () => {
    const save = completeSave({ level: 8 });
    const corrupted = { ...save, character: { ...save.character, level: 15 } };

    expect(() => migrateSave(corrupted)).toThrow(SaveCorruptionError);
    expect(() => migrateSave(corrupted)).toThrow(/checksum/i);
  });

  it('canonicalizes object keys recursively while preserving array order', () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }], a: true })).toBe(
      '{"a":true,"z":[{"a":1,"b":2}]}',
    );
    expect(canonicalJson({ a: [2, 1] })).not.toBe(canonicalJson({ a: [1, 2] }));
  });
});
