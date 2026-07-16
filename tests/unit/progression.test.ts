import { describe, expect, it } from 'vitest';

import {
  applyDeathPenalty,
  applyExperience,
  experienceFloorForLevel,
} from '../../src/core/progression';
import { createCharacter } from '../../src/core/stats';

describe('applyExperience', () => {
  it('carries experience across multiple level boundaries and emits each level-up', () => {
    const character = createCharacter('成長測試', 'elf');

    const result = applyExperience(character, 350);

    expect(character).toMatchObject({ level: 1, experience: 0 });
    expect(result.character).toMatchObject({ level: 3, experience: 350 });
    expect(result.events).toEqual([
      { type: 'level-up', entityId: character.id, level: 2 },
      { type: 'level-up', entityId: character.id, level: 3 },
    ]);
  });

  it('never exceeds level 15 or the level-cap experience ceiling', () => {
    const character = createCharacter('封頂測試', 'knight');

    const result = applyExperience(character, Number.MAX_SAFE_INTEGER);

    expect(result.character.level).toBe(15);
    expect(result.character.experience).toBe(experienceFloorForLevel(16) - 1);
  });
});

describe('applyDeathPenalty', () => {
  it('removes 5% of the current level span', () => {
    const character = {
      ...createCharacter('死亡測試', 'wizard'),
      level: 4,
      experience: experienceFloorForLevel(4) + 100,
    };

    const result = applyDeathPenalty(character);

    expect(character.experience).toBe(experienceFloorForLevel(4) + 100);
    expect(result.experience).toBe(experienceFloorForLevel(4) + 80);
  });

  it("does not reduce experience below the current level's floor", () => {
    const floor = experienceFloorForLevel(7);
    const character = {
      ...createCharacter('保級測試', 'prince'),
      level: 7,
      experience: floor + 10,
    };

    const result = applyDeathPenalty(character);

    expect(result.level).toBe(7);
    expect(result.experience).toBe(floor);
  });
});
