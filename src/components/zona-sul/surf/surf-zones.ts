/**
 * ZONAS DE SURF (30/10, Pedro: o SORRISO no meio de Copacabana além do Arpoador). Antes havia UMA zona e os ganchos da
 * água (altura, empurrão, tubo, baforada, espuma) eram dela. Agora cada pico se REGISTRA aqui e os ganchos perguntam
 * "qual zona contém este ponto?" (as zonas não se sobrepõem). O mar em volta, o herói (eixos da prancha, velocidade da
 * onda) e o som leem a zona certa. Com só o Arpoador registrado, tudo funciona exatamente como antes.
 */
import { setZsWaterChurn, setZsWaterExtra, setZsWaterPush, setZsWaterSpit, setZsWaterTube } from '../zs-terrain-data';
import type { SurfFrame } from './surf-frame';
import { toSurfLocal } from './surf-frame';
import type { SurfScheduler } from './surf-scheduler';
import { type SurfProfile, surfChurnAt, surfHeightAt, surfInTubeAt, surfPushAt, surfSpitAt } from './surf-wave';

export type SurfZoneInfo = {
  readonly id: string; readonly pf: SurfProfile; readonly frame: SurfFrame; readonly scheduler: SurfScheduler;
  /** malha desenhada neste quadro (o mar em volta abre o buraco só então) */
  drawn: boolean;
};
export const surfZones: SurfZoneInfo[] = [];

/** (s, q) local está dentro da zona? */
export function inSurfZone(z: SurfZoneInfo, s: number, q: number): boolean {
  return s >= -z.frame.lim[1] && s <= z.frame.lim[0] && q >= z.pf.Q_MIN && q <= z.pf.Q_MAX;
}
/** A zona que contém (x, z) — com as coordenadas locais (s, q) — ou null. */
export function surfZoneAt(x: number, z: number): { zone: SurfZoneInfo; s: number; q: number } | null {
  for (const zn of surfZones) { const [s, q] = toSurfLocal(zn.frame, x, z); if (inSurfZone(zn, s, q)) return { zone: zn, s, q }; }
  return null;
}
/** A zona com o pico mais perto de (x, z) (som, tecla J). */
export function nearestSurfZone(x: number, z: number): SurfZoneInfo | null {
  let best: SurfZoneInfo | null = null, bd = Infinity;
  for (const zn of surfZones) { const d = Math.hypot(zn.frame.px - x, zn.frame.pz - z); if (d < bd) { bd = d; best = zn; } }
  return best;
}

function install(): void {
  setZsWaterExtra((x, z, yRef) => {
    const h = surfZoneAt(x, z); if (!h) return 0;
    const { zone: zn, s, q } = h;
    return surfHeightAt(s, q, zn.scheduler.states, zn.scheduler.vars, yRef, zn.frame.lim, zn.pf);
  });
  // a onda EMPURRA quem boia (carro parado na água, herói nadando) rumo à praia
  setZsWaterPush((x, z, out, yRef) => {
    const h = surfZoneAt(x, z); if (!h) return false;
    const { zone: zn, s, q } = h;
    const p = surfPushAt(s, q, zn.scheduler.states, zn.scheduler.vars, zn.frame.lim, yRef, zn.pf); if (p < 0.02) return false;
    out.x = zn.frame.qx * p; out.z = zn.frame.qz * p; return true;
  });
  setZsWaterTube((x, z, yRef) => {
    const h = surfZoneAt(x, z); if (!h) return false;
    const { zone: zn, s, q } = h;
    return surfInTubeAt(s, q, zn.scheduler.states, zn.scheduler.vars, yRef, zn.frame.lim, zn.pf);
  });
  setZsWaterSpit((x, z, yRef, out) => {
    const h = surfZoneAt(x, z); if (!h) return false;
    const { zone: zn, s, q } = h;
    const a = surfSpitAt(s, q, zn.scheduler.states, zn.scheduler.vars, yRef, zn.frame.lim, zn.pf); if (a === 0) return false;
    out.x = zn.frame.sx * a; out.z = zn.frame.sz * a; return true;
  });
  setZsWaterChurn((x, z) => {
    const h = surfZoneAt(x, z); if (!h) return 0;
    const { zone: zn, s, q } = h;
    return surfChurnAt(s, q, zn.scheduler.states, zn.scheduler.vars, zn.frame.lim, zn.pf);
  });
}
function uninstall(): void { setZsWaterExtra(null); setZsWaterPush(null); setZsWaterChurn(null); setZsWaterTube(null); setZsWaterSpit(null); }

/** Registra uma zona; devolve a função que tira ela (o último a sair desliga os ganchos da água). */
export function registerSurfZone(z: SurfZoneInfo): () => void {
  surfZones.push(z);
  if (surfZones.length === 1) install();
  return () => {
    const i = surfZones.indexOf(z); if (i >= 0) surfZones.splice(i, 1);
    if (surfZones.length === 0) uninstall();
  };
}
