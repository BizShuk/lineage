import {
  SaveCorruptionError,
  saveGameV0Schema,
  sealSaveV1,
  type SaveGameV1,
} from './saveSchema';
import { validateSaveV1 } from './saveSchema';

function schemaVersionOf(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Reflect.get(value, 'schemaVersion');
}

export function migrateSave(value: unknown): SaveGameV1 {
  const schemaVersion = schemaVersionOf(value);

  if (schemaVersion === 1) {
    return validateSaveV1(value);
  }

  if (schemaVersion === 0) {
    const result = saveGameV0Schema.safeParse(value);
    if (!result.success) {
      throw new SaveCorruptionError('Invalid V0 save structure', { cause: result.error });
    }

    return sealSaveV1({ ...result.data, schemaVersion: 1, checksum: '' });
  }

  const versionLabel =
    typeof schemaVersion === 'number' || typeof schemaVersion === 'string'
      ? String(schemaVersion)
      : 'missing';
  throw new SaveCorruptionError(`Unsupported save schema version ${versionLabel}`);
}
