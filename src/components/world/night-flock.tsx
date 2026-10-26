/**
 * Relógio do BANDO DA NOITE (Pedro 26/10: "mais pombos à noite"): a cada 5 s pergunta ao store se o bando chega
 * (escureceu) ou vai embora (clareou). Não é 3D — igual ao BossSpawner. Montado só no modo 'world'.
 */
import { useEffect } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { nightFactor } from '@/game/systems/dayNightSystem';

export const NIGHT_FLOCK_CHECK_MS = 5000;

export function NightFlock() {
  useEffect(() => {
    const tick = () => useGameStore.getState().tickNightFlock(nightFactor());
    tick();
    const every = setInterval(tick, NIGHT_FLOCK_CHECK_MS);
    return () => clearInterval(every);
  }, []);
  return null;
}
