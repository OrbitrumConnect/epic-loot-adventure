/**
 * Relógio da FEITICEIRA DA MATA (03/11): a cada 4 s pergunta ao store se ela surge (atrás do herói), vai embora ou se o
 * corpo sai. Não é 3D — igual ao NightFlock/BossSpawner. Montado só na Zona Sul, no modo 'world'.
 */
import { useEffect } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { heroFacing } from './free-aim';

export const SORC_CHECK_MS = 4000;

export function SorceressStalker() {
  useEffect(() => {
    const tick = () => useGameStore.getState().tickSorceress(Date.now(), heroFacing.yaw);
    const every = setInterval(tick, SORC_CHECK_MS);
    return () => clearInterval(every);
  }, []);
  return null;
}
