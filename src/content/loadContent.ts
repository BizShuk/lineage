import abilities from './data/abilities.json';
import classes from './data/classes.json';
import items from './data/items.json';
import maps from './data/maps.json';
import monsters from './data/monsters.json';
import npcs from './data/npcs.json';
import quests from './data/quests.json';
import { createGameContent, type GameContent } from './catalog';
import { ContentLoadError, gameContentSchema, type ParsedGameContent } from './schema';

type Definition = { id: string };

const idsOf = (definitions: readonly Definition[]): Set<string> =>
  new Set(definitions.map(({ id }) => id));

const findDuplicates = (label: string, definitions: readonly Definition[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of definitions) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return [...duplicates].map((id) => `${label}含有重複 ID：${id}`);
};

const requireReference = (
  issues: string[],
  ids: ReadonlySet<string>,
  owner: string,
  field: string,
  id: string,
): void => {
  if (!ids.has(id)) {
    issues.push(`${owner}.${field} 參照不存在的 ID：${id}`);
  }
};

const validateReferences = (content: ParsedGameContent): string[] => {
  const issues = [
    ...findDuplicates('classes', content.classes),
    ...findDuplicates('items', content.items),
    ...findDuplicates('abilities', content.abilities),
    ...findDuplicates('monsters', content.monsters),
    ...findDuplicates('npcs', content.npcs),
    ...findDuplicates('quests', content.quests),
    ...findDuplicates('maps', content.maps),
  ];
  const classIds = idsOf(content.classes);
  const itemIds = idsOf(content.items);
  const abilityIds = idsOf(content.abilities);
  const monsterIds = idsOf(content.monsters);
  const npcIds = idsOf(content.npcs);
  const questIds = idsOf(content.quests);
  const mapIds = idsOf(content.maps);

  for (const definition of content.classes) {
    for (const id of definition.startingItemIds) {
      requireReference(issues, itemIds, `class:${definition.id}`, 'startingItemIds', id);
    }
    for (const id of definition.abilityIds) {
      requireReference(issues, abilityIds, `class:${definition.id}`, 'abilityIds', id);
    }
  }

  for (const definition of content.items) {
    for (const id of definition.allowedClasses) {
      requireReference(issues, classIds, `item:${definition.id}`, 'allowedClasses', id);
    }
    if (definition.grantsAbilityId !== undefined) {
      requireReference(
        issues,
        abilityIds,
        `item:${definition.id}`,
        'grantsAbilityId',
        definition.grantsAbilityId,
      );
    }
  }

  for (const definition of content.abilities) {
    for (const id of definition.allowedClasses) {
      requireReference(issues, classIds, `ability:${definition.id}`, 'allowedClasses', id);
    }
    if (definition.reagentItemId !== undefined) {
      requireReference(
        issues,
        itemIds,
        `ability:${definition.id}`,
        'reagentItemId',
        definition.reagentItemId,
      );
    }
  }

  for (const definition of content.monsters) {
    for (const id of definition.abilityIds) {
      requireReference(issues, abilityIds, `monster:${definition.id}`, 'abilityIds', id);
    }
    for (const { itemId } of definition.drops) {
      requireReference(issues, itemIds, `monster:${definition.id}`, 'drops', itemId);
    }
  }

  for (const definition of content.npcs) {
    requireReference(issues, mapIds, `npc:${definition.id}`, 'mapId', definition.mapId);
    for (const id of definition.shopItemIds) {
      requireReference(issues, itemIds, `npc:${definition.id}`, 'shopItemIds', id);
    }
    for (const id of definition.questIds) {
      requireReference(issues, questIds, `npc:${definition.id}`, 'questIds', id);
    }
    for (const id of definition.taughtAbilityIds) {
      requireReference(issues, abilityIds, `npc:${definition.id}`, 'taughtAbilityIds', id);
    }
  }

  for (const definition of content.quests) {
    requireReference(issues, npcIds, `quest:${definition.id}`, 'giverNpcId', definition.giverNpcId);
    for (const id of definition.allowedClasses) {
      requireReference(issues, classIds, `quest:${definition.id}`, 'allowedClasses', id);
    }
    for (const id of definition.prerequisiteQuestIds) {
      requireReference(issues, questIds, `quest:${definition.id}`, 'prerequisiteQuestIds', id);
    }
    for (const { itemId } of definition.rewards.itemRewards) {
      requireReference(issues, itemIds, `quest:${definition.id}`, 'rewards.itemRewards', itemId);
    }
    for (const id of definition.rewards.abilityIds) {
      requireReference(issues, abilityIds, `quest:${definition.id}`, 'rewards.abilityIds', id);
    }
    for (const objective of definition.objectives) {
      if (objective.type === 'kill' || objective.type === 'defeat') {
        requireReference(
          issues,
          monsterIds,
          `quest:${definition.id}`,
          'objectives.monsterId',
          objective.monsterId,
        );
      } else if (objective.type === 'collect') {
        requireReference(
          issues,
          itemIds,
          `quest:${definition.id}`,
          'objectives.itemId',
          objective.itemId,
        );
      } else if (objective.type === 'talk') {
        requireReference(
          issues,
          npcIds,
          `quest:${definition.id}`,
          'objectives.npcId',
          objective.npcId,
        );
      } else {
        requireReference(
          issues,
          mapIds,
          `quest:${definition.id}`,
          'objectives.mapId',
          objective.mapId,
        );
      }
    }
  }

  const mapById = new Map(content.maps.map((definition) => [definition.id, definition]));
  for (const definition of content.maps) {
    for (const id of definition.npcIds) {
      requireReference(issues, npcIds, `map:${definition.id}`, 'npcIds', id);
    }
    for (const { targetMapId } of definition.exits) {
      requireReference(issues, mapIds, `map:${definition.id}`, 'exits.targetMapId', targetMapId);
    }
    for (const { monsterId } of definition.spawns) {
      requireReference(issues, monsterIds, `map:${definition.id}`, 'spawns.monsterId', monsterId);
    }
  }

  for (const npc of content.npcs) {
    const map = mapById.get(npc.mapId);
    if (map !== undefined && !map.npcIds.includes(npc.id)) {
      issues.push(`npc:${npc.id}.mapId 指向 ${npc.mapId}，但該地圖未列出此 NPC`);
    }
  }

  return issues;
};

const formatSchemaIssue = (issue: { path: PropertyKey[]; message: string }): string => {
  const path = issue.path.length === 0 ? 'root' : issue.path.join('.');
  return `${path}：${issue.message}`;
};

export const loadContent = (raw: unknown): GameContent => {
  const result = gameContentSchema.safeParse(raw);
  if (!result.success) {
    throw new ContentLoadError(result.error.issues.map(formatSchemaIssue));
  }

  const referenceIssues = validateReferences(result.data);
  if (referenceIssues.length > 0) {
    throw new ContentLoadError(referenceIssues);
  }
  return createGameContent(result.data);
};

const bundledRawContent: unknown = { classes, items, abilities, monsters, npcs, quests, maps };

export const loadBundledContent = (): GameContent => loadContent(bundledRawContent);

export type { GameContent } from './catalog';
