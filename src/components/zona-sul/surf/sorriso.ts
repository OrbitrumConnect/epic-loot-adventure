/**
 * O SORRISO (30/10, Pedro): "no meio de Copacabana existe uma onda famosa chamada Sorriso (na vida real, na ressaca). No
 * mar oceânico até a beira: quebra grande, vai se formando e antes da beira abre um tubo e morre pela areia. A extensão
 * real é de ~1.300 m da costa." O mapa é 1:7,4 → ~176 m da areia no jogo. No jogo: sempre, no tempo do Arpoador.
 *
 * Perfil (surf-wave.ts) — Pedro 30/10, desenho: "são 3 SEÇÕES e olha o FUNDO que ela vem": a ondulação nasce lá no
 * fundo (~350 m da areia) e vai crescendo; SEÇÃO 1 quebra a ~176 m (grande, ~8 m, com véu) e vira espuma; a espuma se
 * desfaz, a onda se refaz e a SEÇÃO 2 quebra a ~112 m; de novo, e a SEÇÃO 3 quebra na beira (~48 m), com tubo, e morre
 * na areia. Chega "gorda" (perde pouca altura entre as seções). A crista faz a curva do "sorriso" (BEND). Pico achado no
 * TERRENO: a linha da praia no meio de Copacabana, o mar à frente dela (perpendicular).
 */
import { type ZsTerrain, zsHeightAt, zsSurfAt, ZS_WATER_Y } from '../zs-terrain-data';
import { ZS_SURF } from '../zona-sul-meta';
import type { SurfMeshRule } from './surf-break';
import { type SurfFrame, surfLimits } from './surf-frame';
import { SERIES, type SeriesRule } from './surf-scheduler';
import type { SurfProfile } from './surf-wave';

/** distância (m, em q) do pico até a linha d'água */
export const SORRISO_SHORE_Q = 28;

export const SORRISO: SurfProfile = {
  id: 'sorriso',
  ZONE_S: 150, CORE_S: 110,
  Q_MIN: SORRISO_SHORE_Q - 350, Q_MAX: SORRISO_SHORE_Q + 8, Q_OPEN: 20, // "olha o fundo que ela vem": nasce a ~350 m
  C: 3.2,                           // Pedro 30/10: "está meio rápida demais" (4,2 → 3,2, igual ao Arpoador)
  BREAK_Q: SORRISO_SHORE_Q - 176,   // quebra a ~176 m da areia (1.300 m reais na escala 1:7,4)
  H_START: 0.4, H_MAX: 8.2,         // ressaca: maior que o Arpoador (6,3)
  V_PEEL: 9,                        // a parede grande vai quebrando de ponta a ponta
  CLOSE_LAG: 18, OPEN_EDGE: 9, CLOSE_EDGE: 7,
  EDGE_S: 24, EDGE_Q0: 20, EDGE_Q1: 10,
  BEND: 20, BEND_S: 130,            // a crista em "sorriso"
  // Pedro 30/10: "está quebrando sem fazer o véu, parece uma montanha de água — pode quebrar normal, fazer o formato de
  // quebra" → lá fora o lip/véu cai como no Arpoador (formato de quebra completo) e fecha em espuma um pouco atrás
  CURL_OUT: 1,
  BARREL_OUT: 1,
  CLOSE_LAG_OUT: 18,
  // "atrás da espuma está meio reto — pode ter mais volume em formato de rampa descendo": costas longas e a espuma
  // baixa menos depois de fechar
  BACK_W: 16,
  CLOSED_DROP: 0.35,
  FOAM_RIDE: true,                  // Pedro 30/10: "dá pra ficar ali pela espuma em pé e emendar na próxima seção?"
  DECAY: 0.45,                      // chega "gorda" na beira (~5 m na 3ª seção; o Arpoador perde 75%)
  // SEÇÃO 2 a ~112 m e SEÇÃO 3 na beira a ~48 m da areia (cada uma se refaz da espuma da anterior em ~25 m)
  INNER: [
    { Q: SORRISO_SHORE_Q - 112, REFORM: 26, V_PEEL: 8.5 },
    { Q: SORRISO_SHORE_Q - 48, REFORM: 24, V_PEEL: 8 },
  ],
};

/** Séries: o MESMO tempo do Arpoador (Pedro 30/10: "só ajustar o mesmo tempo do Arpoador") — 3–5 ondas a 12,5–15,5 s,
 *  calmaria de 45–60 s, 1ª série 10 s depois de entrar. */
export const SORRISO_SERIES: SeriesRule = SERIES;
/** Malha: mais rala que a do Arpoador (zona maior) — densa só nas faixas que dobram (as 3 seções). */
export const SORRISO_MESH: SurfMeshRule = { ds: 1.8, dsMobile: 2.8, dense: 0.4, denseMobile: 0.8, denseOuter: 0.75, denseOuterMobile: 1.6 };

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
