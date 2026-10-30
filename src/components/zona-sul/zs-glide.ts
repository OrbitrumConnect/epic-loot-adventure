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
  /** velocidade de cruzeiro / mínima (abaixo estola) / máxima (m/s). Pedro 30/10: "planando reto tá em 40 km/h, pode
   *  ser uns 65" → cruzeiro 18 m/s (65 km/h); estol e máxima subiram na mesma proporção (38 e 130 km/h). */
  CRUISE: 18, MIN: 10.5, MAX: 36,
  /** afundamento (m/s) no cruzeiro; no estol; extra por m/s acima do cruzeiro (mergulho). Cruzeiro mais rápido → afunda
   *  na mesma proporção (1,8 m/s a 18 m/s = os mesmos ~10 m pra frente por metro perdido de antes) */
  SINK: 1.8, SINK_STALL: 6, SINK_PER_SPEED: 0.9,
  /** W: ganha velocidade (m/s²); S: perde; solto: volta pro cruzeiro. RASANTE (Pedro 30/10: "senti falta de dar
   *  rasante, inclinar ela pra baixo"): W mergulha forte; S com velocidade ACIMA do cruzeiro troca velocidade por SUBIDA
   *  (o "pull-up" de piloto de verdade: desce em rasante e sobe de novo). */
  DIVE_ACC: 6, FLARE_DEC: 3.2, TRIM: 0.8, ZOOM_CLIMB: 0.6,
  /** inclinação visual do bico (rad): mergulhando desce até 0,55; empinando sobe até 0,3 */
  PITCH_DIVE: 0.55, PITCH_FLARE: 0.3,
  /** inclinação máx (rad) e quanto ela vira (rad/s por rad de inclinação) */
  BANK_MAX: 0.7, TURN_K: 1.5, BANK_RATE: 2.2,
  /** abre sozinha: caindo (vy < −OPEN_VY) e a pelo menos OPEN_AGL m do chão */
  OPEN_VY: 1.5, OPEN_AGL: 3,
  /** pousa a menos disto do chão (m) */
  LAND_AGL: 0.5,
} as const;

/** `pitch` = inclinação VISUAL do bico (+ = pra baixo, mergulho) */
export type GlideState = { yaw: number; speed: number; bank: number; y: number; stalled: boolean; pitch: number };
export type GlideInput = { steer: number; pitch: number };

export function newGlide(yaw: number, y: number, speed: number = GLIDE.CRUISE): GlideState {
  return { yaw, speed: Math.max(GLIDE.MIN, speed), bank: 0, y, stalled: false, pitch: 0 };
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
  // PULL-UP: empinando com velocidade sobrando, a asa sobe (troca velocidade por altura)
  const zoom = inp.pitch < -0.1 && s.speed > GLIDE.CRUISE ? (s.speed - GLIDE.CRUISE) * GLIDE.ZOOM_CLIMB * -inp.pitch : 0;
  // bico: mergulho desce, empinar sobe, solto volta reto
  const wantPitch = inp.pitch > 0.1 ? GLIDE.PITCH_DIVE * inp.pitch : inp.pitch < -0.1 ? -GLIDE.PITCH_FLARE * -inp.pitch : 0;
  s.pitch += (wantPitch - s.pitch) * Math.min(1, dt * 3);
  // afunda: cruzeiro + mergulho (velocidade acima do cruzeiro custa altura) ; estol afunda forte; curva fechada afunda um pouco
  const sink = s.stalled ? GLIDE.SINK_STALL
    // velocidade sobrando custa altura MERGULHANDO (bico pra baixo); empinando ela vira subida (zoom); solto, pouco
    : GLIDE.SINK + Math.max(0, s.speed - GLIDE.CRUISE) * (inp.pitch > 0.1 ? GLIDE.SINK_PER_SPEED : inp.pitch < -0.1 ? 0 : 0.15) + Math.abs(s.bank) * 0.6;
  s.y -= (sink - zoom) * dt;
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
  /** pulinho (m/s pra cima), 2º pulo NO AR (mais alto, com kickflip) e gravidade */
  HOP: 6, HOP2: 7.6, GRAV: 15,
  /** kickflip: tempo de uma volta (s) · giro no ar com A/D (rad/s) — Pedro 30/10: "pular 2×, o 2º mais alto, o skate
   *  gira um flip; e rodar 360 o boneco quando ponho pro lado no salto" */
  FLIP_S: 0.42, SPIN_RATE: 8,
  /** ladeira máxima que sobe (graus) */
  MAX_SLOPE: 35,
} as const;

/** `jumps` = pulos dados neste voo (0–2) · `flip` = progresso do kickflip (0 = parado, 0..1 girando) ·
 *  `spin` = giro VISUAL no ar (rad, A/D) · `trick`/`trickT` = nome da manobra ao pousar e quanto tempo mostra */
export type SkateState = { yaw: number; speed: number; y: number; vy: number; air: boolean; jumps: number; flip: number; flips: number; spin: number; trick: string; trickT: number };
export type SkateInput = { throttle: number; steer: number; turbo: boolean; hop: boolean };

export function newSkate(yaw: number, y: number): SkateState {
  return { yaw, speed: 0, y, vy: 0, air: false, jumps: 0, flip: 0, flips: 0, spin: 0, trick: '', trickT: 0 };
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
  const steer = Math.max(-1, Math.min(1, inp.steer));
  // no chão A/D faz a curva; NO AR A/D gira o corpo e o skate (360) — o rumo segue reto
  if (!s.air) s.yaw -= steer * SKATE.TURN * turnK * dt * (s.speed < 0 ? -1 : 1);
  else s.spin -= steer * SKATE.SPIN_RATE * dt;
  if (s.flip > 0) { s.flip += dt / SKATE.FLIP_S; if (s.flip >= 1) { s.flip = 0; s.flips++; } }
  s.trickT = Math.max(0, s.trickT - dt);
  let nx = x + Math.sin(s.yaw) * s.speed * dt, nz = z + Math.cos(s.yaw) * s.speed * dt;
  // ladeira íngreme na frente (subindo) segura: o skate não escala parede
  const here = surfaceAt(x, z), there = surfaceAt(nx, nz);
  if (there > here + 0.05 && slopeAt(nx, nz) > SKATE.MAX_SLOPE) { nx = x; nz = z; s.speed *= 0.3; }
  // altura: flutua; pulinho; desce rampa sem "voar" (gruda até 1 m abaixo)
  const want = surfaceAt(nx, nz) + SKATE.HOVER;
  if (inp.hop && !s.air) { s.vy = SKATE.HOP; s.air = true; s.jumps = 1; }
  else if (inp.hop && s.air && s.jumps === 1) { s.vy = SKATE.HOP2; s.jumps = 2; s.flip = 1e-4; } // 2º pulo no ar + kickflip
  if (s.air || s.y > want + 1) {
    s.air = true; s.vy -= SKATE.GRAV * dt; s.y += s.vy * dt;
    if (s.y <= want) { s.y = want; s.vy = 0; s.air = false; land(s); }
  } else s.y += (want - s.y) * Math.min(1, dt * 14);
  return { x: nx, z: nz };
}

/** Pousou: nomeia a manobra (giros completos + kickflips) e zera o voo. O giro que sobrou volta suave (no herói). */
function land(s: SkateState): void {
  const turns = Math.round(Math.abs(s.spin) / (Math.PI * 2) * 2) / 2; // meia volta conta (180)
  const flips = s.flips + (s.flip > 0.5 ? 1 : 0);
  const parts: string[] = [];
  if (turns >= 0.5) parts.push(String(Math.round(turns * 360)));
  if (flips > 0) parts.push(flips > 1 ? `kickflip ×${flips}` : 'kickflip');
  if (parts.length) { s.trick = parts.join(' + ') + '!'; s.trickT = 1.8; }
  s.jumps = 0; s.flip = 0; s.flips = 0;
  s.spin = s.spin - Math.round(s.spin / (Math.PI * 2)) * Math.PI * 2; // sobra (fora de volta inteira) — o herói assenta
}
