import type { GameContent } from '../../content/catalog';
import type { DomainEvent } from '../../core/events';
import {
  buyItem,
  equipItem,
  removeItem,
  replaceEquipment,
  sellItem,
  useItem,
  type EquipmentState,
  type InventoryFailureReason,
  type ItemDefinition,
} from '../../core/inventory';
import { applyExperience } from '../../core/progression';
import {
  advanceQuest,
  claimReward,
  isEndingUnlocked,
  startQuest,
  type QuestCatalog,
} from '../../core/quests';
import { deriveStats } from '../../core/stats';
import { sealSaveV1, type SaveGameV1 } from '../../storage/saveSchema';
import type { PlayerCommand } from './InputController';
import {
  WorldController,
  type WorldActionFailureReason,
  type WorldControllerOptions,
  type WorldPersistenceEvent,
  type WorldSnapshot,
} from './WorldController';

export type PlayerAction =
  | { readonly type: 'interact'; readonly targetId: string }
  | { readonly type: 'accept-quest'; readonly npcId: string; readonly questId: string }
  | { readonly type: 'claim-reward'; readonly npcId: string; readonly questId: string }
  | { readonly type: 'buy'; readonly npcId: string; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'sell'; readonly npcId: string; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'equip'; readonly itemId: string }
  | { readonly type: 'use'; readonly itemId: string }
  | { readonly type: 'cast'; readonly abilityId: string; readonly targetId: string };

export type PlayerActionFailureReason =
  | InventoryFailureReason
  | WorldActionFailureReason
  | 'npc-not-found'
  | 'npc-out-of-range'
  | 'quest-not-found'
  | 'quest-not-offered'
  | 'quest-unavailable'
  | 'item-not-sold'
  | 'not-a-merchant'
  | 'wrong-class'
  | 'not-completed'
  | 'reward-unavailable'
  | 'inventory-full';

export type PlayerActionResult =
  | { readonly ok: true; readonly events: readonly DomainEvent[] }
  | {
      readonly ok: false;
      readonly reason: PlayerActionFailureReason;
      readonly events: readonly DomainEvent[];
    };

export type GameSessionOptions = WorldControllerOptions;

export interface GameSessionSnapshot extends WorldSnapshot {
  readonly equipment: EquipmentState;
  readonly quickSlots: SaveGameV1['quickSlots'];
  readonly settings: SaveGameV1['settings'];
  readonly unlockedAbilityIds: readonly string[];
  readonly endingComplete: boolean;
}

const success = (events: readonly DomainEvent[] = []): PlayerActionResult => ({
  ok: true,
  events,
});

const failure = (reason: PlayerActionFailureReason): PlayerActionResult => ({
  ok: false,
  reason,
  events: [],
});

const itemDefinition = (content: GameContent, itemId: string): ItemDefinition => {
  const item = content.item(itemId);
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    weight: item.weight,
    stackLimit: item.stackLimit,
    buyPrice: item.buyPrice,
    sellPrice: item.sellPrice,
    allowedClasses: item.allowedClasses,
    ...(item.equipmentSlot === undefined ? {} : { equipmentSlot: item.equipmentSlot }),
    ...(item.healAmount === undefined ? {} : { healAmount: item.healAmount }),
  };
};

const distance = (
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): number => Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

export class GameSession {
  readonly #content: GameContent;
  readonly #controller: WorldController;
  readonly #questCatalog: QuestCatalog;
  readonly #quickSlots: SaveGameV1['quickSlots'];
  readonly #settings: SaveGameV1['settings'];
  readonly #gameVersion: string;
  readonly #slot: SaveGameV1['slot'];
  #persistenceEvents: WorldPersistenceEvent[] = [];

  constructor(options: GameSessionOptions) {
    this.#content = options.content;
    this.#controller = new WorldController(options);
    this.#questCatalog = Object.fromEntries(
      options.content.quests.map((quest) => [quest.id, quest]),
    );
    this.#quickSlots = [...options.save.quickSlots];
    this.#settings = { ...options.save.settings };
    this.#gameVersion = options.save.gameVersion;
    this.#slot = options.save.slot;
  }

  get snapshot(): GameSessionSnapshot {
    const snapshot = this.#controller.snapshot;
    const baphometDefeated =
      snapshot.world.flags.baphometDefeated === true ||
      snapshot.world.defeatedBosses.includes('baphomet');
    const finalReportComplete =
      baphometDefeated && snapshot.quests.claimedRewards.includes('baphomet-ending');
    const world = {
      ...snapshot.world,
      flags: {
        ...snapshot.world.flags,
        baphometDefeated,
        finalReportComplete,
      },
    };
    return {
      ...snapshot,
      world,
      quickSlots: [...this.#quickSlots],
      settings: { ...this.#settings },
      unlockedAbilityIds: this.#unlockedAbilityIds(snapshot),
      endingComplete: isEndingUnlocked(world.flags),
    };
  }

  serialize(updatedAt: string): SaveGameV1 {
    const snapshot = this.snapshot;
    return sealSaveV1({
      schemaVersion: 1,
      gameVersion: this.#gameVersion,
      slot: this.#slot,
      updatedAt,
      checksum: '',
      character: snapshot.character,
      inventory: snapshot.inventory,
      equipment: snapshot.equipment,
      quests: snapshot.quests,
      world: snapshot.world,
      quickSlots: snapshot.quickSlots,
      settings: snapshot.settings,
    });
  }

  dispatch(command: PlayerCommand): void {
    this.#controller.dispatch(command);
  }

  update(deltaMs: number): void {
    this.#controller.update(deltaMs);
  }

  drainEvents(): DomainEvent[] {
    return this.#controller.drainEvents();
  }

  drainPersistenceEvents(): WorldPersistenceEvent[] {
    const events = [
      ...this.#controller.drainPersistenceEvents(),
      ...this.#persistenceEvents,
    ];
    this.#persistenceEvents = [];
    return events;
  }

  perform(action: PlayerAction): PlayerActionResult {
    switch (action.type) {
      case 'interact':
        return this.#interact(action.targetId);
      case 'accept-quest':
        return this.#acceptQuest(action.npcId, action.questId);
      case 'claim-reward':
        return this.#claimReward(action.npcId, action.questId);
      case 'buy':
        return this.#buy(action.npcId, action.itemId, action.quantity);
      case 'sell':
        return this.#sell(action.npcId, action.itemId, action.quantity);
      case 'equip':
        return this.#equip(action.itemId);
      case 'use':
        return this.#use(action.itemId);
      case 'cast':
        return this.#controller.cast(action.abilityId, action.targetId);
    }
  }

  #nearbyNpc(npcId: string):
    | { readonly ok: true; readonly npc: GameContent['npcs'][number] }
    | { readonly ok: false; readonly reason: 'npc-not-found' | 'npc-out-of-range' } {
    const npc = this.#content.npcs.find(({ id }) => id === npcId);
    if (npc === undefined) return { ok: false, reason: 'npc-not-found' };
    const player = this.#controller.snapshot.player;
    if (npc.mapId !== player.mapId || distance(npc, player) > 1) {
      return { ok: false, reason: 'npc-out-of-range' };
    }
    return { ok: true, npc };
  }

  #interact(npcId: string): PlayerActionResult {
    const nearby = this.#nearbyNpc(npcId);
    if (!nearby.ok) return failure(nearby.reason);
    const snapshot = this.#controller.snapshot;
    const quests = advanceQuest(
      snapshot.quests,
      { type: 'npc-talked', npcId },
      this.#questCatalog,
    );
    if (quests !== snapshot.quests) {
      this.#controller.syncSerializableState({
        character: snapshot.character,
        inventory: snapshot.inventory,
        quests,
      });
      this.#persistenceEvents.push('quest-stage');
    }
    return success();
  }

  #acceptQuest(npcId: string, questId: string): PlayerActionResult {
    const nearby = this.#nearbyNpc(npcId);
    if (!nearby.ok) return failure(nearby.reason);
    const quest = this.#content.quests.find(({ id }) => id === questId);
    if (quest === undefined) return failure('quest-not-found');
    if (quest.giverNpcId !== npcId || !nearby.npc.questIds.includes(questId)) {
      return failure('quest-not-offered');
    }
    const snapshot = this.#controller.snapshot;
    const quests = startQuest(
      snapshot.quests,
      questId,
      snapshot.character.classId,
      this.#questCatalog,
    );
    if (quests === snapshot.quests) return failure('quest-unavailable');
    this.#controller.syncSerializableState({
      character: snapshot.character,
      inventory: snapshot.inventory,
      quests,
    });
    this.#persistenceEvents.push('quest-stage');
    return success();
  }

  #claimReward(npcId: string, questId: string): PlayerActionResult {
    const nearby = this.#nearbyNpc(npcId);
    if (!nearby.ok) return failure(nearby.reason);
    const quest = this.#content.quests.find(({ id }) => id === questId);
    if (quest === undefined) return failure('quest-not-found');
    if (quest.giverNpcId !== npcId || !nearby.npc.questIds.includes(questId)) {
      return failure('quest-not-offered');
    }
    const snapshot = this.#controller.snapshot;
    const items = Object.fromEntries(
      this.#content.items.map((item) => [item.id, itemDefinition(this.#content, item.id)]),
    );
    const result = claimReward(
      snapshot.quests,
      questId,
      {
        inventory: snapshot.inventory,
        experience: snapshot.character.experience,
        abilityIds: this.#unlockedAbilityIds(snapshot),
      },
      this.#questCatalog,
      items,
    );
    if (!result.ok) return failure(result.reason);
    const gainedExperience = result.target.experience - snapshot.character.experience;
    const progression = applyExperience(snapshot.character, gainedExperience);
    this.#controller.syncSerializableState({
      character: {
        ...progression.character,
        carriedWeight: result.target.inventory.carriedWeight,
      },
      inventory: result.target.inventory,
      equipment: snapshot.equipment,
      quests: result.state,
    });
    if (result.state !== snapshot.quests) this.#persistenceEvents.push('quest-stage');
    return success(progression.events);
  }

  #buy(npcId: string, itemId: string, quantity: number): PlayerActionResult {
    const nearby = this.#nearbyNpc(npcId);
    if (!nearby.ok) return failure(nearby.reason);
    if (!nearby.npc.shopItemIds.includes(itemId)) return failure('item-not-sold');
    const snapshot = this.#controller.snapshot;
    const result = buyItem(snapshot.inventory, itemDefinition(this.#content, itemId), quantity);
    if (!result.ok) return failure(result.reason);
    this.#controller.syncSerializableState({
      character: {
        ...snapshot.character,
        carriedWeight: result.inventory.carriedWeight,
      },
      inventory: result.inventory,
      quests: snapshot.quests,
    });
    return success(result.events);
  }

  #sell(npcId: string, itemId: string, quantity: number): PlayerActionResult {
    const nearby = this.#nearbyNpc(npcId);
    if (!nearby.ok) return failure(nearby.reason);
    if (nearby.npc.shopItemIds.length === 0) return failure('not-a-merchant');
    const snapshot = this.#controller.snapshot;
    const result = sellItem(snapshot.inventory, itemDefinition(this.#content, itemId), quantity);
    if (!result.ok) return failure(result.reason);
    this.#controller.syncSerializableState({
      character: {
        ...snapshot.character,
        carriedWeight: result.inventory.carriedWeight,
      },
      inventory: result.inventory,
      quests: snapshot.quests,
    });
    return success(result.events);
  }

  #equip(itemId: string): PlayerActionResult {
    const snapshot = this.#controller.snapshot;
    const item = itemDefinition(this.#content, itemId);
    const slot = item.equipmentSlot;
    const result =
      slot !== undefined && snapshot.equipment[slot] !== undefined
        ? replaceEquipment(
            snapshot.inventory,
            snapshot.equipment,
            snapshot.character,
            (equippedItemId) => itemDefinition(this.#content, equippedItemId),
            slot,
            item,
          )
        : equipItem(snapshot.inventory, snapshot.equipment, snapshot.character, item);
    if (!result.ok) return failure(result.reason);
    const equipmentAC = Object.values(result.equipment).reduce(
      (total, equippedItemId) =>
        total + (this.#content.item(equippedItemId).acModifier ?? 0),
      0,
    );
    this.#controller.syncSerializableState({
      character: {
        ...snapshot.character,
        carriedWeight: result.inventory.carriedWeight,
        equipmentAC,
      },
      inventory: result.inventory,
      quests: snapshot.quests,
      equipment: result.equipment,
    });
    return success(result.events);
  }

  #use(itemId: string): PlayerActionResult {
    const snapshot = this.#controller.snapshot;
    const contentItem = this.#content.item(itemId);
    if (!contentItem.allowedClasses.includes(snapshot.character.classId)) {
      return failure('wrong-class');
    }
    const item = itemDefinition(this.#content, itemId);
    if (contentItem.manaAmount !== undefined) {
      const removed = removeItem(snapshot.inventory, item, 1);
      if (!removed.ok) return failure(removed.reason);
      this.#controller.syncSerializableState({
        character: {
          ...snapshot.character,
          mp: Math.min(
            deriveStats(snapshot.character).maxMP,
            snapshot.character.mp + contentItem.manaAmount,
          ),
          carriedWeight: removed.inventory.carriedWeight,
        },
        inventory: removed.inventory,
        quests: snapshot.quests,
      });
      return success(removed.events);
    }
    const used = useItem(snapshot.inventory, snapshot.character, item);
    if (!used.ok) return failure(used.reason);
    this.#controller.syncSerializableState({
      character: {
        ...used.character,
        carriedWeight: used.inventory.carriedWeight,
      },
      inventory: used.inventory,
      quests: snapshot.quests,
    });
    return success(used.events);
  }

  #unlockedAbilityIds(snapshot: WorldSnapshot): string[] {
    const classDefinition = this.#content.classes.find(
      ({ id }) => id === snapshot.character.classId,
    );
    if (classDefinition === undefined) return [];
    const unlocked = classDefinition.abilityIds.filter(
      (abilityId) => this.#content.ability(abilityId).unlockLevel <= snapshot.character.level,
    );
    for (const questId of snapshot.quests.claimedRewards) {
      const quest = this.#content.quests.find(({ id }) => id === questId);
      if (quest === undefined) continue;
      for (const abilityId of quest.rewards.abilityIds) {
        if (!unlocked.includes(abilityId)) unlocked.push(abilityId);
      }
    }
    return unlocked;
  }
}
