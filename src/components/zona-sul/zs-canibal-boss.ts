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
  /** corpo: altura do modelo inteiro (m) e a fração enterrada. 05/11 (Pedro: "muito grande — uns 40% menor; ele EM PÉ andando,
   *  correndo, pulando e atacando, o herói cai no chão"): 110 → 66 m, em pé no chão da arena (sai do buraco e vem).
   *  05/11 (2ª, Pedro: "pode diminuir uns 40% — ainda tá grande … e precisa ser mais lento a movimentação"): 66 → 40 m.
   *  05/11 (3ª, Pedro: "o boss pode diminuir mais uns 20%" e logo depois "o Canibal ainda dá pra deixar uns 30% menor"):
   *  40 → 28 m (−30% do que estava no jogo; raio, alcances e raízes juntos — a velocidade fica).
   *  05/11 noite (Pedro, vendo a foto: "ainda tá grande, dá pra diminuir uns 30% ainda"): 28 → 19,6 m (tudo × 0,7 de novo) */
  BODY_H: 19.6,
  SUBMERGED_K: 0,
  BODY_R: 2,
  /** v2 (05/11): anda/corre atrás de quem está na arena (sem sair dela), pancada que DERRUBA, PULO em quem foge.
   *  05/11 (2ª, "mais lento"): andar 5 → 2,5 m/s, correr 9 → 4,5 m/s (o passo do clip acompanha: CANIBAL_STEP na view) */
  WALK_SPEED: 2.5,
  RUN_SPEED: 4.5,
  /** corre quando o alvo está além disto (m); não passa deste raio do centro (a rampa fica na parede) */
  RUN_FROM: 25,
  ARENA_R: 48,
  /** pancada: alcance (m), raio do impacto, intervalo (s), dano, empurrão (m). 05/11 (2ª): alcance/raio −40% junto com o corpo;
   *  (3ª) −30% de novo */
  ATK_REACH: 3.9,
  ATK_R: 2.7,
  ATK_EVERY_S: 3.5,
  ATK_DMG: 220,
  ATK_PUSH_M: 12,
  /** PULO: em quem está além de LEAP_FROM m; dura LEAP_S; impacto LEAP_R m (dano/empurrão); de LEAP_EVERY_S em LEAP_EVERY_S */
  LEAP_FROM: 28,
  LEAP_S: 1.3,
  LEAP_R: 3.9,
  LEAP_DMG: 280,
  LEAP_PUSH_M: 14,
  LEAP_EVERY_S: 9,
  /** o buraco no meio da arena (raio, m) */
  PIT_R: 18,
  /** acorda: alguém até WAKE_R do centro e já lá embaixo (pé abaixo de WAKE_BELOW); dorme sem ninguém em SLEEP_R por SLEEP_MS.
   *  05/11 (Pedro: "o boss só aparece quando chega no chão lá embaixo mesmo"): era −25 m / 62 m (acordava com você ainda na
   *  rampa) → só com o pé no CHÃO da arena (−55: abaixo de −51) e dentro dela (≤ 50 m do centro — a rampa fica a ~55 m) */
  WAKE_R: 50,
  WAKE_BELOW: -51,
  SLEEP_R: 110,
  SLEEP_MS: 30_000,
  RISE_S: 5,
  /** raízes: quantas, raio do anel onde saem, comprimento, grossura, alcance da chicotada. 05/11 (3ª, "uns 30% menor"): −30%
   *  junto com o corpo (46 m de raiz num Canibal de 28 m ficava bem maior que ele); o anel (onde saem, na arena) fica */
  ROOTS: 6,
  ROOT_RING: 30,
  ROOT_LEN: 22.5,
  ROOT_R: 1.5,
  ROOT_REACH: 19.6,
  ROOT_HP: 6000,
  /** armadura (corta metade disto de cada golpe — o míssil da bazuca atravessa). 05/11 (Pedro: "o fuzil pode dar dano nele
   *  também"): 800 → 0 — a armadura saiu; quem segura o fuzil é a PROTEÇÃO de bossResist.ts (10%, no máximo 5 por golpe) */
  ARMOR: 0,
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
  /** corpo: vida (05/11: 70 → 50 mil, ele ficou menor e o fuzil entra), alcance da pancada, intervalo, dano, empurrão */
  BODY_HP: 50_000,
  BODY_REACH: 26,
  BODY_SLAM_S: 6,
  BODY_DMG: 240,
  BODY_PUSH_M: 14,
  RESPAWN_MS: 20 * 60_000,
  REC_LEVEL: 60,
  /** CRIAS (05/11, Pedro: "deve vir hordas iguais às crias do Kraken — cada tentáculo vem, aumentando a horda cada vez mais
   *  que mata"): cada raiz cortada solta canibais do buraco — 2 na 1ª, +1 a cada raiz (até 6); no máximo 12 vivas */
  CRIA_FIRST: 2,
  /** 05/11 (Pedro: "quando o boss nasce já nasce com 5 crias, fora as que vêm de tentáculo") */
  CRIA_ON_RISE: 5,
  CRIA_MAX_EACH: 6,
  CRIA_MAX_ALIVE: 12,
  /** crias mais fracas que o Canibal comum (vida e golpe) */
  CRIA_HP_K: 0.5,
  CRIA_ATK_K: 0.6,
} as const;

/** prefixo das crias: `zs_cave_` = nascem no chão da caverna e a IA anda lá dentro; não renascem sozinhas */
export const CANIBAL_CRIA_PREFIX = 'zs_cave_cria_';
/** Quantas crias sobem quando a `cut`-ésima raiz cai (1ª = 2, 2ª = 3 …, até 6), sem passar do teto de vivas. */
export function criaCount(cut: number, aliveNow: number): number {
  const want = Math.min(CANIBAL.CRIA_MAX_EACH, CANIBAL.CRIA_FIRST + Math.max(0, cut - 1));
  return Math.max(0, Math.min(want, CANIBAL.CRIA_MAX_ALIVE - aliveNow));
}

export const CANIBAL_PREFIX = 'zs_canibal_';
export const CANIBAL_BODY_ID = 'zs_canibal_boss';
export const canibalRootId = (i: number) => `zs_canibal_r${i}`;
export const isCanibalBoss = (id: string) => id.startsWith(CANIBAL_PREFIX);
/** centro (o buraco) e o chão da arena */
export const CANIBAL_AT = { x: CAVE_LAIR.x, z: CAVE_LAIR.z, floor: CAVE_LAIR.floor } as const;

export type CanibalPhase = 'sleep' | 'rise' | 'fight' | 'dead';
export type RootSlam = { tx: number; tz: number; age: number; hit: boolean };
export type CanibalRoot = { i: number; alive: boolean; diedAt: number; slam: RootSlam | null; nextAt: number };
/** o que o corpo está fazendo (vira a animação: idle/walk/run/attack/leap/roar/death) */
export type CanibalAct = 'idle' | 'walk' | 'run' | 'attack' | 'leap' | 'roar' | 'death';
/** PULO em curso: de onde, pra onde e quanto já foi (s) */
export type CanibalLeap = { fx: number; fz: number; tx: number; tz: number; t: number; hit: boolean };
export type CanibalState = {
  phase: CanibalPhase; riseT: number; lastNearAt: number; nextAt: number; yaw: number;
  bodyAct: 'idle' | 'attack' | 'death'; bodyNextAt: number; roots: CanibalRoot[];
  /** v2 (05/11): onde ele está, o que faz, próximo golpe/pulo, pulo em curso */
  x: number; z: number; act: CanibalAct; atkAt: number; leapAt: number; leap: CanibalLeap | null;
};

export function newCanibal(): CanibalState {
  return {
    phase: 'sleep', riseT: 0, lastNearAt: 0, nextAt: 0, yaw: 0, bodyAct: 'idle', bodyNextAt: 0,
    roots: Array.from({ length: CANIBAL.ROOTS }, (_, i) => ({ i, alive: true, diedAt: 0, slam: null, nextAt: i * 0.7 })),
    x: CAVE_LAIR.x, z: CAVE_LAIR.z, act: 'idle', atkAt: 0, leapAt: 0, leap: null,
  };
}

/** Prende (x, z) dentro da arena (até ARENA_R do centro). */
export function clampArena(x: number, z: number): { x: number; z: number } {
  const dx = x - CAVE_LAIR.x, dz = z - CAVE_LAIR.z, d = Math.hypot(dx, dz);
  if (d <= CANIBAL.ARENA_R) return { x, z };
  const k = CANIBAL.ARENA_R / d;
  return { x: CAVE_LAIR.x + dx * k, z: CAVE_LAIR.z + dz * k };
}
/** ANDA/CORRE até o alvo (sem sair da arena; para no alcance da pancada). Devolve a distância que sobrou. */
export function canibalMove(c: CanibalState, tx: number, tz: number, dt: number): number {
  const d = Math.hypot(tx - c.x, tz - c.z);
  c.yaw = Math.atan2(tx - c.x, tz - c.z);
  if (d <= CANIBAL.ATK_REACH * 0.85) { c.act = 'idle'; return d; }
  const run = d > CANIBAL.RUN_FROM, sp = (run ? CANIBAL.RUN_SPEED : CANIBAL.WALK_SPEED) * dt;
  const step = Math.min(sp, d - CANIBAL.ATK_REACH * 0.8);
  const p = clampArena(c.x + ((tx - c.x) / d) * step, c.z + ((tz - c.z) / d) * step);
  c.x = p.x; c.z = p.z; c.act = run ? 'run' : 'walk';
  return Math.hypot(tx - c.x, tz - c.z);
}
/** Onde ele está no PULO (x, z, altura) — arco de LEAP_S s, ~0,35× o próprio tamanho de altura no meio (40 m → ~14 m). */
export function leapPos(l: CanibalLeap): { x: number; z: number; h: number } {
  const k = Math.min(1, l.t / CANIBAL.LEAP_S);
  return { x: l.fx + (l.tx - l.fx) * k, z: l.fz + (l.tz - l.fz) * k, h: Math.sin(k * Math.PI) * CANIBAL.BODY_H * 0.35 };
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
