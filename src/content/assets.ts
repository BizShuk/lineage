import { z } from 'zod';

import rawAssetManifest from './data/assets.json';
import type { GameContent } from './catalog';
import { loadBundledContent } from './loadContent';

const plannedPaths = new Set([
  'public/assets/sprites/player-prince.png',
  'public/assets/sprites/player-knight.png',
  'public/assets/sprites/player-elf.png',
  'public/assets/sprites/player-wizard.png',
  'public/assets/sprites/monsters-surface.png',
  'public/assets/sprites/monsters-undead.png',
  'public/assets/sprites/black-knight.png',
  'public/assets/sprites/baphomet.png',
  'public/assets/sprites/npcs.png',
  'public/assets/sprites/items.png',
  'public/assets/sprites/effects.png',
  'public/assets/maps/terrain-overworld-v2.png',
  'public/assets/maps/terrain-dungeon-v2.png',
  'public/assets/ui/classic-frame.png',
]);

const assetEntrySchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9-]*$/),
    path: z
      .string()
      .refine(
        (path) =>
          path.startsWith('public/assets/') &&
          path.endsWith('.png') &&
          plannedPaths.has(path),
        '不允許的資產路徑',
      ),
    group: z.string().regex(/^[a-z][a-z0-9-]*$/),
    frame: z.number().int().nonnegative(),
    license: z.literal('project-original'),
  })
  .strict();

const assetManifestFileSchema = z
  .object({
    version: z.literal(1),
    assets: z.array(assetEntrySchema).min(1),
  })
  .strict();

export type AssetEntry = z.infer<typeof assetEntrySchema>;
export type AssetManifestFile = z.infer<typeof assetManifestFileSchema>;
export type AssetManifest = Readonly<Record<string, Readonly<AssetEntry>>>;

export class AssetManifestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AssetManifestError';
  }
}

export const collectAssetKeys = (content: GameContent): ReadonlySet<string> =>
  new Set([
    ...content.classes.map(({ spriteKey }) => spriteKey),
    ...content.monsters.map(({ spriteKey }) => spriteKey),
    ...content.npcs.map(({ spriteKey }) => spriteKey),
    ...content.items.map(({ assetKey }) => assetKey),
    ...content.abilities.map(({ assetKey }) => assetKey),
    ...content.maps.map(({ assetKey }) => assetKey),
  ]);

const formatIssues = (error: z.ZodError): string =>
  error.issues
    .map(({ path, message }) => `${path.length === 0 ? 'root' : path.join('.')}：${message}`)
    .join('；');

export const loadAssetManifest = (
  raw: unknown = rawAssetManifest,
  content: GameContent = loadBundledContent(),
): AssetManifest => {
  const result = assetManifestFileSchema.safeParse(raw);
  if (!result.success) {
    throw new AssetManifestError(`資產 manifest 驗證失敗：${formatIssues(result.error)}`, {
      cause: result.error,
    });
  }

  const manifest: Record<string, Readonly<AssetEntry>> = {};
  for (const entry of result.data.assets) {
    if (manifest[entry.key] !== undefined) {
      throw new AssetManifestError(`資產 manifest 含有重複 key：${entry.key}`);
    }
    manifest[entry.key] = Object.freeze({ ...entry });
  }

  const required = collectAssetKeys(content);
  const missing = [...required].filter((key) => manifest[key] === undefined);
  if (missing.length > 0) {
    throw new AssetManifestError(`資產 manifest 缺少必要 key：${missing.join(', ')}`);
  }

  const allowedKeys = new Set([...required, 'ui-classic-frame']);
  const unknown = Object.keys(manifest).filter((key) => !allowedKeys.has(key));
  if (unknown.length > 0) {
    throw new AssetManifestError(`資產 manifest 含有未知 key：${unknown.join(', ')}`);
  }

  return Object.freeze(manifest);
};
