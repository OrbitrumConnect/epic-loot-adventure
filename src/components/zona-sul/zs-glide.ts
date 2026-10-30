/**
 * ZONA SUL — ASA-DELTA (nível 8) e SKATE VOADOR (nível 15) (Pedro 29/10: "teremos skate voador nível 15, asa-delta
 * nível 8"). Física PURA (sem three, testável); o herói só chama o passo e aplica a posição.
 *
 * ASA-DELTA: na mão + no ar caindo de um lugar alto → abre sozinha e PLANA. Rumo (yaw) + velocidade no ar + altura.
 *  - A/D inclina (vira mais rápido quanto mais inclinado), W mergulha (ganha velocidade, afunda mais), S empina (freia,
 *    afunda menos… até ESTOLAR abaixo da velocidade mínima e afundar forte), solta = volta pro planeio de cruzeiro.
 *  - Chegou no chão (ou bateu no morro) → pousa e fecha. Na água → cai nadando.
 * SKATE VOADOR: na mão → flutua 35 cm acima do chão OU da água. W acelera, S freia/ré, A/D curva, Shift turbo,
 *  Espaço pulinho. Ladeira acima de ~35° segura (não escala parede). Sem gasolina, sem recarga.
 */

export const GLIDE = {
  /** velocidade de cruzeiro / mínima (abaixo estola) / máxima (m/s) */
  CRUISE: 11, MIN: 6.5, MAX: 24,
  /** afundamento (m/s) no cruzeiro; no estol; extra por m/s acima do cruzeiro (mergulho) */
  SINK: 1.1, SINK_STALL: 5, SINK_PER_SPEED: 0.35,
  /** W: ganha velocidade (m/s²); S: perde; solto: volta pro cruzeiro */
  DIVE_ACC: 4, FLARE_DEC: 3.2, TRIM: 0.8,
  /** inclinação máx (rad) e quanto ela vira (rad/s por rad de inclinação) */
  BANK_MAX: 0.7, TURN_K: 1.5, BANK_RATE: 2.2,
  /** abre sozinha: caindo (vy < −OPEN_VY) e a pelo menos OPEN_AGL m do chão */
  OPEN_VY: 1.5, OPEN_AGL: 3,
  /** pousa a menos disto do chão (m) */
  LAND_AGL: 0.5,
} as const;

export type GlideState = { yaw: number; speed: number; bank: number; y: number; stalled: boolean };
export type GlideInput = { steer: number; pitch: number };

export function newGlide(yaw: number, y: number, speed: number = GLIDE.CRUISE): GlideState {
  return { yaw, speed: Math.max(GLIDE.MIN, speed), bank: 0, y, stalled: false };
}

/** Pode abrir a asa agora? (no ar, caindo, alto o bastante) */
export function canOpenGlider(vy: number, agl: number): boolean {
  return vy < -GLIDE.OPEN_VY && agl >= GLIDE.OPEN_AGL;
}

/** Um passo do planeio. Devolve o deslocamento no chão (dx, dz) e se POUSOU (chão a menos de LAND_AGL). */
export function glideStep(s: GlideState, inp: GlideInput, groundY: number, dt: number): { dx: number; dz: number; landed: boolean } {
  // inclinação segue o comando (suave) e vira proporcional a ela
  const wantBank = Math.max(-1, Math.min(1, inp.steer)) * GLIDE.BANK_MAX;
  s.bank += (wantBank - s.bank) * Math.min(1, dt * GLIDE.BANK_RATE);
  s.yaw -= s.bank * GLIDE.TURN_K * dt;
  // velocidade: W mergulha, S empina, solto volta ao cruzeiro
  if (inp.pitch > 0.1) s.speed += GLIDE.DIVE_ACC * inp.pitch * dt;
  else if (inp.pitch < -0.1) s.speed -= GLIDE.FLARE_DEC * -inp.pitch * dt;
  else s.speed += (GLIDE.CRUISE - s.speed) * Math.min(1, dt * GLIDE.TRIM);
  s.speed = Math.max(GLIDE.MIN - 1.5, Math.min(GLIDE.MAX, s.speed));
  s.stalled = s.speed < GLIDE.MIN;
  // afunda: cruzeiro + mergulho (velocidade acima do cruzeiro custa altura) ; estol afunda forte; curva fechada afunda um pouco
  const sink = s.stalled ? GLIDE.SINK_STALL
    : GLIDE.SINK + Math.max(0, s.speed - GLIDE.CRUISE) * GLIDE.SINK_PER_SPEED + Math.abs(s.bank) * 0.6;
  s.y -= sink * dt;
  const dx = Math.sin(s.yaw) * s.speed * dt, dz = Math.cos(s.yaw) * s.speed * dt;
  return { dx, dz, landed: s.y - groundY <= GLIDE.LAND_AGL };
}

export const SKATE = {
  /** altura de flutuar (m) acima do chão/água */
  HOVER: 0.35,
  /** velocidade normal / turbo / ré (m/s) e aceleração / freio (m/s²) */
  MAX: 9, TURBO: 15, REVERSE: 3, ACC: 7, BRAKE: 11, DRAG: 1.6,
  /** curva (rad/s) — mais lenta em alta velocidade */
  TURN: 2.4,
  /** pulinho (m/s pra cima) e gravidade */
  HOP: 6, GRAV: 15,
  /** ladeira máxima que sobe (graus) */
  MAX_SLOPE: 35,
} as const;

export type SkateState = { yaw: number; speed: number; y: number; vy: number; air: boolean };
export type SkateInput = { throttle: number; steer: number; turbo: boolean; hop: boolean };

export function newSkate(yaw: number, y: number): SkateState {
  return { yaw, speed: 0, y, vy: 0, air: false };
}

/** Um passo do skate. `surfaceAt` = altura do que está embaixo (chão ou água, o maior). `slopeAt` = graus do chão. */
export function skateStep(
  s: SkateState, inp: SkateInput, x: number, z: number, dt: number,
  surfaceAt: (x: number, z: number) => number, slopeAt: (x: number, z: number) => number,
): { x: number; z: number } {
  const top = inp.turbo ? SKATE.TURBO : SKATE.MAX;
  if (inp.throttle > 0.05) s.speed = Math.min(top, s.speed + SKATE.ACC * inp.throttle * dt);
  else if (inp.throttle < -0.05) s.speed = Math.max(-SKATE.REVERSE, s.speed - SKATE.BRAKE * -inp.throttle * dt);
  else s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), SKATE.DRAG * dt);
  if (s.speed > top) s.speed = Math.max(top, s.speed - SKATE.BRAKE * dt); // soltou o turbo: volta ao normal suave
  const turnK = 1 - 0.45 * Math.min(1, Math.abs(s.speed) / SKATE.TURBO);
  s.yaw -= Math.max(-1, Math.min(1, inp.steer)) * SKATE.TURN * turnK * dt * (s.speed < 0 ? -1 : 1);
  let nx = x + Math.sin(s.yaw) * s.speed * dt, nz = z + Math.cos(s.yaw) * s.speed * dt;
  // ladeira íngreme na frente (subindo) segura: o skate não escala parede
  const here = surfaceAt(x, z), there = surfaceAt(nx, nz);
  if (there > here + 0.05 && slopeAt(nx, nz) > SKATE.MAX_SLOPE) { nx = x; nz = z; s.speed *= 0.3; }
  // altura: flutua; pulinho; desce rampa sem "voar" (gruda até 1 m abaixo)
  const want = surfaceAt(nx, nz) + SKATE.HOVER;
  if (inp.hop && !s.air) { s.vy = SKATE.HOP; s.air = true; }
  if (s.air || s.y > want + 1) {
    s.air = true; s.vy -= SKATE.GRAV * dt; s.y += s.vy * dt;
    if (s.y <= want) { s.y = want; s.vy = 0; s.air = false; }
  } else s.y += (want - s.y) * Math.min(1, dt * 14);
  return { x: nx, z: nz };
}
