/**
 * ZONA SUL (rota isolada /zona-sul) — o Rio pós-colapso tomado pela mata: relevo real (escala 1:3), mar e Lagoa com
 * NADO, mata atlântica instanciada, herói do jogo andando com colisão no chão. NÃO mexe no mapa do jogo.
 * Controles: WASD/setas anda · Shift corre · Espaço pula · arrastar gira a câmera · roda = zoom.
 * Celular: dedo à esquerda anda (joystick), à direita gira a câmera.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { HERO_HEIGHT } from '@/components/world/world-kit';
import { ZS_LANDMARKS, ZS_SPAWN } from './zona-sul-meta';
import { loadZsTerrain, type ZsTerrain, zsHeightAt, ZS_WATER_Y, zsWaterPushAt, zsWaterYAt } from './zs-terrain-data';
import { SurfBreak } from './surf/surf-break';

/** Quanto da correnteza da onda leva o herói nadando (o carro tem a sua em CAR.WAVE_PUSH). */
const ZS_SWIM_WAVE_CARRY = 1.15; // a espuma leva junto (o bolso da onda segura quem está na frente dela) — "leva mais"
/** Jacaré: nadando a favor, você "pega" a onda e vai um pouco à frente dela (até ~1,25×). */
const ZS_BODYSURF_EXTRA = 0.3;
const HERO_PUSH = { x: 0, z: 0 };
/** Motor de surf (fase B, só na Zona Sul). Chave: ?surf=0 na URL desliga (o mar volta exatamente ao de antes). */
const SURF_ON = typeof window === 'undefined' || !/[?&]surf=0/.test(window.location.search);
import { ZsTerrainMesh } from './zs-terrain-mesh';
import { ZsWater } from './zs-water';
import { ZsVegetation } from './zs-vegetation';
import { zsDiveStep, zsStep, ZS_RUN, ZS_SWIM, ZS_SWIM_FAST, ZS_SWIM_GLIDE, ZS_SWIM_SINK, ZS_SWIM_SINK_MOVE, ZS_WALK, zsWaterState } from './zs-move';
import { CAR, CAR_SEATS, carStep, newCar, SEAT_FOOT_K, type ZsCar } from './zs-car';
import { type CarDims, ZsCarView } from './zs-car-view';

/** Clips extras do herói só na Zona Sul (Mixamo do Pedro): dirigir, abrir a porta, nadar, boiar. */
const HERO_CLIPS = { drive: '/zona-sul/anim/drive.glb', open_door: '/zona-sul/anim/open_door.glb', swim: '/zona-sul/anim/swim.glb', tread: '/zona-sul/anim/tread.glb' };
/** a pé → abrindo a porta (ENTER_MS) → dirigindo. E entra/sai. */
const drive = { mode: 'foot' as 'foot' | 'entering' | 'driving', enterAt: 0 };
const ENTER_MS = 1100;

const SUN = new THREE.Vector3(-0.55, 0.62, -0.45).normalize();
const FOG = '#bcd0dc';

type Hud = { x: number; z: number; y: number; state: string; near: string; overview: boolean; car?: string | undefined };
/** Entrada + câmera. `overview` (tecla K): câmera de CIMA solta do boneco — WASD move a vista, Shift acelera,
 *  arrastar gira, roda sobe/desce; K de novo volta pro herói (o herói fica parado onde estava). */
const input = { keys: new Set<string>(), stick: { x: 0, z: 0 }, yaw: 0.6, pitch: 0.32, dist: 9, overview: false, ov: { x: 0, z: 0, alt: 420, pitch: 1.05 }, eTap: false, lookAt: 0,
  /** câmera no carro (tecla V): 3ª pessoa atrás ou DE DENTRO (cabeça do motorista); olhar em volta de dentro */
  carCam: 'chase' as 'chase' | 'cockpit', cockYaw: 0, cockPitch: 0 };
/** Altura do OLHO do motorista sentado acima do pé (m) e campo de visão de dentro (mais aberto). */
const EYE_SEATED = 1.12, COCKPIT_FOV = 74, CHASE_FOV = 55;

function Hero({ t, heroRef, focusRef, onHud, carRef, dimsRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3>; focusRef: React.MutableRefObject<THREE.Vector3>; onHud: (h: Hud) => void; carRef: React.MutableRefObject<ZsCar | null>; dimsRef: React.MutableRefObject<CarDims | null> }) {
  const group = useRef<THREE.Group>(null);
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
      if (drive.mode === 'foot' && car && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST) {
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
    if ((water0.swimming || water0.wading) && drive.mode === 'foot') {
      // NA ÁGUA (nadando ou no raso) com embalo: a velocidade vai suave até a desejada (e desliza ao soltar)
      const sv = swimVel.current, target = !wantMove ? 0 : water0.swimming ? (shift ? ZS_SWIM_FAST : ZS_SWIM) : v;
      const kk = 1 - Math.exp(-ZS_SWIM_GLIDE * dt);
      sv.x += (wx * target - sv.x) * kk; sv.y += (wz * target - sv.y) * kk;
      v = sv.length(); moving = v > 0.35;
      // a onda leva quem está nadando (espuma forte, face média) — somado à braçada. JACARÉ (surf de peito, Pedro 28/10):
      // nadando A FAVOR da onda (rumo à praia) você "pega" ela e vai um pouco mais rápido que ela (corpo desliza pouco)
      let pw = 0;
      if (water0.swimming && zsWaterPushAt(p.x, p.z, HERO_PUSH)) {
        const pm = Math.hypot(HERO_PUSH.x, HERO_PUSH.z), along = wantMove ? Math.max(0, (wx * HERO_PUSH.x + wz * HERO_PUSH.z) / pm) : 0;
        pw = ZS_SWIM_WAVE_CARRY + ZS_BODYSURF_EXTRA * along;
        bodysurf.current = along > 0.5 && pm > 1.2;
      } else bodysurf.current = false;
      st = zsStep(t, p.x, p.z, (sv.x + HERO_PUSH.x * pw) * dt, (sv.y + HERO_PUSH.z * pw) * dt);
      if (moving) facing.current = Math.atan2(sv.x, sv.y);
    } else {
      st = wantMove ? zsStep(t, p.x, p.z, wx * v * dt, wz * v * dt) : { x: p.x, z: p.z, ground: zsHeightAt(t, p.x, p.z), ...water0 };
      swimVel.current.set(wantMove ? wx * v : 0, wantMove ? wz * v : 0); // entra na água com o embalo de quem vinha
      if (wantMove) facing.current = Math.atan2(wx, wz);
    }
    p.x = st.x; p.z = st.z;
    // vertical: pulo (só fora d'água funda) + chão / nado
    if (k.has('Space') && grounded.current && !st.swimming && drive.mode === 'foot') { vy.current = 6.2; grounded.current = false; }
    dive.current = st.swimming && drive.mode === 'foot' ? zsDiveStep(dive.current, k.has('KeyC'), ZS_WATER_Y - st.ground, dt) : 0;
    // altura de quem nada vai junto: dentro do tubo o nível é o chão da cavidade (dá pra entrar), por fora é o topo
    const floor = st.swimming ? zsWaterYAt(p.x, p.z, p.y + 0.3) - (moving || dive.current > 0.3 ? ZS_SWIM_SINK_MOVE : ZS_SWIM_SINK) - dive.current : st.ground; // boia NA onda
    if (!grounded.current) { vy.current -= 15 * dt; p.y += vy.current * dt; if (p.y <= floor) { p.y = floor; grounded.current = true; vy.current = 0; } }
    else p.y += (floor - p.y) * Math.min(1, dt * (st.swimming ? 3 : 30)); // na água sobe/desce macio (braçada ↔ boiar)
    if (drive.mode === 'foot') action.current = st.swimming ? (moving || dive.current > 0.3 ? 'swim' : 'tread') : !grounded.current ? 'jump' : moving ? (run ? 'run' : 'walk') : 'idle';
    speed.current = moving ? v : 0;
    if (group.current) {
      group.current.position.set(p.x, p.y, p.z);
      let d = facing.current - group.current.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      group.current.rotation.y += d * Math.min(1, dt * 12);
    }
    // câmera em órbita, sem entrar no chão
    const tx = p.x, ty = p.y + 1.6, tz = p.z;
    const cp = Math.cos(input.pitch);
    const cx = tx + Math.sin(input.yaw) * cp * input.dist, cz = tz + Math.cos(input.yaw) * cp * input.dist;
    let cyy = ty + Math.sin(input.pitch) * input.dist;
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
      onHud({ x: p.x, z: p.z, y: p.y, state: drive.mode === 'entering' ? 'entrando no carro' : st.swimming && dive.current > 0.3 ? 'mergulhando · ' + dive.current.toFixed(1) + ' m (solte o C pra subir)' : st.swimming && bodysurf.current ? 'pegando jacaré!' : st.swimming ? (moving ? 'nadando · C mergulha' : 'boiando · C mergulha') : st.wading ? 'na água rasa' : !grounded.current ? 'pulando' : run && moving ? 'correndo' : moving ? 'andando' : 'parado', near: best, overview: false, car: nearCar ? 'E = entrar no carro voador' : undefined });
    }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={2.1} color="#fff4e0" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-camera-far={300} shadow-bias={-0.0004} />
      <group ref={group}>
        <Suspense fallback={null}>
          <GlbHeroMixamo actionRef={action} speedRef={speed} autoHeight={HERO_HEIGHT * 1.04} customClips={HERO_CLIPS} />
        </Suspense>
      </group>
    </>
  );
}

function Controls() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'KeyK' && !e.repeat) input.overview = !input.overview;
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

export default function ZonaSulWorld() {
  const [t, setT] = useState<ZsTerrain | null>(null);
  const [err, setErr] = useState('');
  const [hud, setHud] = useState<Hud | null>(null);
  const heroRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Onde o detalhe (chão, árvores, água) é montado: o herói, ou o centro da vista de cima (tecla K). */
  const focusRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Carro voador: nasce do lado da partida, no Arpoador (Pedro: "joga lá perto do Arpoador onde eu testo"). */
  const carRef = useRef<ZsCar | null>(null);
  const dimsRef = useRef<CarDims | null>(null);
  // só em desenvolvimento: os testes de tela leem posição/estado (o jogo publicado não expõe nada)
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zs?: unknown }).__zs = { hero: heroRef.current, car: carRef, terrain: () => t };
  useEffect(() => {
    let alive = true;
    loadZsTerrain().then((tt) => { if (!alive) return; heroRef.current.y = zsHeightAt(tt, ZS_SPAWN.x, ZS_SPAWN.z); carRef.current = newCar(ZS_SPAWN.x + 3, ZS_SPAWN.z - 2, 0, tt); setT(tt); }).catch((e) => alive && setErr(String(e)));
    return () => { alive = false; };
  }, []);
  const sunPos = useMemo(() => SUN.clone().multiplyScalar(1000).toArray() as [number, number, number], []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: FOG, touchAction: 'none' }}>
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
          <Hero t={t} heroRef={heroRef} focusRef={focusRef} onHud={setHud} carRef={carRef} dimsRef={dimsRef} />
          <Suspense fallback={null}><ZsCarView carRef={carRef} dimsRef={dimsRef} /></Suspense>
          <Controls />
        </Canvas>
      )}
      <div style={{ position: 'absolute', top: 10, left: 12, color: '#10202c', font: '600 13px system-ui', background: 'rgba(255,255,255,.72)', padding: '6px 10px', borderRadius: 8, pointerEvents: 'none', maxWidth: 'calc(100% - 24px)' }}>
        TRIBOS · Zona Sul (teste isolado — não é o mapa do jogo)
        {hud && <div style={{ font: '400 12px system-ui', marginTop: 3 }}>{hud.state}{hud.car && hud.state.startsWith('dirigindo') ? '' : ` · altura ${hud.y.toFixed(0)} m`}{hud.near ? ` · perto de ${hud.near}` : ''}</div>}
        {hud?.car && <div style={{ font: '700 12px system-ui', marginTop: 3, color: '#0b5c7a' }}>{hud.car}</div>}
        <div style={{ font: '400 11px system-ui', marginTop: 2, opacity: 0.8 }}>
          {hud?.overview ? 'VISTA DE CIMA · WASD move · Shift rápido · arraste gira · roda sobe/desce · K volta pro herói'
            : 'WASD anda · Shift corre · Espaço pula · arraste gira · roda = zoom · K = vista de cima'}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 6, right: 8, color: '#10202c', font: '400 10px system-ui', background: 'rgba(255,255,255,.6)', padding: '2px 6px', borderRadius: 5, pointerEvents: 'none' }}>
        Relevo: AWS Terrain Tiles (SRTM) · Mapa: © OpenStreetMap contributors (ODbL)
      </div>
      {!t && !err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: '600 18px system-ui', color: '#10202c' }}>Carregando a Zona Sul…</div>}
      {err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: '600 16px system-ui', color: '#8a1c1c' }}>Erro: {err}</div>}
    </div>
  );
}
