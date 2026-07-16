import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { deriveStats } from '../../src/core/stats';
import type { GameSessionSnapshot } from '../../src/game/systems/GameSession';
import { TileGrid, type GridPoint, type GridRectangle } from '../../src/world/grid';
import { findPath } from '../../src/world/pathfinding';

interface MapAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly collisionLayer: { readonly blockedRectangles: readonly GridRectangle[] };
}

interface MapDefinition {
  readonly id: string;
  readonly exits: readonly {
    readonly x: number;
    readonly y: number;
    readonly targetMapId: string;
    readonly targetX: number;
    readonly targetY: number;
  }[];
}

interface NpcDefinition extends GridPoint {
  readonly id: string;
  readonly mapId: string;
  readonly role: string;
}

interface ItemDefinition {
  readonly id: string;
  readonly buyPrice: number;
  readonly healAmount?: number;
}

const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as unknown;

const mapAssets = [
  readJson('../../public/assets/maps/village.map.json') as MapAsset,
  readJson('../../public/assets/maps/scarecrow-field.map.json') as MapAsset,
  readJson('../../public/assets/maps/north-field.map.json') as MapAsset,
  readJson('../../public/assets/maps/coast.map.json') as MapAsset,
  readJson('../../public/assets/maps/black-knight-area.map.json') as MapAsset,
  readJson('../../public/assets/maps/dungeon-floor-1.map.json') as MapAsset,
  readJson('../../public/assets/maps/dungeon-floor-2.map.json') as MapAsset,
] as readonly MapAsset[];

const mapDefinitions = readJson('../../src/content/data/maps.json') as readonly MapDefinition[];
const npcDefinitions = readJson('../../src/content/data/npcs.json') as readonly NpcDefinition[];
const itemDefinitions = readJson('../../src/content/data/items.json') as readonly ItemDefinition[];
const required = <T extends { readonly id: string }>(
  definitions: readonly T[],
  id: string,
  kind: string,
): T => {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new Error(`missing ${kind}: ${id}`);
  return definition;
};

const content = {
  maps: mapDefinitions,
  npcs: npcDefinitions,
  map: (id: string): MapDefinition => required(mapDefinitions, id, 'map'),
  npc: (id: string): NpcDefinition => required(npcDefinitions, id, 'npc'),
  item: (id: string): ItemDefinition => required(itemDefinitions, id, 'item'),
};

const assets = new Map(mapAssets.map((asset) => [asset.id, asset]));
const grids = new Map(
  mapAssets.map((asset) => [
    asset.id,
    TileGrid.fromBlockedRectangles(
      asset.width,
      asset.height,
      asset.collisionLayer.blockedRectangles,
    ),
  ]),
);

const distance = (left: GridPoint, right: GridPoint): number =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

const quantityOf = (snapshot: GameSessionSnapshot, itemId: string): number =>
  snapshot.inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;

const questProgressScore = (snapshot: GameSessionSnapshot): number =>
  snapshot.quests.completed.length * 1_000_000 +
  Object.values(snapshot.quests.active).reduce(
    (total, progress) =>
      total + Object.values(progress.counters).reduce((sum, count) => sum + count, 0),
    0,
  );

export class CampaignDriver {
  readonly #page: Page;
  readonly #content = content;

  constructor(page: Page) {
    this.#page = page;
  }

  async startKnight(): Promise<void> {
    await this.#page.clock.install();
    await this.#page.goto('/?e2e=campaign&seed=20260717');
    await this.#page.getByRole('button', { name: '開始新遊戲' }).click();
    await this.#page.getByLabel('角色名稱').fill('遠征騎士');
    await this.#page.getByRole('radio', { name: '騎士' }).check();
    await this.#page.getByRole('button', { name: '建立角色' }).click();
    await expect(this.#page.getByTestId('game-root')).toHaveAttribute('data-scene', 'world');
    await this.#page.waitForFunction(() => window.__lineageCampaignE2E !== undefined);
    await expect(this.#page.getByTestId('world-state')).toHaveCount(0);
  }

  async snapshot(): Promise<GameSessionSnapshot> {
    return this.#page.evaluate(() => {
      const probe = window.__lineageCampaignE2E;
      if (probe === undefined) throw new Error('campaign snapshot probe is unavailable');
      return probe.snapshot();
    });
  }

  async equipStartingGear(): Promise<void> {
    await this.equip('dagger');
    await this.equip('leather-jacket');
    await this.#assignPotion('red-potion');
  }

  async completeTraining(): Promise<void> {
    await this.travelTo('scarecrow-field');
    await this.#questAction('scarecrow-instructor', 'scarecrow-training', 'accept');
    await this.talkTo('scarecrow-instructor');
    await this.fightMany('goblin', 4);
    await this.#questAction('scarecrow-instructor', 'scarecrow-training', 'claim');
  }

  async completeVillageRegistration(): Promise<void> {
    await this.travelTo('talking-island-village');
    await this.#questAction('village-elder-jered', 'village-registration', 'accept');
    for (const npcId of ['pandora', 'dorin', 'gereng']) await this.talkTo(npcId);
    await this.#questAction('village-elder-jered', 'village-registration', 'claim');
  }

  async exerciseCommerce(): Promise<void> {
    await this.#interactNpc('pandora');
    await this.#page.getByTestId('shop-buy-meat').click();
    await this.#page.getByTestId('shop-sell-meat').click();
    for (let index = 0; index < 6; index += 1) {
      await this.#page.getByTestId('shop-buy-red-potion').click();
    }
    await this.#closePanels();
  }

  async completeKnightGuidance(): Promise<void> {
    await this.#questAction('village-guard', 'knight-guidance', 'accept');
    await this.travelTo('north-field');
    await this.fightMany('dwarf', 5);
    await this.travelTo('talking-island-village');
    await this.#questAction('village-guard', 'knight-guidance', 'claim');
    await this.equip('long-sword');
    await this.equip('large-shield');
    await this.#assignSkill('power-strike');

    await this.buy('balsim', 'helmet', 1);
    await this.equip('helmet');
    await this.buy('pandora', 'red-potion', 5);
  }

  async completeFieldSupplies(): Promise<void> {
    await this.travelTo('north-field');
    await this.#questAction('gunther', 'field-supplies', 'accept');
    await this.travelTo('talking-island-village');
    await this.travelTo('north-field');
    await this.fightMany('dwarf', 3);

    while (quantityOf(await this.snapshot(), 'animal-hide') < 4) {
      const livingOrcs = (await this.snapshot()).monsters.filter(
        ({ monsterId, hp }) => monsterId === 'orc' && hp > 0,
      );
      if (livingOrcs.length === 0) await this.#refreshCurrentMap();
      await this.fightMany('orc', 1);
    }
    await this.#questAction('gunther', 'field-supplies', 'claim');
    await this.travelTo('talking-island-village');
    await this.buy('pandora', 'red-potion', 10);
  }

  async completeBlackKnightAssault(): Promise<void> {
    await this.travelTo('black-knight-area');
    await this.#questAction('ricky', 'black-knight-assault', 'accept');
    await this.fightMany('black-knight', 6);
    await this.fightMany('kurt', 1);
    await this.#questAction('ricky', 'black-knight-assault', 'claim');
    await this.travelTo('talking-island-village');
    await this.buy('pandora', 'red-potion', 15);
  }

  async completeDungeonSeal(): Promise<void> {
    await this.travelTo('talking-island-dungeon-1');
    await this.#questAction('dungeon-warden', 'dungeon-seal', 'accept');
    await this.travelTo('black-knight-area');
    await this.travelTo('talking-island-dungeon-1');
    await this.fightMany('skeleton', 7);
    await this.travelTo('talking-island-dungeon-2');
    await this.fightMany('skeleton', 1);
    await this.travelTo('talking-island-dungeon-1');
    await this.#questAction('dungeon-warden', 'dungeon-seal', 'claim');
  }

  async completeEnding(): Promise<void> {
    await this.travelTo('talking-island-village');
    await this.buy('pandora', 'red-potion', 20);
    await this.travelTo('north-field');
    await this.#questAction('gunther', 'baphomet-ending', 'accept');
    await this.travelTo('talking-island-dungeon-2');
    await this.fightMany('baphomet', 1);
    await this.travelTo('talking-island-village');
    await this.sell('pandora', 'dagger', 1);
    await this.travelTo('north-field');
    await this.#questAction('gunther', 'baphomet-ending', 'claim');
  }

  async saveReloadAndFreeExplore(): Promise<GameSessionSnapshot> {
    const saved = await this.snapshot();
    await this.#page.getByTestId('manual-save').click();
    await expect(this.#page.getByTestId('autosave-status')).toHaveText('已儲存目前進度。');
    await this.#page.reload();
    await expect(this.#page.getByTestId('save-panel')).toContainText('遠征騎士');
    await this.#page.getByTestId('save-load-1').click();
    await this.#page.waitForFunction(() => window.__lineageCampaignE2E !== undefined);
    const restored = await this.snapshot();
    expect(restored.quests.claimedRewards).toEqual(saved.quests.claimedRewards);
    expect(restored.world.flags).toEqual(saved.world.flags);
    expect(restored.world.defeatedBosses).toEqual(saved.world.defeatedBosses);

    await this.moveTo({ x: 90, y: 45 });
    return this.snapshot();
  }

  async equip(itemId: string): Promise<void> {
    await this.#openPanel('KeyI', 'inventory-panel');
    await this.#page.getByTestId(`inventory-item-${itemId}`).click();
    await this.#closePanels();
  }

  async buy(npcId: string, itemId: string, requested: number): Promise<void> {
    await this.#interactNpc(npcId);
    const snapshot = await this.snapshot();
    const price = this.#content.item(itemId).buyPrice;
    const quantity = Math.min(requested, Math.floor(snapshot.inventory.adena / price));
    if (quantity < 1) throw new Error(`cannot afford ${itemId}`);
    for (let index = 0; index < quantity; index += 1) {
      await this.#page.getByTestId(`shop-buy-${itemId}`).click();
    }
    await this.#closePanels();
  }

  async sell(npcId: string, itemId: string, requested: number): Promise<void> {
    await this.#interactNpc(npcId);
    const snapshot = await this.snapshot();
    const owned = quantityOf(snapshot, itemId);
    const quantity = Math.min(requested, owned);
    if (quantity < 1) throw new Error(`cannot sell missing ${itemId}`);
    for (let index = 0; index < quantity; index += 1) {
      await this.#page.getByTestId(`shop-sell-${itemId}`).click();
    }
    await this.#closePanels();
  }

  async talkTo(npcId: string): Promise<void> {
    await this.#interactNpc(npcId);
    await this.#closePanels();
  }

  async travelTo(targetMapId: string): Promise<void> {
    const initial = await this.snapshot();
    const route = this.#mapRoute(initial.player.mapId, targetMapId);
    if (route.length === 0) throw new Error(`no route from ${initial.player.mapId} to ${targetMapId}`);
    for (const nextMapId of route.slice(1)) {
      const snapshot = await this.snapshot();
      const map = this.#content.map(snapshot.player.mapId);
      const exit = map.exits.find(({ targetMapId: id }) => id === nextMapId);
      if (exit === undefined) throw new Error(`missing exit ${map.id} -> ${nextMapId}`);
      if (snapshot.player.x === exit.x && snapshot.player.y === exit.y) {
        await this.#stepAwayFromExit();
      }
      await this.moveTo({ x: exit.x, y: exit.y });
      const arrived = await this.snapshot();
      if (arrived.player.mapId !== nextMapId) {
        throw new Error(`exit ${map.id} did not enter ${nextMapId}`);
      }
    }
  }

  async moveTo(target: GridPoint): Promise<void> {
    const startingMap = (await this.snapshot()).player.mapId;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const snapshot = await this.snapshot();
      if (snapshot.player.mapId !== startingMap) return;
      if (snapshot.player.x === target.x && snapshot.player.y === target.y) return;
      const grid = grids.get(snapshot.player.mapId);
      if (grid === undefined) throw new Error(`missing grid ${snapshot.player.mapId}`);
      const path = findPath(grid, snapshot.player, target);
      if (path.length < 2) {
        throw new Error(`no path to ${String(target.x)},${String(target.y)}`);
      }
      let waypointIndex = Math.min(10, path.length - 1);
      while (waypointIndex > 1 && this.#occupied(snapshot, path[waypointIndex])) {
        waypointIndex -= 1;
      }
      const waypoint = path[waypointIndex];
      if (waypoint === undefined) throw new Error('path has no waypoint');
      if (waypointIndex === 1 && this.#occupied(snapshot, waypoint)) {
        await this.#stepToward(snapshot.player, waypoint);
        await this.#healIfNeeded();
        continue;
      }
      await this.#clickTile(waypoint);
      await this.#page.clock.runFor(waypointIndex * 70 + 100);
      await this.#healIfNeeded();
    }
    const snapshot = await this.snapshot();
    throw new Error(
      `movement stalled at ${snapshot.player.mapId}:${String(snapshot.player.x)},${String(snapshot.player.y)}`,
    );
  }

  async fightMany(monsterId: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      let target = (await this.snapshot()).monsters.find(
        (monster) => monster.monsterId === monsterId && monster.hp > 0,
      );
      if (target === undefined) {
        await this.#refreshCurrentMap();
        target = (await this.snapshot()).monsters.find(
          (monster) => monster.monsterId === monsterId && monster.hp > 0,
        );
      }
      if (target === undefined) throw new Error(`no living ${monsterId}`);
      const startingSnapshot = await this.snapshot();
      const startingExperience = startingSnapshot.character.experience;
      const startingQuestProgress = questProgressScore(startingSnapshot);
      await this.#moveAdjacent(target);
      let current = (await this.snapshot()).monsters.find(({ id }) => id === target.id);
      if (current === undefined) throw new Error(`missing target ${target.id}`);
      await this.#selectTarget(target.id);

      for (let tick = 0; tick < 320; tick += 1) {
        await this.#page.clock.runFor(250);
        await this.#healIfNeeded();
        const snapshot = await this.snapshot();
        current = snapshot.monsters.find(({ id }) => id === target.id);
        if (
          current?.hp === 0 ||
          snapshot.character.experience > startingExperience ||
          questProgressScore(snapshot) > startingQuestProgress
        ) {
          await this.#collectGroundLoot();
          break;
        }
        if (current === undefined) throw new Error(`target vanished ${target.id}`);
        if (snapshot.autoAttackTargetId !== target.id) {
          await this.#selectTarget(target.id);
        }
        if (snapshot.unlockedAbilityIds.includes('power-strike')) {
          await this.#page.keyboard.press('F6');
        }
        if (tick === 319) throw new Error(`${monsterId} survived the combat timeout`);
      }
    }
  }

  async #questAction(
    npcId: string,
    questId: string,
    action: 'accept' | 'claim',
  ): Promise<void> {
    await this.#interactNpc(npcId);
    await this.#page.keyboard.press('KeyQ');
    await expect(this.#page.getByTestId('quests-panel')).toBeVisible();
    await this.#page.getByTestId(`quest-${questId}`).click();
    await expect.poll(async () => {
      const snapshot = await this.snapshot();
      return action === 'accept'
        ? snapshot.quests.active[questId] !== undefined
        : snapshot.quests.claimedRewards.includes(questId);
    }).toBe(true);
    await this.#closePanels();
  }

  async #interactNpc(npcId: string): Promise<void> {
    const npc = this.#content.npc(npcId);
    await this.travelTo(npc.mapId);
    await this.#moveAdjacent(npc);
    await this.#page.locator('canvas').focus();
    await this.#page.keyboard.press('KeyE');
    const panel = npc.role === 'shop' ? 'shop-panel' : npc.role === 'warehouse' ? 'warehouse-panel' : 'dialogue-panel';
    await expect(this.#page.getByTestId(panel)).toBeVisible();
  }

  async #moveAdjacent(target: GridPoint): Promise<void> {
    const snapshot = await this.snapshot();
    if (distance(snapshot.player, target) <= 1) return;
    const grid = grids.get(snapshot.player.mapId);
    if (grid === undefined) throw new Error(`missing grid ${snapshot.player.mapId}`);
    const candidates: GridPoint[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const candidate = { x: target.x + dx, y: target.y + dy };
        if (grid.isWalkable(candidate)) candidates.push(candidate);
      }
    }
    const destination = candidates
      .map((candidate) => ({ candidate, path: findPath(grid, snapshot.player, candidate) }))
      .filter(({ path }) => path.length > 0)
      .sort((left, right) => left.path.length - right.path.length)[0]?.candidate;
    if (destination === undefined) throw new Error('no adjacent destination');
    await this.moveTo(destination);
  }

  async #selectTarget(targetId: string): Promise<void> {
    const livingCount = (await this.snapshot()).monsters.filter(({ hp }) => hp > 0).length;
    await this.#page.locator('canvas').focus();
    for (let attempt = 0; attempt <= livingCount; attempt += 1) {
      if ((await this.snapshot()).autoAttackTargetId === targetId) return;
      await this.#page.keyboard.press('Tab');
    }
    throw new Error(`cannot select target ${targetId} with production target cycling`);
  }

  async #collectGroundLoot(): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const snapshot = await this.snapshot();
      const loot = snapshot.groundLoot.find(({ mapId }) => mapId === snapshot.player.mapId);
      if (loot === undefined) return;
      const beforeCount = snapshot.groundLoot.length;
      await this.#moveAdjacent(loot);
      await this.#page.locator('canvas').focus();
      await this.#page.keyboard.press('KeyE');
      await this.#page.clock.runFor(50);
      if ((await this.snapshot()).groundLoot.length === beforeCount) return;
    }
    throw new Error('ground loot collection stalled');
  }

  async #healIfNeeded(): Promise<void> {
    const snapshot = await this.snapshot();
    const maxHP = deriveStats(snapshot.character).maxHP;
    if (snapshot.character.hp > Math.floor(maxHP * 0.7)) return;
    const potion = snapshot.inventory.stacks
      .filter(({ quantity }) => quantity > 0)
      .map(({ itemId }) => this.#content.item(itemId))
      .filter(({ healAmount }) => healAmount !== undefined)
      .sort((left, right) => (left.healAmount ?? 0) - (right.healAmount ?? 0))[0];
    if (potion === undefined) return;
    if (snapshot.quickSlots[0] !== potion.id) await this.#assignPotion(potion.id);
    await this.#page.locator('canvas').focus();
    await this.#page.keyboard.press('F5');
  }

  async #assignPotion(itemId: string): Promise<void> {
    await this.#openPanel('KeyI', 'inventory-panel');
    await this.#page.getByTestId(`inventory-quick-${itemId}`).click();
    await this.#closePanels();
  }

  async #assignSkill(skillId: string): Promise<void> {
    await this.#openPanel('Shift+KeyS', 'spells-panel');
    await this.#page.getByTestId(`spell-quick-${skillId}`).click();
    await this.#closePanels();
  }

  async #openPanel(key: string, testId: string): Promise<void> {
    await this.#page.locator('canvas').focus();
    await this.#page.keyboard.press(key);
    await expect(this.#page.getByTestId(testId)).toBeVisible();
  }

  async #closePanels(): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
      const top = await this.#page.getByTestId('game-root').getAttribute('data-top-panel');
      if (top === null || top === '') return;
      await this.#page.keyboard.press('Escape');
    }
    throw new Error('panel stack did not close');
  }

  async #refreshCurrentMap(): Promise<void> {
    const snapshot = await this.snapshot();
    const exit = this.#content.map(snapshot.player.mapId).exits[0];
    if (exit === undefined) throw new Error(`map ${snapshot.player.mapId} has no exit`);
    await this.travelTo(exit.targetMapId);
    await this.travelTo(snapshot.player.mapId);
  }

  async #stepAwayFromExit(): Promise<void> {
    const snapshot = await this.snapshot();
    const map = this.#content.map(snapshot.player.mapId);
    const grid = grids.get(map.id);
    if (grid === undefined) throw new Error(`missing grid ${map.id}`);
    const candidate = [
      { x: snapshot.player.x + 1, y: snapshot.player.y },
      { x: snapshot.player.x - 1, y: snapshot.player.y },
      { x: snapshot.player.x, y: snapshot.player.y + 1 },
      { x: snapshot.player.x, y: snapshot.player.y - 1 },
    ].find(
      (point) =>
        grid.isWalkable(point) && !map.exits.some(({ x, y }) => x === point.x && y === point.y),
    );
    if (candidate === undefined) throw new Error('cannot step away from exit');
    await this.moveTo(candidate);
  }

  async #stepToward(from: GridPoint, target: GridPoint): Promise<void> {
    const code =
      target.x > from.x
        ? 'ArrowRight'
        : target.x < from.x
          ? 'ArrowLeft'
          : target.y > from.y
            ? 'ArrowDown'
            : 'ArrowUp';
    await this.#page.locator('canvas').focus();
    await this.#page.keyboard.press(code);
    await this.#page.clock.runFor(120);
  }

  async #clickTile(target: GridPoint): Promise<void> {
    const snapshot = await this.snapshot();
    const asset = assets.get(snapshot.player.mapId);
    if (asset === undefined) throw new Error(`missing map asset ${snapshot.player.mapId}`);
    const scrollX = snapshot.player.x * 16 + 8 - 256;
    const scrollY = snapshot.player.y * 16 + 8 - 216;
    const logicalX = target.x * 16 + 8 - scrollX;
    const logicalY = target.y * 16 + 8 - scrollY;
    if (logicalX < 0 || logicalX >= 512 || logicalY < 0 || logicalY >= 432) {
      throw new Error(`tile ${String(target.x)},${String(target.y)} is outside the camera`);
    }
    const canvas = this.#page.locator('canvas');
    const bounds = await canvas.boundingBox();
    if (bounds === null) throw new Error('canvas has no bounds');
    await canvas.click({
      position: {
        x: logicalX * (bounds.width / 640),
        y: logicalY * (bounds.height / 480),
      },
    });
  }

  #occupied(snapshot: GameSessionSnapshot, point: GridPoint | undefined): boolean {
    if (point === undefined) return false;
    return (
      snapshot.monsters.some(({ x, y, hp }) => hp > 0 && x === point.x && y === point.y) ||
      snapshot.groundLoot.some(({ x, y }) => x === point.x && y === point.y) ||
      this.#content.npcs.some(
        ({ mapId, x, y }) => mapId === snapshot.player.mapId && x === point.x && y === point.y,
      )
    );
  }

  #mapRoute(from: string, to: string): readonly string[] {
    const queue: { readonly mapId: string; readonly route: readonly string[] }[] = [
      { mapId: from, route: [from] },
    ];
    const visited = new Set([from]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      if (current.mapId === to) return current.route;
      for (const exit of this.#content.map(current.mapId).exits) {
        if (visited.has(exit.targetMapId)) continue;
        visited.add(exit.targetMapId);
        queue.push({ mapId: exit.targetMapId, route: [...current.route, exit.targetMapId] });
      }
    }
    return [];
  }
}
