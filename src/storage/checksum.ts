const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not support non-finite numbers');
    }
    return JSON.stringify(value);
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Canonical JSON does not support ${typeof value} values`);
  }

  if (ancestors.has(value)) {
    throw new TypeError('Canonical JSON does not support circular references');
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON only supports plain objects and arrays');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry, ancestors)).join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`);
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set());
}

export function calculateSaveChecksum(save: object): string {
  const canonical = canonicalJson({ ...save, checksum: '' });
  let hash = FNV_OFFSET_BASIS_64;

  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME_64) & UINT64_MASK;
  }

  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}
