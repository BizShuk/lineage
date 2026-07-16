import type { CharacterClass } from './model';
import type { DomainEvent } from './events';
import type { SeededRng } from './rng';

export type DamageRange = readonly [min: number, max: number];

export interface StatusEffect {
  id: string;
  sourceId: string;
  kind: 'buff' | 'debuff' | 'control';
  expiresAt: number;
  power?: number;
}

export interface Combatant {
  id: string;
  hp: number;
  maxHP: number;
  mp?: number;
  maxMP?: number;
  ac: number;
  hitBonus: number;
  damage: DamageRange;
  classId?: CharacterClass;
  level?: number;
  statuses?: readonly StatusEffect[];
  cooldowns?: Readonly<Record<string, number>>;
}

export interface AttackCommand {
  attackerId: string;
  targetId: string;
}

export type AbilityEffect =
  | { type: 'damage'; damage: DamageRange }
  | { type: 'heal'; healing: DamageRange }
  | { type: 'cleanse' }
  | {
      type: 'buff' | 'debuff' | 'control';
      statusId: string;
      durationMs: number;
      power?: number;
    };

export interface AbilityDefinition {
  id: string;
  allowedClasses: readonly CharacterClass[];
  minLevel: number;
  mpCost: number;
  range: number;
  cooldownMs: number;
  requiredItemId?: string | undefined;
  effect: AbilityEffect;
}

export interface AbilityCastContext {
  distance: number;
  nowMs: number;
  availableItemIds: readonly string[];
}

export type AbilityFailureReason =
  | 'class'
  | 'level'
  | 'mp'
  | 'range'
  | 'cooldown'
  | 'required-item';

export interface CombatResult {
  attacker: Combatant;
  target: Combatant;
  events: DomainEvent[];
}

export type AbilityCastResult =
  | {
      ok: true;
      caster: Combatant;
      target: Combatant;
      events: DomainEvent[];
    }
  | {
      ok: false;
      reason: AbilityFailureReason;
      caster: Combatant;
      target: Combatant;
      events: [];
    };

function copyCombatant(combatant: Combatant): Combatant {
  const copy: Combatant = { ...combatant };
  if (combatant.statuses !== undefined) {
    copy.statuses = combatant.statuses.map((status) => ({ ...status }));
  }
  if (combatant.cooldowns !== undefined) {
    copy.cooldowns = { ...combatant.cooldowns };
  }

  return copy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveAttack(
  attacker: Combatant,
  target: Combatant,
  rng: SeededRng,
): CombatResult {
  const nextAttacker = copyCombatant(attacker);
  const nextTarget = copyCombatant(target);
  const hitChance = clamp(50 + attacker.hitBonus + target.ac, 5, 95) / 100;

  if (rng.next() >= hitChance) {
    return {
      attacker: nextAttacker,
      target: nextTarget,
      events: [{ type: 'miss', sourceId: attacker.id, targetId: target.id }],
    };
  }

  const rolledDamage = rng.int(attacker.damage[0], attacker.damage[1]);
  const amount = Math.min(target.hp, rolledDamage);
  nextTarget.hp = Math.max(0, target.hp - rolledDamage);
  const events: DomainEvent[] = [
    { type: 'damage', sourceId: attacker.id, targetId: target.id, amount },
  ];

  if (nextTarget.hp === 0) {
    events.push({ type: 'death', entityId: target.id });
  }

  return { attacker: nextAttacker, target: nextTarget, events };
}

function castFailureReason(
  caster: Combatant,
  ability: AbilityDefinition,
  context: AbilityCastContext,
): AbilityFailureReason | undefined {
  if (
    caster.classId === undefined ||
    !ability.allowedClasses.includes(caster.classId)
  ) {
    return 'class';
  }
  if ((caster.level ?? 0) < ability.minLevel) {
    return 'level';
  }
  if ((caster.mp ?? 0) < ability.mpCost) {
    return 'mp';
  }
  if (
    !Number.isFinite(context.distance) ||
    context.distance < 0 ||
    context.distance > ability.range
  ) {
    return 'range';
  }
  if ((caster.cooldowns?.[ability.id] ?? 0) > context.nowMs) {
    return 'cooldown';
  }
  if (
    ability.requiredItemId !== undefined &&
    !context.availableItemIds.includes(ability.requiredItemId)
  ) {
    return 'required-item';
  }

  return undefined;
}

export function applyAbilityEffect(
  caster: Combatant,
  target: Combatant,
  ability: AbilityDefinition,
  nowMs: number,
  rng: SeededRng,
): { target: Combatant; events: DomainEvent[] } {
  const nextTarget = copyCombatant(target);

  switch (ability.effect.type) {
    case 'damage': {
      const rolledDamage = rng.int(
        ability.effect.damage[0],
        ability.effect.damage[1],
      );
      const amount = Math.min(target.hp, rolledDamage);
      nextTarget.hp = Math.max(0, target.hp - rolledDamage);
      const events: DomainEvent[] = [
        { type: 'damage', sourceId: caster.id, targetId: target.id, amount },
      ];
      if (nextTarget.hp === 0) {
        events.push({ type: 'death', entityId: target.id });
      }
      return { target: nextTarget, events };
    }
    case 'heal': {
      const rolledHealing = rng.int(
        ability.effect.healing[0],
        ability.effect.healing[1],
      );
      nextTarget.hp = Math.min(target.maxHP, target.hp + rolledHealing);
      const amount = nextTarget.hp - target.hp;
      return {
        target: nextTarget,
        events: [{ type: 'heal', sourceId: caster.id, targetId: target.id, amount }],
      };
    }
    case 'cleanse': {
      nextTarget.statuses = (target.statuses ?? []).filter(({ kind }) => kind === 'buff');
      return { target: nextTarget, events: [] };
    }
    case 'buff':
    case 'debuff':
    case 'control': {
      const expiresAt = nowMs + ability.effect.durationMs;
      const status: StatusEffect = {
        id: ability.effect.statusId,
        sourceId: caster.id,
        kind: ability.effect.type,
        expiresAt,
        ...(ability.effect.power === undefined ? {} : { power: ability.effect.power }),
      };
      nextTarget.statuses = [...(target.statuses ?? []), status];
      return {
        target: nextTarget,
        events: [
          {
            type: 'status-applied',
            targetId: target.id,
            statusId: status.id,
            expiresAt,
          },
        ],
      };
    }
  }
}

export function castAbility(
  caster: Combatant,
  target: Combatant,
  ability: AbilityDefinition,
  context: AbilityCastContext,
  rng: SeededRng,
): AbilityCastResult {
  const reason = castFailureReason(caster, ability, context);
  if (reason !== undefined) {
    return { ok: false, reason, caster, target, events: [] };
  }

  const nextCaster = copyCombatant(caster);
  nextCaster.mp = (caster.mp ?? 0) - ability.mpCost;
  nextCaster.cooldowns = {
    ...caster.cooldowns,
    [ability.id]: context.nowMs + ability.cooldownMs,
  };

  const effectTarget = caster.id === target.id ? nextCaster : target;
  const effect = applyAbilityEffect(
    nextCaster,
    effectTarget,
    ability,
    context.nowMs,
    rng,
  );

  if (caster.id === target.id) {
    return {
      ok: true,
      caster: effect.target,
      target: effect.target,
      events: effect.events,
    };
  }

  return {
    ok: true,
    caster: nextCaster,
    target: effect.target,
    events: effect.events,
  };
}
