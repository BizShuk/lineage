import { describe, expect, it } from 'vitest';

import {
  castAbility,
  resolveAttack,
  type AbilityDefinition,
  type Combatant,
} from '../../src/core/combat';
import { SeededRng } from '../../src/core/rng';

function abilityCaster(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'hero',
    hp: 30,
    maxHP: 30,
    mp: 20,
    maxMP: 20,
    ac: 5,
    hitBonus: 10,
    damage: [2, 4],
    classId: 'wizard',
    level: 5,
    statuses: [],
    cooldowns: {},
    ...overrides,
  };
}

function target(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'goblin',
    hp: 12,
    maxHP: 12,
    ac: 10,
    hitBonus: 0,
    damage: [1, 1],
    statuses: [],
    cooldowns: {},
    ...overrides,
  };
}

const fireBolt: AbilityDefinition = {
  id: 'fire-bolt',
  allowedClasses: ['wizard'],
  minLevel: 3,
  mpCost: 4,
  range: 6,
  cooldownMs: 1_000,
  requiredItemId: 'magic-gem',
  effect: { type: 'damage', damage: [5, 5] },
};

describe('resolveAttack', () => {
  it('emits damage and death without mutating inputs', () => {
    const attacker: Combatant = {
      id: 'hero',
      hp: 30,
      maxHP: 30,
      ac: 5,
      hitBonus: 20,
      damage: [4, 4],
    };
    const defender: Combatant = {
      id: 'goblin',
      hp: 4,
      maxHP: 4,
      ac: 10,
      hitBonus: 0,
      damage: [1, 1],
    };

    const result = resolveAttack(attacker, defender, new SeededRng(7));

    expect(attacker.hp).toBe(30);
    expect(defender.hp).toBe(4);
    expect(result.attacker).not.toBe(attacker);
    expect(result.target.hp).toBe(0);
    expect(result.events.map((event) => event.type)).toEqual(['damage', 'death']);
  });

  it('clamps hit chance to 5% and emits a deterministic miss', () => {
    const attacker = abilityCaster({ hitBonus: -1_000 });
    const defender = target({ ac: -100 });

    const result = resolveAttack(attacker, defender, new SeededRng(0));

    expect(result.target.hp).toBe(defender.hp);
    expect(result.events).toEqual([
      { type: 'miss', sourceId: attacker.id, targetId: defender.id },
    ]);
  });

  it('clamps hit chance to 95% so every attack retains a miss chance', () => {
    const attacker = abilityCaster({ hitBonus: 1_000 });
    const defender = target({ ac: 100 });

    const result = resolveAttack(attacker, defender, new SeededRng(36));

    expect(result.events).toEqual([
      { type: 'miss', sourceId: attacker.id, targetId: defender.id },
    ]);
  });

  it('rolls weapon damage inside the inclusive range', () => {
    const attacker = abilityCaster({ hitBonus: 1_000, damage: [2, 4] });

    const result = resolveAttack(attacker, target(), new SeededRng(7));
    const damage = result.events.find((event) => event.type === 'damage');

    expect(damage).toBeDefined();
    expect(damage?.type === 'damage' ? damage.amount : 0).toBeGreaterThanOrEqual(2);
    expect(damage?.type === 'damage' ? damage.amount : 0).toBeLessThanOrEqual(4);
  });
});

describe('castAbility', () => {
  it.each([
    ['class', abilityCaster({ classId: 'knight' }), fireBolt, 2, 1_000, ['magic-gem']],
    ['level', abilityCaster({ level: 2 }), fireBolt, 2, 1_000, ['magic-gem']],
    ['mp', abilityCaster({ mp: 3 }), fireBolt, 2, 1_000, ['magic-gem']],
    ['range', abilityCaster(), fireBolt, 7, 1_000, ['magic-gem']],
    [
      'cooldown',
      abilityCaster({ cooldowns: { 'fire-bolt': 1_001 } }),
      fireBolt,
      2,
      1_000,
      ['magic-gem'],
    ],
    ['required-item', abilityCaster(), fireBolt, 2, 1_000, []],
  ] as const)(
    'rejects casting when the %s requirement fails',
    (reason, caster, ability, distance, nowMs, availableItemIds) => {
      const defender = target();

      const result = castAbility(
        caster,
        defender,
        ability,
        { distance, nowMs, availableItemIds },
        new SeededRng(1),
      );

      expect(result).toMatchObject({ ok: false, reason, caster, target: defender, events: [] });
    },
  );

  it('spends MP, starts a simulation-time cooldown, and applies damage', () => {
    const caster = abilityCaster();
    const defender = target();

    const result = castAbility(
      caster,
      defender,
      fireBolt,
      { distance: 4, nowMs: 5_000, availableItemIds: ['magic-gem'] },
      new SeededRng(3),
    );

    expect(result.ok).toBe(true);
    expect(caster.mp).toBe(20);
    expect(defender.hp).toBe(12);
    expect(result.caster.mp).toBe(16);
    expect(result.caster.cooldowns).toEqual({ 'fire-bolt': 6_000 });
    expect(result.target.hp).toBe(7);
    expect(result.events).toEqual([
      { type: 'damage', sourceId: 'hero', targetId: 'goblin', amount: 5 },
    ]);
  });

  it('heals no higher than max HP', () => {
    const heal: AbilityDefinition = {
      ...fireBolt,
      id: 'heal',
      requiredItemId: undefined,
      effect: { type: 'heal', healing: [5, 5] },
    };
    const wounded = abilityCaster({ hp: 28 });

    const result = castAbility(
      wounded,
      wounded,
      heal,
      { distance: 0, nowMs: 500, availableItemIds: [] },
      new SeededRng(2),
    );

    expect(result.target.hp).toBe(30);
    expect(result.events).toEqual([
      { type: 'heal', sourceId: 'hero', targetId: 'hero', amount: 2 },
    ]);
  });

  it.each(['buff', 'debuff', 'control'] as const)(
    'applies a %s until simulation time reaches its duration',
    (type) => {
      const ability: AbilityDefinition = {
        ...fireBolt,
        id: `${type}-spell`,
        requiredItemId: undefined,
        effect: { type, statusId: `${type}-status`, durationMs: 2_500, power: 3 },
      };
      const caster = abilityCaster();
      const recipient = type === 'buff' ? caster : target();

      const result = castAbility(
        caster,
        recipient,
        ability,
        { distance: 1, nowMs: 10_000, availableItemIds: [] },
        new SeededRng(4),
      );

      expect(result.target.statuses).toContainEqual({
        id: `${type}-status`,
        sourceId: 'hero',
        kind: type,
        expiresAt: 12_500,
        power: 3,
      });
      expect(result.events).toContainEqual({
        type: 'status-applied',
        targetId: recipient.id,
        statusId: `${type}-status`,
        expiresAt: 12_500,
      });
    },
  );

  it('cleanses negative statuses without removing active buffs', () => {
    const cleanse: AbilityDefinition = {
      ...fireBolt,
      id: 'cure-poison',
      requiredItemId: undefined,
      effect: { type: 'cleanse' },
    };
    const poisoned = abilityCaster({
      statuses: [
        { id: 'shield', sourceId: 'hero', kind: 'buff', expiresAt: 5_000, power: 2 },
        { id: 'poison', sourceId: 'spider', kind: 'debuff', expiresAt: 5_000, power: 1 },
        { id: 'blind', sourceId: 'wizard', kind: 'control', expiresAt: 5_000, power: 3 },
      ],
    });

    const result = castAbility(
      poisoned,
      poisoned,
      cleanse,
      { distance: 0, nowMs: 1_000, availableItemIds: [] },
      new SeededRng(5),
    );

    expect(result.ok).toBe(true);
    expect(result.target.statuses).toEqual([
      { id: 'shield', sourceId: 'hero', kind: 'buff', expiresAt: 5_000, power: 2 },
    ]);
    expect(result.events).toEqual([]);
  });
});
