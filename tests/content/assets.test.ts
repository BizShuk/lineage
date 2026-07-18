import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';
import rawAssetManifest from '../../src/content/data/assets.json';
import {
  collectAssetKeys,
  loadAssetManifest,
  type AssetManifestFile,
} from '../../src/content/assets';

const plannedPngPaths = [
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
] as const;

describe('asset manifest contract', () => {
  it('collects every class, monster, NPC, item, ability, and map asset key', () => {
    const content = loadBundledContent();
    const expected = [
      ...content.classes.map(({ spriteKey }) => spriteKey),
      ...content.monsters.map(({ spriteKey }) => spriteKey),
      ...content.npcs.map(({ spriteKey }) => spriteKey),
      ...content.items.map(({ assetKey }) => assetKey),
      ...content.abilities.map(({ assetKey }) => assetKey),
      ...content.maps.map(({ assetKey }) => assetKey),
    ];

    expect([...collectAssetKeys(content)].sort()).toEqual([...new Set(expected)].sort());
  });

  it('maps every required key to a project-original PNG under public/assets', () => {
    const required = collectAssetKeys(loadBundledContent());
    const manifest = loadAssetManifest();

    expect([...required].filter((key) => manifest[key] === undefined)).toEqual([]);
    const entries = Object.values(manifest);
    expect(entries.map(({ license }) => license)).toEqual(
      entries.map(() => 'project-original'),
    );
    expect(
      entries.every(
        ({ path, group, frame }) =>
          path.startsWith('public/assets/') &&
          path.endsWith('.png') &&
          group.length > 0 &&
          Number.isSafeInteger(frame) &&
          frame >= 0,
      ),
    ).toBe(true);
  });

  it('uses exactly the fourteen planned project PNG paths', () => {
    const paths = new Set(Object.values(loadAssetManifest()).map(({ path }) => path));
    expect([...paths].sort()).toEqual([...plannedPngPaths].sort());
  });

  it('rejects duplicate and missing keys', () => {
    const valid = structuredClone(rawAssetManifest) as AssetManifestFile;
    const first = valid.assets[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(() =>
      loadAssetManifest({ ...valid, assets: [...valid.assets, first] }),
    ).toThrow(/重複/i);
    expect(() =>
      loadAssetManifest({ ...valid, assets: valid.assets.slice(1) }),
    ).toThrow(/缺少/i);
  });

  it('rejects unknown paths, non-original licenses, and unknown fields', () => {
    const valid = structuredClone(rawAssetManifest) as AssetManifestFile;
    const first = valid.assets[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(() =>
      loadAssetManifest({
        ...valid,
        assets: [{ ...first, path: 'public/assets/sprites/unplanned.png' }, ...valid.assets.slice(1)],
      }),
    ).toThrow(/路徑/i);
    expect(() =>
      loadAssetManifest({
        ...valid,
        assets: [{ ...first, license: 'third-party' }, ...valid.assets.slice(1)],
      }),
    ).toThrow();
    expect(() => loadAssetManifest({ ...valid, unexpected: true })).toThrow();
  });
});

describe('Task 13 raster files', () => {
  it.each(plannedPngPaths)('%s exists', (path) => {
    expect(existsSync(resolve(path))).toBe(true);
  });
});
