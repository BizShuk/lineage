import { describe, expect, it } from 'vitest';

import type { Attributes, CharacterClass } from '../../src/core/model';
import { createCharacter, deriveStats } from '../../src/core/stats';

const expectedAttributes: Readonly<Record<CharacterClass, Attributes>> = {
  prince: { str: 13, dex: 10, con: 10, int: 10, wis: 11, cha: 13 },
  knight: { str: 16, dex: 12, con: 14, int: 8, wis: 9, cha: 8 },
  elf: { str: 11, dex: 12, con: 12, int: 12, wis: 12, cha: 9 },
  wizard: { str: 8, dex: 7, con: 12, int: 16, wis: 16, cha: 8 },
};

describe('createCharacter', () => {
  it.each(Object.entries(expectedAttributes) as [CharacterClass, Attributes][])(
    'creates a %s with the six class attributes',
    (classId, attributes) => {
      const character = createCharacter('測試角色', classId);

      expect(character.classId).toBe(classId);
      expect(character.attributes).toEqual(attributes);
      expect(Object.keys(character.attributes).sort()).toEqual(
        ['cha', 'con', 'dex', 'int', 'str', 'wis'].sort(),
      );
    },
  );

  it('returns independent attributes for each character', () => {
    const first = createCharacter('第一位騎士', 'knight');
    const second = createCharacter('第二位騎士', 'knight');

    expect(first.attributes).not.toBe(second.attributes);
  });
});

describe('deriveStats', () => {
  it('calculates every derived value from attributes and level', () => {
    const character = createCharacter('妖精', 'elf');

    expect(deriveStats({ ...character, level: 5 })).toEqual({
      maxHP: 54,
      maxMP: 34,
      ac: 6,
      hitBonus: 10,
      damageBonus: 3,
      spellPower: 11,
      weightLimit: 270,
    });
  });

  it('treats lower AC as stronger defense', () => {
    const knight = createCharacter('騎士', 'knight');
    const base = deriveStats(knight);
    const armored = deriveStats({ ...knight, equipmentAC: knight.equipmentAC - 4 });

    expect(armored.ac).toBe(base.ac - 4);
  });

  it('clamps levels below 1 to level 1', () => {
    const wizard = createCharacter('法師', 'wizard');

    expect(deriveStats({ ...wizard, level: 0 })).toEqual(
      deriveStats({ ...wizard, level: 1 }),
    );
  });

  it('clamps levels above 15 to level 15', () => {
    const prince = createCharacter('王族', 'prince');

    expect(deriveStats({ ...prince, level: 16 })).toEqual(
      deriveStats({ ...prince, level: 15 }),
    );
  });

  it('does not mutate the character or its attributes', () => {
    const character = createCharacter('純函式', 'knight');
    const before = structuredClone(character);

    deriveStats(character);

    expect(character).toEqual(before);
  });
});
