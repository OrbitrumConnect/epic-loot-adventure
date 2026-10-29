/**
 * ZONA SUL — SURF fase C: o surfista na prancha (lógica pura, testável). Pedro 28/10: "remada → ficar em pé (posição do
 * zombie na hora de levantar) → surfar"; "caso eu caia dentro do tubo, eu giro junto com ele e vou sendo levado".
 *
 *  remar   deitado na prancha (mais rápido que nadar); a onda leva junto (mesmo "bolso" de quem boia)
 *  levantar ESPAÇO quando a onda já te pegou (correnteza ≥ CATCH × velocidade da onda) — POPUP_S segundos, levado
 *  em pé   a onda leva rumo à praia (com a rampa da face); você corre a parede pro lado que apertar (ao longo da onda,
 *          até LAT_MAX) e inclina pra frente/trás; perdeu a onda por LOSE_S → deita e volta a remar
 *  vaca    a onda FECHOU em cima (espuma batendo ≥ WIPE_CHURN): gira junto com a espuma, levado por WIPE_S, sem
 *          controle; depois volta a remar (com prancha) ou a nadar (sem)
 *
 * Eixos da zona (unitários no plano xz): q = rumo à praia, s = ao longo da onda.
 */
export const RIDE = {
  PADDLE: 3.0, PADDLE_FAST: 4.6, GLIDE: 1.8,  // remada (m/s) e resposta (1/s)
  CATCH: 0.6,                                // fração da velocidade da onda pra conseguir levantar
  POPUP_S: 1.05,                             // levantar: Zombie Stand Up de 30% a 100% (3,08 s × 0,7) a 2× ≈ 1,05 s
  LAT_MAX: 8.5, LAT_FAST: 10.5, LAT_RESP: 2.6, // correr a parede (m/s) e resposta (1/s); a abertura anda ~6,5 m/s
  LEAN: 1.6,                                 // inclinar pra frente/trás (m/s a mais/menos rumo à praia)
  LOSE_S: 1.2,                               // segundos sem onda até deitar de novo
  LOST_PUSH: 0.6,                            // correnteza abaixo disso = "sem onda"
  WIPE_CHURN: 0.55, WIPE_S: 2.2, WIPE_CARRY: 1.2, WIPE_SPIN: 9, // vaca: limiar, duração, arrasto, giro (rad/s)
} as const;

export type RideMode = 'paddle' | 'popup' | 'ride' | 'wipe';
export type RideState = { mode: RideMode; t: number; vx: number; vz: number; lost: number; spin: number };
export type RideInput = { dirX: number; dirZ: number; pop: boolean; fast: boolean };
export type RideWater = { pushX: number; pushZ: number; churn: number };
export type RideAxes = { qx: number; qz: number; sx: number; sz: number };

export function newRide(): RideState { return { mode: 'paddle', t: 0, vx: 0, vz: 0, lost: 0, spin: 0 }; }

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
      // levantando: só a onda leva (sem controle)
      st.vx = w.pushX; st.vz = w.pushZ;
      if (st.t >= RIDE.POPUP_S) go('ride');
      return { dx: st.vx * dt, dz: st.vz * dt };
    }
    case 'ride': {
      // ao longo da onda: o que você aperta (projeção no eixo s), com resposta; rumo à praia: a onda + inclinação
      const lat = (inp.dirX * ax.sx + inp.dirZ * ax.sz) * (inp.fast ? RIDE.LAT_FAST : RIDE.LAT_MAX);
      const curLat = st.vx * ax.sx + st.vz * ax.sz;
      const newLat = curLat + (lat - curLat) * Math.min(1, RIDE.LAT_RESP * dt);
      const lean = (inp.dirX * ax.qx + inp.dirZ * ax.qz) * RIDE.LEAN;
      const along = pm + lean;
      st.vx = ax.sx * newLat + ax.qx * along; st.vz = ax.sz * newLat + ax.qz * along;
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
