/**
 * ZONA SUL — SURF fase C: o surfista na prancha (lógica pura, testável). Pedro 28/10: "remada → ficar em pé (posição do
 * zombie na hora de levantar) → surfar"; "caso eu caia dentro do tubo, eu giro junto com ele e vou sendo levado".
 *
 *  remar   deitado na prancha (mais rápido que nadar); a onda leva junto (mesmo "bolso" de quem boia)
 *  levantar ESPAÇO quando a onda já te pegou (correnteza ≥ CATCH × velocidade da onda) — POPUP_S segundos, levado
 *  em pé   a onda te segura no bolso; a prancha tem rumo e velocidade: CARVING (vira com raio pro lado que você
 *          aponta), desce a face = ganha velocidade, sobe = perde, Shift = pump; subindo rápido e passando o lip →
 *          AÉREO (no ar A/D gira; pousou alinhado = limpo, torto = vaca); perdeu a onda por LOSE_S → deita e rema
 *  vaca    a onda FECHOU em cima (espuma batendo ≥ WIPE_CHURN): gira junto com a espuma, levado por WIPE_S, sem
 *          controle; depois volta a remar (com prancha) ou a nadar (sem)
 *
 * Eixos da zona (unitários no plano xz): q = rumo à praia, s = ao longo da onda.
 */
export const RIDE = {
  PADDLE: 3.8, PADDLE_FAST: 5.4, GLIDE: 2.8,  // remada (m/s) e resposta (1/s) — Pedro: "2–3 km/h mais rápido, tá presa"
  CATCH: 0.6,                                // fração da velocidade da onda pra conseguir levantar
  POPUP_S: 1.05,                             // levantar: Zombie Stand Up de 30% a 100% (3,08 s × 0,7) a 2× ≈ 1,05 s
  LOSE_S: 2,                                 // segundos sem onda até deitar de novo (1,2 era pouco)
  LOST_PUSH: 0.6,                            // correnteza abaixo disso = "sem onda"
  WIPE_CHURN: 0.55, WIPE_S: 2.2, WIPE_CARRY: 1.2, WIPE_SPIN: 9, // vaca: limiar, duração, arrasto, giro (rad/s)
  // MANOBRA (Pedro 28/10: "pro lado vai lateral, aéreo perto da crista, carving direitinho" — referência: Kelly Slater's
  // Pro Surfer = virar esq/dir + acelerar + frear). A prancha tem RUMO e VELOCIDADE próprios em cima da onda (que te
  // segura no bolso): vira com raio (carving), desce a face = ganha velocidade, sobe = perde (skate numa rampa que anda).
  TURN: 2.6,                                 // giro da prancha (rad/s) — carving
  G_FACE: 9, DRAG: 0.55, S_CRUISE: 4, S_MAX: 13, PUMP: 2.2, STALL: 4, // gravidade na face, arrasto, cruzeiro/máx, pump (W), freio (S)
  BOOST: 0.55, BOOST_CD: 0.8,                // toque no Shift em pé: +0,55 m/s (≈ 2 km/h) na hora, no máx. 1 a cada 0,8 s (Pedro)
  // AÉREO: subindo a face rápido e passando o lip → decola; no ar A/D gira; pousou alinhado = aéreo, torto = vaca
  AIR_RISE: 2.2, AIR_UP: 0.2, AIR_MIN_S: 4, GRAV: 13, AIR_SPIN: 7.5, LAND_TOL: 70 * Math.PI / 180,
} as const;

export type RideMode = 'paddle' | 'popup' | 'ride' | 'wipe';
export type RideState = {
  mode: RideMode; t: number; vx: number; vz: number; lost: number; spin: number;
  /** em pé: rumo da prancha (yaw do mundo), velocidade própria em cima da onda, taxa de curva (pra inclinar) */
  yaw: number; speed: number; carve: number;
  /** aéreo: no ar? altura dos pés, velocidade vertical, giro acumulado; subida da água embaixo (suavizada) */
  air: boolean; y: number; vy: number; airSpin: number; spinDir: number; rise: number; prevSurf: number;
  /** placar: aéreos limpos e a última manobra (pro HUD) */
  airs: number; trick: string; trickT: number;
  /** respiro do boost (s) */
  boostCd: number;
};
/** remando: direção no mundo (relativa à câmera, como nadar). EM PÉ: comandos DA PRANCHA (Pedro 28/10: "em cima da
 *  prancha os comandos trocam") — steer +1 = vira à DIREITA (D), −1 = esquerda (A); throttle +1 = acelera/pump (W),
 *  −1 = freia/stall (S). Não dependem da câmera, então nunca invertem. */
export type RideInput = { dirX: number; dirZ: number; pop: boolean; fast: boolean; steer?: number; throttle?: number;
  /** em pé: TOQUE no Shift (só no quadro em que apertou) = boost leve de velocidade */
  boost?: boolean };
/** água em volta: correnteza, espuma, e (em pé) a altura da água embaixo e a inclinação dela (∂h/∂x, ∂h/∂z) */
export type RideWater = { pushX: number; pushZ: number; churn: number; surfY?: number; gradX?: number; gradZ?: number;
  /** de que lado do pico você está (+1 direita, −1 esquerda, no eixo s): ao levantar, sai NA LINHA pra esse lado */
  side?: number };
export type RideAxes = { qx: number; qz: number; sx: number; sz: number };

export function newRide(): RideState {
  return { mode: 'paddle', t: 0, vx: 0, vz: 0, lost: 0, spin: 0, yaw: 0, speed: 0, carve: 0, air: false, y: 0, vy: 0, airSpin: 0, spinDir: 0, rise: 0, prevSurf: NaN, airs: 0, trick: '', trickT: 0, boostCd: 0 };
}
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Dá pra levantar agora? (a onda já te pegou) */
export function canPop(st: RideState, w: RideWater, waveC: number): boolean {
  return st.mode === 'paddle' && Math.hypot(w.pushX, w.pushZ) >= RIDE.CATCH * waveC;
}

/** Um passo. Muda `st` e devolve o deslocamento (m) no plano. */
export function rideStep(st: RideState, inp: RideInput, w: RideWater, ax: RideAxes, waveC: number, dt: number): { dx: number; dz: number } {
  st.t += dt;
  const go = (m: RideMode) => { st.mode = m; st.t = 0; st.lost = 0; };
  if (st.mode !== 'wipe' && w.churn >= RIDE.WIPE_CHURN) go('wipe'); // a onda fechou em cima: vaca
  const pm = Math.hypot(w.pushX, w.pushZ);
  switch (st.mode) {
    case 'paddle': {
      const target = inp.fast ? RIDE.PADDLE_FAST : RIDE.PADDLE, k = 1 - Math.exp(-RIDE.GLIDE * dt);
      st.vx += (inp.dirX * target - st.vx) * k; st.vz += (inp.dirZ * target - st.vz) * k;
      if (inp.pop && canPop(st, w, waveC)) go('popup');
      // remada + a onda leva (como quem boia)
      return { dx: (st.vx + w.pushX * 1.15) * dt, dz: (st.vz + w.pushZ * 1.15) * dt };
    }
    case 'popup': {
      // levantando: só a onda leva (sem controle); já aponta a prancha rumo à praia e sai com velocidade de cruzeiro
      st.vx = w.pushX; st.vz = w.pushZ;
      if (st.t >= RIDE.POPUP_S) {
        go('ride');
        // sai NA LINHA da onda pro lado em que você está (descendo de leve) — reto pra praia passava da onda em 2 s
        const sd = (w.side ?? 0) >= 0 ? 1 : -1, lx = ax.sx * sd * 0.87 + ax.qx * 0.5, lz = ax.sz * sd * 0.87 + ax.qz * 0.5;
        st.yaw = Math.atan2(lx, lz);
        st.speed = RIDE.S_CRUISE; st.air = false; st.rise = 0; st.prevSurf = NaN;
      }
      return { dx: st.vx * dt, dz: st.vz * dt };
    }
    case 'ride': {
      const surfY = w.surfY ?? 0;
      let ux = Math.sin(st.yaw), uz = Math.cos(st.yaw);
      // a onda te segura no BOLSO (anda junto com ela); fora dela, só a correnteza que sobrar
      const carry = pm >= RIDE.LOST_PUSH ? waveC : pm;
      if (st.air) {
        // ── NO AR: balística; a onda continua te levando; A/D (pro lado) GIRA a prancha ───────────────────────────
        // o SENTIDO do giro é escolhido quando você aperta e segue enquanto segura (não para "apontando" pro lado)
        const steerA = inp.steer ?? 0;
        if (Math.abs(steerA) > 0.3) { if (st.spinDir === 0) st.spinDir = -Math.sign(steerA); } else st.spinDir = 0;
        const spin = st.spinDir * RIDE.AIR_SPIN * dt;
        st.yaw = wrap(st.yaw + spin); st.airSpin += spin; st.carve = 0;
        st.vy -= RIDE.GRAV * dt; st.y += st.vy * dt;
        ux = Math.sin(st.yaw); uz = Math.cos(st.yaw);
        st.vx = ax.qx * carry + ux * st.speed * 0.35; st.vz = ax.qz * carry + uz * st.speed * 0.35;
        if (st.vy < 0 && st.y <= surfY) {
          // POUSO: alinhado com 0° / 180° / 360°… = limpo; torto = vaca
          const turns = Math.abs(st.airSpin) / Math.PI, off = Math.abs(turns - Math.round(turns)) * Math.PI;
          st.air = false; st.y = surfY; st.prevSurf = surfY; st.rise = 0;
          if (off > RIDE.LAND_TOL) { go('wipe'); st.trick = 'caiu do aéreo!'; st.trickT = 2; return { dx: st.vx * dt, dz: st.vz * dt }; }
          const deg = Math.round(turns) * 180;
          if (Math.round(turns) % 2 === 1) st.yaw = wrap(st.yaw + Math.PI); // pousou de ré: vira a prancha (reverse)
          st.airs++; st.trick = deg >= 180 ? `aéreo ${deg}!` : 'aéreo!'; st.trickT = 2.5;
          st.speed = Math.max(st.speed, RIDE.S_CRUISE);
        }
        return { dx: st.vx * dt, dz: st.vz * dt };
      }
      // ── CARVING: a prancha vira pro lado que você aponta, com raio (não muda de direção na hora) ───────────────
      // D = direita (o rumo gira no sentido horário visto de cima = yaw diminui), A = esquerda
      const prevYaw = st.yaw, steer = Math.max(-1, Math.min(1, inp.steer ?? 0)), thr = Math.max(-1, Math.min(1, inp.throttle ?? 0));
      st.yaw = wrap(st.yaw - steer * RIDE.TURN * dt);
      // sem velocidade na parede, a ponta CAI rampa abaixo sozinha (não fica "parado" no meio da face)
      const gm = Math.hypot(w.gradX ?? 0, w.gradZ ?? 0);
      if (st.speed < 2.5 && gm > 0.15) {
        const dn = wrap(Math.atan2(-(w.gradX ?? 0), -(w.gradZ ?? 0)) - st.yaw), r = 1.6 * Math.min(1, gm) * (1 - st.speed / 2.5) * dt;
        st.yaw = wrap(st.yaw + Math.max(-r, Math.min(r, dn)));
      }
      st.carve = wrap(st.yaw - prevYaw) / dt;
      ux = Math.sin(st.yaw); uz = Math.cos(st.yaw);
      // ── VELOCIDADE: desce a face = ganha, sobe = perde (gravidade na rampa); arrasto puxa pro cruzeiro; Shift = pump
      const down = -((w.gradX ?? 0) * ux + (w.gradZ ?? 0) * uz);
      const pump = Math.max(0, thr), stall = Math.max(0, -thr);
      // BOOST: toque no Shift = +2 km/h na hora (com respiro)
      st.boostCd = Math.max(0, st.boostCd - dt);
      if (inp.boost && st.boostCd <= 0) { st.speed += RIDE.BOOST; st.boostCd = RIDE.BOOST_CD; }
      st.speed += (RIDE.G_FACE * down - RIDE.DRAG * (st.speed - RIDE.S_CRUISE) + RIDE.PUMP * pump - RIDE.STALL * stall) * dt;
      st.speed = Math.max(0, Math.min(RIDE.S_MAX, st.speed));
      st.vx = ax.qx * carry + ux * st.speed; st.vz = ax.qz * carry + uz * st.speed;
      // ── AÉREO: a água embaixo subia rápido (subindo a face rumo ao lip) e agora desce (passou o lip) → decola ───
      if (Number.isNaN(st.prevSurf)) st.prevSurf = surfY;
      const rise = (surfY - st.prevSurf) / dt; st.prevSurf = surfY;
      const up = -(ux * ax.qx + uz * ax.qz); // rumo à crista (pro mar)
      if (st.rise > RIDE.AIR_RISE && rise < 0 && up > RIDE.AIR_UP && st.speed > RIDE.AIR_MIN_S) {
        st.air = true; st.vy = st.rise * 1.1 + 2; st.y = surfY; st.airSpin = 0; st.spinDir = 0; // impulso do lip: aéreo leve (~1–1,5 m)
      }
      st.rise += (rise - st.rise) * Math.min(1, 8 * dt);
      if (st.trickT > 0) st.trickT -= dt;
      st.lost = pm < RIDE.LOST_PUSH ? st.lost + dt : 0;
      if (st.lost >= RIDE.LOSE_S) { go('paddle'); st.vx *= 0.5; st.vz *= 0.5; } // perdeu a onda: deita de novo
      return { dx: st.vx * dt, dz: st.vz * dt };
    }
    case 'wipe': {
      // vaca: gira junto com a espuma, levado, sem controle
      st.spin += RIDE.WIPE_SPIN * dt;
      st.vx = w.pushX * RIDE.WIPE_CARRY; st.vz = w.pushZ * RIDE.WIPE_CARRY;
      if (st.t >= RIDE.WIPE_S) { go('paddle'); st.spin = 0; }
      return { dx: st.vx * dt, dz: st.vz * dt };
    }
  }
  return { dx: 0, dz: 0 };
}
