/**
 * O SORRISO (30/10, Pedro): "no meio de Copacabana existe uma onda famosa chamada Sorriso, que só acontece quando tem
 * ressaca. No mar oceânico até a beira: quebra grande, mais cheia, menos tubular, vai se formando e antes da beira abre
 * um tubo e morre pela areia. A extensão real é de ~1.300 m da costa." O mapa é 1:7,4 → ~176 m da areia no jogo.
 *
 * Perfil (surf-wave.ts): nasce ~233 m mar adentro, QUEBRA a ~176 m da areia (grande, ~8 m; o lip arremessa só 35% =
 * quebra cheia, que vira espuma), vem rolando; a ~34 m da beira a espuma se desfaz, a onda se refaz e QUEBRA DE NOVO
 * abrindo pros lados — agora com TUBO — e morre na areia. A crista faz a curva do "sorriso" (BEND). Pico achado no
 * TERRENO: a linha da praia no meio de Copacabana, o mar à frente dela (perpendicular).
 */
import { type ZsTerrain, zsHeightAt, zsSurfAt, ZS_WATER_Y } from '../zs-terrain-data';
import { ZS_SURF } from '../zona-sul-meta';
import type { SurfMeshRule } from './surf-break';
import { type SurfFrame, surfLimits } from './surf-frame';
import type { SeriesRule } from './surf-scheduler';
import type { SurfProfile } from './surf-wave';

/** distância (m, em q) do pico até a linha d'água */
export const SORRISO_SHORE_Q = 28;

export const SORRISO: SurfProfile = {
  id: 'sorriso',
  ZONE_S: 150, CORE_S: 110,
  Q_MIN: -205, Q_MAX: SORRISO_SHORE_Q + 8, Q_OPEN: 20,
  C: 4.2,                           // onda grande anda mais rápido que a do Arpoador (3,2)
  BREAK_Q: SORRISO_SHORE_Q - 176,   // quebra a ~176 m da areia (1.300 m reais na escala 1:7,4)
  H_START: 0.5, H_MAX: 8.2,         // ressaca: maior que o Arpoador (6,3)
  V_PEEL: 12,                       // a parede grande vai quebrando rápido de ponta a ponta (cheia)
  CLOSE_LAG: 18, OPEN_EDGE: 9, CLOSE_EDGE: 7,
  EDGE_S: 24, EDGE_Q0: 20, EDGE_Q1: 10,
  BEND: 20, BEND_S: 130,            // a crista em "sorriso"
  CURL_OUT: 0.35,                   // lá fora: o lip arremessa pouco…
  BARREL_OUT: 0,                    // …e não forma cavidade: parede CHEIA que vira espuma (30/10: com tubo baixo ficava "bloco")
  CLOSE_LAG_OUT: 6,                 // a crista quebra em espuma logo atrás de onde abriu
  INNER: { Q: SORRISO_SHORE_Q - 32, REFORM: 34, V_PEEL: 8.5 }, // perto da beira: se refaz e abre o tubo
};

/** Séries na ressaca: ondas a ~60 m uma da outra (14–18 s × 4,2 m/s), calmaria curta (o mar está mexido). */
export const SORRISO_SERIES: SeriesRule = { CALM_MIN: 30, CALM_MAX: 45, MIN_WAVES: 3, MAX_WAVES: 5, GAP_MIN: 14, GAP_MAX: 18, FIRST_AT: 4, MAX_DT: 0.25 };
/** Malha: mais rala que a do Arpoador (zona maior) — densa só nas duas faixas que dobram. */
export const SORRISO_MESH: SurfMeshRule = { ds: 1.4, dsMobile: 2.5, dense: 0.35, denseMobile: 0.7, denseOuter: 0.6, denseOuterMobile: 1.2 };

/** Meio de Copacabana (na areia) — medido no terreno (praia de x ≈ 220 a 560). */
export const SORRISO_AT = { x: 390, z: 50 } as const;

/**
 * Pico do Sorriso pelo terreno: ajusta uma reta na linha da praia (a areia mais ao sul, de 90 m em 90 m do meio), o mar
 * fica do lado +z (sul); acha a linha d'água no meio e põe o pico SORRISO_SHORE_Q m mar adentro, com o eixo q (mar →
 * praia) perpendicular à praia. Puro (testável no terreno de verdade).
 */
export function findSorrisoFrame(t: ZsTerrain): SurfFrame | null {
  const pts: { x: number; z: number }[] = [];
  for (let x = SORRISO_AT.x - 90; x <= SORRISO_AT.x + 90; x += 10) {
    for (let z = SORRISO_AT.z + 160; z >= SORRISO_AT.z - 160; z -= 1) if (zsSurfAt(t, x, z) === ZS_SURF.beach) { pts.push({ x, z }); break; }
  }
  if (pts.length < 5) return null;
  // z = a·x + b (mínimos quadrados)
  const n = pts.length, mx = pts.reduce((s, p) => s + p.x, 0) / n, mz = pts.reduce((s, p) => s + p.z, 0) / n;
  let sxx = 0, sxz = 0; for (const p of pts) { sxx += (p.x - mx) ** 2; sxz += (p.x - mx) * (p.z - mz); }
  const a = sxz / Math.max(1e-6, sxx);
  // normal pro MAR (lado +z): (−a, 1) normalizado
  const L = Math.hypot(a, 1), nx = -a / L, nz = 1 / L;
  // linha d'água no meio: anda da areia pro mar até ter água
  const bz = a * (SORRISO_AT.x - mx) + mz;
  let wx = SORRISO_AT.x, wz = bz;
  for (let d = 0; d < 120 && zsHeightAt(t, wx, wz) >= ZS_WATER_Y; d += 0.5) { wx = SORRISO_AT.x + nx * d; wz = bz + nz * d; }
  const px = wx + nx * SORRISO_SHORE_Q, pz = wz + nz * SORRISO_SHORE_Q;
  const qx = -nx, qz = -nz, sx = -qz, sz = qx; // q = mar → praia; s = direita de quem olha pra praia
  const depth = ZS_WATER_Y - zsHeightAt(t, px, pz);
  let cnt = 0, wet = 0;
  for (let s = -SORRISO.CORE_S; s <= SORRISO.CORE_S; s += 10) for (let q = SORRISO.Q_MIN; q <= SORRISO.Q_OPEN; q += 10) {
    cnt++; if (zsHeightAt(t, px + sx * s + qx * q, pz + sz * s + qz * q) < ZS_WATER_Y - 0.4) wet++;
  }
  return { px, pz, qx, qz, sx, sz, water: wet / cnt, depth, lim: surfLimits(t, px, pz, qx, qz, sx, sz, SORRISO) };
}
