import type { DomainEvent } from './events';
import type { CharacterClass, CharacterState } from './model';
import { deriveStats } from './stats';

export type EquipmentSlot =
  | 'weapon'
  | 'shield'
  | 'helmet'
  | 'armor'
  | 'cloak'
  | 'gloves'
  | 'boots'
  | 'amulet'
  | 'ring';

export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind:
    | 'weapon'
    | 'armor'
    | 'consumable'
    | 'spellbook'
    | 'ammunition'
    | 'quest';
  readonly weight: number;
  readonly stackLimit: number;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly allowedClasses: readonly CharacterClass[];
  readonly equipmentSlot?: EquipmentSlot;
  readonly healAmount?: number;
}

export type ItemLookup = (itemId: string) => ItemDefinition;

export interface InventoryStack {
  readonly itemId: string;
  readonly quantity: number;
}

export interface InventoryState {
  readonly stacks: readonly InventoryStack[];
  readonly adena: number;
  readonly carriedWeight: number;
  readonly weightLimit: number;
}

export type EquipmentState = Readonly<Partial<Record<EquipmentSlot, string>>>;

export type InventoryFailureReason =
  | 'overweight'
  | 'missing-item'
  | 'wrong-class'
  | 'quest-item'
  | 'insufficient-adena'
  | 'invalid-quantity';

interface InventorySuccess {
  readonly ok: true;
  readonly inventory: InventoryState;
  readonly events: DomainEvent[];
}

interface InventoryFailure {
  readonly ok: false;
  readonly inventory: InventoryState;
  readonly reason: InventoryFailureReason;
}

export type InventoryResult = InventorySuccess | InventoryFailure;

export type EquipmentResult =
  | (InventorySuccess & { readonly equipment: EquipmentState })
  | (InventoryFailure & { readonly equipment: EquipmentState });

export type UseItemResult =
  | (InventorySuccess & { readonly character: CharacterState })
  | (InventoryFailure & { readonly character: CharacterState });

function invalidQuantity(quantity: number): boolean {
  return !Number.isSafeInteger(quantity) || quantity <= 0;
}

function stackQuantity(inventory: InventoryState, itemId: string): number {
  return inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;
}

function changedStacks(
  inventory: InventoryState,
  itemId: string,
  quantity: number,
): InventoryStack[] {
  const stacks = inventory.stacks
    .filter((stack) => stack.itemId !== itemId)
    .map((stack) => ({ ...stack }));

  if (quantity > 0) {
    stacks.push({ itemId, quantity });
  }

  return stacks;
}

function weightAfterQuantityChange(
  inventory: InventoryState,
  item: ItemDefinition,
  nextQuantity: number,
): number {
  const currentQuantity = stackQuantity(inventory, item.id);
  const unaffectedWeight = inventory.carriedWeight - currentQuantity * item.weight;

  return Math.max(0, unaffectedWeight + nextQuantity * item.weight);
}

function failure(
  inventory: InventoryState,
  reason: InventoryFailureReason,
): InventoryFailure {
  return { ok: false, inventory, reason };
}

export function addItem(
  inventory: InventoryState,
  item: ItemDefinition,
  quantity: number,
): InventoryResult {
  if (invalidQuantity(quantity)) {
    return failure(inventory, 'invalid-quantity');
  }

  const nextQuantity = stackQuantity(inventory, item.id) + quantity;
  if (nextQuantity > item.stackLimit) {
    return failure(inventory, 'invalid-quantity');
  }

  const carriedWeight = weightAfterQuantityChange(inventory, item, nextQuantity);
  if (carriedWeight > inventory.weightLimit) {
    return failure(inventory, 'overweight');
  }

  return {
    ok: true,
    inventory: {
      ...inventory,
      stacks: changedStacks(inventory, item.id, nextQuantity),
      carriedWeight,
    },
    events: [],
  };
}

export function removeItem(
  inventory: InventoryState,
  item: ItemDefinition,
  quantity: number,
): InventoryResult {
  if (invalidQuantity(quantity)) {
    return failure(inventory, 'invalid-quantity');
  }

  const currentQuantity = stackQuantity(inventory, item.id);
  if (currentQuantity < quantity) {
    return failure(inventory, 'missing-item');
  }

  const nextQuantity = currentQuantity - quantity;
  return {
    ok: true,
    inventory: {
      ...inventory,
      stacks: changedStacks(inventory, item.id, nextQuantity),
      carriedWeight: weightAfterQuantityChange(inventory, item, nextQuantity),
    },
    events: [],
  };
}

export function equipItem(
  inventory: InventoryState,
  equipment: EquipmentState,
  character: CharacterState,
  item: ItemDefinition,
): EquipmentResult {
  if (!item.equipmentSlot) {
    return { ...failure(inventory, 'invalid-quantity'), equipment };
  }

  if (!item.allowedClasses.includes(character.classId)) {
    return { ...failure(inventory, 'wrong-class'), equipment };
  }

  if (equipment[item.equipmentSlot] !== undefined) {
    return { ...failure(inventory, 'invalid-quantity'), equipment };
  }

  const removed = removeItem(inventory, item, 1);
  if (!removed.ok) {
    return { ...removed, equipment };
  }

  return {
    ...removed,
    equipment: { ...equipment, [item.equipmentSlot]: item.id },
  };
}

export function unequipItem(
  inventory: InventoryState,
  equipment: EquipmentState,
  itemLookup: ItemLookup,
  slot: EquipmentSlot,
): EquipmentResult {
  const itemId = equipment[slot];
  if (itemId === undefined) {
    return { ...failure(inventory, 'invalid-quantity'), equipment };
  }

  const added = addItem(inventory, itemLookup(itemId), 1);
  if (!added.ok) {
    return { ...added, equipment };
  }

  const nextEquipment: EquipmentState = Object.fromEntries(
    Object.entries(equipment).filter(([equipmentSlot]) => equipmentSlot !== slot),
  );
  return { ...added, equipment: nextEquipment };
}

export function replaceEquipment(
  inventory: InventoryState,
  equipment: EquipmentState,
  character: CharacterState,
  itemLookup: ItemLookup,
  slot: EquipmentSlot,
  newItem: ItemDefinition,
): EquipmentResult {
  if (newItem.equipmentSlot !== slot) {
    return { ...failure(inventory, 'invalid-quantity'), equipment };
  }
  if (!newItem.allowedClasses.includes(character.classId)) {
    return { ...failure(inventory, 'wrong-class'), equipment };
  }

  const unequipped = unequipItem(inventory, equipment, itemLookup, slot);
  if (!unequipped.ok) {
    return unequipped;
  }

  const equipped = equipItem(
    unequipped.inventory,
    unequipped.equipment,
    character,
    newItem,
  );
  if (!equipped.ok) {
    return { ...failure(inventory, equipped.reason), equipment };
  }
  return equipped;
}

export function useItem(
  inventory: InventoryState,
  character: CharacterState,
  item: ItemDefinition,
): UseItemResult {
  if (item.kind !== 'consumable' || item.healAmount === undefined) {
    return {
      ...failure(inventory, 'invalid-quantity'),
      character,
    };
  }

  const removed = removeItem(inventory, item, 1);
  if (!removed.ok) {
    return { ...removed, character };
  }

  const maxHP = deriveStats(character).maxHP;
  const hp = Math.min(maxHP, character.hp + item.healAmount);
  const healed = hp - character.hp;
  const events: DomainEvent[] = [
    {
      type: 'heal',
      sourceId: character.id,
      targetId: character.id,
      amount: healed,
    },
  ];

  return {
    ok: true,
    inventory: removed.inventory,
    character: { ...character, hp },
    events,
  };
}

export function consumeAmmunition(
  inventory: InventoryState,
  itemId: string,
): InventoryState {
  const currentQuantity = stackQuantity(inventory, itemId);
  if (currentQuantity < 1) {
    return inventory;
  }

  return {
    ...inventory,
    stacks: changedStacks(inventory, itemId, currentQuantity - 1),
    carriedWeight: Math.max(0, inventory.carriedWeight - 1),
  };
}

export function buyItem(
  inventory: InventoryState,
  item: ItemDefinition,
  quantity: number,
): InventoryResult {
  if (invalidQuantity(quantity)) {
    return failure(inventory, 'invalid-quantity');
  }

  const totalPrice = item.buyPrice * quantity;
  if (!Number.isSafeInteger(totalPrice) || totalPrice < 0) {
    return failure(inventory, 'invalid-quantity');
  }
  if (inventory.adena < totalPrice) {
    return failure(inventory, 'insufficient-adena');
  }

  const added = addItem(inventory, item, quantity);
  if (!added.ok) {
    return added;
  }

  return {
    ...added,
    inventory: { ...added.inventory, adena: inventory.adena - totalPrice },
  };
}

export function sellItem(
  inventory: InventoryState,
  item: ItemDefinition,
  quantity: number,
): InventoryResult {
  if (item.kind === 'quest') {
    return failure(inventory, 'quest-item');
  }

  if (invalidQuantity(quantity)) {
    return failure(inventory, 'invalid-quantity');
  }

  const totalPrice = item.sellPrice * quantity;
  if (!Number.isSafeInteger(totalPrice) || totalPrice < 0) {
    return failure(inventory, 'invalid-quantity');
  }

  const removed = removeItem(inventory, item, quantity);
  if (!removed.ok) {
    return removed;
  }

  return {
    ...removed,
    inventory: { ...removed.inventory, adena: inventory.adena + totalPrice },
  };
}
