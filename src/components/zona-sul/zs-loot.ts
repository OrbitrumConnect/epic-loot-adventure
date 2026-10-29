/**
 * ZONA SUL — o LOOT do jogo, só LEITURA (Pedro 28/10: "pôr o I pra acessar o mesmo loot do outro mapa, e a prancha de
 * surf num slot"). Lê o inventário do save do jogo (`tribos.local.v1`) e faz uma CÓPIA local + a PRANCHA.
 *
 * Por que cópia e não o inventário de verdade: o save do jogo RECUSA item que ele não conhece (a prancha não existe lá) —
 * um save recusado já derrubou o progresso do Pedro uma vez (23/10). Aqui nada é gravado: o save do jogo fica intacto.
 * (Gravar o que muda na Zona Sul vem quando o jogo migrar pra cá.)
 */
import { ITEMS } from '@/game/data/items';
import { parseLocalSave, SAVE_KEY } from '@/game/systems/persistenceSystem';

export const ZS_BOARD_ID = 'zs_surfboard';
export const ZS_HOTBAR_SIZE = 10;

export type ZsLootSlot = { itemId: string; quantity: number };
/** `hotbar[i]` = índice em `slots` (ou null). */
export type ZsLoot = { slots: ZsLootSlot[]; hotbar: (number | null)[] };
type InvLike = { slots: { itemId: string | null; quantity: number }[]; hotbar: { slots: (number | null)[] } };

/** Nome do item (a prancha é só da Zona Sul). */
export function zsItemName(id: string | null | undefined): string {
  if (!id) return 'Vazio';
  if (id === ZS_BOARD_ID) return 'Prancha de surf';
  return ITEMS[id]?.name ?? id;
}

/** Cópia do inventário (sem slots vazios; hotbar remapeado) + a prancha no fim. Puro. */
export function zsLootFrom(inv: InvLike | null | undefined): ZsLoot {
  const slots: ZsLootSlot[] = [], remap = new Map<number, number>();
  inv?.slots.forEach((s, i) => { if (s.itemId && s.quantity > 0) { remap.set(i, slots.length); slots.push({ itemId: s.itemId, quantity: s.quantity }); } });
  const hotbar: (number | null)[] = Array.from({ length: ZS_HOTBAR_SIZE }, (_, i) => {
    const src = inv?.hotbar.slots[i];
    return src != null && remap.has(src) ? remap.get(src)! : null;
  });
  slots.push({ itemId: ZS_BOARD_ID, quantity: 1 });
  return { slots, hotbar };
}

/** Lê o save do jogo (sem gravar). Sem save: o inventário atual da memória (`fallback`). */
export function readZsLoot(storage: Pick<Storage, 'getItem'> | null, fallback?: InvLike | null): ZsLoot {
  try {
    const save = storage ? parseLocalSave(storage.getItem(SAVE_KEY)) : null;
    if (save) return zsLootFrom(save.player.inventory);
  } catch { /* storage bloqueado: usa o da memória */ }
  return zsLootFrom(fallback);
}

/** Põe o item `slot` no espaço `hot` do hotbar (tira de outro espaço se já estava lá). Puro. */
export function zsAssignHotbar(loot: ZsLoot, hot: number, slot: number): ZsLoot {
  const hotbar = loot.hotbar.map((v) => (v === slot ? null : v));
  hotbar[hot] = slot;
  return { ...loot, hotbar };
}

/** Item no espaço selecionado do hotbar. */
export function zsSelectedItem(loot: ZsLoot, hot: number): string | null {
  const i = loot.hotbar[hot];
  return i != null ? loot.slots[i]?.itemId ?? null : null;
}
