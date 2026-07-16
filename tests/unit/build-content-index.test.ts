import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectContentIndex,
  renderContentIndex,
  writeContentIndex,
} from '../../scripts/build-content-index';

describe('content index builder', () => {
  it('collects every bundled content ID in fixed, sorted categories', () => {
    const index = collectContentIndex(process.cwd());

    expect(Object.keys(index)).toEqual([
      'classes',
      'items',
      'abilities',
      'npcs',
      'monsters',
      'quests',
      'maps',
    ]);
    expect(index.classes).toEqual(['elf', 'knight', 'prince', 'wizard']);
    expect(index.items).toHaveLength(49);
    expect(index.abilities).toHaveLength(29);
    expect(index.npcs).toHaveLength(17);
    expect(index.monsters).toHaveLength(15);
    expect(index.quests).toHaveLength(17);
    expect(index.maps).toHaveLength(7);
    for (const ids of Object.values(index)) {
      expect(ids).toEqual([...ids].sort((left, right) => left.localeCompare(right, 'en')));
    }
  });

  it('renders the same Markdown for equivalent indexes regardless of input order', () => {
    const first = renderContentIndex({
      classes: ['wizard', 'elf'],
      items: ['red-potion', 'dagger'],
      abilities: ['light'],
      npcs: ['pandora'],
      monsters: ['orc'],
      quests: ['field-supplies'],
      maps: ['coast'],
    });
    const second = renderContentIndex({
      classes: ['elf', 'wizard'],
      items: ['dagger', 'red-potion'],
      abilities: ['light'],
      npcs: ['pandora'],
      monsters: ['orc'],
      quests: ['field-supplies'],
      maps: ['coast'],
    });

    expect(first).toBe(second);
    expect(first).toContain('## Classes (2)\n\n- `elf`\n- `wizard`');
    expect(first.endsWith('\n')).toBe(true);
  });

  it('writes to the generated specification path by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'lineage-content-index-'));
    const outputPath = writeContentIndex({
      root,
      index: {
        classes: ['knight'],
        items: [],
        abilities: [],
        npcs: [],
        monsters: [],
        quests: [],
        maps: [],
      },
    });

    expect(outputPath).toBe(join(root, 'docs/specs/generated-content-index.md'));
    expect(readFileSync(outputPath, 'utf8')).toContain('## Classes (1)\n\n- `knight`');
  });
});
