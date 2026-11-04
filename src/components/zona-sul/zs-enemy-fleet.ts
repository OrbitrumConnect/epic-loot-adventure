/**
 * ESQUADRA PIRATA (03/11, Pedro: "preciso que faça algumas tropas de navios juntas, 2 3, um pouco menores que o galeão que
 * o herói usa (~35% menor), que luram no barco do herói, atacam com canhão…" · "o navio deve ter alguém pilotando,
 * possível de matar também"). ETAPA 1: os navios caçam o seu e atiram de canhão; o CAPITÃO no timão dá pra matar
 * (sem ele o navio fica à deriva e para de atirar). Etapas seguintes: horda de tubarões + kraken de abordagem; Kraken chefe.
 *
 * Lógica PURA (testável), no molde do navio do herói (`zs-warship`): a MESMA física (`warshipStep` com o casco menor), a
 * MESMA salva (`cannonSalvo`) e a mesma bala em arco. Só o "cérebro" é daqui:
 *  - CHEGAM: você NAVEGANDO o seu navio no mar há 1 min (e fora do descanso) → 2–3 navios surgem a ~260 m, em mar fundo.
 *  - CAÇAM: vão até o seu navio; perto (~70 m), viram DE LADO e mantêm o través apontado pra você (como em jogo de navio).
 *  - ATIRAM: com você no través (±31°) e entre 25 e 150 m: a elevação sai da distância (balística) com o ponto previsto
 *    (pra onde você vai) e um ERRO de pontaria. Recarga por lado.
 *  - VÃO EMBORA: você abriu 520 m, ou saiu do navio por 20 s → somem; voltam depois de um descanso.
 *  - Um pouco mais LENTOS que o seu (10 × 12 m/s): dá pra fugir.
 * Frente do navio = (sin yaw, cos yaw).
 */
import { cannonSalvo, hullFits, nearWarshipHull, newWarship, WARSHIP, warshipWorld, type CannonBall, type WarshipInput, type WarshipSide, type ZsWarship } from './zs-warship';
import type { CreatureState } from '@/game/types';

export const FLEET = {
  /** 35% menor que o galeão do herói (Pedro) */
  SCALE: 0.65,
  MIN: 2, MAX: 3,
  /** vida de cada navio (o do herói: 50 mil). Medido o canhão do herói: nv 35 = 273/bala, nv 105 = 763 → ~33 / ~12 balas */
  HP: 9000,
  /** m/s — o do herói é 12: dá pra fugir */
  MAX_SPEED: 10,
  /** distância que eles buscam (m), de lado */
  PREF: 70,
  FIRE_MIN: 25, FIRE_MAX: 150,
  /** só atira com o alvo no través (± rad do costado) */
  FIRE_ARC: 0.55,
  RELOAD_S: 6.5,
  /** erro de pontaria (m, em volta do ponto previsto) */
  AIM_ERR: 7,
  /** dano de UMA bala no navio do herói (50 mil → ~77 balas: ~2 min contra 3 navios — dá pra revidar ou fugir; com 1500
   *  afundava em ~1 min, medido) e no herói (água/convés, antes da armadura) */
  BALL_DMG: 650, HERO_DMG: 45,
  SPAWN_DIST: 260, LEAVE_DIST: 520,
  /** navegando há isto (ms) no mar pra eles aparecerem */
  SAIL_MS: 60_000,
  /** fora do navio por isto (ms) = vão embora */
  ASHORE_MS: 20_000,
  /** descanso depois de AFUNDAR a esquadra / de você FUGIR (ms) */
  REST_MS: 6 * 60_000, ESCAPE_REST_MS: 3 * 60_000,
  /** o CAPITÃO no timão */
  PILOT_HP: 520,
  /** loot por navio afundado */
  LOOT: { gold: 120, items: [{ id: 'iron_ore', n: 30 }, { id: 'wood', n: 60 }] as const },
  /** espaço entre os navios da esquadra (m) */
  SPACING: 45,
  /** TRIPULAÇÃO (03/11, Pedro: "cada navio inimigo pode ter uns 8 inimigos dentro que atiram, fora o capitão"): piratas de
   *  FUZIL no convés — atiram em você de até CREW_RANGE m (acerto cai com a distância), dá pra matar um por um */
  // (alcance 60 → 95 m: os navios seguram 70–100 m de você — medido; com 60 a tripulação quase não atirava)
  // (golpe 12 → 8 e recarga 2,6 → 3,2 s: com 16 atiradores tiravam ~26/s — o herói tem 100 + 12/nível (~500 no nv 35) e
  // caía em ~20 s; agora ~14/s com 2 navios, dá tempo de reagir)
  CREW: 8, CREW_HP: 180, CREW_RANGE: 95, CREW_RELOAD_S: 3.2, CREW_DMG: 8,
  /** chance de acerto: perto (≤ 20 m) e no limite do alcance */
  CREW_HIT_NEAR: 0.6, CREW_HIT_FAR: 0.25,
} as const;
export const FLEET_LEN = WARSHIP.LENGTH * FLEET.SCALE;
export const FLEET_HALF_BEAM = FLEET_LEN * 0.12;
export const FLEET_PILOT_PREFIX = 'fleet_pilot_';
export const isFleetPilot = (id: string) => id.startsWith(FLEET_PILOT_PREFIX);
export const FLEET_CREW_PREFIX = 'fleet_crew_';
/** Qualquer um da esquadra (capitão ou tripulante): desenhado no navio, fora da IA de terra, fora da rede. */
export const isFleetUnit = (id: string) => id.startsWith('fleet_');

export type EnemyShip = ZsWarship & { id: string; pilotId: string; pilotDead: boolean; rewarded: boolean; crewIds: string[] };
export type FleetState = { ships: EnemyShip[]; nextAt: number; sailingSince: number | null; ashoreSince: number | null; seq: number };
export const zsFleet: FleetState = { ships: [], nextAt: 0, sailingSince: null, ashoreSince: null, seq: 0 };

/** Pode chegar AGORA? (você navegando há SAIL_MS, sem esquadra, fora do descanso) */
export function fleetMaySpawn(o: { now: number; sailing: boolean; sailingSince: number | null; nextAt: number; present: boolean }): boolean {
  return o.sailing && !o.present && o.sailingSince !== null && o.now - o.sailingSince >= FLEET.SAIL_MS && o.now >= o.nextAt;
}

/** Onde nascem: a SPAWN_DIST do seu navio, em mar fundo (o casco cabe), proa pra você; os outros AO LADO (SPACING).
 *  Tenta 24 direções a partir de uma sorteada. Sem lugar = []. */
export function fleetSpawnSpots(swim: (x: number, z: number) => boolean, target: { x: number; z: number }, n: number, rng: () => number): { x: number; z: number; yaw: number }[] {
  const a0 = rng() * Math.PI * 2;
  for (let k = 0; k < 24; k++) {
    const a = a0 + (k / 24) * Math.PI * 2;
    for (const d of [FLEET.SPAWN_DIST, FLEET.SPAWN_DIST * 0.8, FLEET.SPAWN_DIST * 1.2]) {
      const x = target.x + Math.sin(a) * d, z = target.z + Math.cos(a) * d;
      const yaw = Math.atan2(target.x - x, target.z - z);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw); // direita do navio
      const out: { x: number; z: number; yaw: number }[] = [];
      for (let i = 0; i < n; i++) {
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * FLEET.SPACING;
        const px = x + rx * side, pz = z + rz * side;
        if (hullFits(swim, px, pz, yaw, FLEET_LEN)) out.push({ x: px, z: pz, yaw });
      }
      if (out.length >= Math.min(n, FLEET.MIN)) return out;
    }
  }
  return [];
}

export function newEnemyShip(id: string, at: { x: number; z: number; yaw: number }): EnemyShip {
  return { ...newWarship(at.x, at.z, at.yaw), hp: FLEET.HP, id, pilotId: `${FLEET_PILOT_PREFIX}${id}`, pilotDead: false, rewarded: false,
    crewIds: Array.from({ length: FLEET.CREW }, (_, i) => `${FLEET_CREW_PREFIX}${id}_${i}`) };
}

/** O CAPITÃO (alvo de verdade: mira, dano, XP) — não anda sozinho: o mundo o põe no timão todo quadro. */
export function newFleetPilot(ship: EnemyShip, def: { maxHp: number; armor: number; attackCooldown: number }): CreatureState {
  return {
    id: ship.pilotId, speciesId: 'raider_scout', name: 'Capitão Pirata', hp: FLEET.PILOT_HP, maxHp: FLEET.PILOT_HP, attackPower: 0, armor: def.armor,
    attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: ship.x, z: ship.z }, behavior: 'patrol', lootTable: [], respawnAt: null,
  };
}
/** Lugar do tripulante `i` no convés (coordenadas do navio: u = pro lado, v = ao longo): metade em cada costado. */
export function crewSpot(i: number): { u: number; v: number } {
  const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), n = Math.ceil(FLEET.CREW / 2);
  return { u: side * FLEET_HALF_BEAM * 0.55, v: (-0.22 + (0.5 * k) / Math.max(1, n - 1)) * FLEET_LEN };
}
export function newFleetCrew(ship: EnemyShip, i: number, def: { armor: number; attackCooldown: number }): CreatureState {
  const p = crewSpot(i), w = warshipWorld(ship, p.u, p.v);
  return {
    id: ship.crewIds[i]!, speciesId: 'raider_scout', name: 'Pirata do navio', hp: FLEET.CREW_HP, maxHp: FLEET.CREW_HP, attackPower: FLEET.CREW_DMG, armor: def.armor,
    attackCooldown: FLEET.CREW_RELOAD_S, lastAttackAt: 0, position: { x: w.x, z: w.z }, behavior: 'patrol', lootTable: [], respawnAt: null,
  };
}
/** Chance de um tiro do tripulante acertar a `d` m (perto 60% → no limite 25%). */
export function crewHitChance(d: number): number {
  if (d > FLEET.CREW_RANGE) return 0;
  const k = Math.max(0, Math.min(1, (d - 20) / (FLEET.CREW_RANGE - 20)));
  return FLEET.CREW_HIT_NEAR + (FLEET.CREW_HIT_FAR - FLEET.CREW_HIT_NEAR) * k;
}

/** Onde fica o timão (popa) desse navio — o capitão. */
export function fleetHelm(s: { x: number; z: number; yaw: number }, helmU: number): { x: number; z: number } {
  return warshipWorld(s, 0, helmU * FLEET_LEN);
}

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Leme e vela pra caçar: longe = proa pro alvo; perto = de LADO (o través mais virado pra ele), afastando de quem está
 *  colado (não se trombam). Sem capitão: nada (à deriva). */
export function fleetSteer(s: EnemyShip, target: { x: number; z: number }, others: readonly { x: number; z: number }[]): WarshipInput {
  if (s.pilotDead || s.sinkT !== null) return { throttle: 0, steer: 0 };
  const dx = target.x - s.x, dz = target.z - s.z, d = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz);
  let want = bearing;
  if (d < FLEET.PREF + 35) {
    // de lado: das duas, a que menos vira (+90° ou −90° do rumo ao alvo)
    const a = wrap(bearing + Math.PI / 2 - s.yaw), b = wrap(bearing - Math.PI / 2 - s.yaw);
    want = s.yaw + (Math.abs(a) < Math.abs(b) ? a : b);
    if (d < FLEET.PREF - 20) want += (Math.abs(a) < Math.abs(b) ? -1 : 1) * 0.35; // perto demais: abre um pouco
  }
  // separação: navio da esquadra a < 35 m → desvia pro lado contrário
  for (const o of others) {
    const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz);
    if (od > 0.1 && od < 35) want = s.yaw + wrap(want - s.yaw) * 0.5 + wrap(Math.atan2(ox, oz) - s.yaw) * 0.5 * (1 - od / 35);
  }
  const diff = wrap(want - s.yaw);
  return { throttle: d > FLEET.PREF + 35 ? 1 : 0.55, steer: Math.max(-1, Math.min(1, -diff * 2)) };
}

/** Alcance (m) da bala saindo `h` m ACIMA do alvo com elevação `a` (rad). */
function rangeAt(a: number, h: number): number {
  const v = WARSHIP.BALL_SPEED, g = WARSHIP.GRAVITY, vy = v * Math.sin(a);
  return (v * Math.cos(a) * (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, h)))) / g;
}
/** Elevação pra uma bala com a velocidade do canhão cair a `d` m, saindo `h` m acima do alvo (o costado fica ~4 m acima
 *  da água — sem contar isso a bala caía ~25 m LONGE demais a 90 m, medido no teste). Ângulo baixo (busca binária entre
 *  −0,2 rad — perto, aponta um pouco pra baixo — e 45°). null = fora do alcance. */
export const ELEV_LOW = -0.2;
export function elevationFor(d: number, h = 0): number | null {
  let lo = ELEV_LOW, hi = Math.PI / 4;
  if (d > rangeAt(hi, h)) return null;
  if (d <= rangeAt(lo, h)) return lo;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (rangeAt(mid, h) < d) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Atira AGORA? Lado com o alvo no través e recarregado, na distância certa → a salva (balas em arco). `aim` = onde o
 *  alvo vai estar (previsto) já com o erro de pontaria. */
export function fleetFire(s: EnemyShip, aim: { x: number; z: number }, deckY: number, aimY = 0): { side: WarshipSide; balls: CannonBall[] } | null {
  if (s.pilotDead || s.sinkT !== null) return null;
  const dx = aim.x - s.x, dz = aim.z - s.z, d = Math.hypot(dx, dz);
  if (d < FLEET.FIRE_MIN || d > FLEET.FIRE_MAX) return null;
  const bearing = Math.atan2(dx, dz);
  for (const side of ['starboard', 'port'] as const) {
    if (s.reload[side] > 0) continue;
    const out = s.yaw + (side === 'starboard' ? Math.PI / 2 : -Math.PI / 2);
    const swing = wrap(bearing - out);
    if (Math.abs(swing) > FLEET.FIRE_ARC) continue;
    // da BOCA do canhão (no costado, ~3,7 m pro lado do alvo — cannonSalvo) e acima da água (o alvo)
    const elev = elevationFor(Math.max(1, d - WARSHIP.LENGTH * 0.1), deckY - aimY);
    if (elev === null) return null;
    s.reload[side] = FLEET.RELOAD_S;
    return { side, balls: cannonSalvo(s, side, elev, deckY, swing) };
  }
  return null;
}

/** Ponto previsto do alvo (pra onde ele vai em `t` s) + erro de pontaria. */
export function leadAim(target: { x: number; z: number; yaw: number; speed: number }, from: { x: number; z: number }, rng: () => number): { x: number; z: number } {
  const t = Math.hypot(target.x - from.x, target.z - from.z) / (WARSHIP.BALL_SPEED * 0.95);
  const a = rng() * Math.PI * 2, e = rng() * FLEET.AIM_ERR;
  return { x: target.x + Math.sin(target.yaw) * target.speed * t + Math.sin(a) * e, z: target.z + Math.cos(target.yaw) * target.speed * t + Math.cos(a) * e };
}

/** Ir embora? 'stay' | 'escaped' (você abriu LEAVE_DIST ou saiu do navio por ASHORE_MS) | 'beaten' (todos afundaram). */
export function fleetVerdict(o: { now: number; ships: readonly EnemyShip[]; target: { x: number; z: number } | null; ashoreSince: number | null }): 'stay' | 'escaped' | 'beaten' {
  const alive = o.ships.filter((s) => s.sinkT === null);
  if (o.ships.length > 0 && alive.length === 0 && o.ships.every((s) => (s.sinkT ?? 0) >= WARSHIP.SINK_S)) return 'beaten';
  if (o.ashoreSince !== null && o.now - o.ashoreSince >= FLEET.ASHORE_MS) return 'escaped';
  if (o.target && alive.length > 0 && alive.every((s) => Math.hypot(s.x - o.target!.x, s.z - o.target!.z) > FLEET.LEAVE_DIST)) return 'escaped';
  return 'stay';
}

/** A bala do HERÓI caiu em (x, z): acertou o casco de algum navio da esquadra? (o primeiro) */
export function fleetShipAt(ships: readonly EnemyShip[], x: number, z: number): EnemyShip | null {
  for (const s of ships) if (s.sinkT === null && nearWarshipHull(s, x, z, FLEET_HALF_BEAM, 1.5, FLEET_LEN)) return s;
  return null;
}
