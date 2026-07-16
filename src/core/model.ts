export type CharacterClass = 'prince' | 'knight' | 'elf' | 'wizard';

export interface Attributes {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface CharacterState {
  id: string;
  name: string;
  classId: CharacterClass;
  level: number;
  experience: number;
  attributes: Attributes;
  hp: number;
  mp: number;
  alignment: number;
  carriedWeight: number;
  equipmentAC: number;
}

export interface DerivedStats {
  maxHP: number;
  maxMP: number;
  ac: number;
  hitBonus: number;
  damageBonus: number;
  spellPower: number;
  weightLimit: number;
}
