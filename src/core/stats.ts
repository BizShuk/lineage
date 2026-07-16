import type {
  Attributes,
  CharacterClass,
  CharacterState,
  DerivedStats,
} from './model';

const CLASS_ATTRIBUTES: Readonly<Record<CharacterClass, Readonly<Attributes>>> =
  Object.freeze({
    prince: Object.freeze({ str: 13, dex: 10, con: 10, int: 10, wis: 11, cha: 13 }),
    knight: Object.freeze({ str: 16, dex: 12, con: 14, int: 8, wis: 9, cha: 8 }),
    elf: Object.freeze({ str: 11, dex: 12, con: 12, int: 12, wis: 12, cha: 9 }),
    wizard: Object.freeze({ str: 8, dex: 7, con: 12, int: 16, wis: 16, cha: 8 }),
  });

const MIN_LEVEL = 1;
const MAX_LEVEL = 15;

function clampLevel(level: number): number {
  if (Number.isNaN(level)) {
    return MIN_LEVEL;
  }

  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.trunc(level)));
}

export function deriveStats(character: CharacterState): DerivedStats {
  const level = clampLevel(character.level);
  const { str, dex, con, int, wis } = character.attributes;

  return {
    maxHP: 10 + con * 2 + level * 4,
    maxMP: int + wis + level * 2,
    ac: 10 - Math.floor(dex / 3) + character.equipmentAC,
    hitBonus: Math.floor((str + dex) / 4) + level,
    damageBonus: Math.floor(str / 3),
    spellPower: Math.floor((int + wis) / 4) + level,
    weightLimit: 100 + str * 10 + con * 5,
  };
}

export function createCharacter(name: string, classId: CharacterClass): CharacterState {
  const character: CharacterState = {
    id: `${classId}:${name}`,
    name,
    classId,
    level: MIN_LEVEL,
    experience: 0,
    attributes: { ...CLASS_ATTRIBUTES[classId] },
    hp: 0,
    mp: 0,
    alignment: 0,
    carriedWeight: 0,
    equipmentAC: 0,
  };
  const { maxHP, maxMP } = deriveStats(character);

  return { ...character, hp: maxHP, mp: maxMP };
}
