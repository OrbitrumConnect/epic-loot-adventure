/**
 * O SORRISO no mundo: o mesmo motor de onda do Arpoador (SurfBreak) com o perfil do Sorriso, ligado SÓ na ressaca
 * (zs-ressaca.ts — confere 1×/s). Começou/acabou → avisa na tela. Fora da ressaca as ondas que já vinham terminam e
 * o mar fica liso (a malha nem desenha).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/game/state/game-store';
import type { ZsTerrain } from '../zs-terrain-data';
import { ressacaAt, ressacaForced } from '../zs-ressaca';
import { SurfBreak } from './surf-break';
import { findSorrisoFrame, SORRISO, SORRISO_AT, SORRISO_MESH, SORRISO_SERIES } from './sorriso';

export const RESSACA_ON_MSG = '🌊 RESSACA! O Sorriso está quebrando no meio de Copacabana.';
export const RESSACA_OFF_MSG = 'A ressaca passou — o Sorriso parou de quebrar.';

export function SorrisoBreak({ t }: { t: ZsTerrain }) {
  const forced = useMemo(ressacaForced, []);
  const [on, setOn] = useState(() => ressacaAt(Date.now(), forced).on);
  useEffect(() => {
    let was = ressacaAt(Date.now(), forced).on;
    if (was) useGameStore.getState().setMessage(RESSACA_ON_MSG);
    const id = window.setInterval(() => {
      const now = ressacaAt(Date.now(), forced).on;
      if (now === was) return;
      was = now; setOn(now);
      useGameStore.getState().setMessage(now ? RESSACA_ON_MSG : RESSACA_OFF_MSG);
    }, 1000);
    return () => window.clearInterval(id);
  }, [forced]);
  return (
    <SurfBreak t={t} shoreX={SORRISO_AT.x} shoreZ={SORRISO_AT.z} pf={SORRISO} frameOf={findSorrisoFrame}
      enabled={on} rule={SORRISO_SERIES} mesh={SORRISO_MESH} seed={20261030} />
  );
}
