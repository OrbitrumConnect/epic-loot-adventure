/**
 * KRAKEN DAS CAGARRAS (04/11 — esquadra pirata, ETAPA 3). Pedro: "o Kraken chefe nas Cagarras: metade do corpo pra fora
 * d'água, tentáculos; luta de navio, com os canhões nos tentáculos".
 * v2 KAIJU (04/11, Pedro vendo a v1: "pode ser bem maior — 6×, 7×; em volta dele mar meio turvo; consigo ver a perna —
 * os pés afundados na areia até a cintura; depois dos tentáculos ele sai e vem lentamente, o barco levemente mais rápido;
 * fugiu uns 80 m, ele volta 100%; redemoinhos puxando o barco pro centro dele — não dá pra ficar muito perto; mais vida
 * nele e nos tentáculos; a cada tentáculo destruído 1–2 krakens sobem no barco atrás do herói").
 *
 * Mora no mar aberto a OESTE da Ilha das Palmas, de frente pra praia (Pedro 04/11). Dorme debaixo d'água; NAVIO a ≤ WAKE_R acorda: sobe até a CINTURA (130 m de
 * corpo, ~65 m pra fora, os pés enterrados no fundo; a água turva esconde o que fica embaixo), 6 TENTÁCULOS de 95 m
 * e TUBARÕES em volta.
 *  - REDEMOINHO: navio a ≤ PULL_R do centro é puxado pra ele (até PULL_MAX m/s; o navio a toda escapa).
 *  - TENTÁCULO: casco a ≤ TENT_REACH da base = levanta, CHICOTEIA, fica na água e volta. Vida própria; a bala de canhão
 *    acerta o tentáculo NO AR (e o fuzil). Cortado = sobem 1–2 CRIAS do Kraken no navio mais perto (atrás do herói).
 *  - CORPO: protegido (a bala estoura nele sem dano) até cortar os 6; aí ele SAI do covil e vem atrás do navio mais perto
 *    (WALK_SPEED: um pouco mais lento que o navio a toda) e bate no que chegar perto. Despistou (casco > BODY_REACH +
 *    GIVEUP_EXTRA) = ele afunda e volta INTEIRO pro covil.
 *  - De longe (≥ ROCK_MIN): arremessa PEDRA no navio mais perto até ROCK_RANGE.
 *  - Todo mundo longe (> SLEEP_R) por SLEEP_MS = afunda e dorme (volta inteiro). Morto = volta depois de RESPAWN_MS.
 * Lógica pura aqui (testes); desenho, rede e dano em `zs-kraken-boss-view.tsx`.
 */
import { WARSHIP, warshipLocal, warshipWorld } from './zs-warship';

export const KRAKEN_BOSS = {
  // 04/11 (Pedro, com foto: "aqui!" — mar aberto, de frente pra praia): a OESTE da ponta da Ilha das Palmas, fundo de
  // 12 m, a terra mais perto a ~112 m (as ilhas de fundo, nenhum tentáculo em cima delas). Era (28, 878), colado nas ilhas.
  LAIR: { x: -500, z: 1110 },
  /** parado (sem navio por perto) olha pra PRAIA (norte); com alvo, gira pra ele */
  FACE_BEACH_YAW: Math.PI,
  WAKE_R: 320, SLEEP_R: 600, SLEEP_MS: 30_000, RISE_S: 6,
  /** corpo inteiro (m) e quanto dele fica DEBAIXO d'água: até a cintura — os pés no fundo */
  // Pedro: "uns 50–70 m de altura? me diga o que fica top" → 130 m de corpo, ~65 m pra fora (3× a Ilha Cagarra)
  BODY_H: 130, SUBMERGED_K: 0.5, BODY_R: 19,
  TENTACLES: 6, TENT_RING: 48, TENT_LEN: 95, TENT_R: 5.5, TENT_REACH: 90, TENT_HP: 8000, TENT_ARMOR: 10,
  /** chicotada: levanta (WIND) → bate (STRIKE) → fica na água (LIE) → volta; recarga entre uma e outra */
  TENT_SLAM_S: 5, TENT_WIND_S: 1.3, TENT_STRIKE_S: 0.5, TENT_LIE_S: 1.0,
  TENT_SHIP_DMG: 1400, TENT_HERO_DMG: 90, TENT_HERO_R: 12,
  // 04/11 (Pedro: "nível 80 é muito alto, dá pra ser antes"): corpo 80 → 60 mil e pedra 1.100 → 800 → sozinho no nv 60
  // ~5 min de canhão (bala ~470) contra ~6 min que o navio aguenta de longe; em grupo, bem antes
  BODY_HP: 60_000, BODY_ARMOR: 30, BODY_REACH: 65, BODY_SLAM_S: 5, BODY_SHIP_DMG: 3500, BODY_HERO_DMG: 150,
  /** saiu do covil: anda um pouco mais devagar que o navio a toda (WARSHIP.MAX 12) */
  // 04/11 (Pedro: "quando ele solta pode vir uns 15% mais lento, só o andar dele"): 10,2 → ~8,7 m/s
  WALK_SPEED: WARSHIP.MAX * 0.85 * 0.85, GIVEUP_EXTRA: 80, SINK_S: 5,
  /** redemoinho e a água turva em volta */
  PULL_R: 210, PULL_MAX: 3.2, MURK_R: 105,
  /** com os tentáculos ainda de pé o redemoinho puxa +10% (Pedro 04/11) */
  PULL_TENT_K: 1.1,
  /** o navio afundou no redemoinho com o herói a bordo/perto = ele é SUGADO e morre (Pedro 04/11: "dificulta, fica mais legal") */
  SUCK_HERO_R: 12,
  /** tubarões que vêm junto (rondam ele / o navio que chegar perto) */
  SHARKS: 4,
  ROCK_MIN: 60, ROCK_RANGE: 300, ROCK_S: 6, ROCK_DMG: 800, ROCK_HERO_DMG: 60,
  /** crias que sobem no navio a cada tentáculo cortado (no máximo SPAWN_MAX vivas) */
  SPAWN_MIN: 1, SPAWN_MAX_EACH: 2, SPAWN_MAX: 5, SPAWN_HP_K: 0.5, SPAWN_ATK_K: 0.6,
  RESPAWN_MS: 20 * 60_000,
} as const;
export const KRAKEN_PREFIX = 'zs_kraken_';
export const KRAKEN_BODY_ID = `${KRAKEN_PREFIX}boss`;
export const krakenTentId = (i: number) => `${KRAKEN_PREFIX}t${i}`;
export const isKrakenBoss = (id: string) => id.startsWith(KRAKEN_PREFIX);
/** crias: o prefixo `fleet_` (fora da IA de terra, do piloto e do renascer — o mesmo do Kraken de abordagem) */
export const KRAKEN_SPAWN_PREFIX = 'fleet_kraken_kb';

/** sleep dorme · rise sobe · fight luta no covil · hunt saiu atrás do navio · sink afunda (despistado) · dead caiu */
export type KrakenPhase = 'sleep' | 'rise' | 'fight' | 'hunt' | 'sink' | 'dead';
export type SlamTarget = { kind: 'ship' | 'hero'; owner: string; x: number; z: number };
export type Tentacle = { i: number; alive: boolean; diedAt: number | null; reload: number; slam: (SlamTarget & { age: number; hit: boolean }) | null };
export type KrakenState = {
  phase: KrakenPhase; riseT: number; sinkT: number; lastNearAt: number; nextAt: number;
  /** onde ele está (no covil, ou andando atrás do navio) */
  x: number; z: number; moving: boolean;
  /** o casco MAIS PERTO que ele chegou nesta perseguição (despista = fugir GIVEUP_EXTRA a partir daqui) */
  closest: number;
  tents: Tentacle[]; bodyOut: boolean; bodyReload: number; bodyAct: 'idle' | 'attack' | 'death'; bodyActT: number; rockReload: number;
  /** pra onde o corpo olha (o alvo) */
  yaw: number;
};
export function newKraken(): KrakenState {
  return {
    phase: 'sleep', riseT: 0, sinkT: 0, lastNearAt: 0, nextAt: 0, x: KRAKEN_BOSS.LAIR.x, z: KRAKEN_BOSS.LAIR.z, moving: false, closest: Infinity,
    bodyOut: false, bodyReload: KRAKEN_BOSS.BODY_SLAM_S, bodyAct: 'idle', bodyActT: 0, rockReload: KRAKEN_BOSS.ROCK_S, yaw: Math.PI,
    tents: Array.from({ length: KRAKEN_BOSS.TENTACLES }, (_, i) => ({ i, alive: true, diedAt: null, reload: 1 + i * 0.7, slam: null })),
  };
}
/** o estado do mundo (anfitrião simula; convidado espelha) */
export const zsKraken: { s: KrakenState } = { s: newKraken() };

/** Base do tentáculo `i` (no anel em volta do corpo, onde ele estiver). */
export function tentacleBase(i: number, at: { x: number; z: number } = KRAKEN_BOSS.LAIR): { x: number; z: number } {
  const a = (i / KRAKEN_BOSS.TENTACLES) * Math.PI * 2 + 0.3;
  return { x: at.x + Math.sin(a) * KRAKEN_BOSS.TENT_RING, z: at.z + Math.cos(a) * KRAKEN_BOSS.TENT_RING };
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
/** O navio mais perto de `at` (distância ao CASCO) e a distância. */
export function nearestShip(ships: readonly KrakenShip[], halfBeam: number, at: { x: number; z: number } = KRAKEN_BOSS.LAIR): { ship: KrakenShip; d: number } | null {
  let best: { ship: KrakenShip; d: number } | null = null;
  for (const s of ships) {
    const q = hullNearestPoint(s, at, halfBeam), d = Math.hypot(q.x - at.x, q.z - at.z);
    if (!best || d < best.d) best = { ship: s, d };
  }
  return best;
}
/** Fases do relógio: dorme → sobe (navio a ≤ WAKE_R) → luta; todos longe por SLEEP_MS = dorme de novo (inteiro, no
 *  covil); afundando (despistado) → volta inteiro pro covil; morto → volta depois. `hunt` (saiu atrás) é a tela que liga. */
export function krakenPhaseStep(k: KrakenState, now: number, dt: number, nearest: number): KrakenPhase {
  if (nearest <= KRAKEN_BOSS.SLEEP_R) k.lastNearAt = now;
  switch (k.phase) {
    case 'sleep': if (nearest <= KRAKEN_BOSS.WAKE_R) { k.phase = 'rise'; k.riseT = 0; k.lastNearAt = now; } break;
    case 'rise': k.riseT += dt; if (k.riseT >= KRAKEN_BOSS.RISE_S) k.phase = 'fight'; break;
    case 'fight': case 'hunt': if (now - k.lastNearAt > KRAKEN_BOSS.SLEEP_MS) Object.assign(k, newKraken()); break;
    case 'sink': k.sinkT += dt; if (k.sinkT >= KRAKEN_BOSS.SINK_S) Object.assign(k, newKraken()); break;
    case 'dead': if (now >= k.nextAt) Object.assign(k, newKraken()); break;
  }
  return k.phase;
}
/** Fora do covil: anda até o navio-alvo (para quando o casco fica a ~60% do alcance do golpe); só por onde é mar. */
export function krakenWalk(k: KrakenState, target: { x: number; z: number }, hullDist: number, dt: number, canStand: (x: number, z: number) => boolean): void {
  k.moving = false;
  if (hullDist <= KRAKEN_BOSS.BODY_REACH * 0.6) return;
  const dx = target.x - k.x, dz = target.z - k.z, d = Math.hypot(dx, dz) || 1, st = Math.min(KRAKEN_BOSS.WALK_SPEED * dt, hullDist - KRAKEN_BOSS.BODY_REACH * 0.6);
  const nx = k.x + (dx / d) * st, nz = k.z + (dz / d) * st;
  if (canStand(nx, nz)) { k.x = nx; k.z = nz; k.moving = true; }
  else if (canStand(nx, k.z)) { k.x = nx; k.moving = true; }
  else if (canStand(k.x, nz)) { k.z = nz; k.moving = true; }
}
/** Despistou: o casco mais perto ficou além do golpe + GIVEUP_EXTRA (o navio a toda é um pouco mais rápido que ele). */
// 04/11 (Pedro: "matei os tentáculos, ele tinha que vir atrás de mim e não sumir e voltar — bug?"): media do ALCANCE do
// golpe — cortado o último tentáculo de longe (canhão até ~270 m), já nascia "despistado". Agora: fugir GIVEUP_EXTRA (80 m)
// a partir do ponto MAIS PERTO que ele chegou nesta perseguição (nunca menos que golpe + 80).
export const krakenGaveUp = (hullDist: number, closest = 0) => hullDist > Math.max(closest, KRAKEN_BOSS.BODY_REACH) + KRAKEN_BOSS.GIVEUP_EXTRA;
/** REDEMOINHO: velocidade (m/s) que puxa o navio em (x, z) pro centro do Kraken — 0 fora de PULL_R ou colado no corpo. */
export function whirlpoolPull(k: { x: number; z: number }, p: { x: number; z: number }, boost = 1): { x: number; z: number } {
  const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz), { PULL_R, PULL_MAX, BODY_R } = KRAKEN_BOSS;
  if (d >= PULL_R || d <= BODY_R + WARSHIP.LENGTH / 2) return { x: 0, z: 0 };
  const s = PULL_MAX * boost * (1 - (d - BODY_R) / (PULL_R - BODY_R));
  return { x: (dx / d) * s, z: (dz / d) * s };
}
/** Força do redemoinho agora: +10% com os tentáculos de pé. */
export const pullBoost = (k: Pick<KrakenState, 'bodyOut'>) => (k.bodyOut ? 1 : KRAKEN_BOSS.PULL_TENT_K);
/** O navio do herói AFUNDOU (começou agora) dentro do redemoinho com o Kraken acordado e o herói a bordo/perto = sugado. */
export function suckedDown(k: Pick<KrakenState, 'phase' | 'x' | 'z'>, ship: { x: number; z: number; sinkT: number | null }, hero: { x: number; z: number }): boolean {
  if (ship.sinkT === null || !whirlpoolOn(k.phase)) return false;
  if (Math.hypot(ship.x - k.x, ship.z - k.z) > KRAKEN_BOSS.PULL_R) return false;
  return Math.hypot(hero.x - ship.x, hero.z - ship.z) <= WARSHIP.LENGTH / 2 + KRAKEN_BOSS.SUCK_HERO_R;
}
/** O redemoinho está ligado nesta fase? */
export const whirlpoolOn = (p: KrakenPhase) => p === 'rise' || p === 'fight' || p === 'hunt';
/** Tempo total de uma chicotada (s). */
export const SLAM_TOTAL_S = KRAKEN_BOSS.TENT_WIND_S + KRAKEN_BOSS.TENT_STRIKE_S + KRAKEN_BOSS.TENT_LIE_S + 1.0;
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
  return Math.PI / 2 * Math.max(0, 1 - (age - W - S - L) / 1.0);                // volta a ficar em pé
}
/** Todos os tentáculos cortados? (o corpo fica exposto e ele sai do covil) */
export const allTentaclesCut = (k: KrakenState) => k.tents.every((t) => !t.alive);
/** Quantas crias sobem por tentáculo cortado (1–2), sem passar de SPAWN_MAX vivas. */
export function spawnCount(alive: number, rng: () => number): number {
  const want = KRAKEN_BOSS.SPAWN_MIN + (rng() < 0.5 ? 0 : KRAKEN_BOSS.SPAWN_MAX_EACH - KRAKEN_BOSS.SPAWN_MIN);
  return Math.max(0, Math.min(want, KRAKEN_BOSS.SPAWN_MAX - alive));
}

/**
 * FORMAS pra BALA (04/11: "canhões nos tentáculos" — a bala bate NO AR, não só onde cairia): a tela escreve todo quadro
 * os gomos dos tentáculos (centro + raio) e o corpo (cilindro da água até o topo). `id` vazio = bate mas não tira vida
 * (o corpo protegido enquanto houver tentáculo).
 */
export const krakenShapes: { segs: { x: number; y: number; z: number; r: number; id: string }[]; body: { x: number; z: number; y0: number; y1: number; r: number; id: string } | null } = { segs: [], body: null };
export function krakenBallHit(p: { x: number; y: number; z: number }): string | null {
  // tentáculo PRIMEIRO (é o que se mira; colado no corpo, conta nele), depois o corpo
  for (const s of krakenShapes.segs) {
    const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z;
    if (dx * dx + dy * dy + dz * dz <= s.r * s.r) return s.id;
  }
  const b = krakenShapes.body;
  if (b && p.y >= b.y0 && p.y <= b.y1 && Math.hypot(p.x - b.x, p.z - b.z) <= b.r) return b.id;
  return null;
}
