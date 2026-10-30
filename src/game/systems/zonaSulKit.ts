/**
 * KIT DE MOBILIDADE da Zona Sul (29–30/10): PRANCHA (nv 5), ASA-DELTA (nv 8) e SKATE VOADOR (nv 15) são itens oficiais
 * e TODO personagem tem os três (Pedro: "ela já tem que entrar dentro do loot"; "teremos skate voador nível 15, asa-delta
 * nível 8"). Ficam travados até o nível (unlockSystem). Puro e idempotente:
 *  - quem já tem (mochila) não ganha outro;
 *  - vai pro primeiro espaço LIVRE da mochila; mochila CHEIA → a mochila ganha UM espaço a mais só pra ele (nada sai do
 *    lugar, nada se perde). Não pesam (veículos, como a caixa de munição) → nunca travam a coleta de ninguém;
 *  - entra no 1º espaço livre da hotbar (1–0); hotbar cheia → no fim, clicável.
 * São FIXOS do personagem: não dá pra descartar (dropItem recusa).
 */
import type { InventoryState } from '../types';
import { addItem, canAddItem, getItemCount } from './inventorySystem';

export const SURFBOARD_ID = 'surfboard';
export const HANG_GLIDER_ID = 'hang_glider';
export const HOVER_SKATE_ID = 'hover_skate';
/** ordem de entrega (e de lugar na hotbar) */
export const MOBILITY_IDS = [SURFBOARD_ID, HANG_GLIDER_ID, HOVER_SKATE_ID] as const;
export function isMobilityItem(id: string | null | undefined): boolean {
  return !!id && (MOBILITY_IDS as readonly string[]).includes(id);
}
/** teclas 1–9 e 0 */
const HOTKEYS = 10;

export type KitResult = { inventory: InventoryState; granted: boolean; grewBag: boolean };

/** Entrega UM item do kit (se faltar). */
export function grantKitItem(inv: InventoryState, itemId: string): KitResult {
  if (getItemCount(inv, itemId) > 0) return { inventory: inv, granted: false, grewBag: false };
  let added: InventoryState;
  let grewBag = false;
  if (canAddItem(inv, itemId, 1)) added = addItem(inv, itemId, 1);
  else {
    // mochila cheia: um espaço novo no FIM só pra ele (o save aceita: espaços = maxSlots)
    added = { ...inv, slots: [...inv.slots, { itemId, quantity: 1 }], maxSlots: inv.maxSlots + 1 };
    grewBag = true;
  }
  const idx = added.slots.findIndex(s => s.itemId === itemId);
  const hot = [...added.hotbar.slots];
  const free = hot.slice(0, HOTKEYS).findIndex(v => v == null || added.slots[v]?.itemId == null);
  // hotbar cheia (1–0 ocupados): entra no FIM, clicável — nunca tira nada seu do lugar
  if (free >= 0) hot[free] = idx;
  else hot.push(idx);
  return { inventory: { ...added, hotbar: { ...added.hotbar, slots: hot } }, granted: true, grewBag };
}

/** A prancha (mantido: testes e chamadas antigas). */
export function grantSurfboard(inv: InventoryState): KitResult {
  return grantKitItem(inv, SURFBOARD_ID);
}

/** O kit inteiro: devolve o inventário com o que faltava e a lista do que entrou. */
export function grantMobilityKit(inv: InventoryState): { inventory: InventoryState; granted: string[]; grewBag: boolean } {
  let cur = inv, grewBag = false;
  const granted: string[] = [];
  for (const id of MOBILITY_IDS) {
    const r = grantKitItem(cur, id);
    if (r.granted) { granted.push(id); cur = r.inventory; grewBag ||= r.grewBag; }
  }
  return { inventory: cur, granted, grewBag };
}
