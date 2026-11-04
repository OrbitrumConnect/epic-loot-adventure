/**
 * O que a PÁGINA do jogo assina sem redesenhar à toa (30/10, Pedro: "o lag está aumentando"). Medido com perfil de CPU:
 *  - a posição do herói muda ~7×/s → a página INTEIRA (HUD, barra, painéis) re-renderizava junto (39% da CPU dirigindo);
 *  - em COMBATE a vida, o "último dano" e a mensagem "X ataca! −dano" mudam a cada golpe → idem (12% da CPU no acampamento).
 * `usePlayerForPage` devolve o MESMO jogador enquanto só posição/vida/mana/vigor mudaram; `useUiForPage` o mesmo UI
 * enquanto só a mensagem mudou. As barras, as coordenadas e a linha de mensagem assinam SÓ o número delas (componentes
 * próprios na página). Qualquer outra mudança (XP, mochila, nível, morte…) redesenha igual a antes.
 */
import { useRef } from 'react';
import type { InventoryState, PlayerState, UIState } from '@/game/types';
import { useGameStore } from './game-store';

type GameState = ReturnType<typeof useGameStore.getState>;
type KeyEq<T> = Partial<{ [K in keyof T]: (x: T[K], y: T[K]) => boolean }>;

/** Iguais em tudo menos `skip` (mesmas referências — a store troca só o que mudou). `eq`: chave com comparação própria. */
export function sameExcept<T extends object>(a: T, b: T, skip: readonly (keyof T)[], eq?: KeyEq<T>): boolean {
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (skip.includes(k) || a[k] === b[k]) continue;
    const f = eq?.[k];
    if (!f || !f(a[k], b[k])) return false;
  }
  return true;
}
export const sameButPosition = (a: PlayerState, b: PlayerState) => sameExcept(a, b, ['position']);

/**
 * MOCHILA que só mudou na QUANTIDADE de munição (03/11 — gatilho segurado, até 10 tiros/s; perfil de CPU segurando o
 * fuzil: a página inteira redesenhava a cada bala). Igual pra PÁGINA quando: mesmos itens nos mesmos lugares, mesmas
 * quantidades fora a munição, mesma barra rápida — e a munição NÃO está na barra rápida (lá a quantidade aparece). O
 * contador de munição e o peso da mochila assinam o número deles (componentes próprios). Acabou a munição (o espaço
 * esvazia) ou qualquer outra mudança: redesenha como antes.
 */
export function sameInvButAmmo(a: InventoryState, b: InventoryState): boolean {
  if (a.maxWeight !== b.maxWeight || a.maxSlots !== b.maxSlots || a.equipment !== b.equipment || a.slots.length !== b.slots.length) return false;
  if (a.hotbar !== b.hotbar && (a.hotbar.slots.length !== b.hotbar.slots.length || a.hotbar.slots.some((v, i) => v !== b.hotbar.slots[i]))) return false;
  let ammoDiff = false;
  for (let i = 0; i < a.slots.length; i++) {
    const x = a.slots[i], y = b.slots[i];
    if (x === y) continue;
    if (!x || !y || x.itemId !== y.itemId) return false;
    if (x.quantity === y.quantity) continue;
    if (x.itemId !== 'ammo') return false;
    ammoDiff = true;
  }
  return !(ammoDiff && b.hotbar.slots.some((i) => i != null && b.slots[i]?.itemId === 'ammo'));
}

/** Chaves que mudam o tempo todo e têm componente próprio na página. 03/11: + lastAttackAt (muda a cada tiro/golpe; a
 *  página não usa — a cadência é lida na hora pelo jogo). */
export const PAGE_PLAYER_SKIP: readonly (keyof PlayerState)[] = ['position', 'hp', 'mana', 'stamina', 'lastDamagedAt', 'lastAttackAt'];
const PAGE_PLAYER_EQ: KeyEq<PlayerState> = { inventory: sameInvButAmmo };
export const PAGE_UI_SKIP: readonly (keyof UIState)[] = ['message'];

function useStableExcept<T extends object>(select: (s: GameState) => T, skip: readonly (keyof T)[], eq?: KeyEq<T>): T {
  const last = useRef<T | null>(null);
  return useGameStore((s) => {
    const v = select(s), prev = last.current;
    if (prev && prev !== v && sameExcept(prev, v, skip, eq)) return prev;
    last.current = v;
    return v;
  });
}

export function usePlayerForPage(): PlayerState { return useStableExcept((s) => s.player, PAGE_PLAYER_SKIP, PAGE_PLAYER_EQ); }
export function useUiForPage(): UIState { return useStableExcept((s) => s.ui, PAGE_UI_SKIP); }
