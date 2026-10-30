/**
 * O que a PÁGINA do jogo assina sem redesenhar à toa (30/10, Pedro: "o lag está aumentando"). Medido com perfil de CPU:
 *  - a posição do herói muda ~7×/s → a página INTEIRA (HUD, barra, painéis) re-renderizava junto (39% da CPU dirigindo);
 *  - em COMBATE a vida, o "último dano" e a mensagem "X ataca! −dano" mudam a cada golpe → idem (12% da CPU no acampamento).
 * `usePlayerForPage` devolve o MESMO jogador enquanto só posição/vida/mana/vigor mudaram; `useUiForPage` o mesmo UI
 * enquanto só a mensagem mudou. As barras, as coordenadas e a linha de mensagem assinam SÓ o número delas (componentes
 * próprios na página). Qualquer outra mudança (XP, mochila, nível, morte…) redesenha igual a antes.
 */
import { useRef } from 'react';
import type { PlayerState, UIState } from '@/game/types';
import { useGameStore } from './game-store';

type GameState = ReturnType<typeof useGameStore.getState>;

/** Iguais em tudo menos `skip` (mesmas referências — a store troca só o que mudou). */
export function sameExcept<T extends object>(a: T, b: T, skip: readonly (keyof T)[]): boolean {
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!skip.includes(k) && a[k] !== b[k]) return false;
  return true;
}
export const sameButPosition = (a: PlayerState, b: PlayerState) => sameExcept(a, b, ['position']);

/** Chaves que mudam o tempo todo e têm componente próprio na página. */
export const PAGE_PLAYER_SKIP: readonly (keyof PlayerState)[] = ['position', 'hp', 'mana', 'stamina', 'lastDamagedAt'];
export const PAGE_UI_SKIP: readonly (keyof UIState)[] = ['message'];

function useStableExcept<T extends object>(select: (s: GameState) => T, skip: readonly (keyof T)[]): T {
  const last = useRef<T | null>(null);
  return useGameStore((s) => {
    const v = select(s), prev = last.current;
    if (prev && prev !== v && sameExcept(prev, v, skip)) return prev;
    last.current = v;
    return v;
  });
}

export function usePlayerForPage(): PlayerState { return useStableExcept((s) => s.player, PAGE_PLAYER_SKIP); }
export function useUiForPage(): UIState { return useStableExcept((s) => s.ui, PAGE_UI_SKIP); }
