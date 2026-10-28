/**
 * ZONA SUL — onde fica a zona de surf (fase B): procura o PICO perto de um ponto da praia (a partida, no Arpoador) com
 * a zona INTEIRA em água aberta (sem pedra/areia dentro — onda não quebra em cima de terra) e o eixo q apontando pra
 * praia. Puro (testável no terreno de verdade). Nada é inventado: sai do relevo/costa do mapa.
 */
import { type ZsTerrain, zsHeightAt, ZS_WATER_Y } from '../zs-terrain-data';
import { SURF } from './surf-wave';

export type SurfFrame = {
  /** pico (mundo) */ px: number; pz: number;
  /** eixo q (mar → praia) e eixo s (direita do surfista de frente pra praia), unitários no plano xz */
  qx: number; qz: number; sx: number; sz: number;
  /** fração da zona em água e profundidade no pico */ water: number; depth: number;
  /** até onde a onda vai de cada lado (m em s): [direita, esquerda] — para antes de pedra/areia (a onda MORRE na pedra) */
  lim: [number, number];
};

/** Até onde (|s|) a região do tubo (q ≤ Q_OPEN) é água aberta de cada lado, com folga de 6 m. Máx. ZONE_S. */
export function surfLimits(t: ZsTerrain, px: number, pz: number, qx: number, qz: number, sx: number, sz: number): [number, number] {
  const side = (sign: number) => {
    for (let a = 4; a <= SURF.ZONE_S; a += 2) for (let q = SURF.Q_MIN; q <= SURF.Q_OPEN; q += 4) {
      const s = sign * a;
      if (zsHeightAt(t, px + sx * s + qx * q, pz + sz * s + qz * q) >= ZS_WATER_Y - 0.4) return Math.max(SURF.EDGE_S, a - 6);
    }
    return SURF.ZONE_S;
  };
  return [side(1), side(-1)];
}

/** Mundo → local (s, q). */
export function toSurfLocal(f: SurfFrame, x: number, z: number): [number, number] {
  const dx = x - f.px, dz = z - f.pz;
  return [dx * f.sx + dz * f.sz, dx * f.qx + dz * f.qz];
}

export function findSurfFrame(t: ZsTerrain, shoreX: number, shoreZ: number): SurfFrame | null {
  let best: SurfFrame | null = null, bestScore = -Infinity;
  for (let d = 55; d <= 140; d += 5) for (let a = 0; a < 72; a++) {
    const ang = a / 72 * Math.PI * 2, px = shoreX + Math.cos(ang) * d, pz = shoreZ + Math.sin(ang) * d;
    const depth = ZS_WATER_Y - zsHeightAt(t, px, pz);
    if (depth < 2.5) continue;
    const qx = (shoreX - px) / d, qz = (shoreZ - pz) / d, sx = -qz, sz = qx; // s = direita de quem olha pra praia (+q)
    let n = 0, wet = 0;
    // só onde o TUBO existe precisa ser água aberta (até Q_OPEN); depois a espuma corre até a areia
    for (let s = -SURF.ZONE_S; s <= SURF.ZONE_S; s += 10) for (let q = SURF.Q_MIN; q <= SURF.Q_OPEN; q += 10) {
      n++; if (zsHeightAt(t, px + sx * s + qx * q, pz + sz * s + qz * q) < ZS_WATER_Y - 0.4) wet++;
    }
    const water = wet / n;
    const score = water * 10 - Math.abs(d - 80) * 0.01 - Math.abs(depth - 5) * 0.02;
    if (score > bestScore) { bestScore = score; best = { px, pz, qx, qz, sx, sz, water, depth, lim: [SURF.ZONE_S, SURF.ZONE_S] }; }
  }
  if (best) best.lim = surfLimits(t, best.px, best.pz, best.qx, best.qz, best.sx, best.sz);
  return best; // quem usa confere `water` (zona toda em água aberta)
}
