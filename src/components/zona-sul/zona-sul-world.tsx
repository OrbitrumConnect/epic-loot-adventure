/**
 * ZONA SUL — o Rio pós-colapso tomado pela mata: relevo real, mar e Lagoa com NADO, onda com SURF, carro voador.
 * Desde 29/10 é um MAPA DO JOGO (chave "Zona Sul" na casa do jogo, `routes/index.tsx`): mesmo personagem, mesmo save,
 * a hotbar/I/HUD são os do jogo (a prancha é item oficial — `surfboard`). Este arquivo só desenha o mundo e o herói.
 * Controles: WASD/setas anda · Shift corre · Espaço pula · arrastar gira a câmera · roda = zoom.
 * Celular: dedo à esquerda anda (joystick), à direita gira a câmera; botões de carro/mergulho/correr na tela.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import type { Sky as SkyImpl } from 'three-stdlib';
import { memo, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { HERO_HEIGHT } from '@/components/world/world-kit';
import { ZS_LANDMARKS, ZS_SPAWN, ZS_SURF } from './zona-sul-meta';
import { loadZsTerrain, type ZsTerrain, zsHeightAt, zsSlopeDeg, zsSurfAt, ZS_WATER_Y, zsWaterChurnAt, zsWaterInTubeAt, zsWaterPushAt, zsWaterSpitAt, zsWaterYAt } from './zs-terrain-data';
import { SurfBreak } from './surf/surf-break';
import { SorrisoBreak } from './surf/sorriso-break';
import { nearestSurfZone, surfZoneAt } from './surf/surf-zones';
import { SURF } from './surf/surf-wave';
import { canPop, newRide, RIDE, rideStep, type RideState, type RideWater } from './surf/surf-ride';
import { useGameStore } from '@/game/state/game-store';
import { selectedItemId } from '@/components/world/held-weapon';
import { HANG_GLIDER_ID, HOVER_SKATE_ID, SURFBOARD_ID } from '@/game/systems/zonaSulKit';
import { canOpenGlider, GLIDE, glideStep, type GlideState, newGlide, newSkate, SKATE, skateStep, type SkateState } from './zs-glide';
import { ZsGearView } from './zs-gear-view';
import { isUnlocked, lockedMessage } from '@/game/systems/unlockSystem';
import { useTouchScreen } from '@/hooks/use-mobile';
// COMBATE (29/10, Pedro: "usar armas, tiro pro elite… ligar tudo 100%"): as MESMAS peças e regras do Vale
import { HeldItem } from '@/components/world/held-weapon';
import { palette, impactShake, type Palette } from '@/components/world/world-kit';
import { aimFire, aimSensitivityScale, aimZoomStep, gunKick, setAimCamera, setAiming, useAim } from '@/components/world/aim';
import { recentShotPoint } from '@/game/systems/shotFacing';
import { weaponRangeFor } from '@/game/data/weapons';
import { activeDodge, dodgeSpeed, startDodge, takeDodgeRequest } from '@/game/systems/dodgeSystem';
import { takeKnockback } from '@/game/systems/knockbackSystem';
import { isGrabbed } from '@/game/systems/grabSystem';
import { effectiveAttributes } from '@/game/systems/attributesSystem';
import { audioManager } from '@/game/audio/audio-manager';
import { heroFacing } from '@/components/world/free-aim';
import { takeVirtualLook, touchLayout, virtualMove } from '@/components/world/virtual-input';
import { LightPool } from '@/components/world/light-pool';
import { ZsWarmOverlay, ZsWarmUp } from './zs-warmup';
import { noteManualLook } from '@/components/world/pilot-aim';
import { HeroNameplate } from '@/components/world/hero-nameplate';
import { Camps, Enemies } from '@/components/world/world-entities';
import { CombatFeedback } from '@/components/world/combat-feedback';
import { Projectiles } from '@/components/world/projectiles';
import { HeroPowers } from '@/components/world/hero-powers';
import { BurstRuntime } from '@/components/world/burst-runtime';
import { AutoPilot } from '@/components/world/auto-pilot';
import { BackgroundSim } from '@/components/world/background-sim';
import { AssetBoundary } from '@/components/world/asset-boundary';
import { HarvestNodes } from '@/components/world/harvest-nodes';
import { SAFE_ZONE } from '@/game/data/camps';
import { resetWorldProfile, setWorldProfile, WORLD } from '@/game/data/world-profile';
import { createZsWildlife, ZS_FAUNA } from '@/game/systems/zsSpawnSystem';
import { createZsHarvestNodes } from '@/game/systems/zsHarvestSystem';
import { createCaveBoss, zsQuery, zsWorldProfile } from './zs-world-profile';
import { zsAttack, zsCave, zsCtx } from './zs-context';
import { CAVE_MOUTH_ZONE, caveCamFit, caveField, caveInside, caveMouthDist, caveMove, caveRoomName, setCaveTerrain } from './zs-cave';
import { ZsCave } from './zs-cave-view';
import { layers, resetLayers, sameLayerAsPlayer } from '@/game/systems/layerSystem';
import { shipGround, zsShip, ZsShip } from './zs-ship';
import { type AmbienceState, zsAmbience } from './zs-ambience';
import { ZsDayNight, ZsLamps, zsSun } from './zs-daynight';
import { nightFactor, setWorldEpoch, worldEpoch } from '@/game/systems/dayNightSystem';
import { type BoardPose, newBoardPose, ZsBoardView } from './zs-board-view';

/** Quanto da correnteza da onda leva o herói nadando (o carro tem a sua em CAR.WAVE_PUSH). */
const ZS_SWIM_WAVE_CARRY = 1.15; // a espuma leva junto (o bolso da onda segura quem está na frente dela) — "leva mais"
/** Jacaré: nadando a favor, você "pega" a onda e vai um pouco à frente dela (até ~1,25×). */
const ZS_BODYSURF_EXTRA = 0.3;
const HERO_PUSH = { x: 0, z: 0 }, HERO_SPIT = { x: 0, z: 0 };
/** Motor de surf (fase B, só na Zona Sul). Chave: ?surf=0 na URL desliga (o mar volta exatamente ao de antes). */
const SURF_ON = typeof window === 'undefined' || !/[?&]surf=0/.test(window.location.search);
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
  paddle: '/zona-sul/anim/swim.glb', popup: '/zona-sul/anim/zombie_stand_up.glb', surf: '/zona-sul/anim/zombie_stand_up.glb',
  // ASA-DELTA (30/10): "Flying" do Mixamo (do Pedro) — corpo deitado, braços à frente, pendurado sob a asa
  glide: '/zona-sul/anim/glide.glb' };
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

/** Golpe/tiro: quanto dura a animação de ataque (s) — o herói PARA pra atacar (igual ao Vale). Giro do especial R. */
const ATTACK_S = 0.45, SPIN_S = 0.45;
/** Mira (botão direito): câmera no ombro a 1,7 m (celular 3,2), ombro 0,75 m pro lado, campo de visão 52°/zoom (celular 58°). */
const AIM_DIST = 1.7, AIM_DIST_TOUCH = 3.2, AIM_SHOULDER = 0.75, AIM_FOV = 52, AIM_FOV_TOUCH = 58;
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

/** SOM do mundo em volta do herói (mar, arrebentação, carro, vento) — 10×/s. */
const AMB: AmbienceState = { sea: 0, surf: 0, car: false, carSpeed: 0, carAlt: 0, wind: 0 };
function ambienceAt(t: ZsTerrain, p: THREE.Vector3, car: ZsCar | null, rideSpeed: number): AmbienceState {
  let sea = 0;
  for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; if (zsSurfAt(t, p.x + Math.sin(ang) * 60, p.z + Math.cos(ang) * 60) === ZS_SURF.sea) sea++; }
  AMB.sea = zsCtx.inWater ? 1 : (sea / 8) * Math.max(0, 1 - Math.max(0, p.y) / 45);
  // arrebentação do pico MAIS PERTO (Arpoador ou, na ressaca, o Sorriso); calmaria = mais baixo; Sorriso sem ressaca = mudo
  const zn = nearestSurfZone(p.x, p.z), f = zn?.frame;
  AMB.surf = zn && f ? Math.max(0, 1 - Math.hypot(p.x - f.px, p.z - f.pz) / 320) * (zn.drawn ? 1 : zn.scheduler.enabled ? 0.4 : 0) : 0;
  AMB.car = drive.mode === 'driving' && !!car;
  AMB.carSpeed = car?.speed ?? 0; AMB.carAlt = car?.altitude ?? 0;
  AMB.wind = AMB.car ? Math.min(1, AMB.carAlt / 25 + Math.abs(AMB.carSpeed) / 60) : Math.min(1, (rideSpeed / 14) * 0.6);
  // caverna: lá dentro o mar e o vento somem (a rocha abafa)
  const muffle = 1 - zsCave.dark; AMB.sea *= muffle; AMB.surf *= muffle; AMB.wind *= muffle;
  return AMB;
}

/** Pra onde virar ao atacar: o ponto do último tiro; senão o bicho vivo mais perto no alcance da arma (igual ao Vale). */
function attackYaw(px: number, pz: number, fallback: number): number {
  const shot = recentShotPoint();
  if (shot && (shot.x - px) ** 2 + (shot.z - pz) ** 2 > 0.04) return Math.atan2(shot.x - px, shot.z - pz);
  const st = useGameStore.getState();
  const range = weaponRangeFor(selectedItemId(st), st.player.level) + 1;
  let best: { x: number; z: number } | null = null, bd = range * range;
  for (const c of st.creatures) {
    if (c.behavior === 'dead' || !sameLayerAsPlayer(c.id)) continue;
    const d = (c.position.x - px) ** 2 + (c.position.z - pz) ** 2;
    if (d < bd) { bd = d; best = c.position; }
  }
  return best ? Math.atan2(best.x - px, best.z - pz) : fallback;
}

function Hero({ t, heroRef, focusRef, onHud, carRef, dimsRef, boardRef, playerRef, movement, c, gearRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3>; focusRef: React.MutableRefObject<THREE.Vector3>; onHud: (h: Hud) => void; carRef: React.MutableRefObject<ZsCar | null>; dimsRef: React.MutableRefObject<CarDims | null>; boardRef: React.MutableRefObject<BoardPose>; playerRef: React.MutableRefObject<THREE.Group | null>; movement: React.MutableRefObject<THREE.Vector3>; c: Palette; gearRef: { glider: BoardPose; skate: BoardPose } }) {
  const group = useRef<THREE.Group>(null);
  /** combate: tique do último ataque visto, tempo de animação restante, especial, giro do R, coice, mira (0..1) */
  const atkTick = useRef(-1), atkT = useRef(0), specTick = useRef(-1), spinT = useRef(0);
  const recoil = useRef({ x: 0, y: 0 }), aimK = useRef(0), yawNow = useRef(0), posAcc = useRef(0), ambAcc = useRef(0);
  /** ASA-DELTA planando / SKATE VOADOR em cima (null = não) · Espaço do quadro anterior (pulinho só no toque) */
  const glide = useRef<GlideState | null>(null), skate = useRef<SkateState | null>(null), spaceWas = useRef(false);
  /** surf na prancha (null = sem prancha na água) · vaca de quem nada sem prancha (s restantes) · giro da vaca */
  const ride = useRef<RideState | null>(null);
  const tumble = useRef(0), spin = useRef(0);
  const boardYaw = useRef(0), popOk = useRef(false), lean = useRef(0), tubeCam = useRef(0), shiftWas = useRef(false);
  /** caverna: na poça (anda mais devagar) · quanto da distância da câmera cabe sem entrar na rocha (0..1) */
  const caveWade = useRef(false), camFit = useRef(1);
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
  const { camera, scene, gl } = useThree();
  useEffect(() => { playerRef.current = group.current; return () => { playerRef.current = null; }; }, [playerRef]);
  useEffect(() => { setAimCamera(camera); return () => { setAimCamera(null); setAiming(false); }; }, [camera]);
  useEffect(() => { atkTick.current = useGameStore.getState().attackTick; specTick.current = useGameStore.getState().specialTick; }, []);

  // só em desenvolvimento: testes de tela leem/forçam o surf (o jogo publicado não expõe nada)
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __zsRide?: unknown }).__zsRide = { ride, input, action, scene, camera, gl, glide, skate, air: (vy0 = -3) => { grounded.current = false; vy.current = vy0; } }; }, [scene, camera, gl]);
  const fog = useMemo(() => new THREE.Fog(FOG, 200, 2200), []); // névoa LEVE (custo ~zero: é uma conta no shader)
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  const wasOverview = useRef(false);
  const camTarget = useRef(new THREE.Vector3());

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const p = heroRef.current, k = input.keys;
    // CAVERNA (30/10): dentro dela (ou perto da boca) a caverna desenha; quanto mais fundo, mais escuro (lanterna acende)
    {
      const inside = drive.mode === 'foot' && caveInside(p.x, p.y, p.z), md = caveMouthDist(p.x, p.y, p.z);
      layers.inside = inside; layers.player = inside && md > CAVE_MOUTH_ZONE ? 1 : 0;
      zsCave.inCave = inside;
      const want = inside && !input.overview ? Math.min(1, Math.max(0, (md - 6) / 28)) : 0;
      zsCave.dark += (want * want * (3 - 2 * want) - zsCave.dark) * Math.min(1, dt * 2.5);
      if (zsCave.dark < 0.002) zsCave.dark = 0;
      zsCave.near = inside || md < 170 || input.overview;
      zsCave.deep = zsCave.dark > 0.97;
    }
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
    { const d2 = zsCave.dark * zsCave.dark; fog.near = 200 + (5 - 200) * d2; fog.far = 2200 + (75 - 2200) * d2; } // caverna: breu ao longe
    const car = carRef.current, now = performance.now();
    const gs = useGameStore.getState();
    // RENASCER na zona segura (praia do Arpoador) quando o tempo da morte acaba — igual ao Vale
    if (gs.player.dead && gs.player.respawnAt > 0 && Date.now() >= gs.player.respawnAt) {
      useGameStore.setState(s => ({ player: { ...s.player, hp: s.player.maxHp, dead: false, respawnAt: 0, position: { x: SAFE_ZONE.x, z: SAFE_ZONE.z } }, ui: { ...s.ui, message: 'Você reviveu na zona segura.', deathBy: null } }));
      drive.mode = 'foot'; ride.current = null; swimVel.current.set(0, 0); vy.current = 0; grounded.current = true; dive.current = 0;
      p.set(SAFE_ZONE.x, zsHeightAt(t, SAFE_ZONE.x, SAFE_ZONE.z), SAFE_ZONE.z); movement.current.set(p.x, 0, p.z);
      if (group.current) group.current.visible = true;
    }
    const dead = useGameStore.getState().player.dead;
    if (dead && drive.mode !== 'foot') { drive.mode = 'foot'; if (group.current) group.current.visible = true; } // morreu no carro: cai do lado
    // GOLPE/TIRO (attackTick do jogo): ~0,45 s de ataque, vira pro alvo; arma de fogo dá coice na câmera
    if (gs.attackTick !== atkTick.current) {
      atkTick.current = gs.attackTick;
      if (drive.mode === 'foot' && !ride.current && !dead) { atkT.current = ATTACK_S; if (!useAim.getState().active) facing.current = attackYaw(p.x, p.z, facing.current); }
      const kick = gunKick(selectedItemId(gs));
      if (kick > 0) { recoil.current.x += kick; recoil.current.y += (Math.random() - 0.5) * kick * 0.5; }
    }
    atkT.current = Math.max(0, atkT.current - dt);
    // ESPECIAIS (Q salto / R giro) — o dano sai no jogo; aqui é o corpo
    if (gs.specialTick !== specTick.current) {
      specTick.current = gs.specialTick;
      if (gs.specialKind === 'jump' && grounded.current && !dead && drive.mode === 'foot') { vy.current = 7; grounded.current = false; }
      else if (gs.specialKind === 'spin') spinT.current = SPIN_S;
    }
    spinT.current = Math.max(0, spinT.current - dt);
    const rk = Math.exp(-dt * 14); recoil.current.x *= rk; recoil.current.y *= rk;
    // CELULAR: o arrasto no botão de ATACAR (joystick de câmera do jogo) gira a câmera
    const vl = takeVirtualLook();
    if (vl.dx || vl.dy) { const sens = 0.005 * aimSensitivityScale(); input.yaw -= vl.dx * sens; input.pitch = Math.max(-0.5, Math.min(1.35, input.pitch + vl.dy * sens)); input.lookAt = now; noteManualLook(); }
    // posição no JOGO (inimigos, tiro, piloto, coleta) — ~7×/s, como no Vale
    posAcc.current += dt;
    if (posAcc.current > 0.15) { posAcc.current = 0; const cur = gs.player.position; if (cur.x !== p.x || cur.z !== p.z) useGameStore.setState(s => ({ player: { ...s.player, position: { x: p.x, z: p.z } } })); }
    zsCtx.driving = drive.mode === 'driving';
    ambAcc.current += dt;
    if (ambAcc.current > 0.1) { ambAcc.current = 0; zsAmbience.update(ambienceAt(t, p, car, ride.current?.mode === 'ride' ? ride.current.speed : 0)); }
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
      } else if (drive.mode === 'foot' && !dead) useGameStore.getState().collectNearest(); // longe do carro: E = pegar/colher (igual ao Vale)
    }
    if (drive.mode === 'entering' && now - drive.enterAt >= ENTER_MS) { drive.mode = 'driving'; input.dist = Math.max(input.dist, 12); if (car) camTarget.current.set(car.x, car.y + 1.8, car.z); }
    // carro ESTACIONADO também tem física (sem comando): boia na onda e é levado por ela (Pedro: "se o hover car estiver
    // parado a onda empurra ele") — antes ele só se mexia com alguém dirigindo
    if (drive.mode !== 'driving' && car) carStep(t, car, { throttle: 0, steer: 0 }, dt, now);
    if (drive.mode === 'driving' && car) {
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.stick.z - virtualMove.z;
      const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x + virtualMove.x;
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
      if (sun.current) { const sd = zsSun.dir; sun.current.position.set(p.x + sd.x * 120, p.y + sd.y * 120, p.z + sd.z * 120); sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld(); sun.current.intensity = zsSun.intensity * (1 - zsCave.dark); sun.current.color.copy(zsSun.color); } // sol/luar do relógio do jogo
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
    const caveNow = zsCave.inCave;
    // ===== ASA-DELTA e SKATE VOADOR (30/10) — modos próprios, como o carro: movem o herói/câmera e encerram o quadro =====
    {
      const held = drive.mode === 'foot' && !dead ? selectedItemId(gs) : null, lvl = gs.player.level;
      const surfaceAt = (x: number, z: number) => Math.max(zsHeightAt(t, x, z), zsWaterYAt(x, z));
      // ASA-DELTA: na mão + caindo de um lugar ALTO → abre sozinha
      if (!glide.current && held === HANG_GLIDER_ID && isUnlocked(held, lvl) && !grounded.current && !zsCtx.inWater && !caveNow
        && canOpenGlider(vy.current, p.y - surfaceAt(p.x, p.z))) {
        glide.current = newGlide(facing.current, p.y, Math.max(GLIDE.CRUISE, Math.hypot(swimVel.current.x, swimVel.current.y)));
      }
      if (glide.current && held !== HANG_GLIDER_ID) glide.current = null; // trocou de item no ar: cai (sem asa)
      // SKATE: na mão (liberado) = em cima dele
      if (held === HOVER_SKATE_ID && isUnlocked(held, lvl) && !glide.current && !caveNow) { if (!skate.current) skate.current = newSkate(facing.current, Math.max(p.y, surfaceAt(p.x, p.z) + SKATE.HOVER)); }
      else skate.current = null;
      const gl = glide.current, sk = skate.current;
      gearRef.glider.visible = !!gl; gearRef.skate.visible = !!sk;
      if (gl || sk) {
        const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x + virtualMove.x;
        const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.stick.z - virtualMove.z;
        const turbo = k.has('ShiftLeft') || k.has('ShiftRight');
        const space = k.has('Space');
        const bx = (x: number) => Math.max(t.x0, Math.min(t.x0 + (t.w - 1) * t.cell, x)), bz = (z: number) => Math.max(t.z0, Math.min(t.z0 + (t.h - 1) * t.cell, z));
        let status = '', lift = 0, roll = 0, pitchBody = 0, snapYaw = false;
        if (gl) {
          const r = glideStep(gl, { steer, pitch: fwd }, surfaceAt(p.x, p.z), dt);
          p.x = bx(p.x + r.dx); p.z = bz(p.z + r.dz); p.y = gl.y;
          const under = surfaceAt(p.x, p.z);
          if (r.landed || p.y <= under + GLIDE.LAND_AGL) { // pousou (ou bateu no morro): fecha a asa
            glide.current = null; p.y = Math.max(p.y, under); vy.current = 0; grounded.current = true;
            swimVel.current.set(Math.sin(gl.yaw) * Math.min(gl.speed, ZS_RUN), Math.cos(gl.yaw) * Math.min(gl.speed, ZS_RUN));
          }
          facing.current = gl.yaw; action.current = 'glide'; speed.current = gl.speed; roll = gl.bank; pitchBody = gl.pitch;
          // herói DENTRO do triângulo (Pedro 30/10: "na foto o personagem está abaixo") — o trapézio ~1 m abaixo dos pés
          // do modelo (o corpo deitado fica entre a quilha e a barra); o bico inclina no rasante e na subida
          // a asa fica PRESA num ponto do corpo (0,95 m abaixo da origem do herói) que gira JUNTO no rasante — os dois
          // inclinam como uma peça só (antes cada um girava no seu ponto e se separavam de lado)
          const gp = gearRef.glider, hang = -0.95, ly = hang * Math.cos(gl.pitch), lz = hang * Math.sin(gl.pitch);
          gp.x = p.x + Math.sin(gl.yaw) * lz; gp.y = p.y + ly; gp.z = p.z + Math.cos(gl.yaw) * lz; gp.yaw = gl.yaw; gp.roll = -gl.bank; gp.pitch = gl.pitch;
          status = gl.stalled ? 'ESTOL! solte o S ou aperte W pra ganhar velocidade'
            : 'asa-delta · ' + Math.round(gl.speed * 3.6) + ' km/h · altura ' + Math.round(p.y - under) + ' m · A/D vira · W rasante · S sobe/freia';
        } else if (sk) {
          const r = skateStep(sk, { throttle: fwd, steer, turbo, hop: space && !spaceWas.current }, p.x, p.z, dt, surfaceAt, (x, z) => zsSlopeDeg(t, x, z));
          p.x = bx(r.x); p.z = bz(r.z); p.y = sk.y;
          if (!sk.air) sk.spin *= Math.exp(-dt * 10); // pousou fora de volta inteira: assenta suave
          facing.current = sk.yaw + sk.spin + STANCE; action.current = 'surf'; speed.current = 0; lift = SURF_LIFT;
          snapYaw = sk.air || Math.abs(sk.spin) > 0.01; // no giro o corpo acompanha na hora (sem atraso)
          const sp = gearRef.skate; sp.x = p.x; sp.y = p.y; sp.z = p.z; sp.yaw = sk.yaw + sk.spin; sp.pitch = 0;
          // kickflip: o skate dá uma volta no eixo do comprimento; no chão inclina na curva
          sp.roll = sk.flip > 0 ? sk.flip * Math.PI * 2 : Math.max(-0.35, Math.min(0.35, -steer * Math.min(1, Math.abs(sk.speed) / SKATE.MAX) * 0.3));
          status = (sk.trickT > 0 ? sk.trick.toUpperCase() + ' · ' : '') + (sk.air ? (sk.jumps < 2 ? 'NO AR · Espaço de novo = pulo duplo + kickflip · A/D gira 360' : 'NO AR · A/D gira 360')
            : 'skate voador · ' + Math.round(Math.abs(sk.speed) * 3.6) + ' km/h · W acelera · S freia · A/D curva · Shift turbo · Espaço pula (2× = kickflip)')
            + (zsHeightAt(t, p.x, p.z) < ZS_WATER_Y ? ' · sobre a água' : '');
        }
        spaceWas.current = space;
        grounded.current = !glide.current ? true : false; zsCtx.inWater = false; ride.current = null; dive.current = 0;
        if (group.current) {
          group.current.position.set(p.x, p.y + lift, p.z);
          if (snapYaw) yawNow.current = facing.current;
          else { let d = facing.current - yawNow.current; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; yawNow.current += d * Math.min(1, dt * 10); }
          group.current.rotation.order = 'YXZ'; group.current.rotation.y = yawNow.current; group.current.rotation.x = pitchBody; group.current.rotation.z = roll * 0.6;
          heroFacing.yaw = yawNow.current;
        }
        // câmera de PERSEGUIÇÃO atrás do rumo (arrastar olha em volta; 1,5 s depois volta) — igual ao carro
        const heading = gl ? gl.yaw : sk!.yaw;
        if (now - input.lookAt > 1500) { let dy = heading + Math.PI - input.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; input.yaw += dy * Math.min(1, dt * 3); }
        const ct = camTarget.current, follow = 1 - Math.exp(-8 * dt);
        ct.x += (p.x - ct.x) * follow; ct.y += (p.y + 1.6 - ct.y) * follow; ct.z += (p.z - ct.z) * follow;
        const dist = (gl ? Math.max(input.dist, 11) : input.dist) + Math.min(6, (gl ? gl.speed : Math.abs(sk!.speed)) * 0.15);
        const cpp = Math.cos(input.pitch), cx2 = ct.x + Math.sin(input.yaw) * cpp * dist, cz2 = ct.z + Math.cos(input.yaw) * cpp * dist;
        let cy2 = ct.y + Math.sin(input.pitch) * dist; const gc = Math.max(zsHeightAt(t, cx2, cz2), ZS_WATER_Y) + 0.6; if (cy2 < gc) cy2 = gc;
        const persp = camera as THREE.PerspectiveCamera; if (Math.abs(persp.fov - CHASE_FOV) > 0.05) { persp.fov = CHASE_FOV; persp.updateProjectionMatrix(); }
        camera.position.set(cx2, cy2, cz2); camera.lookAt(ct.x, ct.y, ct.z);
        if (sun.current) { const sd = zsSun.dir; sun.current.position.set(p.x + sd.x * 120, p.y + sd.y * 120, p.z + sd.z * 120); sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld(); sun.current.intensity = zsSun.intensity * (1 - zsCave.dark); sun.current.color.copy(zsSun.color); }
        boardRef.current.visible = false;
        audioManager.setFootsteps(false);
        hudAcc.current += dt;
        if (hudAcc.current > 0.25) { hudAcc.current = 0; onHud({ x: p.x, z: p.z, y: p.y, state: status, near: '', overview: false }); }
        return;
      }
      spaceWas.current = k.has('Space');
    }
    // direção relativa à câmera
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x + virtualMove.x;
    let iz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) + input.stick.z + virtualMove.z;
    if (dead) { ix = 0; iz = 0; }
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    const wx = ix * cy + iz * sy, wz = -ix * sy + iz * cy; // gira o input pelo yaw da câmera
    // NAVIO: em pé no convés não é "nadar", mesmo com o mar embaixo (zs-ship)
    const deckNow = drive.mode === 'foot' ? shipGround(zsShip.c, p.x, p.z, p.y) : null;
    const water0 = caveNow || (deckNow && !('wall' in deckNow)) ? { swimming: false, wading: false } : zsWaterState(zsHeightAt(t, p.x, p.z));
    const shift = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.stick.x, input.stick.z) > 0.92 || Math.hypot(virtualMove.x, virtualMove.z) > 0.92;
    const moveBonus = 1 + effectiveAttributes(gs.player).moveSpeed / 100; // atributo Velocidade (igual ao Vale)
    let autoRun = false, dodging = false;
    const run = shift && !water0.swimming;
    const wantMove = Math.hypot(wx, wz) > 0.05 && drive.mode === 'foot';
    let v = (run ? ZS_RUN : ZS_WALK) * (water0.wading ? 0.75 : 1) * moveBonus;
    let moving = wantMove;
    let st;
    const onBoard = selectedItemId(useGameStore.getState()) === SURFBOARD_ID && water0.swimming && drive.mode === 'foot';
    if (!onBoard) ride.current = null;
    if (onBoard) {
      // PRANCHA (fase C): remar → ESPAÇO levanta quando a onda pegar → em pé corre a parede → vaca se fechar em cima
      const r = ride.current ?? (ride.current = newRide());
      // a onda da ZONA onde o herói está (Arpoador ou Sorriso); fora de todas, a do pico mais perto
      const zn = surfZoneAt(p.x, p.z)?.zone ?? nearestSurfZone(p.x, p.z), fr = zn?.frame ?? null, waveC = zn?.pf.C ?? SURF.C;
      const ax = fr ? { qx: fr.qx, qz: fr.qz, sx: fr.sx, sz: fr.sz } : NO_AXES;
      const pushing = zsWaterPushAt(p.x, p.z, HERO_PUSH, p.y + 0.3);
      const w: RideWater = { pushX: pushing ? HERO_PUSH.x : 0, pushZ: pushing ? HERO_PUSH.z : 0, churn: zsWaterChurnAt(p.x, p.z), foamRide: !!zn?.pf.FOAM_RIDE };
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
      popOk.current = canPop(r, w, waveC);
      // em pé: comandos DA PRANCHA (A/D vira, W acelera, S freia) — não dependem da câmera (Pedro: "em cima da prancha os
      // comandos trocam"); remando: como nadar (relativo à câmera)
      const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x;
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.stick.z;
      const boost = shift && !shiftWas.current; // só o TOQUE (segurar não vira turbo)
      const d = rideStep(r, { dirX: wantMove ? wx : 0, dirZ: wantMove ? wz : 0, pop, fast: shift, steer, throttle, boost }, w, ax, waveC, dt);
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
      // EM TERRA (o mesmo do Vale): piloto automático/joystick, ataque PARA, esquiva rola, empurrão, agarrão do jacaré
      let mx = wantMove ? wx : 0, mz = wantMove ? wz : 0, mv = v;
      if (wantMove) movement.current.set(p.x, 0, p.z);
      else if (!dead && drive.mode === 'foot') {
        const ax = movement.current.x - p.x, az = movement.current.z - p.z, al = Math.hypot(ax, az);
        if (al > 0.15) { mx = ax / al; mz = az / al; mv = ZS_RUN * moveBonus; autoRun = true; } // o piloto corre
      }
      if (atkT.current > 0 || isGrabbed() || dead || drive.mode !== 'foot') { mx = 0; mz = 0; }
      const dreq = takeDodgeRequest();
      if (dreq && !isGrabbed() && !dead && drive.mode === 'foot') {
        const d = dreq.dir ?? (mx || mz ? { x: mx, z: mz } : { x: Math.sin(facing.current), z: Math.cos(facing.current) });
        if (startDodge(d.x, d.z)) atkT.current = 0;
      }
      const dg = activeDodge(); dodging = !!dg;
      const wadeK = caveNow && caveWade.current ? 0.7 : 1; // poça da caverna: água no joelho
      let dx = mx * mv * dt * wadeK, dz = mz * mv * dt * wadeK;
      if (dg) { const sp = dodgeSpeed(dg.t); dx = dg.dirX * sp * dt; dz = dg.dirZ * sp * dt; }
      const shove = takeKnockback('player', dt); if (shove) { dx += shove.x; dz += shove.z; }
      // CAVERNA: dentro (ou entrando pela boca) o chão e as paredes são os dela; fora, o mapa como sempre
      const cm = drive.mode === 'foot' && (caveNow || dx || dz) ? caveMove(t, p.x, p.z, p.y, dx, dz) : null;
      caveWade.current = !!cm?.wading;
      st = cm ? { x: cm.x, z: cm.z, ground: cm.ground, swimming: false, wading: cm.wading }
        : dx || dz ? zsStep(t, p.x, p.z, dx, dz) : { x: p.x, z: p.z, ground: zsHeightAt(t, p.x, p.z), ...water0 };
      moving = Math.hypot(dx, dz) > 0.05 * dt; v = Math.hypot(dx, dz) / dt;
      swimVel.current.set(dx / dt, dz / dt); // entra na água com o embalo de quem vinha
      if (dg) facing.current = Math.atan2(dg.dirX, dg.dirZ);
      else if (moving && (mx || mz)) facing.current = Math.atan2(mx, mz);
    }
    zsCtx.inWater = st.swimming;
    shiftWas.current = shift;
    // NAVIO: o convés é chão; o casco é PAREDE pra quem vem de baixo (água/areia); a prancha é rampa
    if (drive.mode === 'foot') {
      let sg = shipGround(zsShip.c, st.x, st.z, p.y);
      if (sg && 'wall' in sg) { st = { ...st, x: p.x, z: p.z }; sg = shipGround(zsShip.c, p.x, p.z, p.y); }
      if (sg && !('wall' in sg)) st = { ...st, ground: sg.y, swimming: false, wading: false };
    }
    p.x = st.x; p.z = st.z;
    // caverna: chão bem abaixo do pé (o buraco da boca, a beirada) = cai de verdade; o teto segura o pulo
    if (caveNow || caveInside(p.x, p.y, p.z)) {
      if (grounded.current && st.ground < p.y - 0.8) { grounded.current = false; vy.current = 0; }
      if (!grounded.current && vy.current > 0 && caveField(p.x, p.y + 1.85, p.z) > -0.05) vy.current = 0;
    }
    // vertical: pulo (só fora d'água funda) + chão / nado
    if (k.has('Space') && grounded.current && !st.swimming && drive.mode === 'foot' && !dead) { vy.current = 6.2; grounded.current = false; }
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
    if (drive.mode === 'foot') action.current = dead ? 'death' : rm === 'paddle' ? 'paddle' : rm === 'popup' ? 'popup' : rm === 'ride' ? 'surf' : rolling ? 'swim'
      : st.swimming ? (moving || dive.current > 0.3 ? 'swim' : 'tread') : dodging ? 'dodge' : atkT.current > 0 ? 'attack'
      : !grounded.current ? 'jump' : moving ? (run || autoRun ? 'run' : 'walk') : 'idle';
    audioManager.setFootsteps(drive.mode === 'foot' && !dead && !st.swimming && grounded.current && moving && !dodging, run || autoRun);
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
      // MIRANDO: o herói olha pra onde a câmera aponta (mesmo andando de lado) — igual ao Vale
      if (useAim.getState().active && !rm && !dead && !dodging) facing.current = input.yaw + Math.PI;
      let d = facing.current - yawNow.current;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      yawNow.current += d * Math.min(1, dt * 12);
      group.current.rotation.y = yawNow.current + (spinT.current > 0 ? (1 - spinT.current / SPIN_S) * Math.PI * 2 : 0);
      heroFacing.yaw = yawNow.current; // tiro livre no celular: pra onde o herói olha
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
    // MIRA (botão direito / botão Mirar): câmera no OMBRO, perto, campo de visão fechando com o zoom — igual ao Vale
    const aim = useAim.getState(), aiming = aim.active && !rm && !dead;
    aimK.current += ((aiming ? 1 : 0) - aimK.current) * Math.min(1, dt * 10);
    const ak = aimK.current, touchAim = touchLayout.on;
    const tk = tubeCam.current;
    let camDist = input.dist + (TUBE_CAM_DIST - input.dist) * tk;
    camDist += ((touchAim ? AIM_DIST_TOUCH : AIM_DIST) - camDist) * ak;
    const camPitch = input.pitch + (TUBE_CAM_PITCH - input.pitch) * tk - recoil.current.x; // coice levanta a mira
    const yawC = input.yaw + recoil.current.y;
    const persp = camera as THREE.PerspectiveCamera;
    const wantFov = CHASE_FOV + ((touchAim ? AIM_FOV_TOUCH : AIM_FOV) / Math.max(1, aim.zoom) - CHASE_FOV) * ak;
    if (Math.abs(persp.fov - wantFov) > 0.05) { persp.fov = wantFov; persp.updateProjectionMatrix(); }
    // câmera em órbita, sem entrar no chão; mirando, o apoio vai pro ombro (celular: o OUTRO ombro, longe dos botões)
    const sh = AIM_SHOULDER * ak * (touchAim ? -1 : 1);
    const tx = p.x + Math.cos(yawC) * sh, ty = p.y + 1.6 - 0.05 * ak + (rm === 'ride' ? SURF_LIFT * 0.6 : 0), tz = p.z - Math.sin(yawC) * sh;
    const cp = Math.cos(camPitch);
    const cx = tx + Math.sin(yawC) * cp * camDist, cz = tz + Math.cos(yawC) * cp * camDist;
    let cyy = ty + Math.sin(camPitch) * camDist;
    if (zsCave.inCave) {
      // CAVERNA: a câmera chega até onde cabe (encolhe na hora, volta devagar) — nunca dentro da rocha
      const fit = caveCamFit(t, tx, ty, tz, cx, cyy, cz);
      camFit.current = fit < camFit.current ? fit : Math.min(fit, camFit.current + dt * 1.2);
      const kf = Math.max(camFit.current, Math.min(1, 0.9 / Math.max(0.1, camDist)));
      camera.position.set(tx + (cx - tx) * kf, ty + (cyy - ty) * kf, tz + (cz - tz) * kf);
    } else {
      camFit.current = 1;
      const gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.6;
      if (cyy < gcam) cyy = gcam;
      camera.position.set(cx, cyy, cz);
    }
    camera.lookAt(tx, ty, tz);
    const shake = impactShake(); // soco de impacto quando um golpe acerta
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3; camera.position.z += (Math.random() - 0.5) * shake * 0.3; }
    // sol + sombra seguem o herói
    if (sun.current) { const sd = zsSun.dir; sun.current.position.set(p.x + sd.x * 120, p.y + sd.y * 120, p.z + sd.z * 120); sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld(); sun.current.intensity = zsSun.intensity * (1 - zsCave.dark); sun.current.color.copy(zsSun.color); } // sol/luar do relógio do jogo
    hudAcc.current += dt;
    if (hudAcc.current > 0.25) {
      hudAcc.current = 0;
      let best = '', bd = 700;
      for (const l of ZS_LANDMARKS) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd) { bd = d; best = `${l.name} (${Math.round(d)} m)`; } }
      if (zsCave.inCave) best = `${caveRoomName(p.x, p.z)} (caverna, ${Math.max(0, Math.round(zsHeightAt(t, p.x, p.z) - p.y))} m de rocha em cima)`;
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
        <HeroNameplate />
        <Suspense fallback={null}>
          <GlbHeroMixamo actionRef={action} speedRef={speed} autoHeight={HERO_HEIGHT * 1.04} customClips={HERO_CLIPS} customClipCut={HERO_CUT} preview rangedAttack weapon={<HeldItem c={c} />} />
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
      // botão PULAR do celular (controles do jogo) manda só o "apertou": vira um toque curto
      if (!e.isTrusted && e.code === 'Space') { input.keys.add('Space'); window.setTimeout(() => input.keys.delete('Space'), 160); return; }
      if (e.code === 'KeyK' && !e.repeat) input.overview = !input.overview;
      if (e.code === 'KeyP' && !e.repeat) input.perf = !input.perf;
      if (e.code === 'KeyE' && !e.repeat) input.eTap = true;
      // V a pé = alterna 3ª pessoa ↔ de cima (igual ao V do Vale, que cicla seguir/de-cima); V dirigindo = câmera do carro.
      if (e.code === 'KeyV' && !e.repeat) {
        if (drive.mode === 'driving') { input.carCam = input.carCam === 'chase' ? 'cockpit' : 'chase'; input.cockYaw = 0; input.cockPitch = 0; }
        else input.overview = !input.overview;
      }
      input.keys.add(e.code); if (e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => input.keys.delete(e.code);
    const blur = () => input.keys.clear();
    const look = new Map<number, { x: number; y: number }>(), stick = new Map<number, { x: number; y: number }>();
    /** clique ESQUERDO curto (sem arrastar) = atacar; arrastar = girar a câmera */
    let press: { x: number; y: number; at: number } | null = null;
    const locked = () => document.pointerLockElement === el;
    const canFight = () => !zsPause.on && drive.mode === 'foot' && !input.overview;
    const fire = () => { if (!canFight()) return; if (!(useAim.getState().active && aimFire())) zsAttack.fn?.(); };
    // o MUNDO inteiro (canvas + plaquinhas de vida/nome em HTML por cima): clicar num bicho com plaquinha na frente
    // também ataca (29/10: o clique caía na plaquinha e o golpe não saía). Botões/campos da tela ficam de fora.
    const host = (el.parentElement ?? el) as HTMLElement;
    const ui = (e: Event) => e.target instanceof Element && !!e.target.closest('button, input, textarea, select, a');
    // BOTÕES DO MOUSE pelos eventos de MOUSE (igual ao Vale): com o direito segurado (mirando), o clique do esquerdo
    // NÃO gera "pointerdown" (botões juntos viram só "pointermove" pela regra dos eventos de ponteiro) — o tiro mirando
    // não saía. "mousedown" avisa cada botão.
    const mdown = (e: MouseEvent) => {
      if (ui(e)) return;
      if (e.button === 2) { if (canFight()) { setAiming(true); el.requestPointerLock?.(); } return; } // MIRA: segura o direito
      if (e.button !== 0) return;
      if (locked() || useAim.getState().active) { fire(); return; } // mirando: clicou, atirou
      press = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 2) { setAiming(false); if (locked()) document.exitPointerLock(); }
      if (e.button === 0 && press && performance.now() - press.at < 350) fire(); // clique curto (sem arrastar) = ataque
      if (e.button === 0) press = null;
    };
    const down = (e: PointerEvent) => {
      if (ui(e)) return;
      host.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse' && e.button !== 0) return; // direito = mira (mdown); arrastar gira só com o esquerdo
      // celular: com os controles do JOGO na tela (joystick/atacar/poderes), o dedo no mundo só gira a câmera
      if (e.pointerType === 'touch' && !touchLayout.on && e.clientX < el.clientWidth * 0.45) stick.set(e.pointerId, { x: e.clientX, y: e.clientY });
      else look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e: PointerEvent) => {
      if (locked()) { // mira com o mouse preso: giro pelo movimento (sensibilidade cai com o zoom)
        const sens = 0.0025 * aimSensitivityScale();
        input.yaw -= e.movementX * sens; input.pitch = Math.max(-0.5, Math.min(1.35, input.pitch + e.movementY * sens));
        input.lookAt = performance.now(); noteManualLook();
        return;
      }
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press = null;
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
    const up = (e: PointerEvent) => {
      look.delete(e.pointerId); if (stick.delete(e.pointerId)) { input.stick.x = 0; input.stick.z = 0; }
    };
    const menu = (e: MouseEvent) => e.preventDefault(); // botão direito é a mira, não o menu do navegador
    const wheel = (e: WheelEvent) => {
      if (useAim.getState().active) { aimZoomStep(e.deltaY < 0 ? 1 : -1); e.preventDefault(); return; } // mirando: zoom da mira
      const f = e.deltaY > 0 ? 1.12 : 0.89;
      if (input.overview) input.ov.alt = Math.max(60, Math.min(2600, input.ov.alt * f));
      else input.dist = Math.max(3, Math.min(40, input.dist * f));
      e.preventDefault();
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
    host.addEventListener('mousedown', mdown); window.addEventListener('mouseup', mup);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('contextmenu', menu);
      setAiming(false); if (locked()) document.exitPointerLock();
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      host.removeEventListener('mousedown', mdown); window.removeEventListener('mouseup', mup);
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up);
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
          : touch ? 'joystick anda · arraste a tela gira a câmera' : 'WASD anda · clique ataca · botão direito mira · Espaço pula · E carro/pegar · C mergulha · K vista de cima · P FPS'}</small>
      </div>
      {hud.canPop && (
        <button type="button" className="zs-btn zs-btn--pop" onPointerDown={() => { input.popTap = true; }}>LEVANTAR <small>(Espaço)</small></button>
      )}
    </>
  );
}

/** A superfície (chão, mar, onda, mata, postes, navio): some no fundo da caverna (`zsCave.deep`). */
function ZsSurface({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { if (g.current) g.current.visible = !zsCave.deep; });
  return <group ref={g}>{children}</group>;
}

/** Painel do jogo aberto (inventário, mapa, base…): as teclas não mexem o herói (o mar segue vivo). */
const zsPause = { on: false };
/** Onde você parou na Zona Sul (neste aparelho) — o mapa velho sempre nasce no ponto de partida; aqui volta onde estava. */
const POS_KEY = 'tribos.zs.pos';
function readZsPos(t: ZsTerrain): { x: number; z: number; y?: number } {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x?: unknown; z?: unknown; y?: unknown } | null;
    const x = Number(v?.x), z = Number(v?.z), y = Number(v?.y);
    if (Number.isFinite(x) && Number.isFinite(z) && x > t.x0 && x < t.x0 + t.w * t.cell && z > t.z0 && z < t.z0 + t.h * t.cell) {
      // saiu do jogo DENTRO da caverna: volta lá dentro (não em cima do morro)
      if (Number.isFinite(y) && caveInside(x, y, z)) return { x, z, y };
      return { x, z };
    }
  } catch { /* sem storage / lixo: nasce no ponto de partida */ }
  return { x: ZS_SPAWN.x, z: ZS_SPAWN.z };
}
function saveZsPos(p: THREE.Vector3) {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, ...(layers.inside ? { y: Math.round(p.y * 100) / 100 } : {}) })); } catch { /* sem storage */ }
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

function ZonaSulWorld({ paused = false, onAttack }: { paused?: boolean; onAttack?: () => void }) {
  const [t, setT] = useState<ZsTerrain | null>(null);
  /** fauna/acampamentos/perfil prontos (precisam do terreno) — só aí o combate entra na cena */
  const [ready, setReady] = useState(false);
  /** o herói pro combate (inimigos, poderes, piloto) e o destino do piloto automático */
  const playerRef = useRef<THREE.Group | null>(null);
  const movement = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  const c = useMemo(() => palette(), []);
  const hemiRef = useRef<THREE.HemisphereLight>(null), ambRef = useRef<THREE.AmbientLight>(null), skyRef = useRef<SkyImpl>(null);
  useEffect(() => { zsAttack.fn = onAttack ?? null; return () => { zsAttack.fn = null; }; }, [onAttack]);
  const [err, setErr] = useState('');
  const touch = useTouchScreen();
  const heroRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Onde o detalhe (chão, árvores, água) é montado: o herói, ou o centro da vista de cima (tecla K). */
  const focusRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Carro voador: nasce do seu lado (Pedro: "joga lá perto do Arpoador onde eu testo"). */
  const carRef = useRef<ZsCar | null>(null);
  const dimsRef = useRef<CarDims | null>(null);
  const boardRef = useRef<BoardPose>(newBoardPose());
  /** poses da ASA-DELTA e do SKATE (o herói escreve; as vistas leem) */
  const gliderPose = useRef<BoardPose>(newBoardPose()), skatePose = useRef<BoardPose>(newBoardPose());
  const gearRef = useMemo(() => ({ get glider() { return gliderPose.current; }, get skate() { return skatePose.current; } }), []);
  const perfRef = useRef<HTMLDivElement>(null);
  // só em desenvolvimento: os testes de tela leem posição/estado (o jogo publicado não expõe nada)
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zs?: unknown }).__zs = { hero: heroRef.current, car: carRef, terrain: () => t, store: useGameStore, movement, setEpoch: setWorldEpoch, nightFactor, worldEpoch, amb: () => ({ ...AMB }), ship: zsShip };
  useEffect(() => {
    zsPause.on = paused;
    if (paused) { input.keys.clear(); input.stick.x = 0; input.stick.z = 0; }
  }, [paused]);
  useEffect(() => {
    // entrou no mapa: a pé, câmera no herói; 1ª vez = ganha a prancha
    drive.mode = 'foot'; input.overview = false; input.keys.clear(); hudNow = null;
    zsAmbience.arm(); // som do mar/carro/vento (liga no 1º clique/tecla)
    // PRANCHA: quem garante é a casa do jogo (routes/index.tsx) — item fixo, volta sempre que faltar
    let alive = true;
    loadZsTerrain().then((tt) => {
      if (!alive) return;
      setCaveTerrain(tt); // a caverna precisa do chão do mapa (bocas) antes de qualquer conta
      const at = readZsPos(tt);
      heroRef.current.set(at.x, at.y ?? zsHeightAt(tt, at.x, at.z), at.z); focusRef.current.copy(heroRef.current);
      movement.current.set(at.x, 0, at.z);
      carRef.current = newCar(at.x + 3, at.z - 2, 0, tt);
      // o JOGO passa a viver na Zona Sul: chão/terra/limites/zona segura/acampamentos dela + a fauna por região
      const prof = zsWorldProfile(tt);
      setWorldProfile(prof);
      const query = zsQuery(tt);
      useGameStore.getState().enterWorld('zona-sul', {
        creatures: [...createZsWildlife(query, undefined, ZS_FAUNA, prof.camps), ...[createCaveBoss()].filter((c) => c !== null)],
        harvestNodes: createZsHarvestNodes(query),
        position: { x: at.x, z: at.z },
      });
      setT(tt); setReady(true);
    }).catch((e) => alive && setErr(String(e)));
    const keep = window.setInterval(() => { if (carRef.current) saveZsPos(heroRef.current); }, 2000);
    return () => {
      alive = false; window.clearInterval(keep); if (carRef.current) saveZsPos(heroRef.current); zsPause.on = false; input.keys.clear();
      zsCtx.inWater = false; zsCtx.driving = false; audioManager.setFootsteps(false); zsAmbience.mute();
      resetLayers(); zsCave.inCave = false; zsCave.dark = 0; zsCave.near = false; zsCave.deep = false; setCaveTerrain(null);
      // saiu da Zona Sul (trocou de mapa / cidade): o jogo volta pro Vale (se a troca já não fez isso)
      if (WORLD.id === 'zona-sul') { resetWorldProfile(); useGameStore.getState().enterWorld('classic'); }
    };
  }, []);
  const sunPos = useMemo(() => SUN.clone().multiplyScalar(1000).toArray() as [number, number, number], []);
  return (
    <div className="zs-world" style={{ background: FOG }}>
      {t && (
        <Canvas shadows dpr={[1, 1.25]} camera={{ fov: 55, near: 0.3, far: 7000 }} gl={{ antialias: true }}>
          <color attach="background" args={[FOG]} />
          <Sky ref={skyRef} sunPosition={sunPos} turbidity={5} rayleigh={1.4} mieCoefficient={0.006} distance={4500} />
          <hemisphereLight ref={hemiRef} args={['#eef4f8', '#6b7a4a', 1.5]} />
          <ambientLight ref={ambRef} intensity={0.35} />
          {/* DIA/NOITE (relógio do jogo) + lua + postes nas pistas */}
          <ZsDayNight hemi={hemiRef} amb={ambRef} sky={skyRef} />
          {/* POOL DE LUZES (30/10, lag): postes, fogueiras e tocha dividem poucas luzes FIXAS — sem recompilar shader; de dia saem */}
          <LightPool size={touchLayout.on ? 2 : 4} focus={heroRef} />
          {/* a SUPERFÍCIE some quando o herói está no fundo da caverna (nada dela aparece lá dentro — e não pesa) */}
          <ZsSurface>
            <AssetBoundary label="ZsPostes" fallback={null}><Suspense fallback={null}><ZsLamps t={t} heroRef={heroRef} /></Suspense></AssetBoundary>
            {/* NAVIO encalhado entre Ipanema e Leblon (dá pra subir pela prancha) */}
            <AssetBoundary label="ZsNavio" fallback={null}><Suspense fallback={null}><ZsShip t={t} /></Suspense></AssetBoundary>
            <ZsTerrainMesh t={t} heroRef={focusRef} />
            <ZsWater t={t} />
            {SURF_ON && <SurfBreak t={t} shoreX={ZS_SPAWN.x} shoreZ={ZS_SPAWN.z} />}
            {/* SORRISO: no meio de Copacabana (Pedro 30/10) */}
            {SURF_ON && <SorrisoBreak t={t} />}
            <ZsVegetation t={t} heroRef={focusRef} />
          </ZsSurface>
          {/* CAVERNA (30/10): Rebouças → galerias → águas → grande caverna → salão do chefe; ramal até o Leblon */}
          <ZsCave t={t} heroRef={heroRef} />
          <Hero t={t} heroRef={heroRef} focusRef={focusRef} onHud={pushHud} carRef={carRef} dimsRef={dimsRef} boardRef={boardRef} playerRef={playerRef} movement={movement} c={c} gearRef={gearRef} />
          {/* COMBATE — as mesmas peças do Vale, no chão da Zona Sul (perfil do mapa) */}
          {/* cada peça com a sua rede de carregamento (29/10: um bicho novo carregando o modelo ESCONDIA o mundo inteiro
              por um instante — o React esconde até a rede mais próxima) e proteção contra modelo quebrado (igual ao Vale) */}
          {ready && (
            <AssetBoundary label="ZsCombate" fallback={null}>
              <Suspense fallback={null}><Camps c={c} /></Suspense>
              {/* recursos de colher (madeira na mata, pedra no campo — PR #14): a mesma peça do Vale, VISÍVEIS */}
              <Suspense fallback={null}><HarvestNodes c={c} /></Suspense>
              <Suspense fallback={null}><Enemies c={c} playerRef={playerRef} cameraMode="third" /></Suspense>
              <Suspense fallback={null}><CombatFeedback /></Suspense>
              <Suspense fallback={null}><Projectiles /></Suspense>
              <Suspense fallback={null}><HeroPowers playerRef={playerRef} paused={paused} /></Suspense>
              <BurstRuntime paused={paused} />
              <AutoPilot playerRef={playerRef} movement={movement} paused={paused} />
              <BackgroundSim paused={paused} />
            </AssetBoundary>
          )}
          {/* PRÉ-AQUECIMENTO: 1 exemplar invisível de cada bicho/inimigo do mapa (o 1º encontro não trava) */}
          {ready && <ZsWarmUp c={c} playerRef={playerRef} />}
          <Suspense fallback={null}><ZsCarView carRef={carRef} dimsRef={dimsRef} /></Suspense>
          <Suspense fallback={null}><ZsBoardView poseRef={boardRef} /></Suspense>
          <AssetBoundary label="ZsAsaSkate" fallback={null}>
            <Suspense fallback={null}><ZsGearView kind="glider" poseRef={gliderPose} /></Suspense>
            <Suspense fallback={null}><ZsGearView kind="skate" poseRef={skatePose} /></Suspense>
          </AssetBoundary>
          <Controls />
          <ZsPerf elRef={perfRef} />
        </Canvas>
      )}
      {/* STATUS (canto direito, onde no mapa velho fica o minimapa) + LEVANTAR — componente próprio, o mundo não re-renderiza */}
      <ZsHudView touch={touch} />
      <ZsWarmOverlay />
      <div ref={perfRef} className="zs-perf" style={{ display: 'none' }} />
      {touch && t && !paused && (
        <div className="zs-touch">
          <button type="button" className="zs-btn" title="Entrar / sair do carro" aria-label="Entrar / sair do carro" onPointerDown={() => { input.eTap = true; }}>Carro</button>
          <HoldKey code="ShiftLeft" label="Correr" title="Correr / remar forte / turbo" />
          <HoldKey code="KeyC" label="Descer" title="Mergulhar / descer o carro" />
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
