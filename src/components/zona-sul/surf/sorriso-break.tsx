/**
 * O SORRISO no mundo: o mesmo motor de onda do Arpoador (SurfBreak) com o perfil do Sorriso. SEMPRE ligado, com a mesma
 * agenda de séries do Arpoador (Pedro 30/10: "fiz o redeploy, as ondas do Sorriso não aparecem mais — está com tempo
 * grande de intervalo? só ajustar o mesmo tempo do Arpoador"; antes só quebrava na janela da ressaca, 6 min a cada 20).
 */
import type { ZsTerrain } from '../zs-terrain-data';
import { SurfBreak } from './surf-break';
import { findSorrisoFrame, SORRISO, SORRISO_AT, SORRISO_MESH, SORRISO_SERIES } from './sorriso';

export function SorrisoBreak({ t }: { t: ZsTerrain }) {
  return (
    <SurfBreak t={t} shoreX={SORRISO_AT.x} shoreZ={SORRISO_AT.z} pf={SORRISO} frameOf={findSorrisoFrame}
      rule={SORRISO_SERIES} mesh={SORRISO_MESH} seed={20261030} />
  );
}
