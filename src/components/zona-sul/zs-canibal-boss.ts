/**
 * CANIBAL GIGANTE DO COVIL (04/11, Pedro: "o boss dentro da cave profunda … o corpo dele vem do meio e ele tem raízes
 * similares ao tentáculo, pode dar empurrão, ver se pega o herói, bate no chão … o canibal gigante meio que do tamanho do
 * Kraken dentro da terra" · "o boss também é da cintura pra cima, sai do buraco fundo" · "só mata com bazuca — ela dá
 * praticamente todo o dano, o resto é fraco"). Regras PURAS (testáveis); o desenho e a simulação em zs-canibal-boss-view.
 *  - Mora no MEIO da arena do covil (−55 m): o corpo sai do BURACO da cintura pra cima (~55 m fora do chão).
 *  - 6 RAÍZES saem do chão em volta: CHICOTADA que bate no chão (dano + EMPURRÃO) e às vezes AGARRA o herói (preso ~2 s,
 *    3 pancadas; acertar a raiz solta). O corpo dá PANCADA em quem chega perto (empurra longe).
 *  - ARMADURA altíssima no corpo e nas raízes: espada/fuzil/poderes quase não entram; o míssil da BAZUCA atravessa a
 *    armadura (o dano cheio). Recomendado nível 60+ (em grupo, menos).
 *  - Acorda com alguém na ARENA (lá embaixo); sem ninguém por 30 s, volta inteiro pro buraco. Morto volta em 20 min.
 */
import { CAVE_LAIR } from './zs-cave';

export const CANIBAL = {
  NAME: 'Canibal Gigante',
  /** corpo: altura do modelo inteiro (m) e a fração que fica no BURACO (da cintura pra cima pra fora) */
  BODY_H: 110,
  SUBMERGED_K: 0.5,
  BODY_R: 12,
  /** o buraco no meio da arena (raio, m) */
  PIT_R: 18,
  /** acorda: alguém até WAKE_R do centro e já lá embaixo (pé abaixo de WAKE_BELOW); dorme sem ninguém em SLEEP_R por SLEEP_MS */
  WAKE_R: 62,
  WAKE_BELOW: -25,
  SLEEP_R: 110,
  SLEEP_MS: 30_000,
  RISE_S: 5,
  /** raízes: quantas, raio do anel onde saem, comprimento, grossura, alcance da chicotada */
  ROOTS: 6,
  ROOT_RING: 30,
  ROOT_LEN: 46,
  ROOT_R: 3,
  ROOT_REACH: 40,
  ROOT_HP: 9000,
  /** armadura (corta metade disto de cada golpe — o míssil da bazuca atravessa) */
  ARMOR: 800,
  /** chicotada: intervalo de cada raiz, levantar / bater / ficar no chão (s) */
  SLAM_EVERY_S: 4.5,
  WIND_S: 1.2,
  STRIKE_S: 0.4,
  LIE_S: 1.0,
  /** onde bate: raio do golpe (m), dano, empurrão (m) */
  SLAM_R: 7,
  SLAM_DMG: 160,
  PUSH_M: 9,
  /** AGARRÃO: chance por chicotada que acerta, tempo preso, pancadas, dano total */
  GRAB_CHANCE: 0.3,
  GRAB_MS: 2200,
  GRAB_TICKS: 3,
  GRAB_DMG: 300,
  /** corpo: vida, alcance da pancada, intervalo, dano, empurrão */
  BODY_HP: 70_000,
  BODY_REACH: 26,
  BODY_SLAM_S: 6,
  BODY_DMG: 240,
  BODY_PUSH_M: 14,
  RESPAWN_MS: 20 * 60_000,
  REC_LEVEL: 60,
} as const;

export const CANIBAL_PREFIX = 'zs_canibal_';
export const CANIBAL_BODY_ID = 'zs_canibal_boss';
export const canibalRootId = (i: number) => `zs_canibal_r${i}`;
export const isCanibalBoss = (id: string) => id.startsWith(CANIBAL_PREFIX);
/** centro (o buraco) e o chão da arena */
export const CANIBAL_AT = { x: CAVE_LAIR.x, z: CAVE_LAIR.z, floor: CAVE_LAIR.floor } as const;

export type CanibalPhase = 'sleep' | 'rise' | 'fight' | 'dead';
export type RootSlam = { tx: number; tz: number; age: number; hit: boolean };
export type CanibalRoot = { i: number; alive: boolean; diedAt: number; slam: RootSlam | null; nextAt: number };
export type CanibalState = {
  phase: CanibalPhase; riseT: number; lastNearAt: number; nextAt: number; yaw: number;
  bodyAct: 'idle' | 'attack' | 'death'; bodyNextAt: number; roots: CanibalRoot[];
};

export function newCanibal(): CanibalState {
  return {
    phase: 'sleep', riseT: 0, lastNearAt: 0, nextAt: 0, yaw: 0, bodyAct: 'idle', bodyNextAt: 0,
    roots: Array.from({ length: CANIBAL.ROOTS }, (_, i) => ({ i, alive: true, diedAt: 0, slam: null, nextAt: i * 0.7 })),
  };
}
/** estado do mundo (um Canibal só) */
export const zsCanibal = { s: newCanibal() };

/** Onde a raiz `i` sai do chão (anel em volta do buraco). */
export function rootBase(i: number): { x: number; z: number } {
  const a = (i / CANIBAL.ROOTS) * Math.PI * 2 + 0.3;
  return { x: CANIBAL_AT.x + Math.sin(a) * CANIBAL.ROOT_RING, z: CANIBAL_AT.z + Math.cos(a) * CANIBAL.ROOT_RING };
}

/** Alguém pra acordar/manter acordado: o mais perto do centro que já está LÁ EMBAIXO (pé abaixo de WAKE_BELOW). */
export function nearestInArena(heroes: { x: number; y: number; z: number }[]): number {
  let best = Infinity;
  for (const h of heroes) if (h.y < CANIBAL.WAKE_BELOW) best = Math.min(best, Math.hypot(h.x - CANIBAL_AT.x, h.z - CANIBAL_AT.z));
  return best;
}

/** Fases: dorme → sobe (alguém na arena) → luta; sem ninguém por SLEEP_MS volta inteiro; morto volta em RESPAWN_MS. */
export function canibalPhaseStep(c: CanibalState, now: number, dt: number, nearest: number): void {
  if (c.phase !== 'dead' && c.phase !== 'sleep' && nearest <= CANIBAL.SLEEP_R) c.lastNearAt = now;
  switch (c.phase) {
    case 'sleep': if (nearest <= CANIBAL.WAKE_R) { c.phase = 'rise'; c.riseT = 0; c.lastNearAt = now; } break;
    case 'rise': c.riseT += dt; if (c.riseT >= CANIBAL.RISE_S) c.phase = 'fight'; break;
    case 'fight': if (now - c.lastNearAt > CANIBAL.SLEEP_MS) Object.assign(c, newCanibal()); break;
    case 'dead': if (now >= c.nextAt) Object.assign(c, newCanibal()); break;
  }
}

/** Alvo da raiz: o herói mais perto da base dela, até o alcance. */
export function rootTarget<T extends { x: number; z: number }>(i: number, heroes: T[]): T | null {
  const b = rootBase(i);
  let best: T | null = null, bd: number = CANIBAL.ROOT_REACH;
  for (const h of heroes) { const d = Math.hypot(h.x - b.x, h.z - b.z); if (d <= bd) { bd = d; best = h; } }
  return best;
}

export const ROOT_SLAM_TOTAL = CANIBAL.WIND_S + CANIBAL.STRIKE_S + CANIBAL.LIE_S + 0.6;
/** Avança a chicotada; true NO QUADRO em que bate no chão (aplica o golpe 1×). */
export function rootStep(r: CanibalRoot, dt: number): boolean {
  if (!r.slam) return false;
  r.slam.age += dt;
  if (!r.slam.hit && r.slam.age >= CANIBAL.WIND_S + CANIBAL.STRIKE_S) { r.slam.hit = true; return true; }
  if (r.slam.age >= ROOT_SLAM_TOTAL) r.slam = null;
  return false;
}
/** Inclinação da raiz na chicotada (0 em pé → 1 deitada no alvo): levanta um pouco pra trás, desce rápido, volta. */
export function rootLean(age: number): number {
  const { WIND_S: W, STRIKE_S: S, LIE_S: L } = CANIBAL;
  if (age < W) return -0.25 * (age / W);
  if (age < W + S) return -0.25 + 1.25 * ((age - W) / S);
  if (age < W + S + L) return 1;
  return Math.max(0, 1 - (age - W - S - L) / 0.6);
}

/** O golpe pega quem está até SLAM_R do ponto onde a raiz bateu. */
export const slamHits = (slam: { tx: number; tz: number }, x: number, z: number) => Math.hypot(x - slam.tx, z - slam.tz) <= CANIBAL.SLAM_R;
/** Empurrão: pra FORA de (fx, fz), `m` metros (de cima do ponto = pra fora do centro do Canibal). */
export function pushAway(fx: number, fz: number, x: number, z: number, m: number): { x: number; z: number } {
  let dx = x - fx, dz = z - fz, L = Math.hypot(dx, dz);
  if (L < 0.5) { dx = x - CANIBAL_AT.x; dz = z - CANIBAL_AT.z; L = Math.hypot(dx, dz) || 1; }
  return { x: (dx / L) * m, z: (dz / L) * m };
}
/** Todas as raízes cortadas? (o corpo segue — elas só param de bater) */
export const allRootsCut = (c: CanibalState) => c.roots.every((r) => !r.alive);
