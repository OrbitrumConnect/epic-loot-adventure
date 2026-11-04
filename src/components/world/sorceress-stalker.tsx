/**
 * Relógio dos PERSEGUIDORES da mata (03/11): Feiticeira e Guerreiro Indígena. A cada 4 s pergunta ao store se surgem
 * (atrás do herói), vão embora, recuam ferido ou voltam; o corpo da Feiticeira sai depois de cair. Não é 3D — igual ao
 * NightFlock/BossSpawner. Montado só na Zona Sul, no modo 'world'.
 */
import { useEffect } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { heroFacing } from './free-aim';

export const SORC_CHECK_MS = 4000;

export function SorceressStalker() {
  useEffect(() => {
    const tick = () => {
      const st = useGameStore.getState(), now = Date.now();
      st.tickSorceress(now, heroFacing.yaw);
      st.tickIndigena(now, heroFacing.yaw); // 03/11: o Guerreiro Indígena (não morre, recua e volta) usa o mesmo relógio
    };
    const every = setInterval(tick, SORC_CHECK_MS);
    return () => clearInterval(every);
  }, []);
  return null;
}
