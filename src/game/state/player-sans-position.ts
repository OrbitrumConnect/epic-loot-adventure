/**
 * O jogador SEM a posição (30/10, Pedro: "o lag está aumentando"). O herói grava a posição na store ~7×/s e a página
 * INTEIRA do jogo (HUD, barra, painéis) re-renderizava junto — medido andando de carro: 39% da CPU, travada de 100–250 ms
 * a cada ~200 ms. `usePlayerSansPosition` devolve o MESMO objeto enquanto só a posição mudou (vida, XP, mochila… mudando
 * = re-renderiza igual). Quem precisa da posição lê `getState()` na hora ou assina só ela.
 */
import { useRef } from 'react';
import type { PlayerState } from '@/game/types';
import { useGameStore } from './game-store';

/** Iguais em tudo menos `position` (mesmas referências — a store troca só o que mudou). */
export function sameButPosition(a: PlayerState, b: PlayerState): boolean {
  const ka = Object.keys(a) as (keyof PlayerState)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (k !== 'position' && a[k] !== b[k]) return false;
  return true;
}

export function usePlayerSansPosition(): PlayerState {
  const last = useRef<PlayerState | null>(null);
  return useGameStore((s) => {
    const p = s.player, prev = last.current;
    if (prev && prev !== p && sameButPosition(prev, p)) return prev;
    last.current = p;
    return p;
  });
}
