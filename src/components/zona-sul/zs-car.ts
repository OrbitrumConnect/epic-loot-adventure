/**
 * ZONA SUL — CARRO VOADOR (Pedro 28/10), lógica pura (testável):
 *  - flutua HOVER (0,5 m) acima do chão; sobre a água desce pra HOVER_WATER (0,25 m) — a água "sente" ele passar (rastro);
 *  - ESPAÇO = impulso leve de velocidade e SOBE aos poucos até FLY_ALT (~35 m) por até FLY_MS (60 s); C desce quando
 *    quiser; DESCE suave; recarga COOLDOWN_MS (15 s) depois do voo; Shift = turbo;
 *  - paredão é parede (não sobe rampa mais íngreme que CLIMB, nem voando se o morro passar da altura do voo);
 *  - 5 lugares (o motorista agora; os outros prontos pro multiplayer).
 * Frente do carro = (sin yaw, cos yaw), igual ao herói.
 */
import { type ZsTerrain, zsBounds, zsHeightAt, ZS_WATER_Y } from './zs-terrain-data';

export const CAR = {
  HOVER: 0.5, HOVER_WATER: 0.25,
  MAX: 16, REVERSE: 5, BOOST: 1.3, TURBO: 1.35, // m/s (16 ≈ 58 km/h); impulso do voo +30%; Shift = turbo +35%
  ACCEL: 7, BRAKE: 12, DRAG: 0.7, STEER: 1.6,
  FLY_ALT: 35, FLY_MS: 60_000, COOLDOWN_MS: 15_000, // Pedro: "o espaço pode ir mais alto um pouco" (25 → 35 m)
  RISE: 2.4, SINK: 2.2, HUG: 14,         // m/s: subir voando, descer, acompanhar o chão rente
  CLIMB: 0.9,                             // subida máx. por metro (≈ 42°)
  ENTER_DIST: 4.5, EXIT_MAX_SPEED: 3, EXIT_MAX_ALT: 2,
  LENGTH: 5.5,                            // comprimento no jogo (m) — Pedro: "uns 20% maior" (4,6 → 5,5); 5 lugares
} as const;

export type ZsCar = {
  x: number; z: number; y: number; yaw: number; speed: number;
  flying: boolean; flyUntil: number; cooldownUntil: number;
  overWater: boolean; altitude: number; steerVis: number;
};
/** `descend` (tecla C): encerra o voo NA HORA e desce suave (Pedro: "quero apertar C pra ele descer"). */
export type ZsCarInput = { throttle: number; steer: number; boost: boolean; turbo?: boolean; descend?: boolean };

export function newCar(x: number, z: number, yaw: number, t: ZsTerrain): ZsCar {
  return { x, z, yaw, y: carSurface(t, x, z).y, speed: 0, flying: false, flyUntil: 0, cooldownUntil: 0, overWater: false, altitude: 0, steerVis: 0 };
}

/** Altura de flutuar em (x, z): chão + 0,5 m, ou água + 0,25 m. */
export function carSurface(t: ZsTerrain, x: number, z: number): { y: number; water: boolean } {
  const g = zsHeightAt(t, x, z);
  return g < ZS_WATER_Y ? { y: ZS_WATER_Y + CAR.HOVER_WATER, water: true } : { y: g + CAR.HOVER, water: false };
}

/** Um passo do carro (mexe em `c`). `now` em ms. */
export function carStep(t: ZsTerrain, c: ZsCar, inp: ZsCarInput, dt: number, now: number): void {
  // voo: liga no espaço (fora da recarga); termina sozinho e começa a recarga
  if (inp.boost && !c.flying && now >= c.cooldownUntil) { c.flying = true; c.flyUntil = now + CAR.FLY_MS; }
  if (c.flying && (now >= c.flyUntil || inp.descend)) { c.flying = false; c.cooldownUntil = now + CAR.COOLDOWN_MS; } // 60 s é o MÁXIMO
  // velocidade
  const max = CAR.MAX * (c.flying ? CAR.BOOST : 1) * (inp.turbo ? CAR.TURBO : 1);
  if (inp.throttle > 0) c.speed = Math.min(max, c.speed + CAR.ACCEL * inp.throttle * dt);
  else if (inp.throttle < 0) c.speed = c.speed > 0 ? Math.max(0, c.speed - CAR.BRAKE * dt) : Math.max(-CAR.REVERSE, c.speed + CAR.ACCEL * inp.throttle * dt);
  else c.speed *= Math.max(0, 1 - CAR.DRAG * dt);
  if (c.speed > max) c.speed += (max - c.speed) * Math.min(1, dt * 1.5); // saiu do voo: perde o impulso devagar
  if (Math.abs(c.speed) < 0.02) c.speed = 0;
  // direção (só vira andando; de ré inverte)
  const grip = Math.min(1, Math.abs(c.speed) / 6) * Math.sign(c.speed || 1);
  c.yaw -= inp.steer * CAR.STEER * dt * grip;
  c.steerVis += (inp.steer * Math.min(1, Math.abs(c.speed) / 8) - c.steerVis) * Math.min(1, dt * 4);
  // movimento com parede (desliza no eixo livre)
  const b = zsBounds(t), E = 8;
  const clampX = (v: number) => Math.max(b.minX + E, Math.min(b.maxX - E, v)), clampZ = (v: number) => Math.max(b.minZ + E, Math.min(b.maxZ - E, v));
  const dx = Math.sin(c.yaw) * c.speed * dt, dz = Math.cos(c.yaw) * c.speed * dt;
  const ok = (nx: number, nz: number) => {
    const run = Math.hypot(nx - c.x, nz - c.z); if (run < 1e-6) return true;
    return carSurface(t, nx, nz).y <= c.y + run * CAR.CLIMB + 0.35; // morro mais alto que dá pra subir agora = parede
  };
  let nx = clampX(c.x + dx), nz = clampZ(c.z + dz);
  if (!ok(nx, nz)) {
    if (ok(nx, c.z)) nz = c.z; else if (ok(c.x, nz)) nx = c.x; else { nx = c.x; nz = c.z; }
    c.speed *= Math.max(0, 1 - dt * 4); // bateu: perde velocidade
  }
  c.x = nx; c.z = nz;
  // altura: rente ao chão (acompanha rápido) ou voando (sobe/desce suave)
  const s = carSurface(t, c.x, c.z);
  c.overWater = s.water;
  const target = s.y + (c.flying ? CAR.FLY_ALT : 0);
  const d = target - c.y;
  const up = c.flying ? CAR.RISE : CAR.HUG, down = c.y - s.y > 1.5 ? CAR.SINK : CAR.HUG;
  c.y += Math.max(-down * dt, Math.min(up * dt, d));
  if (c.y < s.y) c.y = s.y;
  c.altitude = c.y - s.y;
}

/** Bancos (5): posição relativa ao carro (x = ESQUERDA de quem está sentado olhando pra frente (+z), z = frente), em
 *  frações de largura/comprimento. 0 = motorista (esquerda — medido na foto de trás: com x negativo ele ia pro carona). */
export const CAR_SEATS: { x: number; z: number }[] = [
  { x: 0.12, z: 0.06 }, { x: -0.12, z: 0.06 }, { x: 0.13, z: -0.2 }, { x: 0, z: -0.2 }, { x: -0.13, z: -0.2 }, // largura medida inclui as turbinas: a cabine é ~metade
];
/** Altura do pé do herói sentado, em fração da altura do carro (conferido nas fotos de lado e de trás). */
export const SEAT_FOOT_K = 0.16; // 0,13 o pé aparecia embaixo do carro; 0,18 a cabeça batia no teto
