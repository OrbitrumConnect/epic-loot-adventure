import type { InventoryState, InventorySlot } from '../types';
import { ITEMS } from '../data/items';

export function createInventory(initialItems?: { itemId: string; quantity: number }[]): InventoryState {
  const slots: InventorySlot[] = Array.from({ length: 24 }, () => ({ itemId: null, quantity: 0 }));

  if (initialItems) {
    initialItems.forEach((item, i) => {
      if (i < slots.length) {
        slots[i] = { itemId: item.itemId, quantity: item.quantity };
      }
    });
  }

  return {
    slots,
    maxSlots: 24,
    maxWeight: 40,
    equipment: { primary: null, secondary: null, armor: null, accessory: null },
    hotbar: { slots: [0, 1, 2, 3, 4, 5, 6, 7] },
  };
}

export function getWeight(inventory: InventoryState): number {
  return inventory.slots.reduce((total, slot) => {
    if (!slot.itemId) return total;
    const item = ITEMS[slot.itemId];
    if (!item) return total;
    return total + item.weight * slot.quantity;
  }, 0);
}

export function getUsedSlots(inventory: InventoryState): number {
  return inventory.slots.filter(s => s.itemId !== null).length;
}

export function findItemSlot(inventory: InventoryState, itemId: string): number {
  return inventory.slots.findIndex(s => s.itemId === itemId);
}

export function findEmptySlot(inventory: InventoryState): number {
  return inventory.slots.findIndex(s => s.itemId === null);
}

export function canAddItem(inventory: InventoryState, itemId: string, quantity: number): boolean {
  const item = ITEMS[itemId];
  if (!item) return false;

  const addedWeight = item.weight * quantity;
  if (getWeight(inventory) + addedWeight > inventory.maxWeight) return false;

  const existingSlot = inventory.slots.findIndex(
    s => s.itemId === itemId && s.quantity < item.maxStack
  );
  if (existingSlot >= 0) return true;

  return findEmptySlot(inventory) >= 0;
}

export function addItem(inventory: InventoryState, itemId: string, quantity: number): InventoryState {
  const item = ITEMS[itemId];
  if (!item) return inventory;

  const slots = inventory.slots.map(s => ({ ...s }));
  let remaining = quantity;

  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const slot = slots[i]!;
    if (slot.itemId === itemId && slot.quantity < item.maxStack) {
      const canAdd = Math.min(remaining, item.maxStack - slot.quantity);
      slot.quantity += canAdd;
      remaining -= canAdd;
    }
  }

  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const slot = slots[i]!;
    if (slot.itemId === null) {
      const canAdd = Math.min(remaining, item.maxStack);
      slot.itemId = itemId;
      slot.quantity = canAdd;
      remaining -= canAdd;
    }
  }

  return { ...inventory, slots };
}

export function removeItem(inventory: InventoryState, itemId: string, quantity: number): InventoryState {
  const slots = inventory.slots.map(s => ({ ...s }));
  let remaining = quantity;

  for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = slots[i]!;
    if (slot.itemId === itemId) {
      const toRemove = Math.min(remaining, slot.quantity);
      slot.quantity -= toRemove;
      remaining -= toRemove;
      if (slot.quantity <= 0) {
        slot.itemId = null;
        slot.quantity = 0;
      }
    }
  }

  return { ...inventory, slots };
}

export function hasItems(inventory: InventoryState, itemId: string, quantity: number): boolean {
  return inventory.slots
    .filter(s => s.itemId === itemId)
    .reduce((sum, s) => sum + s.quantity, 0) >= quantity;
}

export function getItemCount(inventory: InventoryState, itemId: string): number {
  return inventory.slots
    .filter(s => s.itemId === itemId)
    .reduce((sum, s) => sum + s.quantity, 0);
}

export function getDroppableItems(inventory: InventoryState): InventorySlot[] {
  return inventory.slots.filter(s => {
    if (!s.itemId) return false;
    const item = ITEMS[s.itemId];
    return item?.dropOnDeath;
  });
}
