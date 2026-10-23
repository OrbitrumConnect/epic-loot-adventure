/**
 * ARMAZÉM COMPARTILHADO (Pedro, 23/10): o armazém da cidade (Clash) é o armazém da BASE inteira —
 * os prédios produzem e somam lá, o loot da bolsa entra pelo depósito, e as construções da base no
 * mapa (casa pedra/metal, muro, torre, entrega, campo de treino) pagam PRIMEIRO com o armazém e a
 * bolsa completa o que faltar. Munição NÃO entra (fica na bolsa, compartilhada com as torres).
 *
 * Como, sem reescrever cada construção: monta uma "bolsa virtual" (bolsa + armazém), roda a
 * construção de sempre em cima dela e depois divide o que ela gastou — armazém primeiro.
 * Qualquer coisa nova da base (tropas, raid) usa o mesmo caixa.
 */
import { DEPOSIT_ITEMS } from '../data/buildings';
import type { BaseResources, InventoryState } from '../types';
import { addItem, getItemCount, removeItem } from './inventorySystem';

/** Perda do armazém quando a base CAI na horda (Pedro: 25%; o raid de jogador será 35%). */
export const HORDE_STORAGE_LOSS = 0.25;

const STORAGE_OF = new Map(DEPOSIT_ITEMS.map((d) => [d.itemId, d.resource]));

/** Bolsa virtual = bolsa + armazém (sem limite de peso/espaço: só pra conta da construção). */
export function combineStorage(inventory: InventoryState, resources: BaseResources): InventoryState {
  let combined: InventoryState = {
    ...inventory,
    maxWeight: Number.MAX_SAFE_INTEGER,
    slots: [...inventory.slots.map((s) => ({ ...s })), ...DEPOSIT_ITEMS.map(() => ({ itemId: null, quantity: 0 }))],
  };
  for (const { itemId, resource } of DEPOSIT_ITEMS) {
    const amount = Math.floor(resources[resource] ?? 0);
    if (amount <= 0) continue;
    // Pilha "infinita" num slot extra: addItem respeitaria o maxStack e poderia perder o excedente.
    const extra = combined.slots.findIndex((s, i) => i >= inventory.slots.length && s.itemId === null);
    if (extra < 0) { combined = addItem(combined, itemId, amount); continue; }
    combined.slots[extra] = { itemId, quantity: amount };
  }
  return combined;
}

/**
 * Divide o que a construção gastou da bolsa virtual: recurso do armazém sai PRIMEIRO do armazém,
 * o resto da bolsa; qualquer outro item (ferro, ouro…) sai da bolsa, como sempre.
 */
export function splitSpend(
  inventory: InventoryState,
  resources: BaseResources,
  before: InventoryState,
  after: InventoryState,
): { inventory: InventoryState; resources: BaseResources } {
  let inv = inventory;
  const res = { ...resources };
  const ids = new Set<string>();
  for (const s of before.slots) if (s.itemId) ids.add(s.itemId);
  for (const s of after.slots) if (s.itemId) ids.add(s.itemId);
  for (const id of ids) {
    const spent = getItemCount(before, id) - getItemCount(after, id);
    if (spent === 0) continue;
    if (spent < 0) { inv = addItem(inv, id, -spent); continue; } // a construção devolveu algo
    const key = STORAGE_OF.get(id);
    let fromBag = spent;
    if (key) {
      const fromStorage = Math.min(spent, Math.floor(res[key] ?? 0));
      res[key] = (res[key] ?? 0) - fromStorage;
      fromBag = spent - fromStorage;
    }
    if (fromBag > 0) inv = removeItem(inv, id, fromBag);
  }
  return { inventory: inv, resources: res };
}

/** Base caiu na horda: o armazém perde `HORDE_STORAGE_LOSS` de cada recurso (arredonda pra baixo o que fica). */
export function hordeStorageLoss(resources: BaseResources): BaseResources {
  const out = { ...resources };
  for (const k of Object.keys(out) as (keyof BaseResources)[]) out[k] = Math.floor((out[k] ?? 0) * (1 - HORDE_STORAGE_LOSS));
  return out;
}
