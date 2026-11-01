/**
 * ZONA SUL — NAVIO DE GUERRA (Pedro 01/11: "navio de guerra pega acima do nível 70; ataca com bola de canhão, mirando").
 * Lógica PURA (testável), no mesmo molde do carro (`zs-car.ts`):
 *  - DIRIGIR pesado: W/S vela (acelera devagar, máx. ~32 km/h), A/D leme (gira devagar, só andando). Só anda no MAR FUNDO
 *    (casco inteiro: proa, popa e meio) — na costa desliza e perde a velocidade, nunca encalha na areia.
 *  - CANHÕES: o lado sai de pra onde a câmera olha (bombordo = esquerda, boreste = direita); a inclinação da câmera dá a
 *    elevação (alcance). Salva de 3 balas em ARCO com gravidade; recarga por lado. Onde cai = dano em área.
 *  - Navio contra navio de OUTRO jogador e vida do navio: próxima etapa (precisa do veículo do outro na rede).
 * Frente do navio = (sin yaw, cos yaw), igual ao herói e ao carro.
 */

export const WARSHIP = {
  LENGTH: 32,                       // m (o encalhado tem 38)
  MAX: 9, REVERSE: 2.5,             // m/s (9 ≈ 32 km/h)
  ACCEL: 1.5, BRAKE: 2.4, COAST: 0.12,
  TURN: 0.3, TURN_RESP: 1.4,        // giro máx. (rad/s, só andando) e resposta (1/s)
  MIN_DEPTH: 3.2,                   // fundura mínima embaixo do casco (m)
  BOARD_DIST: 16,                   // E embarca a até isto do centro (m)
  // canhões
  BALL_SPEED: 52, GRAVITY: 9.8,
  ELEV_MIN: 0.04, ELEV_MAX: 0.62,   // elevação (rad): ~25 m … ~270 m de alcance
  RELOAD_S: 4, SALVO: 3, SALVO_GAP_MS: 150, SALVO_SPREAD: 5,  // 3 balas espalhadas 5 m ao longo do costado
  SPLASH_R: 5,
  UNLOCK_ID: 'war_ship',
  /** ancorado no mar fundo mais perto disto: perto do Arpoador, do lado de Ipanema, FORA da onda (a zona de surf vai até
   *  ~160 m pro oeste do pico, x ≈ −70) */
  DOCK_NEAR: { x: -140, z: 470 },
} as const;

export type WarshipSide = 'port' | 'starboard';
export type ZsWarship = {
  x: number; z: number; yaw: number;
  speed: number; yawRate: number;
  /** adernar visual (rad) ao virar */
  roll: number;
  /** segundos até poder atirar de novo, por lado */
  reload: Record<WarshipSide, number>;
};
export type WarshipInput = { throttle: number; steer: number };

export function newWarship(x: number, z: number, yaw: number): ZsWarship {
  return { x, z, yaw, speed: 0, yawRate: 0, roll: 0, reload: { port: 0, starboard: 0 } };
}

/** O casco cabe em (x, z, yaw)? Proa, popa, meio e as bordas (1/4 da boca) em mar fundo. */
export function hullFits(swimmable: (x: number, z: number) => boolean, x: number, z: number, yaw: number): boolean {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), half = WARSHIP.LENGTH / 2, beam = WARSHIP.LENGTH * 0.12;
  for (const u of [-half, -half / 2, 0, half / 2, half]) for (const v of [-beam, 0, beam]) {
    if (!swimmable(x + fx * u + fz * v, z + fz * u - fx * v)) return false;
  }
  return true;
}

/** Um passo do navio (mexe em `s`). `swimmable` = mar com fundura suficiente (o mapa diz). */
export function warshipStep(swimmable: (x: number, z: number) => boolean, s: ZsWarship, inp: WarshipInput, dt: number): void {
  for (const side of ['port', 'starboard'] as const) s.reload[side] = Math.max(0, s.reload[side] - dt);
  let v = s.speed;
  if (inp.throttle > 0) v += WARSHIP.ACCEL * inp.throttle * Math.max(0, 1 - v / WARSHIP.MAX) * dt;
  else if (inp.throttle < 0) v = v > 0.2 ? Math.max(0, v - WARSHIP.BRAKE * -inp.throttle * dt) : Math.max(-WARSHIP.REVERSE, v + WARSHIP.ACCEL * 0.5 * inp.throttle * dt);
  else v *= Math.exp(-WARSHIP.COAST * dt);
  // leme: só vira andando (um navio parado não gira no lugar); de ré inverte
  const sp = Math.abs(v), dir = v >= 0 ? 1 : -1;
  const want = -inp.steer * WARSHIP.TURN * Math.min(1, sp / 2.5) * dir;
  s.yawRate += (want - s.yawRate) * Math.min(1, WARSHIP.TURN_RESP * dt);
  const ny = s.yaw + s.yawRate * dt;
  const nx = s.x + Math.sin(ny) * v * dt, nz = s.z + Math.cos(ny) * v * dt;
  if (hullFits(swimmable, nx, nz, ny)) { s.x = nx; s.z = nz; s.yaw = ny; }
  else if (hullFits(swimmable, s.x, s.z, ny)) { s.yaw = ny; v *= 0.3; }   // não passa: gira no lugar e perde o embalo
  else { v *= 0.3; s.yawRate *= 0.5; }
  s.speed = v;
  s.roll += (-s.yawRate * Math.min(1, sp / WARSHIP.MAX) * 0.6 - s.roll) * Math.min(1, dt * 1.5);
}

/** Lado do costado pra onde a câmera olha (yaw da VISÃO, câmera → alvo). Direita do navio = (cos yaw, −sin yaw). */
export function cannonSide(shipYaw: number, viewYaw: number): WarshipSide {
  const rx = Math.cos(shipYaw), rz = -Math.sin(shipYaw);
  return Math.sin(viewYaw) * rx + Math.cos(viewYaw) * rz >= 0 ? 'starboard' : 'port';
}

/** Elevação do canhão a partir da inclinação da câmera (mais alta = mais longe). */
export function cannonElevation(camPitch: number): number {
  const k = Math.max(0, Math.min(1, (camPitch - 0.05) / 0.9));
  return WARSHIP.ELEV_MIN + (WARSHIP.ELEV_MAX - WARSHIP.ELEV_MIN) * k;
}

export type CannonBall = { ox: number; oy: number; oz: number; vx: number; vy: number; vz: number };

/** As balas de uma salva: saem do costado `side`, perpendicular ao navio, com a elevação dada. `deckY` = altura dos canhões. */
export function cannonSalvo(s: ZsWarship, side: WarshipSide, elevation: number, deckY: number): CannonBall[] {
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const sgn = side === 'starboard' ? 1 : -1, ox = Math.cos(s.yaw) * sgn, oz = -Math.sin(s.yaw) * sgn; // pra fora do costado
  const beam = WARSHIP.LENGTH * 0.1, h = Math.cos(elevation) * WARSHIP.BALL_SPEED, up = Math.sin(elevation) * WARSHIP.BALL_SPEED;
  const out: CannonBall[] = [];
  for (let i = 0; i < WARSHIP.SALVO; i++) {
    const u = (i - (WARSHIP.SALVO - 1) / 2) * WARSHIP.SALVO_SPREAD;
    out.push({ ox: s.x + fx * u + ox * beam, oy: deckY, oz: s.z + fz * u + oz * beam, vx: ox * h + fx * s.speed, vy: up, vz: oz * h + fz * s.speed });
  }
  return out;
}

/** Posição da bala no tempo t (s). */
export function ballAt(b: CannonBall, t: number): { x: number; y: number; z: number } {
  return { x: b.ox + b.vx * t, y: b.oy + b.vy * t - 0.5 * WARSHIP.GRAVITY * t * t, z: b.oz + b.vz * t };
}

/** Onde e quando a bala cai: primeiro ponto abaixo de `surfaceAt` (máx(chão, água)). Passos de 1/30 s, até 12 s. */
export function ballLanding(b: CannonBall, surfaceAt: (x: number, z: number) => number): { x: number; y: number; z: number; t: number } {
  const step = 1 / 30;
  for (let t = step; t <= 12; t += step) {
    const p = ballAt(b, t);
    if (p.y <= surfaceAt(p.x, p.z)) return { ...p, t };
  }
  const p = ballAt(b, 12);
  return { ...p, t: 12 };
}

/** Ponto de ANCORAGEM: o mais perto de `near` onde o casco cabe, paralelo à costa (varre anéis e giros). Determinístico. */
export function findWarshipDock(swimmable: (x: number, z: number) => boolean, near: { x: number; z: number }): { x: number; z: number; yaw: number } | null {
  for (let r = 0; r <= 400; r += 6) {
    const n = Math.max(1, Math.round((2 * Math.PI * r) / 6));
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2, x = near.x + Math.sin(ang) * r, z = near.z + Math.cos(ang) * r;
      for (let k = 0; k < 12; k++) { const yaw = (k / 12) * Math.PI; if (hullFits(swimmable, x, z, yaw)) return { x, z, yaw }; }
    }
  }
  return null;
}
