/**
 * KIT DA ZONA SUL (29/10): a PRANCHA é item oficial do jogo e TODO personagem tem uma (Pedro: "ela já tem que entrar
 * dentro do loot" — um amigo na onda 100+ não recebeu: mochila cheia). Puro e idempotente:
 *  - quem já tem (mochila) não ganha outra;
 *  - vai pro primeiro espaço LIVRE da mochila; mochila CHEIA → a mochila ganha UM espaço a mais só pra ela (nada sai do
 *    lugar, nada se perde). Ela não pesa (veículo, como a caixa de munição) → nunca trava a coleta de ninguém;
 *  - entra no 1º espaço livre da hotbar (1–0); hotbar cheia → no fim, clicável.
 */
import type { InventoryState } from '../types';
import { addItem, canAddItem, getItemCount } from './inventorySystem';

export const SURFBOARD_ID = 'surfboard';
/** teclas 1–9 e 0 */
const HOTKEYS = 10;

export type KitResult = { inventory: InventoryState; granted: boolean; grewBag: boolean };

export function grantSurfboard(inv: InventoryState): KitResult {
  if (getItemCount(inv, SURFBOARD_ID) > 0) return { inventory: inv, granted: false, grewBag: false };
  let added: InventoryState;
  let grewBag = false;
  if (canAddItem(inv, SURFBOARD_ID, 1)) added = addItem(inv, SURFBOARD_ID, 1);
  else {
    // mochila cheia: um espaço novo no FIM só pra prancha (o save aceita: espaços = maxSlots)
    added = { ...inv, slots: [...inv.slots, { itemId: SURFBOARD_ID, quantity: 1 }], maxSlots: inv.maxSlots + 1 };
    grewBag = true;
  }
  const idx = added.slots.findIndex(s => s.itemId === SURFBOARD_ID);
  const hot = [...added.hotbar.slots];
  const free = hot.slice(0, HOTKEYS).findIndex(v => v == null || added.slots[v]?.itemId == null);
  // hotbar cheia (1–0 ocupados): entra no FIM, clicável — nunca tira nada seu do lugar
  if (free >= 0) hot[free] = idx;
  else hot.push(idx);
  return { inventory: { ...added, hotbar: { ...added.hotbar, slots: hot } }, granted: true, grewBag };
}
