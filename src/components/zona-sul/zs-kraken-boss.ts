/**
 * KRAKEN DAS CAGARRAS (04/11 — esquadra pirata, ETAPA 3). Pedro: "o Kraken chefe nas Cagarras: metade do corpo pra fora
 * d'água, tentáculos; luta de navio, com os canhões nos tentáculos".
 *
 * Mora no mar fundo ao NORTE das ilhas (as Cagarras ficam de fundo pra quem chega de Ipanema). Dorme debaixo d'água;
 * um navio a ≤ WAKE_R acorda: sobe (metade do corpo pra fora) com 6 TENTÁCULOS em volta.
 *  - TENTÁCULO: alcança o casco de navio (ou quem nada) a ≤ TENT_REACH da base dele — levanta e CHICOTEIA (dano no navio
 *    e em quem estiver no convés perto da pancada). Cada um tem vida própria: o canhão (estouro da bala) e o fuzil cortam.
 *  - CORPO: protegido enquanto houver tentáculo; todos cortados = EXPOSTO (vira alvo) e bate no navio que chegar perto.
 *  - De LONGE (≥ ROCK_MIN): arremessa PEDRA no navio mais perto até ROCK_RANGE — ficar parado longe não é seguro.
 *  - Todo mundo longe (> SLEEP_R) por SLEEP_MS = afunda e dorme (volta inteiro). Morto = volta depois de RESPAWN_MS.
 * Lógica pura aqui (testes); desenho, rede e dano em `zs-kraken-boss-view.tsx`.
 */
import { WARSHIP, warshipLocal, warshipWorld } from './zs-warship';

export const KRAKEN_BOSS = {
  LAIR: { x: 28, z: 878 },
  WAKE_R: 220, SLEEP_R: 450, SLEEP_MS: 30_000, RISE_S: 4,
  /** altura do corpo inteiro (m) e quanto dele fica DEBAIXO d'água lutando (metade pra fora) */
  BODY_H: 26, SUBMERGED_K: 0.45,
  TENTACLES: 6, TENT_RING: 13, TENT_LEN: 20, TENT_REACH: 21, TENT_HP: 3200, TENT_ARMOR: 10,
  /** chicotada: levanta (WIND) → bate (STRIKE) → fica na água (LIE) → volta; recarga entre uma e outra */
  TENT_SLAM_S: 4.2, TENT_WIND_S: 0.9, TENT_STRIKE_S: 0.3, TENT_LIE_S: 0.7,
  TENT_SHIP_DMG: 900, TENT_HERO_DMG: 70, TENT_HERO_R: 6,
  BODY_HP: 26_000, BODY_ARMOR: 30, BODY_REACH: 30, BODY_SLAM_S: 4.5, BODY_SHIP_DMG: 2200, BODY_HERO_DMG: 120,
  ROCK_MIN: 35, ROCK_RANGE: 180, ROCK_S: 6, ROCK_DMG: 1100, ROCK_HERO_DMG: 60,
  RESPAWN_MS: 20 * 60_000,
} as const;
export const KRAKEN_PREFIX = 'zs_kraken_';
export const KRAKEN_BODY_ID = `${KRAKEN_PREFIX}boss`;
export const krakenTentId = (i: number) => `${KRAKEN_PREFIX}t${i}`;
export const isKrakenBoss = (id: string) => id.startsWith(KRAKEN_PREFIX);

export type KrakenPhase = 'sleep' | 'rise' | 'fight' | 'dead';
export type SlamTarget = { kind: 'ship' | 'hero'; owner: string; x: number; z: number };
export type Tentacle = { i: number; alive: boolean; diedAt: number | null; reload: number; slam: (SlamTarget & { age: number; hit: boolean }) | null };
export type KrakenState = {
  phase: KrakenPhase; riseT: number; lastNearAt: number; nextAt: number;
  tents: Tentacle[]; bodyOut: boolean; bodyReload: number; bodyAct: 'idle' | 'attack' | 'death'; bodyActT: number; rockReload: number;
  /** pra onde o corpo olha (o alvo) */
  yaw: number;
};
export function newKraken(): KrakenState {
  return {
    phase: 'sleep', riseT: 0, lastNearAt: 0, nextAt: 0, bodyOut: false, bodyReload: KRAKEN_BOSS.BODY_SLAM_S, bodyAct: 'idle', bodyActT: 0,
    rockReload: KRAKEN_BOSS.ROCK_S, yaw: Math.PI,
    tents: Array.from({ length: KRAKEN_BOSS.TENTACLES }, (_, i) => ({ i, alive: true, diedAt: null, reload: 1 + i * 0.6, slam: null })),
  };
}
/** o estado do mundo (anfitrião simula; convidado espelha) */
export const zsKraken: { s: KrakenState } = { s: newKraken() };

/** Base do tentáculo `i` (no anel em volta do corpo). */
export function tentacleBase(i: number, lair: { x: number; z: number } = KRAKEN_BOSS.LAIR): { x: number; z: number } {
  const a = (i / KRAKEN_BOSS.TENTACLES) * Math.PI * 2 + 0.3;
  return { x: lair.x + Math.sin(a) * KRAKEN_BOSS.TENT_RING, z: lair.z + Math.cos(a) * KRAKEN_BOSS.TENT_RING };
}
/** Ponto do CASCO mais perto de `p` (o retângulo do navio). */
export function hullNearestPoint(ship: { x: number; z: number; yaw: number }, p: { x: number; z: number }, halfBeam: number, len: number = WARSHIP.LENGTH): { x: number; z: number } {
  const l = warshipLocal(ship, p.x, p.z);
  return warshipWorld(ship, Math.max(-halfBeam, Math.min(halfBeam, l.u)), Math.max(-len / 2, Math.min(len / 2, l.v)));
}
export type KrakenShip = { owner: string; x: number; z: number; yaw: number };
export type KrakenHero = { id: string; x: number; z: number; inWater: boolean };
/** Alvo da chicotada do tentáculo na base `b`: o casco mais perto ao alcance; senão quem NADA ao alcance. */
export function tentacleTarget(b: { x: number; z: number }, ships: readonly KrakenShip[], heroes: readonly KrakenHero[], halfBeam: number): SlamTarget | null {
  let best: SlamTarget | null = null, bd: number = KRAKEN_BOSS.TENT_REACH;
  for (const s of ships) {
    const q = hullNearestPoint(s, b, halfBeam), d = Math.hypot(q.x - b.x, q.z - b.z);
    if (d <= bd) { bd = d; best = { kind: 'ship', owner: s.owner, x: q.x, z: q.z }; }
  }
  if (best) return best;
  for (const h of heroes) {
    if (!h.inWater) continue;
    const d = Math.hypot(h.x - b.x, h.z - b.z);
    if (d <= bd) { bd = d; best = { kind: 'hero', owner: h.id, x: h.x, z: h.z }; }
  }
  return best;
}
/** O navio mais perto do covil (distância ao CASCO) e a distância. */
export function nearestShip(ships: readonly KrakenShip[], halfBeam: number, lair: { x: number; z: number } = KRAKEN_BOSS.LAIR): { ship: KrakenShip; d: number } | null {
  let best: { ship: KrakenShip; d: number } | null = null;
  for (const s of ships) {
    const q = hullNearestPoint(s, lair, halfBeam), d = Math.hypot(q.x - lair.x, q.z - lair.z);
    if (!best || d < best.d) best = { ship: s, d };
  }
  return best;
}
/** Fases: dorme → sobe (alguém a ≤ WAKE_R) → luta → dorme de novo (todos longe por SLEEP_MS) / morto → volta depois. */
export function krakenPhaseStep(k: KrakenState, now: number, dt: number, nearest: number): KrakenPhase {
  if (nearest <= KRAKEN_BOSS.SLEEP_R) k.lastNearAt = now;
  switch (k.phase) {
    case 'sleep': if (nearest <= KRAKEN_BOSS.WAKE_R) { k.phase = 'rise'; k.riseT = 0; k.lastNearAt = now; } break;
    case 'rise': k.riseT += dt; if (k.riseT >= KRAKEN_BOSS.RISE_S) k.phase = 'fight'; break;
    case 'fight': if (now - k.lastNearAt > KRAKEN_BOSS.SLEEP_MS) { const fresh = newKraken(); Object.assign(k, fresh); } break;
    case 'dead': if (now >= k.nextAt) Object.assign(k, newKraken()); break;
  }
  return k.phase;
}
/** Tempo total de uma chicotada (s). */
export const SLAM_TOTAL_S = KRAKEN_BOSS.TENT_WIND_S + KRAKEN_BOSS.TENT_STRIKE_S + KRAKEN_BOSS.TENT_LIE_S + 0.8;
/** Avança a chicotada do tentáculo; devolve o alvo NO QUADRO DA PANCADA (aplica o dano 1×), senão null. */
export function tentacleStep(t: Tentacle, dt: number, pick: () => SlamTarget | null): SlamTarget | null {
  if (!t.alive) { t.slam = null; return null; }
  if (t.slam) {
    t.slam.age += dt;
    if (!t.slam.hit && t.slam.age >= KRAKEN_BOSS.TENT_WIND_S + KRAKEN_BOSS.TENT_STRIKE_S) { t.slam.hit = true; return t.slam; }
    if (t.slam.age >= SLAM_TOTAL_S) { t.slam = null; t.reload = KRAKEN_BOSS.TENT_SLAM_S; }
    return null;
  }
  t.reload -= dt;
  if (t.reload > 0) return null;
  const tg = pick();
  if (!tg) { t.reload = 0.5; return null; }
  t.slam = { ...tg, age: 0, hit: false };
  return null;
}
/** Ângulo do tentáculo (0 = em pé, π/2 = deitado na direção do alvo) pela idade da chicotada: levanta pra trás, bate, fica. */
export function slamLean(age: number): number {
  const { TENT_WIND_S: W, TENT_STRIKE_S: S, TENT_LIE_S: L } = KRAKEN_BOSS;
  if (age < W) return -0.45 * Math.sin((age / W) * Math.PI / 2);                 // recua (arma o golpe)
  if (age < W + S) return -0.45 + ((age - W) / S) * (Math.PI / 2 + 0.45);       // chicote
  if (age < W + S + L) return Math.PI / 2;                                       // na água
  return Math.PI / 2 * Math.max(0, 1 - (age - W - S - L) / 0.8);                // volta a ficar em pé
}
/** Todos os tentáculos cortados? (o corpo fica exposto) */
export const allTentaclesCut = (k: KrakenState) => k.tents.every((t) => !t.alive);
