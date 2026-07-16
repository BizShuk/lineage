import type { DomainEvent } from './events';

const MIN_LEVEL = 1;
const MAX_LEVEL = 15;

export interface ProgressionState {
  id: string;
  level: number;
  experience: number;
}

export interface ProgressionResult<T extends ProgressionState> {
  character: T;
  events: DomainEvent[];
}

export function experienceFloorForLevel(level: number): number {
  const normalizedLevel = Math.max(MIN_LEVEL, Math.trunc(level));

  return (50 * (normalizedLevel - 1) * normalizedLevel);
}

function normalizedLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return MIN_LEVEL;
  }

  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.trunc(level)));
}

function assertExperienceAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('Experience amount must be a non-negative safe integer');
  }
}

export function applyExperience<T extends ProgressionState>(
  character: T,
  amount: number,
): ProgressionResult<T> {
  assertExperienceAmount(amount);
  const startLevel = normalizedLevel(character.level);
  const levelFloor = experienceFloorForLevel(startLevel);
  const currentExperience = Math.max(levelFloor, character.experience);
  const cap = experienceFloorForLevel(MAX_LEVEL + 1) - 1;
  const room = Math.max(0, cap - currentExperience);
  const experience = currentExperience + Math.min(room, amount);
  let level = startLevel;
  const events: DomainEvent[] = [];

  while (
    level < MAX_LEVEL &&
    experience >= experienceFloorForLevel(level + 1)
  ) {
    level += 1;
    events.push({ type: 'level-up', entityId: character.id, level });
  }

  return {
    character: { ...character, level, experience },
    events,
  };
}

export function applyDeathPenalty<T extends ProgressionState>(character: T): T {
  const level = normalizedLevel(character.level);
  const floor = experienceFloorForLevel(level);
  const span = experienceFloorForLevel(level + 1) - floor;
  const penalty = span * 0.05;

  return {
    ...character,
    level,
    experience: Math.max(floor, character.experience - penalty),
  };
}
