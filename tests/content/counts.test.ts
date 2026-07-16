import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';

describe('bundled Talking Island content', () => {
  it('meets every contractual content floor', () => {
    const content = loadBundledContent();

    expect(content.classes).toHaveLength(4);
    expect(content.items.length).toBeGreaterThanOrEqual(40);
    expect(content.abilities.length).toBeGreaterThanOrEqual(20);
    expect(content.npcs.length).toBeGreaterThanOrEqual(15);
    expect(content.monsters.filter((monster) => monster.rank === 'normal').length).toBeGreaterThanOrEqual(10);
    expect(content.monster('black-knight').rank).toBe('elite');
    expect(content.monster('kurt').rank).toBe('event');
    expect(content.monster('baphomet').rank).toBe('boss');
    expect(content.maps).toHaveLength(7);
  });

  it('contains exactly the approved classes and map IDs', () => {
    const content = loadBundledContent();

    expect(content.classes.map(({ id }) => id).sort()).toEqual(
      ['elf', 'knight', 'prince', 'wizard'],
    );
    expect(content.maps.map(({ id }) => id).sort()).toEqual(
      [
        'black-knight-area',
        'coast',
        'north-field',
        'scarecrow-field',
        'talking-island-dungeon-1',
        'talking-island-dungeon-2',
        'talking-island-village',
      ].sort(),
    );
  });

  it('labels every definition with a historical source tier and notes', () => {
    const content = loadBundledContent();
    const definitions = [
      ...content.classes,
      ...content.items,
      ...content.abilities,
      ...content.monsters,
      ...content.npcs,
      ...content.quests,
      ...content.maps,
    ];

    for (const definition of definitions) {
      expect(['A', 'B', 'C', 'S']).toContain(definition.sourceTier);
      expect(definition.sourceNotes.length).toBeGreaterThan(0);
    }
  });
});
