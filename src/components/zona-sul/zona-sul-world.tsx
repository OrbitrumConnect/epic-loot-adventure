/**
 * ZONA SUL — o Rio pós-colapso tomado pela mata: relevo real, mar e Lagoa com NADO, onda com SURF, carro voador.
 * Desde 29/10 é um MAPA DO JOGO (chave "Zona Sul" na casa do jogo, `routes/index.tsx`): mesmo personagem, mesmo save,
 * a hotbar/I/HUD são os do jogo (a prancha é item oficial — `surfboard`). Este arquivo só desenha o mundo e o herói.
 * Controles: WASD/setas anda · Shift corre · Espaço pula · arrastar gira a câmera · roda = zoom.
 * Celular: dedo à esquerda anda (joystick), à direita gira a câmera; botões de carro/mergulho/correr na tela.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { memo, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { HERO_HEIGHT } from '@/components/world/world-kit';
import { ZS_LANDMARKS, ZS_SPAWN } from './zona-sul-meta';
import { loadZsTerrain, type ZsTerrain, zsHeightAt, ZS_WATER_Y, zsWaterChurnAt, zsWaterInTubeAt, zsWaterPushAt, zsWaterSpitAt, zsWaterYAt } from './zs-terrain-data';
import { SurfBreak, surfZone } from './surf/surf-break';
import { SURF } from './surf/surf-wave';
import { canPop, newRide, RIDE, rideStep, type RideState, type RideWater } from './surf/surf-ride';
import { useGameStore } from '@/game/state/game-store';
import { selectedItemId } from '@/components/world/held-weapon';
import { SURFBOARD_ID } from '@/game/systems/zonaSulKit';
import { isUnlocked, lockedMessage } from '@/game/systems/unlockSystem';
import { useTouchScreen } from '@/hooks/use-mobile';
import { type BoardPose, newBoardPose, ZsBoardView } from './zs-board-view';

/** Quanto da correnteza da onda leva o herói nadando (o carro tem a sua em CAR.WAVE_PUSH). */
const ZS_SWIM_WAVE_CARRY = 1.15; // a espuma leva junto (o bolso da onda segura quem está na frente dela) — "leva mais"
/** Jacaré: nadando a favor, você "pega" a onda e vai um pouco à frente dela (até ~1,25×). */
const ZS_BODYSURF_EXTRA = 0.3;
const HERO_PUSH = { x: 0, z: 0 }, HERO_SPIT = { x: 0, z: 0 };
/** Motor de surf (fase B, só na Zona Sul). Chave: ?surf=0 na URL desliga (o mar volta exatamente ao de antes). */
const SURF_ON = typeof window === 'undefined' || !/[?&]surf=0/.test(window.location.search);
import { ZsTerrainMesh } from './zs-terrain-mesh';
import { ZsWater } from './zs-water';
import { ZsVegetation } from './zs-vegetation';
import { zsDiveStep, zsStep, ZS_RUN, ZS_SWIM, ZS_SWIM_FAST, ZS_SWIM_GLIDE, ZS_SWIM_SINK, ZS_SWIM_SINK_MOVE, ZS_WALK, zsWaterState } from './zs-move';
import { CAR, CAR_SEATS, carStep, newCar, SEAT_FOOT_K, type ZsCar } from './zs-car';
import { type CarDims, ZsCarView } from './zs-car-view';

/** Clips extras do herói só na Zona Sul (Mixamo do Pedro): dirigir, abrir a porta, nadar, boiar. */
const HERO_CLIPS = { drive: '/zona-sul/anim/drive.glb', open_door: '/zona-sul/anim/open_door.glb', swim: '/zona-sul/anim/swim.glb', tread: '/zona-sul/anim/tread.glb',
  // SURF (28/10): remar = o nado deitado na prancha; levantar e base = Zombie Stand Up (Pedro: "só levanta direito depois
  // de 30%; a pose final é boa, meio surfista")
  paddle: '/zona-sul/anim/swim.glb', popup: '/zona-sul/anim/zombie_stand_up.glb', surf: '/zona-sul/anim/zombie_stand_up.glb' };
/** Cortes: levantar = 30%→100% a 2× (≈ RIDE.POPUP_S); base = só o finalzinho (a pose final, segurada). */
// remar/nadar: o RITMO dos braços segue a velocidade real (Pedro 29/10: "remar parece câmera lenta" — a remada tocava
// fixa a 0,8×): remando 3,8 m/s = 1×, com Shift 6,1 = 1,6×; nadando 2,4 = 1×, rápido 4,2 = 1,75×
const HERO_CUT = { open_door: { fixHips: true }, popup: { from: 0.3, speed: 2 }, surf: { from: 0.97 }, paddle: { sync: 1 / 3.8, syncMin: 0.6, syncMax: 1.7 }, swim: { sync: 1 / 2.4, syncMin: 0.6, syncMax: 1.8 } };
/** Pé na prancha: altura do DECK acima da água (m). Giro do corpo em relação ao bico (base de surfista, de lado). */
const BOARD_DECK = 0.12, STANCE = -Math.PI / 2;
/** A pose final do Zombie Stand Up abaixa o quadril: em pé o corpo sobe isto (m) pra os pés ficarem NO deck (Pedro: "corpo
 *  abaixo d'água como se estivesse sentado"); no levantar sobe aos poucos junto com a animação. Medido em foto. */
const SURF_LIFT = 0.8;
const NO_AXES = { qx: 0, qz: -1, sx: 1, sz: 0 };
/** Câmera dentro do tubo: distância (m) e inclinação — no ombro, quase 1ª pessoa. */
const TUBE_CAM_DIST = 1.7, TUBE_CAM_PITCH = 0.06;
/** Quanto o corpo acompanha a inclinação da prancha no carving. */
const LEAN_BODY = 0.8;
/** a pé → abrindo a porta (ENTER_MS) → dirigindo. E entra/sai. */
const drive = { mode: 'foot' as 'foot' | 'entering' | 'driving', enterAt: 0 };
const ENTER_MS = 1100;

const SUN = new THREE.Vector3(-0.55, 0.62, -0.45).normalize();
const FOG = '#bcd0dc';

type Hud = { x: number; z: number; y: number; state: string; near: string; overview: boolean; car?: string | undefined; canPop?: boolean };
/** Entrada + câmera. `overview` (tecla K): câmera de CIMA solta do boneco — WASD move a vista, Shift acelera,
 *  arrastar gira, roda sobe/desce; K de novo volta pro herói (o herói fica parado onde estava). */
const input = { keys: new Set<string>(), stick: { x: 0, z: 0 }, yaw: 0.6, pitch: 0.32, dist: 9, overview: false, ov: { x: 0, z: 0, alt: 420, pitch: 1.05 }, eTap: false, lookAt: 0,
  /** câmera no carro (tecla V): 3ª pessoa atrás ou DE DENTRO (cabeça do motorista); olhar em volta de dentro */
  carCam: 'chase' as 'chase' | 'cockpit', cockYaw: 0, cockPitch: 0,
  /** botão LEVANTAR na tela (celular) */
  popTap: false,
  /** tecla P: mostrador de FPS / desenhos / triângulos */
  perf: false };
/** Altura do OLHO do motorista sentado acima do pé (m) e campo de visão de dentro (mais aberto). */
const EYE_SEATED = 1.12, COCKPIT_FOV = 74, CHASE_FOV = 55;

function Hero({ t, heroRef, focusRef, onHud, carRef, dimsRef, boardRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3>; focusRef: React.MutableRefObject<THREE.Vector3>; onHud: (h: Hud) => void; carRef: React.MutableRefObject<ZsCar | null>; dimsRef: React.MutableRefObject<CarDims | null>; boardRef: React.MutableRefObject<BoardPose> }) {
  const group = useRef<THREE.Group>(null);
  /** surf na prancha (null = sem prancha na água) · vaca de quem nada sem prancha (s restantes) · giro da vaca */
  const ride = useRef<RideState | null>(null);
  const tumble = useRef(0), spin = useRef(0);
  const boardYaw = useRef(0), popOk = useRef(false), lean = useRef(0), tubeCam = useRef(0), shiftWas = useRef(false);
  const action = useRef<HeroAction>('idle');
  const speed = useRef(0);
  const vy = useRef(0);
  /** velocidade NA ÁGUA (embalo do nado) */
  const swimVel = useRef(new THREE.Vector2());
  const bodysurf = useRef(false);
  /** profundidade do mergulho (m abaixo da posição de nadar); C desce, soltou sobe */
  const dive = useRef(0);
  const grounded = useRef(true);
  const facing = useRef(0);
  const hudAcc = useRef(0);
  const sun = useRef<THREE.DirectionalLight>(null);
  const { camera, scene } = useThree();

  // só em desenvolvimento: testes de tela leem/forçam o surf (o jogo publicado não expõe nada)
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __zsRide?: unknown }).__zsRide = { ride, input, action }; }, []);
  const fog = useMemo(() => new THREE.Fog(FOG, 200, 2200), []); // névoa LEVE (custo ~zero: é uma conta no shader)
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  const wasOverview = useRef(false);
  const camTarget = useRef(new THREE.Vector3());

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const p = heroRef.current, k = input.keys;
    if (input.overview) {
      if (!wasOverview.current) { input.ov.x = p.x; input.ov.z = p.z; wasOverview.current = true; }
      const o = input.ov, sy0 = Math.sin(input.yaw), cy0 = Math.cos(input.yaw);
      const mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const mz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      const sp = o.alt * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.4 : 0.8) * dt;
      o.x += (mx * cy0 + mz * sy0) * sp; o.z += (-mx * sy0 + mz * cy0) * sp;
      o.x = Math.max(t.x0, Math.min(t.x0 + t.w * t.cell, o.x)); o.z = Math.max(t.z0, Math.min(t.z0 + t.h * t.cell, o.z));
      const gy = Math.max(zsHeightAt(t, o.x, o.z), ZS_WATER_Y);
      const back = o.alt / Math.tan(o.pitch);
      camera.position.set(o.x + sy0 * back, gy + o.alt, o.z + cy0 * back);
      camera.lookAt(o.x, gy, o.z);
      focusRef.current.set(o.x, gy, o.z);
      fog.near = 900; fog.far = 6000;
      action.current = 'idle'; speed.current = 0;
      hudAcc.current += dt;
      if (hudAcc.current > 0.25) { hudAcc.current = 0; onHud({ x: o.x, z: o.z, y: o.alt, state: `vista de cima (${Math.round(o.alt)} m)`, near: '', overview: true }); }
      return;
    }
    if (wasOverview.current) { wasOverview.current = false; fog.near = 200; fog.far = 2200; }
    const car = carRef.current, now = performance.now();
    // E: entra (perto do carro) / sai (parado e rente ao chão)
    if (input.eTap) {
      input.eTap = false;
      const lvl = useGameStore.getState().player.level;
      if (drive.mode === 'foot' && car && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST && !isUnlocked('flying_car', lvl)) {
        useGameStore.getState().setMessage(lockedMessage('O carro voador', 'flying_car'));
      } else if (drive.mode === 'foot' && car && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST) {
        drive.mode = 'entering'; drive.enterAt = now; facing.current = Math.atan2(car.x - p.x, car.z - p.z);
      } else if (drive.mode === 'driving' && car && Math.abs(car.speed) < CAR.EXIT_MAX_SPEED && car.altitude < CAR.EXIT_MAX_ALT) {
        drive.mode = 'foot';
        if (group.current) group.current.visible = true;
        const pc = camera as THREE.PerspectiveCamera; if (pc.fov !== CHASE_FOV) { pc.fov = CHASE_FOV; pc.updateProjectionMatrix(); }
        const side = (dimsRef.current?.width ?? 2.2) / 2 + 1.1; // desce pelo lado do motorista (direita: o volante do modelo é desse lado)
        p.x = car.x - Math.cos(car.yaw) * side; p.z = car.z + Math.sin(car.yaw) * side; p.y = zsHeightAt(t, p.x, p.z);
        facing.current = car.yaw; grounded.current = true; vy.current = 0;
      }
    }
    if (drive.mode === 'entering' && now - drive.enterAt >= ENTER_MS) { drive.mode = 'driving'; input.dist = Math.max(input.dist, 12); if (car) camTarget.current.set(car.x, car.y + 1.8, car.z); }
    // carro ESTACIONADO também tem física (sem comando): boia na onda e é levado por ela (Pedro: "se o hover car estiver
    // parado a onda empurra ele") — antes ele só se mexia com alguém dirigindo
    if (drive.mode !== 'driving' && car) carStep(t, car, { throttle: 0, steer: 0 }, dt, now);
    if (drive.mode === 'driving' && car) {
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.stick.z;
      const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x;
      carStep(t, car, { throttle: Math.max(-1, Math.min(1, throttle)), steer: Math.max(-1, Math.min(1, steer)), up: k.has('Space'), down: k.has('KeyC'), turbo: k.has('ShiftLeft') || k.has('ShiftRight') }, dt, now);
      p.set(car.x, car.y, car.z);
      focusRef.current.copy(p);
      // herói SENTADO no banco do motorista, olhando pra frente
      const dims = dimsRef.current, seat = CAR_SEATS[0]!;
      const wv = dims?.width ?? 2.2, lv = dims?.length ?? CAR.LENGTH;
      const sx = seat.x * wv, sz = seat.z * lv;
      const seatX = car.x + Math.cos(car.yaw) * sx + Math.sin(car.yaw) * sz, seatZ = car.z - Math.sin(car.yaw) * sx + Math.cos(car.yaw) * sz;
      const feetY = car.y + (dims?.height ?? 1.4) * SEAT_FOOT_K;
      const inside = input.carCam === 'cockpit';
      if (group.current) {
        group.current.position.set(seatX, feetY, seatZ);
        group.current.rotation.y = car.yaw;
        group.current.visible = !inside; // de dentro o herói some (a cabeça dele não entra na frente)
      }
      action.current = 'drive'; speed.current = 0;
      const persp = camera as THREE.PerspectiveCamera;
      const wantFov = inside ? COCKPIT_FOV : CHASE_FOV;
      if (persp.fov !== wantFov) { persp.fov = wantFov; persp.updateProjectionMatrix(); }
      if (inside) {
        // DE DENTRO: olho do motorista; olha pra frente do carro (+ arrastar olha em volta; volta ao centro sozinho)
        if (now - input.lookAt > 2000) { input.cockYaw *= Math.exp(-2.5 * dt); input.cockPitch *= Math.exp(-2.5 * dt); }
        const ly = car.yaw + input.cockYaw, lp = input.cockPitch - Math.max(-0.12, Math.min(0.12, car.vy * 0.02));
        const ex = seatX + Math.sin(car.yaw) * 0.2, ey = feetY + EYE_SEATED, ez = seatZ + Math.cos(car.yaw) * 0.2;
        camera.position.set(ex, ey, ez);
        camera.lookAt(ex + Math.sin(ly) * Math.cos(lp) * 10, ey + Math.sin(lp) * 10, ez + Math.cos(ly) * Math.cos(lp) * 10);
        camTarget.current.set(car.x, car.y + 1.8, car.z); // voltar pra fora sem "voo" da câmera
      } else {
      // câmera atrás do carro, com ATRASO suave (fluido): segue o alvo amortecido, gira junto com a direção e se
      // afasta com a velocidade; arrastar ainda ajusta
      if (now - input.lookAt > 1500) { let d = car.yaw + Math.PI - input.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; input.yaw += d * Math.min(1, dt * 3); }
      const ct = camTarget.current, follow = 1 - Math.exp(-8 * dt);
      ct.x += (car.x - ct.x) * follow; ct.y += (car.y + 1.8 - ct.y) * follow; ct.z += (car.z - ct.z) * follow;
      const dist = input.dist + Math.min(8, Math.abs(car.speed) * 0.18);
      const tx = ct.x, ty = ct.y, tz = ct.z, cp = Math.cos(input.pitch);
      const cx = tx + Math.sin(input.yaw) * cp * dist, cz = tz + Math.cos(input.yaw) * cp * dist;
      let cyy = ty + Math.sin(input.pitch) * dist;
      const gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.6; if (cyy < gcam) cyy = gcam;
      camera.position.set(cx, cyy, cz); camera.lookAt(tx, ty, tz);
      }
      if (sun.current) { sun.current.position.set(p.x + SUN.x * 120, p.y + SUN.y * 120, p.z + SUN.z * 120); sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld(); }
      hudAcc.current += dt;
      if (hudAcc.current > 0.25) {
        hudAcc.current = 0;
        const cd = Math.max(0, Math.ceil((car.cooldownUntil - now) / 1000)), en = Math.ceil(car.energy);
        const voo = cd > 0 ? 'recarga do voo ' + cd + ' s' : 'Espaço sobe · C desce · energia ' + en + ' s · Shift turbo';
        onHud({ x: car.x, z: car.z, y: car.y, state: 'dirigindo · ' + Math.round(Math.abs(car.speed) * 3.6) + ' km/h · altura ' + car.altitude.toFixed(1) + ' m' + (car.overWater ? ' · sobre a água' : ''), near: '', overview: false, car: voo + ' · V câmera ' + (inside ? 'de fora' : 'de dentro') + ' · E sai (parado e baixo)' });
      }
      return;
    }
    if (drive.mode === 'entering') { action.current = 'open_door'; speed.current = 0; }
    focusRef.current.copy(p);
    // direção relativa à câmera
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x;
    let iz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) + input.stick.z;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    const wx = ix * cy + iz * sy, wz = -ix * sy + iz * cy; // gira o input pelo yaw da câmera
    const water0 = zsWaterState(zsHeightAt(t, p.x, p.z));
    const shift = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.stick.x, input.stick.z) > 0.92;
    const run = shift && !water0.swimming;
    const wantMove = Math.hypot(wx, wz) > 0.05 && drive.mode === 'foot';
    let v = (run ? ZS_RUN : ZS_WALK) * (water0.wading ? 0.75 : 1);
    let moving = wantMove;
    let st;
    const onBoard = selectedItemId(useGameStore.getState()) === SURFBOARD_ID && water0.swimming && drive.mode === 'foot';
    if (!onBoard) ride.current = null;
    if (onBoard) {
      // PRANCHA (fase C): remar → ESPAÇO levanta quando a onda pegar → em pé corre a parede → vaca se fechar em cima
      const r = ride.current ?? (ride.current = newRide());
      const fr = surfZone.frame, ax = fr ? { qx: fr.qx, qz: fr.qz, sx: fr.sx, sz: fr.sz } : NO_AXES;
      const pushing = zsWaterPushAt(p.x, p.z, HERO_PUSH, p.y + 0.3);
      const w: RideWater = { pushX: pushing ? HERO_PUSH.x : 0, pushZ: pushing ? HERO_PUSH.z : 0, churn: zsWaterChurnAt(p.x, p.z) };
      if (fr) { const ddx = p.x - fr.px, ddz = p.z - fr.pz; w.side = ddx * fr.sx + ddz * fr.sz >= 0 ? 1 : -1; }
      if (r.mode === 'ride' && !r.air && zsWaterSpitAt(p.x, p.z, p.y + 0.3, HERO_SPIT)) { w.spitX = HERO_SPIT.x; w.spitZ = HERO_SPIT.z; }
      if (r.mode === 'ride' && !r.air) w.inTube = zsWaterInTubeAt(p.x, p.z, p.y + 0.3);
      if (r.mode === 'ride') {
        // em pé: a água EMBAIXO (altura e inclinação) — dá a velocidade na face (rampa) e o aéreo no lip
        const yr = (r.air ? r.y : p.y) + 0.3, e = 0.5;
        w.surfY = zsWaterYAt(p.x, p.z, yr);
        w.gradX = (zsWaterYAt(p.x + e, p.z, yr) - zsWaterYAt(p.x - e, p.z, yr)) / (2 * e);
        w.gradZ = (zsWaterYAt(p.x, p.z + e, yr) - zsWaterYAt(p.x, p.z - e, yr)) / (2 * e);
      }
      const pop = k.has('Space') || input.popTap; input.popTap = false;
      popOk.current = canPop(r, w, SURF.C);
      // em pé: comandos DA PRANCHA (A/D vira, W acelera, S freia) — não dependem da câmera (Pedro: "em cima da prancha os
      // comandos trocam"); remando: como nadar (relativo à câmera)
      const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x;
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.stick.z;
      const boost = shift && !shiftWas.current; // só o TOQUE (segurar não vira turbo)
      const d = rideStep(r, { dirX: wantMove ? wx : 0, dirZ: wantMove ? wz : 0, pop, fast: shift, steer, throttle, boost }, w, ax, SURF.C, dt);
      st = zsStep(t, p.x, p.z, d.dx, d.dz);
      const sp = Math.hypot(r.vx, r.vz);
      v = sp; moving = sp > 0.3;
      if (r.mode === 'ride') boardYaw.current = r.yaw; // em pé: o rumo É o da prancha (carving)
      else if (sp > 0.3 && r.mode !== 'wipe') {
        let dy = Math.atan2(r.vx, r.vz) - boardYaw.current;
        while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        boardYaw.current += dy * Math.min(1, dt * 6);
      }
      facing.current = r.mode === 'ride' || r.mode === 'popup' ? boardYaw.current + STANCE : boardYaw.current;
      spin.current = r.spin;
      swimVel.current.set(r.mode === 'paddle' ? r.vx : 0, r.mode === 'paddle' ? r.vz : 0);
      bodysurf.current = false; tumble.current = 0;
    } else if ((water0.swimming || water0.wading) && drive.mode === 'foot') {
      // NA ÁGUA (nadando ou no raso) com embalo: a velocidade vai suave até a desejada (e desliza ao soltar)
      const sv = swimVel.current, target = !wantMove ? 0 : water0.swimming ? (shift ? ZS_SWIM_FAST : ZS_SWIM) : v;
      const kk = 1 - Math.exp(-ZS_SWIM_GLIDE * dt);
      sv.x += (wx * target - sv.x) * kk; sv.y += (wz * target - sv.y) * kk;
      v = sv.length(); moving = v > 0.35;
      // a onda leva quem está nadando (espuma forte, face média) — somado à braçada. JACARÉ (surf de peito, Pedro 28/10):
      // nadando A FAVOR da onda (rumo à praia) você "pega" ela e vai um pouco mais rápido que ela (corpo desliza pouco)
      let pw = 0;
      if (water0.swimming && zsWaterPushAt(p.x, p.z, HERO_PUSH, p.y + 0.3)) {
        const pm = Math.hypot(HERO_PUSH.x, HERO_PUSH.z), along = wantMove ? Math.max(0, (wx * HERO_PUSH.x + wz * HERO_PUSH.z) / pm) : 0;
        pw = ZS_SWIM_WAVE_CARRY + ZS_BODYSURF_EXTRA * along;
        bodysurf.current = along > 0.5 && pm > 1.2;
      } else bodysurf.current = false;
      // VACA (sem prancha): a onda fechou em cima → gira junto com a espuma e é levado, sem controle (Pedro 28/10)
      if (water0.swimming && tumble.current <= 0 && zsWaterChurnAt(p.x, p.z) >= RIDE.WIPE_CHURN) tumble.current = RIDE.WIPE_S;
      if (tumble.current > 0) {
        tumble.current = Math.max(0, tumble.current - dt); spin.current = tumble.current > 0 ? spin.current + RIDE.WIPE_SPIN * dt : 0;
        const c = pw > 0 ? RIDE.WIPE_CARRY : 0;
        st = zsStep(t, p.x, p.z, HERO_PUSH.x * c * dt, HERO_PUSH.z * c * dt);
        sv.set(0, 0); moving = false; bodysurf.current = false;
      } else st = zsStep(t, p.x, p.z, (sv.x + HERO_PUSH.x * pw) * dt, (sv.y + HERO_PUSH.z * pw) * dt);
      if (moving) facing.current = Math.atan2(sv.x, sv.y);
    } else {
      st = wantMove ? zsStep(t, p.x, p.z, wx * v * dt, wz * v * dt) : { x: p.x, z: p.z, ground: zsHeightAt(t, p.x, p.z), ...water0 };
      swimVel.current.set(wantMove ? wx * v : 0, wantMove ? wz * v : 0); // entra na água com o embalo de quem vinha
      if (wantMove) facing.current = Math.atan2(wx, wz);
    }
    shiftWas.current = shift;
    p.x = st.x; p.z = st.z;
    // vertical: pulo (só fora d'água funda) + chão / nado
    if (k.has('Space') && grounded.current && !st.swimming && drive.mode === 'foot') { vy.current = 6.2; grounded.current = false; }
    dive.current = st.swimming && drive.mode === 'foot' ? zsDiveStep(dive.current, k.has('KeyC'), ZS_WATER_Y - st.ground, dt) : 0;
    // altura de quem nada vai junto: dentro do tubo o nível é o chão da cavidade (dá pra entrar), por fora é o topo
    const rm = ride.current?.mode, rolling = rm === 'wipe' || tumble.current > 0;
    if (rm) dive.current = 0;
    const waterY = st.swimming ? zsWaterYAt(p.x, p.z, p.y + 0.3) : 0;
    const floor = !st.swimming ? st.ground
      : rm === 'popup' || rm === 'ride' ? waterY + BOARD_DECK                 // em pé no deck
      : rm === 'paddle' ? waterY + BOARD_DECK + 0.07                         // deitado EM CIMA do deck (acima da água)
      : rolling ? waterY - 0.6                                               // vaca: embaixo da espuma
      : waterY - (moving || dive.current > 0.3 ? ZS_SWIM_SINK_MOVE : ZS_SWIM_SINK) - dive.current; // boia NA onda
    if (!grounded.current) { vy.current -= 15 * dt; p.y += vy.current * dt; if (p.y <= floor) { p.y = floor; grounded.current = true; vy.current = 0; } }
    else if (rm === 'ride' && ride.current?.air) p.y = ride.current.y + BOARD_DECK; // AÉREO: a altura é a do voo
    else p.y += (floor - p.y) * Math.min(1, dt * (rm === 'ride' || rm === 'popup' ? 12 : st.swimming ? 3 : 30)); // em pé gruda na face; nadando sobe/desce macio
    if (drive.mode === 'foot') action.current = rm === 'paddle' ? 'paddle' : rm === 'popup' ? 'popup' : rm === 'ride' ? 'surf' : rolling ? 'swim'
      : st.swimming ? (moving || dive.current > 0.3 ? 'swim' : 'tread') : !grounded.current ? 'jump' : moving ? (run ? 'run' : 'walk') : 'idle';
    // a prancha: deitado (embaixo do peito), em pé (embaixo dos pés), vaca (rodando solta perto)
    // inclinação do CARVING (suave): proporcional à taxa de curva da prancha
    const wantLean = rm === 'ride' && ride.current && !ride.current.air ? Math.max(-0.5, Math.min(0.5, -ride.current.carve * 0.16)) : 0;
    lean.current += (wantLean - lean.current) * Math.min(1, dt * 8);
    const bp = boardRef.current;
    bp.visible = !!rm;
    if (rm) {
      const fx = Math.sin(boardYaw.current), fz = Math.cos(boardYaw.current), off = rm === 'paddle' ? 0.35 : 0;
      bp.x = p.x + fx * off; bp.z = p.z + fz * off;
      bp.y = rm === 'ride' || rm === 'popup' ? p.y : rm === 'paddle' ? waterY + BOARD_DECK : waterY + 0.05;
      bp.yaw = boardYaw.current;
      bp.roll = rm === 'wipe' ? spin.current * 0.7 : rm === 'ride' ? lean.current : 0; // carving: a prancha deita na curva
    }
    speed.current = moving ? v : 0;
    if (group.current) {
      // em pé na prancha: sobe o corpo (pose do Zombie abaixa o quadril); levantando: sobe junto com a animação
      const lift = rm === 'ride' ? SURF_LIFT : rm === 'popup' ? SURF_LIFT * Math.min(1, (ride.current?.t ?? 0) / RIDE.POPUP_S) : 0;
      group.current.position.set(p.x, p.y + lift, p.z);
      let d = facing.current - group.current.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      group.current.rotation.y += d * Math.min(1, dt * 12);
      group.current.rotation.order = 'YXZ';
      group.current.rotation.x = rolling ? spin.current : rm === 'ride' ? lean.current * LEAN_BODY : 0; // vaca gira; carving inclina o corpo
    }
    // EM PÉ NA PRANCHA: a câmera vai sozinha pro OMBRO, atrás da prancha, na direção em que você está indo (Pedro: "quando
    // na onda, câmera no ombro já na direção") — arrastou pra olhar em volta, espera 1,5 s e volta
    if (ride.current?.mode === 'ride' && performance.now() - input.lookAt > 1500) {
      let dyaw = boardYaw.current + Math.PI - input.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      input.yaw += dyaw * Math.min(1, dt * 3);
      input.pitch += (0.3 - input.pitch) * Math.min(1, dt * 2);
    }
    // DENTRO DO TUBO em pé: a câmera chega no OMBRO, quase 1ª pessoa (Pedro: "se eu entrar no tubo a câmera fica quase
    // 1ª pessoa") — entra e sai suave; fora do tubo volta pro zoom de antes
    const inTube = rm === 'ride' && !ride.current?.air && zsWaterInTubeAt(p.x, p.z, p.y + 0.3);
    tubeCam.current += ((inTube ? 1 : 0) - tubeCam.current) * Math.min(1, dt * 2.5);
    const tk = tubeCam.current, camDist = input.dist + (TUBE_CAM_DIST - input.dist) * tk, camPitch = input.pitch + (TUBE_CAM_PITCH - input.pitch) * tk;
    // câmera em órbita, sem entrar no chão
    const tx = p.x, ty = p.y + 1.6 + (rm === 'ride' ? SURF_LIFT * 0.6 : 0), tz = p.z;
    const cp = Math.cos(camPitch);
    const cx = tx + Math.sin(input.yaw) * cp * camDist, cz = tz + Math.cos(input.yaw) * cp * camDist;
    let cyy = ty + Math.sin(camPitch) * camDist;
    const gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.6;
    if (cyy < gcam) cyy = gcam;
    camera.position.set(cx, cyy, cz);
    camera.lookAt(tx, ty, tz);
    // sol + sombra seguem o herói
    if (sun.current) { sun.current.position.set(p.x + SUN.x * 120, p.y + SUN.y * 120, p.z + SUN.z * 120); sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld(); }
    hudAcc.current += dt;
    if (hudAcc.current > 0.25) {
      hudAcc.current = 0;
      let best = '', bd = 700;
      for (const l of ZS_LANDMARKS) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd) { bd = d; best = `${l.name} (${Math.round(d)} m)`; } }
      const nearCar = car && drive.mode === 'foot' && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST;
      const surfTxt = rm === 'paddle' ? (popOk.current ? 'a onda te pegou — ESPAÇO levanta!' : 'remando na prancha · Shift rema forte · espere a onda')
        : rm === 'popup' ? 'levantando…' : rm === 'ride' && ride.current ? (ride.current.trickT > 0 ? ride.current.trick.toUpperCase() + ' · ' : '') + (ride.current.air ? 'NO AR! segure A ou D pra girar' : 'SURFANDO ' + Math.round(ride.current.speed * 3.6) + ' km/h · A/D vira (carving) · W acelera · S freia · Shift = boost · desça a face = ganha velocidade · suba rápido no lip = aéreo') + (ride.current.airs ? ' · aéreos: ' + ride.current.airs : '')
        : rolling ? 'tomou a vaca! girando com a espuma…' : '';
      onHud({ canPop: rm === 'paddle' && popOk.current, x: p.x, z: p.z, y: p.y, state: surfTxt ? surfTxt : drive.mode === 'entering' ? 'entrando no carro' : st.swimming && dive.current > 0.3 ? 'mergulhando · ' + dive.current.toFixed(1) + ' m (solte o C pra subir)' : st.swimming && bodysurf.current ? 'pegando jacaré!' : st.swimming ? (moving ? 'nadando · C mergulha' : 'boiando · C mergulha') : st.wading ? 'na água rasa' : !grounded.current ? 'pulando' : run && moving ? 'correndo' : moving ? 'andando' : 'parado', near: best, overview: false, car: nearCar ? 'E = entrar no carro voador' : undefined });
    }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={2.1} color="#fff4e0" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-camera-far={300} shadow-bias={-0.0004} />
      <group ref={group}>
        <Suspense fallback={null}>
          <GlbHeroMixamo actionRef={action} speedRef={speed} autoHeight={HERO_HEIGHT * 1.04} customClips={HERO_CLIPS} customClipCut={HERO_CUT} preview />
        </Suspense>
      </group>
    </>
  );
}

/** Tecla P: FPS (média de 0,5 s), chamadas de desenho e triângulos do quadro — escreve direto no texto (sem re-render). */
function ZsPerf({ elRef }: { elRef: React.RefObject<HTMLDivElement | null> }) {
  const acc = useRef({ t: 0, n: 0 });
  useFrame((state, dt) => {
    const el = elRef.current; if (!el) return;
    if (!input.perf) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    const a = acc.current; a.t += dt; a.n++;
    if (a.t < 0.5) return;
    const r = state.gl.info.render;
    el.style.display = 'block';
    el.textContent = `${Math.round(a.n / a.t)} FPS · ${r.calls} desenhos · ${Math.round(r.triangles / 1000)} mil triângulos`;
    a.t = 0; a.n = 0;
  });
  return null;
}

function Controls() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const kd = (e: KeyboardEvent) => {
      if (zsPause.on || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyK' && !e.repeat) input.overview = !input.overview;
      if (e.code === 'KeyP' && !e.repeat) input.perf = !input.perf;
      if (e.code === 'KeyE' && !e.repeat) input.eTap = true;
      if (e.code === 'KeyV' && !e.repeat && drive.mode === 'driving') { input.carCam = input.carCam === 'chase' ? 'cockpit' : 'chase'; input.cockYaw = 0; input.cockPitch = 0; }
      input.keys.add(e.code); if (e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => input.keys.delete(e.code);
    const blur = () => input.keys.clear();
    const look = new Map<number, { x: number; y: number }>(), stick = new Map<number, { x: number; y: number }>();
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && e.clientX < el.clientWidth * 0.45) stick.set(e.pointerId, { x: e.clientX, y: e.clientY });
      else look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e: PointerEvent) => {
      const l = look.get(e.pointerId);
      if (l) {
        input.lookAt = performance.now();
        if (drive.mode === 'driving' && input.carCam === 'cockpit') {
          input.cockYaw = Math.max(-2.3, Math.min(2.3, input.cockYaw - (e.clientX - l.x) * 0.005));
          input.cockPitch = Math.max(-0.7, Math.min(0.8, input.cockPitch - (e.clientY - l.y) * 0.004));
          l.x = e.clientX; l.y = e.clientY;
          return;
        }
        input.yaw -= (e.clientX - l.x) * 0.006;
        if (input.overview) input.ov.pitch = Math.max(0.35, Math.min(1.5, input.ov.pitch + (e.clientY - l.y) * 0.004));
        else input.pitch = Math.max(-0.15, Math.min(1.35, input.pitch + (e.clientY - l.y) * 0.005));
        l.x = e.clientX; l.y = e.clientY;
      }
      const s = stick.get(e.pointerId);
      if (s) { input.stick.x = Math.max(-1, Math.min(1, (e.clientX - s.x) / 60)); input.stick.z = Math.max(-1, Math.min(1, (e.clientY - s.y) / 60)); }
    };
    const up = (e: PointerEvent) => { look.delete(e.pointerId); if (stick.delete(e.pointerId)) { input.stick.x = 0; input.stick.z = 0; } };
    const wheel = (e: WheelEvent) => {
      const f = e.deltaY > 0 ? 1.12 : 0.89;
      if (input.overview) input.ov.alt = Math.max(60, Math.min(2600, input.ov.alt * f));
      else input.dist = Math.max(3, Math.min(40, input.dist * f));
      e.preventDefault();
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);
  return null;
}

/** STATUS fora do React do mundo (29/10, Pedro: "tá lagando"): o herói escreve aqui 4×/s e SÓ o painel de status
 *  re-renderiza — antes o `setHud` re-renderizava a árvore 3D inteira (terreno, água, mata, onda) a cada 0,25 s, o mesmo
 *  erro que travou o mapa velho em 26/10. Igual ao anterior não avisa ninguém. */
let hudNow: Hud | null = null;
const hudSubs = new Set<() => void>();
function pushHud(h: Hud) {
  const o = hudNow;
  if (o && o.state === h.state && o.near === h.near && o.car === h.car && o.canPop === h.canPop && o.overview === h.overview) return;
  hudNow = h;
  for (const f of hudSubs) f();
}
function useZsHud(): Hud | null {
  return useSyncExternalStore((cb) => { hudSubs.add(cb); return () => { hudSubs.delete(cb); }; }, () => hudNow, () => null);
}

/** Status no canto + botão LEVANTAR (o único pedaço da tela que muda com o herói). */
function ZsHudView({ touch }: { touch: boolean }) {
  const hud = useZsHud();
  if (!hud) return null;
  return (
    <>
      <div className="zs-hud">
        <strong>{hud.state}</strong>
        {hud.near && !hud.overview && <small>perto de {hud.near}</small>}
        {hud.car && <em>{hud.car}</em>}
        <small className="zs-hud__keys">{hud.overview
          ? 'VISTA DE CIMA · WASD move · Shift rápido · roda sobe/desce · K volta'
          : touch ? 'dedo à esquerda anda · à direita gira a câmera' : 'WASD anda · Shift corre · Espaço pula · C mergulha · E carro · K vista de cima · P FPS'}</small>
      </div>
      {hud.canPop && (
        <button type="button" className="zs-btn zs-btn--pop" onPointerDown={() => { input.popTap = true; }}>LEVANTAR <small>(Espaço)</small></button>
      )}
    </>
  );
}

/** Painel do jogo aberto (inventário, mapa, base…): as teclas não mexem o herói (o mar segue vivo). */
const zsPause = { on: false };
/** Onde você parou na Zona Sul (neste aparelho) — o mapa velho sempre nasce no ponto de partida; aqui volta onde estava. */
const POS_KEY = 'tribos.zs.pos';
function readZsPos(t: ZsTerrain): { x: number; z: number } {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x?: unknown; z?: unknown } | null;
    const x = Number(v?.x), z = Number(v?.z);
    if (Number.isFinite(x) && Number.isFinite(z) && x > t.x0 && x < t.x0 + t.w * t.cell && z > t.z0 && z < t.z0 + t.h * t.cell) return { x, z };
  } catch { /* sem storage / lixo: nasce no ponto de partida */ }
  return { x: ZS_SPAWN.x, z: ZS_SPAWN.z };
}
function saveZsPos(p: THREE.Vector3) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 })); } catch { /* sem storage */ }
}

/** Botão de SEGURAR (celular): enquanto o dedo está nele, a tecla fica apertada. */
function HoldKey({ code, label, title }: { code: string; label: string; title: string }) {
  const up = () => input.keys.delete(code);
  return (
    <button type="button" className="zs-btn" title={title} aria-label={title}
      onPointerDown={(e) => { e.preventDefault(); input.keys.add(code); }} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
      {label}
    </button>
  );
}

function ZonaSulWorld({ paused = false }: { paused?: boolean }) {
  const [t, setT] = useState<ZsTerrain | null>(null);
  const [err, setErr] = useState('');
  const touch = useTouchScreen();
  const heroRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Onde o detalhe (chão, árvores, água) é montado: o herói, ou o centro da vista de cima (tecla K). */
  const focusRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Carro voador: nasce do seu lado (Pedro: "joga lá perto do Arpoador onde eu testo"). */
  const carRef = useRef<ZsCar | null>(null);
  const dimsRef = useRef<CarDims | null>(null);
  const boardRef = useRef<BoardPose>(newBoardPose());
  const perfRef = useRef<HTMLDivElement>(null);
  // só em desenvolvimento: os testes de tela leem posição/estado (o jogo publicado não expõe nada)
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zs?: unknown }).__zs = { hero: heroRef.current, car: carRef, terrain: () => t };
  useEffect(() => {
    zsPause.on = paused;
    if (paused) { input.keys.clear(); input.stick.x = 0; input.stick.z = 0; }
  }, [paused]);
  useEffect(() => {
    // entrou no mapa: a pé, câmera no herói; 1ª vez = ganha a prancha
    drive.mode = 'foot'; input.overview = false; input.keys.clear(); hudNow = null;
    useGameStore.getState().grantSurfboard();
    let alive = true;
    loadZsTerrain().then((tt) => {
      if (!alive) return;
      const at = readZsPos(tt);
      heroRef.current.set(at.x, zsHeightAt(tt, at.x, at.z), at.z); focusRef.current.copy(heroRef.current);
      carRef.current = newCar(at.x + 3, at.z - 2, 0, tt); setT(tt);
    }).catch((e) => alive && setErr(String(e)));
    const keep = window.setInterval(() => { if (carRef.current) saveZsPos(heroRef.current); }, 2000);
    return () => { alive = false; window.clearInterval(keep); if (carRef.current) saveZsPos(heroRef.current); zsPause.on = false; input.keys.clear(); };
  }, []);
  const sunPos = useMemo(() => SUN.clone().multiplyScalar(1000).toArray() as [number, number, number], []);
  return (
    <div className="zs-world" style={{ background: FOG }}>
      {t && (
        <Canvas shadows dpr={[1, 1.25]} camera={{ fov: 55, near: 0.3, far: 7000 }} gl={{ antialias: true }}>
          <color attach="background" args={[FOG]} />
          <Sky sunPosition={sunPos} turbidity={5} rayleigh={1.4} mieCoefficient={0.006} distance={4500} />
          <hemisphereLight args={['#eef4f8', '#6b7a4a', 1.5]} />
          <ambientLight intensity={0.35} />
          <ZsTerrainMesh t={t} heroRef={focusRef} />
          <ZsWater t={t} />
          {SURF_ON && <SurfBreak t={t} shoreX={ZS_SPAWN.x} shoreZ={ZS_SPAWN.z} />}
          <ZsVegetation t={t} heroRef={focusRef} />
          <Hero t={t} heroRef={heroRef} focusRef={focusRef} onHud={pushHud} carRef={carRef} dimsRef={dimsRef} boardRef={boardRef} />
          <Suspense fallback={null}><ZsCarView carRef={carRef} dimsRef={dimsRef} /></Suspense>
          <Suspense fallback={null}><ZsBoardView poseRef={boardRef} /></Suspense>
          <Controls />
          <ZsPerf elRef={perfRef} />
        </Canvas>
      )}
      {/* STATUS (canto direito, onde no mapa velho fica o minimapa) + LEVANTAR — componente próprio, o mundo não re-renderiza */}
      <ZsHudView touch={touch} />
      <div ref={perfRef} className="zs-perf" style={{ display: 'none' }} />
      {touch && t && !paused && (
        <div className="zs-touch">
          <button type="button" className="zs-btn" title="Entrar / sair do carro" aria-label="Entrar / sair do carro" onPointerDown={() => { input.eTap = true; }}>Carro</button>
          <HoldKey code="ShiftLeft" label="Correr" title="Correr / remar forte / turbo" />
          <HoldKey code="KeyC" label="Descer" title="Mergulhar / descer o carro" />
          <HoldKey code="Space" label="Pular" title="Pular / levantar na prancha / subir o carro" />
        </div>
      )}
      <div className="zs-credit">Relevo: AWS Terrain Tiles (SRTM) · Mapa: © OpenStreetMap contributors (ODbL)</div>
      {!t && !err && <div className="world-loading">Chegando na Zona Sul…</div>}
      {err && <div className="world-loading" style={{ color: '#ef4444' }}>Erro: {err}</div>}
    </div>
  );
}

/** memo: a casa do jogo re-renderiza (relógio 1×/s, vida, XP…) e o mundo 3D NÃO vai junto — só muda com `paused`. */
export default memo(ZonaSulWorld);
