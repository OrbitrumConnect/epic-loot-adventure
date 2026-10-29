/**
 * KIT DA ZONA SUL (29/10): a PRANCHA é item oficial do jogo. Na 1ª entrada na Zona Sul quem não tem ganha uma — vai pra
 * mochila e pro primeiro espaço LIVRE da hotbar (1–0). Puro e idempotente: quem já tem (mochila) não ganha outra.
 */
import type { InventoryState } from '../types';
import { addItem, canAddItem, getItemCount } from './inventorySystem';

export const SURFBOARD_ID = 'surfboard';
/** teclas 1–9 e 0 */
const HOTKEYS = 10;

export type KitResult = { inventory: InventoryState; granted: boolean; full: boolean };

export function grantSurfboard(inv: InventoryState): KitResult {
  if (getItemCount(inv, SURFBOARD_ID) > 0) return { inventory: inv, granted: false, full: false };
  if (!canAddItem(inv, SURFBOARD_ID, 1)) return { inventory: inv, granted: false, full: true };
  const added = addItem(inv, SURFBOARD_ID, 1);
  const idx = added.slots.findIndex(s => s.itemId === SURFBOARD_ID);
  const hot = [...added.hotbar.slots];
  const free = hot.slice(0, HOTKEYS).findIndex(v => v == null || added.slots[v]?.itemId == null);
  // hotbar cheia (1–0 ocupados): entra no FIM, clicável — nunca tira nada seu do lugar
  if (free >= 0) hot[free] = idx;
  else hot.push(idx);
  return { inventory: { ...added, hotbar: { ...added.hotbar, slots: hot } }, granted: true, full: false };
}
