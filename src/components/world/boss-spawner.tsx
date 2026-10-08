/**
 * Faz o mini-boss (`raider_warlord`) nascer no mundo aberto em intervalos.
 * Não é 3D — só um relógio: dispara `spawnBoss()` na store, que decide o local
 * e garante um colosso por vez. Montado só no modo 'world'; sair pro city/raid
 * limpa os timers.
 */
import { useEffect } from 'react';
import { useGameStore } from '@/game/state/game-store';

/** Cadência do boss: a cada 15 min. */
export const BOSS_SPAWN_MS = 15 * 60 * 1000;
/** Primeiro colosso logo no começo (40–80 s) pra o mundo já ter ameaça/boss pra ver. */
const FIRST_SPAWN_MS = 40_000 + Math.random() * 40_000;

export function BossSpawner() {
  useEffect(() => {
    const spawn = () => useGameStore.getState().spawnBoss();
    const first = setTimeout(spawn, FIRST_SPAWN_MS);
    const every = setInterval(spawn, BOSS_SPAWN_MS);
    return () => { clearTimeout(first); clearInterval(every); };
  }, []);
  return null;
}
