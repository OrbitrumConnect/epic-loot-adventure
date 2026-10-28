/**
 * ZONA SUL — CARRO VOADOR / HOVERCRAFT (Pedro 28/10), lógica pura (testável). 2ª versão ("tá engessado, não fluido; o
 * speed não tá rápido; segurar Espaço sobe com limite, segurar C desce rápido"):
 *  - FÍSICA COM INÉRCIA: velocidade é um vetor (não anda "em trilho"); aderência lateral baixa = escorrega um pouco na
 *    curva como hovercraft; a curva entra e sai suave (taxa de giro com resposta); altura numa MOLA (sem degrau).
 *  - ALTURA: segurar ESPAÇO sobe (até MAX_ALT), segurar C desce rápido, soltou = fica na altura. Rente: flutua 0,5 m do
 *    chão e 0,25 m da água (a água "sente" — rastro).
 *  - ENERGIA de voo: FLY_S segundos no ar (acima de AIR_ALT); acabou → desce sozinho, suave, e só volta a subir depois
 *    da recarga (COOLDOWN_MS). No chão a energia enche de novo.
 *  - Shift = turbo; no ar a máxima sobe um pouco (impulso). Paredão é parede (desliza; perde a velocidade contra ele).
 *  - 5 lugares (motorista agora; os outros prontos pro multiplayer).
 * Frente do carro = (sin yaw, cos yaw), igual ao herói.
 */
import { type ZsTerrain, zsBounds, zsHeightAt, ZS_WATER_Y, zsWaterPushAt, zsWaterYAt } from './zs-terrain-data';

export const CAR = {
  HOVER: 0.5, HOVER_WATER: 0.25,
  MAX: 24, TURBO: 1.4, AIR_BOOST: 1.2, REVERSE: 8,  // m/s: 24 ≈ 86 km/h; turbo ≈ 121 km/h; no ar +20%
  ACCEL: 15, BRAKE: 22, COAST: 0.45,                 // aceleração, freio, arrasto solto (1/s)
  GRIP: 3.2,                                         // aderência lateral (1/s): baixa = escorrega um pouco
  STEER: 2.1, STEER_RESP: 7,                         // giro máx (rad/s) e resposta (1/s)
  MAX_ALT: 40, CLIMB: 7, DESCEND: 14,                // segurar Espaço sobe 7 m/s até 40 m; segurar C desce 14 m/s
  SPRING: 16, DAMP: 8,                               // mola da altura (firme e sem quicar: amortecimento crítico)
  AIR_ALT: 1.5, FLY_S: 60, COOLDOWN_MS: 15_000,      // energia de voo (s no ar) e recarga
  CLIMB_WALL: 0.9,                                   // rampa máx. que dá pra subir rente (≈ 42°)
  ENTER_DIST: 4.5, EXIT_MAX_SPEED: 3, EXIT_MAX_ALT: 2,
  LENGTH: 5.5,                                       // m — Pedro: "uns 20% maior" (4,6 → 5,5); 5 lugares
  WAVE_GRAB: 5,                                      // quão rápido a onda agarra o carro rente à água (1/s)
} as const;
const PUSH = { x: 0, z: 0 };

export type ZsCar = {
  x: number; z: number; y: number; yaw: number;
  vx: number; vz: number; vy: number; yawRate: number;
  /** velocidade pra FRENTE (HUD / sair do carro), m/s */
  speed: number;
  /** altura pedida acima da superfície (Espaço/C) e a real */
  alt: number; altitude: number;
  /** energia de voo (s), recarga e se está no ar */
  energy: number; cooldownUntil: number; flying: boolean;
  overWater: boolean; steerVis: number;
};
export type ZsCarInput = { throttle: number; steer: number; up?: boolean; down?: boolean; turbo?: boolean };

export function newCar(x: number, z: number, yaw: number, t: ZsTerrain): ZsCar {
  return { x, z, yaw, y: carSurface(t, x, z).y, vx: 0, vz: 0, vy: 0, yawRate: 0, speed: 0, alt: 0, altitude: 0, energy: CAR.FLY_S, cooldownUntil: 0, flying: false, overWater: false, steerVis: 0 };
}

/**
 * Altura de flutuar em (x, z): chão + 0,5 m, ou água + 0,25 m. `yRef` = altura do carro: rente à água na frente da onda
 * ele fica NA água do bolso/tubo (não é jogado pra cima do lip); sem ele, por cima da onda.
 */
export function carSurface(t: ZsTerrain, x: number, z: number, yRef = Infinity): { y: number; water: boolean } {
  const g = zsHeightAt(t, x, z);
  return g < ZS_WATER_Y ? { y: zsWaterYAt(x, z, yRef) + CAR.HOVER_WATER, water: true } : { y: g + CAR.HOVER, water: false }; // na água: acima da ONDA
}

/** Um passo do carro (mexe em `c`). `now` em ms. */
export function carStep(t: ZsTerrain, c: ZsCar, inp: ZsCarInput, dt: number, now: number): void {
  // ── altura pedida: Espaço sobe, C desce, soltou fica ─────────────────────────────────────────────────────────
  const canFly = now >= c.cooldownUntil && c.energy > 0;
  if (inp.up && canFly) c.alt = Math.min(CAR.MAX_ALT, c.alt + CAR.CLIMB * dt);
  if (inp.down) c.alt = Math.max(0, c.alt - CAR.DESCEND * dt);
  if (!canFly) c.alt = Math.max(0, c.alt - CAR.DESCEND * 0.35 * dt); // sem energia / em recarga: desce sozinho, suave
  c.flying = c.altitude > CAR.AIR_ALT;
  if (c.flying) {
    c.energy = Math.max(0, c.energy - dt);
    if (c.energy === 0 && now >= c.cooldownUntil) c.cooldownUntil = now + CAR.COOLDOWN_MS; // acabou: recarga
  } else if (now >= c.cooldownUntil) c.energy = Math.min(CAR.FLY_S, c.energy + dt * (CAR.FLY_S / 20)); // no chão enche em 20 s
  // ── velocidade (vetor): pra frente + de lado ────────────────────────────────────────────────────────────────
  // ONDA EMPURRA (Pedro 28/10: "se o hover car estiver parado a onda empurra ele"): rente à água o carro boia NA água
  // que anda — atrito e aderência valem em relação à correnteza (parado, vai junto com ela); subindo, sente cada vez
  // menos; voando alto, nada
  // (2ª, Pedro: "o carrinho começa a andar e não segue a onda, sobe pra cima e fica pra trás"): conta a altura que VOCÊ
  // pediu (Espaço), não a medida — a onda levantando o carro fazia parecer "voo" e soltava ele
  let wx = 0, wz = 0;
  if (c.overWater && c.alt < CAR.AIR_ALT && zsWaterPushAt(c.x, c.z, PUSH, c.y - CAR.HOVER_WATER)) { const k = 1 - c.alt / CAR.AIR_ALT; wx = PUSH.x * k; wz = PUSH.z * k; }
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  let vf = (c.vx - wx) * fx + (c.vz - wz) * fz;
  let vl = (c.vx - wx) * fz - (c.vz - wz) * fx;
  const max = CAR.MAX * (inp.turbo ? CAR.TURBO : 1) * (c.flying ? CAR.AIR_BOOST : 1);
  if (inp.throttle > 0) vf += CAR.ACCEL * inp.throttle * Math.max(0, 1 - vf / max) * dt;
  else if (inp.throttle < 0) vf = vf > 0.2 ? Math.max(0, vf - CAR.BRAKE * -inp.throttle * dt) : Math.max(-CAR.REVERSE, vf + CAR.ACCEL * 0.6 * inp.throttle * dt);
  else vf *= Math.exp(-CAR.COAST * dt);
  if (vf > max) vf += (max - vf) * Math.min(1, dt * 1.2); // perdeu o turbo/impulso: devagar
  vl *= Math.exp(-CAR.GRIP * (c.flying ? 0.6 : 1) * dt);  // escorrega um pouco (no ar, mais)
  // giro com resposta (entra e sai suave); só gira andando; rápido gira um pouco menos; de ré inverte
  const sp = Math.abs(vf), dir = vf >= 0 ? 1 : -1;
  const wantRate = -inp.steer * CAR.STEER * Math.min(1, sp / 7) * (1 - 0.35 * Math.min(1, sp / CAR.MAX)) * dir;
  c.yawRate += (wantRate - c.yawRate) * Math.min(1, CAR.STEER_RESP * dt);
  c.yaw += c.yawRate * dt;
  const nfx = Math.sin(c.yaw), nfz = Math.cos(c.yaw);
  c.vx = nfx * vf + nfz * vl + wx; c.vz = nfz * vf - nfx * vl + wz;
  // ...e a onda AGARRA: na direção da correnteza o carro chega na velocidade dela em ~0,3 s (o arrasto de frente sozinho
  // levava ~5 s e a onda passava por baixo); nunca freia quem já vai mais rápido que ela
  if (wx !== 0 || wz !== 0) {
    const m = Math.hypot(wx, wz), ux = wx / m, uz = wz / m, along = c.vx * ux + c.vz * uz;
    if (along < m) { const dv = (m - along) * Math.min(1, CAR.WAVE_GRAB * dt); c.vx += ux * dv; c.vz += uz * dv; }
  }
  c.steerVis += (inp.steer * Math.min(1, sp / 10) - c.steerVis) * Math.min(1, dt * 5);
  // ── movimento: borda do mapa e paredão (desliza; perde a velocidade CONTRA a parede) ─────────────────────────
  const b = zsBounds(t), E = 8;
  const rawX = c.x + c.vx * dt, rawZ = c.z + c.vz * dt;
  let nx = Math.max(b.minX + E, Math.min(b.maxX - E, rawX)), nz = Math.max(b.minZ + E, Math.min(b.maxZ - E, rawZ));
  if (nx !== rawX) c.vx = 0;
  if (nz !== rawZ) c.vz = 0;
  const ok = (px: number, pz: number) => {
    const run = Math.hypot(px - c.x, pz - c.z); if (run < 1e-6) return true;
    if (zsHeightAt(t, px, pz) < ZS_WATER_Y) return true; // ÁGUA nunca é parede (a face da onda é rampa: o carro sobe nela)
    return carSurface(t, px, pz).y <= c.y + run * CAR.CLIMB_WALL + 0.35;
  };
  if (!ok(nx, nz)) {
    if (ok(nx, c.z)) { nz = c.z; c.vz *= -0.1; }
    else if (ok(c.x, nz)) { nx = c.x; c.vx *= -0.1; }
    else { nx = c.x; nz = c.z; c.vx *= -0.1; c.vz *= -0.1; }
  }
  c.x = nx; c.z = nz;
  c.speed = c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw);
  // ── altura na MOLA (rente acompanha o chão firme; no ar flutua suave) ───────────────────────────────────────
  const s = carSurface(t, c.x, c.z, c.y - CAR.HOVER_WATER); // sente a água onde ESTÁ (bolso/tubo ou por cima)
  c.overWater = s.water;
  const target = s.y + c.alt;
  const low = c.alt < 0.2;
  c.vy += ((target - c.y) * (low ? CAR.SPRING * 2.2 : CAR.SPRING) - c.vy * (low ? CAR.DAMP * 1.6 : CAR.DAMP)) * dt;
  c.vy = Math.max(-CAR.DESCEND * 1.3, Math.min(CAR.CLIMB * 1.6 + 8, c.vy));
  c.y += c.vy * dt;
  if (c.y < s.y) { c.y = s.y; if (c.vy < 0) c.vy = 0; }
  c.altitude = c.y - s.y;
}

/** Bancos (5): posição relativa ao carro (x = ESQUERDA de quem está sentado olhando pra frente (+z), z = frente), em
 *  frações de largura/comprimento. 0 = motorista: o VOLANTE deste modelo fica à DIREITA (visto na câmera de dentro). */
export const CAR_SEATS: { x: number; z: number }[] = [
  { x: -0.12, z: -0.02 }, { x: 0.12, z: -0.02 }, { x: 0.13, z: -0.2 }, { x: 0, z: -0.2 }, { x: -0.13, z: -0.2 }, // largura medida inclui as turbinas: a cabine é ~metade
];
/** Altura do pé do herói sentado, em fração da altura do carro (conferido nas fotos de lado e de trás). */
export const SEAT_FOOT_K = 0.21; // 0,13–0,16 as pernas apareciam embaixo do carro (Pedro); conferido em foto de lado
