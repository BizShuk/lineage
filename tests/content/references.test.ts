import { describe, expect, it } from 'vitest';

import { loadBundledContent } from '../../src/content/loadContent';

describe('bundled content references', () => {
  it('places the first training goblins inside the initial world viewport', () => {
    const content = loadBundledContent();
    const training = content.map('scarecrow-field');
    const goblins = training.spawns.find(({ monsterId }) => monsterId === 'goblin');

    expect(goblins, 'scarecrow-field goblin spawn').toBeDefined();
    if (goblins === undefined) return;

    const viewportWidthInTiles = 640 / 16;
    const worldViewportHeightInTiles = 384 / 16;
    expect(Math.abs(goblins.x - training.entry.x)).toBeLessThan(viewportWidthInTiles / 2);
    expect(goblins.y).toBeGreaterThan(training.entry.y);
    expect(goblins.y).toBeLessThan(training.entry.y + worldViewportHeightInTiles);
    expect(goblins.count, 'only one readable first-frame training target').toBe(1);
  });

  it('keeps the trainer route outside the first goblin patrol and alert envelope', () => {
    const content = loadBundledContent();
    const training = content.map('scarecrow-field');
    const goblin = training.spawns.find(({ monsterId }) => monsterId === 'goblin');
    const instructor = content.npc('scarecrow-instructor');

    expect(goblin, 'scarecrow-field goblin spawn').toBeDefined();
    if (goblin === undefined) return;

    const chebyshevDistance = Math.max(
      Math.abs(goblin.x - instructor.x),
      Math.abs(goblin.y - instructor.y),
    );
    expect(chebyshevDistance, 'patrol radius 3 plus alert radius 5').toBeGreaterThan(8);
  });

  it('has no duplicate IDs in any catalog', () => {
    const content = loadBundledContent();

    for (const definitions of [
      content.classes,
      content.items,
      content.abilities,
      content.monsters,
      content.npcs,
      content.quests,
      content.maps,
    ]) {
      const ids = definitions.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('resolves every class, item, ability, monster, NPC, quest, map exit, and spawn reference', () => {
    const content = loadBundledContent();
    const classIds = new Set(content.classes.map(({ id }) => id));
    const itemIds = new Set(content.items.map(({ id }) => id));
    const abilityIds = new Set(content.abilities.map(({ id }) => id));
    const monsterIds = new Set(content.monsters.map(({ id }) => id));
    const npcIds = new Set(content.npcs.map(({ id }) => id));
    const questIds = new Set(content.quests.map(({ id }) => id));
    const mapIds = new Set(content.maps.map(({ id }) => id));

    for (const characterClass of content.classes) {
      for (const id of characterClass.startingItemIds) {
        expect(itemIds.has(id)).toBe(true);
      }
      for (const id of characterClass.abilityIds) {
        expect(abilityIds.has(id)).toBe(true);
      }
    }

    for (const item of content.items) {
      for (const id of item.allowedClasses) {
        expect(classIds.has(id)).toBe(true);
      }
      if (item.grantsAbilityId !== undefined) {
        expect(abilityIds.has(item.grantsAbilityId)).toBe(true);
      }
    }

    for (const ability of content.abilities) {
      for (const id of ability.allowedClasses) {
        expect(classIds.has(id)).toBe(true);
      }
      if (ability.reagentItemId !== undefined) {
        expect(itemIds.has(ability.reagentItemId)).toBe(true);
      }
    }

    for (const monster of content.monsters) {
      for (const id of monster.abilityIds) {
        expect(abilityIds.has(id)).toBe(true);
      }
      for (const { itemId } of monster.drops) {
        expect(itemIds.has(itemId)).toBe(true);
      }
    }

    for (const npc of content.npcs) {
      expect(mapIds.has(npc.mapId)).toBe(true);
      for (const id of npc.shopItemIds) {
        expect(itemIds.has(id)).toBe(true);
      }
      for (const id of npc.questIds) {
        expect(questIds.has(id)).toBe(true);
      }
      for (const id of npc.taughtAbilityIds) {
        expect(abilityIds.has(id)).toBe(true);
      }
    }

    for (const quest of content.quests) {
      expect(npcIds.has(quest.giverNpcId)).toBe(true);
      for (const id of quest.allowedClasses) {
        expect(classIds.has(id)).toBe(true);
      }
      for (const id of quest.prerequisiteQuestIds) {
        expect(questIds.has(id)).toBe(true);
      }
      for (const { itemId } of quest.rewards.itemRewards) {
        expect(itemIds.has(itemId)).toBe(true);
      }
      for (const id of quest.rewards.abilityIds) {
        expect(abilityIds.has(id)).toBe(true);
      }

      for (const objective of quest.objectives) {
        if (objective.type === 'kill' || objective.type === 'defeat') {
          expect(monsterIds.has(objective.monsterId)).toBe(true);
        } else if (objective.type === 'collect') {
          expect(itemIds.has(objective.itemId)).toBe(true);
        } else if (objective.type === 'talk') {
          expect(npcIds.has(objective.npcId)).toBe(true);
        } else {
          expect(mapIds.has(objective.mapId)).toBe(true);
        }
      }
    }

    for (const map of content.maps) {
      for (const id of map.npcIds) {
        expect(npcIds.has(id)).toBe(true);
      }
      for (const { targetMapId } of map.exits) {
        expect(mapIds.has(targetMapId)).toBe(true);
      }
      for (const { monsterId } of map.spawns) {
        expect(monsterIds.has(monsterId)).toBe(true);
      }
    }
  });
});
