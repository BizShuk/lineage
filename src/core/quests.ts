import {
  addItem,
  type InventoryState,
  type ItemDefinition,
} from './inventory';
import type { CharacterClass } from './model';

export type QuestObjective =
  | { readonly type: 'kill'; readonly monsterId: string; readonly count: number }
  | { readonly type: 'defeat'; readonly monsterId: string; readonly count: 1 }
  | { readonly type: 'collect'; readonly itemId: string; readonly count: number }
  | { readonly type: 'talk'; readonly npcId: string; readonly count: 1 }
  | { readonly type: 'reach'; readonly mapId: string; readonly count: 1 };

export type QuestSignal =
  | { readonly type: 'npc-talked'; readonly npcId: string }
  | {
      readonly type: 'monster-defeated';
      readonly monsterId: string;
      readonly count: number;
    }
  | { readonly type: 'item-acquired'; readonly itemId: string; readonly count: number }
  | { readonly type: 'area-entered'; readonly mapId: string }
  | { readonly type: 'boss-defeated'; readonly monsterId: 'baphomet' };

export interface QuestReward {
  readonly experience: number;
  readonly adena: number;
  readonly itemRewards: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly abilityIds: readonly string[];
}

export interface QuestStageDefinition {
  readonly id: string;
  readonly objectives: readonly QuestObjective[];
}

export interface QuestDefinition {
  readonly id: string;
  readonly allowedClasses: readonly CharacterClass[];
  readonly prerequisiteQuestIds: readonly string[];
  readonly objectives: readonly QuestObjective[];
  readonly rewards: QuestReward;
  readonly stages?: readonly QuestStageDefinition[];
}

export type QuestCatalog = Readonly<Record<string, QuestDefinition>>;

export interface ActiveQuestState {
  readonly stage: string;
  readonly counters: Readonly<Record<string, number>>;
}

export interface QuestState {
  readonly active: Readonly<Record<string, ActiveQuestState>>;
  readonly completed: readonly string[];
  readonly claimedRewards: readonly string[];
}

export interface DialogueChoice {
  readonly id: string;
  readonly text: string;
  readonly nextNodeId?: string;
  readonly signal?: QuestSignal;
}

export interface DialogueNode {
  readonly id: string;
  readonly text: string;
  readonly choices: readonly DialogueChoice[];
}

export type DialogueChoiceResult =
  | {
      readonly ok: true;
      readonly choice: DialogueChoice;
      readonly nextNodeId?: string;
    }
  | {
      readonly ok: false;
      readonly node: DialogueNode;
      readonly reason: 'unknown-choice';
    };

export interface QuestRewardTarget {
  readonly inventory: InventoryState;
  readonly experience: number;
  readonly abilityIds: readonly string[];
}

export type ClaimRewardResult =
  | {
      readonly ok: true;
      readonly granted: boolean;
      readonly state: QuestState;
      readonly target: QuestRewardTarget;
    }
  | {
      readonly ok: false;
      readonly state: QuestState;
      readonly target: QuestRewardTarget;
      readonly reason: 'not-completed' | 'reward-unavailable' | 'inventory-full';
    };

const EMPTY_REWARD: QuestReward = {
  experience: 0,
  adena: 0,
  itemRewards: [],
  abilityIds: [],
};

const BLACK_KNIGHT_OBJECTIVES = [
  { type: 'kill', monsterId: 'black-knight', count: 5 },
  { type: 'talk', npcId: 'guard-captain', count: 1 },
] as const satisfies readonly QuestObjective[];

const BUILT_IN_QUESTS: QuestCatalog = {
  'black-knight-assault': {
    id: 'black-knight-assault',
    allowedClasses: ['prince', 'knight', 'elf', 'wizard'],
    prerequisiteQuestIds: [],
    objectives: BLACK_KNIGHT_OBJECTIVES,
    stages: [
      { id: 'defeat-patrol', objectives: [BLACK_KNIGHT_OBJECTIVES[0]] },
      {
        id: 'report-to-guard-captain',
        objectives: [BLACK_KNIGHT_OBJECTIVES[1]],
      },
    ],
    rewards: EMPTY_REWARD,
  },
};

export function createQuestState(): QuestState {
  return { active: {}, completed: [], claimedRewards: [] };
}

function stagesOf(definition: QuestDefinition): readonly QuestStageDefinition[] {
  return definition.stages ?? [{ id: 'in-progress', objectives: definition.objectives }];
}

export function startQuest(
  state: QuestState,
  questId: string,
  characterClass?: CharacterClass,
  catalog: QuestCatalog = BUILT_IN_QUESTS,
): QuestState {
  const definition = catalog[questId];
  if (
    definition === undefined ||
    state.active[questId] !== undefined ||
    state.completed.includes(questId) ||
    (characterClass !== undefined && !definition.allowedClasses.includes(characterClass)) ||
    !definition.prerequisiteQuestIds.every((id) => state.completed.includes(id))
  ) {
    return state;
  }

  const firstStage = stagesOf(definition)[0];
  if (firstStage === undefined || firstStage.objectives.length === 0) {
    return state;
  }

  return {
    ...state,
    active: {
      ...state.active,
      [questId]: { stage: firstStage.id, counters: {} },
    },
  };
}

function positiveSignalCount(signal: QuestSignal): number | undefined {
  if (signal.type !== 'monster-defeated' && signal.type !== 'item-acquired') {
    return 1;
  }
  return Number.isSafeInteger(signal.count) && signal.count > 0 ? signal.count : undefined;
}

function signalIncrement(objective: QuestObjective, signal: QuestSignal): number | undefined {
  const count = positiveSignalCount(signal);
  if (count === undefined) return undefined;

  if (
    objective.type === 'kill' &&
    signal.type === 'monster-defeated' &&
    objective.monsterId === signal.monsterId
  ) {
    return count;
  }
  if (
    objective.type === 'defeat' &&
    ((signal.type === 'monster-defeated' && objective.monsterId === signal.monsterId) ||
      (signal.type === 'boss-defeated' && objective.monsterId === signal.monsterId))
  ) {
    return count;
  }
  if (
    objective.type === 'collect' &&
    signal.type === 'item-acquired' &&
    objective.itemId === signal.itemId
  ) {
    return count;
  }
  if (
    objective.type === 'talk' &&
    signal.type === 'npc-talked' &&
    objective.npcId === signal.npcId
  ) {
    return count;
  }
  if (
    objective.type === 'reach' &&
    signal.type === 'area-entered' &&
    objective.mapId === signal.mapId
  ) {
    return count;
  }
  return undefined;
}

function counterKey(stage: QuestStageDefinition, objectiveIndex: number): string {
  return `${stage.id}:${String(objectiveIndex)}`;
}

function objectiveTarget(objective: QuestObjective): number {
  return objective.count;
}

export function advanceQuest(
  state: QuestState,
  signal: QuestSignal,
  catalog: QuestCatalog = BUILT_IN_QUESTS,
): QuestState {
  let active: Readonly<Record<string, ActiveQuestState>> = state.active;
  let completed = state.completed;
  let changed = false;

  for (const [questId, progress] of Object.entries(state.active)) {
    const definition = catalog[questId];
    if (definition === undefined) continue;

    const stages = stagesOf(definition);
    const stageIndex = stages.findIndex(({ id }) => id === progress.stage);
    const stage = stages[stageIndex];
    if (stage === undefined) continue;

    let counters = progress.counters;
    let stageChanged = false;
    for (const [objectiveIndex, objective] of stage.objectives.entries()) {
      const increment = signalIncrement(objective, signal);
      if (increment === undefined) continue;

      const key = counterKey(stage, objectiveIndex);
      const current = counters[key] ?? 0;
      const next = Math.min(objectiveTarget(objective), current + increment);
      if (next === current) continue;

      counters = { ...counters, [key]: next };
      stageChanged = true;
    }

    if (!stageChanged) continue;

    const isStageComplete = stage.objectives.every(
      (objective, objectiveIndex) =>
        (counters[counterKey(stage, objectiveIndex)] ?? 0) >= objectiveTarget(objective),
    );
    if (!isStageComplete) {
      active = { ...active, [questId]: { ...progress, counters } };
    } else {
      const nextStage = stages[stageIndex + 1];
      if (nextStage === undefined) {
        const { [questId]: _completedQuest, ...remaining } = active;
        void _completedQuest;
        active = remaining;
        completed = completed.includes(questId) ? completed : [...completed, questId];
      } else {
        active = { ...active, [questId]: { stage: nextStage.id, counters } };
      }
    }
    changed = true;
  }

  return changed ? { ...state, active, completed } : state;
}

export function chooseDialogue(node: DialogueNode, choiceId: string): DialogueChoiceResult {
  const choice = node.choices.find(({ id }) => id === choiceId);
  if (choice === undefined) {
    return { ok: false, node, reason: 'unknown-choice' };
  }
  return choice.nextNodeId === undefined
    ? { ok: true, choice }
    : { ok: true, choice, nextNodeId: choice.nextNodeId };
}

function failedClaim(
  state: QuestState,
  target: QuestRewardTarget,
  reason: Extract<ClaimRewardResult, { ok: false }>['reason'],
): ClaimRewardResult {
  return { ok: false, state, target, reason };
}

export function claimReward(
  state: QuestState,
  questId: string,
  target: QuestRewardTarget,
  catalog: QuestCatalog = BUILT_IN_QUESTS,
  items: Readonly<Record<string, ItemDefinition>> = {},
): ClaimRewardResult {
  if (state.claimedRewards.includes(questId)) {
    return { ok: true, granted: false, state, target };
  }
  if (!state.completed.includes(questId)) {
    return failedClaim(state, target, 'not-completed');
  }

  const definition = catalog[questId];
  if (definition === undefined) {
    return failedClaim(state, target, 'reward-unavailable');
  }

  let inventory = target.inventory;
  for (const itemReward of definition.rewards.itemRewards) {
    const item = items[itemReward.itemId];
    if (item === undefined) {
      return failedClaim(state, target, 'reward-unavailable');
    }
    const added = addItem(inventory, item, itemReward.quantity);
    if (!added.ok) {
      return failedClaim(state, target, 'inventory-full');
    }
    inventory = added.inventory;
  }

  const adena = inventory.adena + definition.rewards.adena;
  const experience = target.experience + definition.rewards.experience;
  if (!Number.isSafeInteger(adena) || !Number.isSafeInteger(experience)) {
    return failedClaim(state, target, 'reward-unavailable');
  }

  const abilityIds = [...target.abilityIds];
  for (const abilityId of definition.rewards.abilityIds) {
    if (!abilityIds.includes(abilityId)) abilityIds.push(abilityId);
  }

  return {
    ok: true,
    granted: true,
    state: {
      ...state,
      claimedRewards: [...state.claimedRewards, questId],
    },
    target: {
      inventory: { ...inventory, adena },
      experience,
      abilityIds,
    },
  };
}

export function canSellItem(item: Pick<ItemDefinition, 'kind'>): boolean {
  return item.kind !== 'quest';
}

export function isEndingUnlocked(
  flags: Readonly<{ baphometDefeated?: boolean; finalReportComplete?: boolean }>,
): boolean {
  return flags.baphometDefeated === true && flags.finalReportComplete === true;
}
