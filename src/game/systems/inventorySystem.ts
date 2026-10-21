import type { InventoryState, InventorySlot } from '../types';
import { ITEMS } from '../data/items';

/** Slot RESERVADO só pra POÇÃO (Pedro): toda poção coletada vai pra este slot (fixo); nada
 *  além de poção entra nele, e a poção não é empurrada pra fora por outro item. Overflow de
 *  poção (acima do maxStack) ainda cai nos outros slots. É o slot da hotbar pra beber rápido. */
export const POTION_SLOT = 11; // índice 11 = "slot 12" (1-indexado) na grade do inventário
const POTION_ITEM = 'health_potion';

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
    maxWeight: 1000, // alinhado ao BASE_MAX_WEIGHT; syncCarry recalcula com a capacidade%
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
  if (!item || quantity <= 0) return false;

  const isPotion = itemId === POTION_ITEM;
  // POÇÃO sempre cabe no slot reservado (SEM limite de peso): bolsa cheia não pode impedir
  // de pegar poção — o slot fixo resolve (Pedro). Só o que passar do maxStack cai na regra
  // normal (peso + outros slots).
  if (isPotion) {
    const s = inventory.slots[POTION_SLOT];
    const cur = s && s.itemId === POTION_ITEM ? s.quantity : 0;
    const free = (!s || s.itemId == null || s.itemId === POTION_ITEM) ? item.maxStack - cur : 0;
    if (free >= quantity) return true;
  }

  const addedWeight = item.weight * quantity;
  if (getWeight(inventory) + addedWeight > inventory.maxWeight) return false;

  // A coleta é atômica: se o drop não couber por inteiro, não podemos retornar
  // `true` e deixar `addItem` perder silenciosamente o excedente da pilha.
  const stackCapacity = inventory.slots.reduce((capacity, slot, i) => {
    // Slot reservado da poção: só conta pra poção; pra qualquer outro item, capacidade 0.
    if (i === POTION_SLOT && !isPotion) return capacity;
    if (slot.itemId === itemId) return capacity + Math.max(0, item.maxStack - slot.quantity);
    if (slot.itemId === null) return capacity + item.maxStack;
    return capacity;
  }, 0);
  return stackCapacity >= quantity;
}

export function addItem(inventory: InventoryState, itemId: string, quantity: number): InventoryState {
  const item = ITEMS[itemId];
  if (!item) return inventory;

  const slots = inventory.slots.map(s => ({ ...s }));
  let remaining = quantity;
  const isPotion = itemId === POTION_ITEM;

  // POÇÃO: entra SEMPRE no slot reservado primeiro (fixo). Outros itens NUNCA usam esse slot.
  if (isPotion) {
    const s = slots[POTION_SLOT];
    if (s && (s.itemId === POTION_ITEM || s.itemId === null)) {
      const cur = s.itemId === POTION_ITEM ? s.quantity : 0;
      const canAdd = Math.min(remaining, item.maxStack - cur);
      if (canAdd > 0) { s.itemId = POTION_ITEM; s.quantity = cur + canAdd; remaining -= canAdd; }
    }
  }

  // Empilha nos slots existentes (pula o reservado — poção já tratada, outros proibidos).
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (i === POTION_SLOT) continue;
    const slot = slots[i]!;
    if (slot.itemId === itemId && slot.quantity < item.maxStack) {
      const canAdd = Math.min(remaining, item.maxStack - slot.quantity);
      slot.quantity += canAdd;
      remaining -= canAdd;
    }
  }

  // Abre slot vazio (nunca o reservado pra não-poção; overflow de poção pode usar outros).
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (i === POTION_SLOT) continue;
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
