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
import type { HeroAction } from '@/components/world/glb-hero';
import { HERO_HEIGHT } from '@/components/world/world-kit';
import { LocalHeroBody } from '@/components/world/hero-skin-body';
import { ZS_LANDMARKS, ZS_SPAWN, ZS_SURF } from './zona-sul-meta';
import { loadZsTerrain, ZS_SPAWN_TERRAIN_URL, type ZsTerrain, zsHeightAt, zsSlopeDeg, zsSurfAt, ZS_WATER_Y, zsWaterChurnAt, zsWaterInTubeAt, zsWaterPushAt, zsWaterSpitAt, zsWaterYAt } from './zs-terrain-data';
import { SurfBreak } from './surf/surf-break';
import { SorrisoBreak } from './surf/sorriso-break';
import { nearestSurfZone, surfZoneAt } from './surf/surf-zones';
import { ARPOADOR, SURF } from './surf/surf-wave';
import { canPop, newRide, RIDE, rideStep, type RideState, type RideWater } from './surf/surf-ride';
import { useGameStore } from '@/game/state/game-store';
import { selectedItemId } from '@/components/world/held-weapon';
import { HANG_GLIDER_ID, HOVER_SKATE_ID, SURFBOARD_ID } from '@/game/systems/zonaSulKit';
import { canOpenGlider, GLIDE, glideStep, type GlideState, newGlide, newSkate, SKATE, skateStep, type SkateState } from './zs-glide';
import { ZsGearView } from './zs-gear-view';
import { isUnlocked, lockedMessage, unlockLevel } from '@/game/systems/unlockSystem';
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
import { heroFacing, setIsoCursor } from '@/components/world/free-aim';
import { housePlayerFeetY, housePlayerInside } from '@/components/world/house-collider';
import { pinchDist, toggleZsCam, useZsCam, ZS_MOBA, ZS_SHOULDER_DIST } from './zs-camera';
import { withSeeThrough, zsSeeThrough } from './zs-see-through';
import { takeVirtualLook, touchLayout, virtualMove } from '@/components/world/virtual-input';
import { LightPool } from '@/components/world/light-pool';
import { ZsWarmOverlay, ZsWarmUp } from './zs-warmup';
import { noteManualLook } from '@/components/world/pilot-aim';
import { HeroNameplate } from '@/components/world/hero-nameplate';
import { Camps, Enemies, MultiplayerWorldSync } from '@/components/world/world-entities';
// BASE e ONLINE do Vale (31/10, Pedro: "tudo do Vale passa pra cá, a base toda, a mecânica — sem inventar")
import { NetBases, PlayerBase } from '@/components/world/player-base';
import { BaseFireFX } from '@/components/world/base-fire';
import { BaseNightLights } from '@/components/world/base-night-lights';
import { RemotePlayers } from '@/components/world/remote-players';
import { TargetRoute } from '@/components/world/target-route';
import { houseFloorSurfaceY, houseWalkFloorY, pushOutBasePieces, pushOutHouseWalls } from '@/components/world/base-collision';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { broadcastCannon, broadcastPose, type NetVehicle, registerCarHitHandler, registerShipHitHandler, useNet } from '@/net/multiplayer';
import { remoteCars, remoteDecks, remoteDeckTick, ZsRemoteVehicles } from './zs-remote-vehicles';
import { carSeatWorld, caronaCarNear, caronaMine, freeCarSeat } from './zs-carona';
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
import { createZsBandits, createZsNewAreaCreatures, createZsSharks, createZsSpreadBandits, createZsSpreadFauna, createZsWildlife, ZS_FAUNA, ZS_SHARK_PEAKS, type ZsSharkPeak } from '@/game/systems/zsSpawnSystem';
import { findSurfFrame } from './surf/surf-frame';
import { findSorrisoFrame, SORRISO } from './surf/sorriso';
import { createZsForestFarm, createZsHarvestNodes, createZsNewAreaTrees, createZsSpreadHarvest } from '@/game/systems/zsHarvestSystem';
import { createCaveCreatures, createCaveOreNodes, zsNavigable, zsQuery, zsSwimmable, zsWorldProfile } from './zs-world-profile';
import { useZsTouch, zsAttack, zsCave, zsCrouch, zsCtx, ZS_CROUCH_CAM_DROP, ZS_CROUCH_SPEED } from './zs-context';
import { type ArcButton, useArcExtras } from '@/components/world/mobile-controls';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, Car, ChevronsDown, ChevronsUp, Gauge, LogOut, Ship } from 'lucide-react';
import { CAVE_ABYSS, caveCamFit, caveDeep, caveField, caveMouthClear, caveInside, caveMouthDist, caveMove, caveRoomName, setCaveTerrain } from './zs-cave';
import { ZsCave, ZsCaveMouthRocks } from './zs-cave-view';
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
import { ZsGrass } from './zs-grass';
import { rampStep, zsRamp, ZsRampView, zsRampFloor } from './zs-ramp';
import { readZsVehicles, restoreCar, restoreWarship, saveZsVehicles } from './zs-vehicle-save';
import { autoFollowDir, zsDiveStep, zsStep, ZS_RUN, ZS_SWIM, ZS_SWIM_FAST, ZS_SWIM_GLIDE, ZS_SWIM_SINK, ZS_SWIM_SINK_MOVE, ZS_WALK, zsWaterState } from './zs-move';
import { CAR, CAR_SEATS, carGone, carStep, damageCar, newCar, SEAT_FOOT_K, type ZsCar } from './zs-car';
import { costText, VEHICLE_COST } from '@/game/data/vehicle-costs';
import { vehicleShield } from '@/game/systems/vehicleShield';
import { ballLanding, cannonElevation, cannonSalvo, cannonSide, cannonSwing, carryOnDeck, damageWarship, findWarshipDock, nearWarshipHull, newWarship, WARSHIP, type WarshipSide, warshipGone, warshipLocal, warshipStep, warshipWorld, type ZsWarship } from './zs-warship';
import { HELM_U, syncWarshipDeck, WARSHIP_DRAFT, warshipAim, warshipBoardSpot, warshipDims, warshipFx, warshipHalfBeam, ZsWarshipView, zsWarshipDeck } from './zs-warship-view';
import { WAKE_BOARD, WAKE_SHIP, ZsWake, zsBoardWake } from './zs-wake';
import { heroMuzzle } from '@/components/world/muzzle';
import { type CarDims, ZsCarView } from './zs-car-view';
import { ZS_GEAR, ZS_HERO_CLIPS, ZS_HERO_CUT } from './zs-hero-clips';
import { ZS_REMOTE_KIT } from './zs-remote-gear';

/** Clips extras do herói só na Zona Sul (dirigir, porta, nadar, boiar, surf, asa) e os cortes — num módulo próprio desde
 *  02/11: o boneco dos OUTROS jogadores usa os mesmos (zs-hero-clips.ts). */
const HERO_CLIPS = ZS_HERO_CLIPS;
const HERO_CUT = ZS_HERO_CUT;
/** Pé na prancha: altura do DECK acima da água (m). Giro do corpo em relação ao bico (base de surfista, de lado). */
const BOARD_DECK = 0.12, STANCE = -Math.PI / 2;
/** Raio do corpo do herói contra muro/casa da base (o mesmo do Vale). */
const HERO_RADIUS = 0.5;
/** A pose final do Zombie Stand Up abaixa o quadril: em pé o corpo sobe isto (m) pra os pés ficarem NO deck (Pedro: "corpo
 *  abaixo d'água como se estivesse sentado"); no levantar sobe aos poucos junto com a animação. Medido em foto. */
const SURF_LIFT = 0.8;
const NO_AXES = { qx: 0, qz: -1, sx: 1, sz: 0 };
/** Câmera dentro do tubo: distância (m) e inclinação — no ombro, quase 1ª pessoa. */
const TUBE_CAM_DIST = 1.7, TUBE_CAM_PITCH = 0.06;
/** Quanto o corpo acompanha a inclinação da prancha no carving. */
const LEAN_BODY = 0.8;
/** a pé → abrindo a porta (ENTER_MS) → dirigindo. E entra/sai. */
const drive = { mode: 'foot' as 'foot' | 'entering' | 'driving' | 'sailing' | 'riding', enterAt: 0,
  /** CARONA (02/11, Pedro: "aliado de qualquer nível entra no carro que o outro aliado dirige"): de quem é o carro e o banco */
  rideWho: null as string | null, seat: 1 };
/** veículos que vão de carona na pose (reaproveitado — nada criado por quadro) */
const netVehicles: NetVehicle[] = [];
/** equipamento em uso que vai de carona na pose (reaproveitado): [tipo, altura acima do pé, rumo, rolagem, inclinação] */
const netGear: number[] = [0, 0, 0, 0, 0];
/** ÂNCORA do navio de guerra (onde ele nasce e onde se CONSTRÓI outro depois de afundar — 01/11) */
const warshipDock: { at: { x: number; z: number; yaw: number } | null } = { at: null };
/** GARAGEM do carro voador (onde ele nasce e onde se CONSTRÓI outro depois de explodir — 01/11) */
const carGarage: { at: { x: number; z: number; yaw: number } | null } = { at: null };
const ENTER_MS = 1100;

/** Golpe/tiro: quanto dura a animação de ataque (s) — o herói PARA pra atacar (igual ao Vale). Giro do especial R. */
const ATTACK_S = 0.45, SPIN_S = 0.45;
/** Mira (botão direito): câmera no ombro a 1,7 m (celular 3,2), ombro 0,75 m pro lado, campo de visão 52°/zoom (celular 58°). */
const AIM_DIST = 1.7, AIM_DIST_TOUCH = 3.2, AIM_SHOULDER = 0.75, AIM_FOV = 52, AIM_FOV_TOUCH = 58;
const SUN = new THREE.Vector3(-0.55, 0.62, -0.45).normalize();
const FOG = '#bcd0dc';
/** Verdes da copa da mata (zs-vegetation, dossel) — o alvo do tom da árvore de farm na Zona Sul. */
const ZS_MATA_LEAF = '#2f5d2a', ZS_MATA_LEAF_LIGHT = '#3b6b31';
/** TUBARÕES (01/11): o ponto do DROP de cada pico sai dos MESMOS achadores que a onda usa (o tubarão acompanha a onda de
 *  verdade): pico + eixo q × BREAK_Q (onde ela quebra). */
function zsSharkPeaks(t: ZsTerrain): ZsSharkPeak[] {
  const out: ZsSharkPeak[] = [];
  const a = findSurfFrame(t, ZS_SPAWN.x, ZS_SPAWN.z);
  if (a) out.push({ id: 'arpoador', x: a.px + a.qx * ARPOADOR.BREAK_Q, z: a.pz + a.qz * ARPOADOR.BREAK_Q, ...ZS_SHARK_PEAKS.arpoador });
  const s = findSorrisoFrame(t);
  if (s) out.push({ id: 'sorriso', x: s.px + s.qx * SORRISO.BREAK_Q, z: s.pz + s.qz * SORRISO.BREAK_Q, ...ZS_SHARK_PEAKS.sorriso });
  return out;
}
/** Folha da árvore de farm na Zona Sul: metade do caminho entre a cor do jogo e o verde da mata. */
function zsFarmLeaf(game: string, mata: string, k = 0.5): string {
  return '#' + new THREE.Color(game).lerp(new THREE.Color(mata), k).getHexString();
}
/** CAVERNA lá no fundo (`zsCave.dark` acima disto): o sol já está apagado → zera de vez e PARA de redesenhar a sombra dele
 *  (1/11: ~1,3 mi de triângulos por quadro que ninguém via). A luz fica na cena (regra de 30/10: ligar/desligar luz faz o
 *  three recompilar tudo) — só o mapa de sombra para; saiu do fundo, volta a atualizar no mesmo quadro. */
const SUN_OFF_DARK = 0.999;
/** Sol/luar do relógio do jogo em cima do herói (a caixa da sombra segue ele). */
function followSun(sun: THREE.DirectionalLight, p: THREE.Vector3) {
  const sd = zsSun.dir;
  sun.position.set(p.x + sd.x * 120, p.y + sd.y * 120, p.z + sd.z * 120);
  sun.target.position.set(p.x, p.y, p.z); sun.target.updateMatrixWorld();
  const off = zsCave.dark > SUN_OFF_DARK;
  sun.intensity = off ? 0 : zsSun.intensity * (1 - zsCave.dark);
  sun.shadow.autoUpdate = !off;
  sun.color.copy(zsSun.color);
}

/** `carTouch`: a linha de baixo NO CELULAR (sem teclas de PC — lá os comandos são os botões do arco); sem ela, some. */
type Hud = { x: number; z: number; y: number; state: string; near: string; overview: boolean; car?: string | undefined; carTouch?: string | undefined; canPop?: boolean };
/** Entrada + câmera. `overview` (tecla K): câmera de CIMA solta do boneco — WASD move a vista, Shift acelera,
 *  arrastar gira, roda sobe/desce; K de novo volta pro herói (o herói fica parado onde estava). */
const input = { keys: new Set<string>(), stick: { x: 0, z: 0 }, yaw: 0.6, pitch: 0.32, dist: 9, overview: false, ov: { x: 0, z: 0, alt: 420, pitch: 1.05 }, eTap: false, lookAt: 0,
  /** câmera no carro (tecla V): 3ª pessoa atrás ou DE DENTRO (cabeça do motorista); olhar em volta de dentro */
  carCam: 'chase' as 'chase' | 'cockpit', cockYaw: 0, cockPitch: 0,
  /** botão LEVANTAR na tela (celular) */
  popTap: false,
  /** AGACHAR (02/11): Ctrl (toque, alterna) ou o botão do arco no celular */
  crouchTap: false,
  /** tecla P: mostrador de FPS / desenhos / triângulos */
  perf: false,
  /** NAVIO DE GUERRA: segurando a mira (botão direito) · pedido de tiro ('aim' = lado pra onde a câmera olha) */
  cannonAim: false, cannonFire: null as WarshipSide | 'aim' | null,
  /** câmera DE CIMA (03/11): distância própria (roda/pinça) — a do ombro (`dist`) fica guardada pra quando voltar */
  mobaDist: ZS_MOBA.DIST as number,
  /** mouse no PC (coordenada da tela −1..1): na câmera de cima o TIRO LIVRE vai no cursor, igual ao Vale */
  mouse: { x: 0, y: 0, at: -Infinity } };
/** Câmera de cima valendo AGORA pro arrasto/roda/pinça: a pé, fora da caverna e sem mirar (mirando = ombro). */
const mobaOn = () => useZsCam.getState().mode === 'cima' && drive.mode === 'foot' && !zsCave.inCave && !input.overview && !useAim.getState().active;
/** rascunho do cursor no chão (câmera de cima no PC) — criados 1×, nunca por quadro */
const zsCursorRay = new THREE.Raycaster(), zsCursorNdc = new THREE.Vector2(), zsCursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), zsCursorHit = new THREE.Vector3();
/** Altura do OLHO do motorista sentado acima do pé (m) e campo de visão de dentro (mais aberto). */
const EYE_SEATED = 1.12, COCKPIT_FOV = 74, CHASE_FOV = 55;

/** SOM do mundo em volta do herói (mar, arrebentação, carro, vento) — 10×/s. */
const AMB: AmbienceState = { sea: 0, surf: 0, car: false, carSpeed: 0, carAlt: 0, wind: 0 };
function ambienceAt(t: ZsTerrain, p: THREE.Vector3, car: ZsCar | null, rideSpeed: number, shipSpeed = 0): AmbienceState {
  let sea = 0;
  for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; if (zsSurfAt(t, p.x + Math.sin(ang) * 60, p.z + Math.cos(ang) * 60) === ZS_SURF.sea) sea++; }
  AMB.sea = zsCtx.inWater ? 1 : (sea / 8) * Math.max(0, 1 - Math.max(0, p.y) / 45);
  // arrebentação do pico MAIS PERTO (Arpoador ou, na ressaca, o Sorriso); calmaria = mais baixo; Sorriso sem ressaca = mudo
  const zn = nearestSurfZone(p.x, p.z), f = zn?.frame;
  AMB.surf = zn && f ? Math.max(0, 1 - Math.hypot(p.x - f.px, p.z - f.pz) / 320) * (zn.drawn ? 1 : zn.scheduler.enabled ? 0.4 : 0) : 0;
  AMB.car = drive.mode === 'driving' && !!car;
  AMB.carSpeed = car?.speed ?? 0; AMB.carAlt = car?.altitude ?? 0;
  AMB.wind = AMB.car ? Math.min(1, AMB.carAlt / 25 + Math.abs(AMB.carSpeed) / 60) : Math.min(1, (rideSpeed / 14) * 0.6);
  // NAVIO (pilotando ou em pé no convés): a água no casco + o vento nas velas, com a velocidade
  AMB.ship = Math.min(1, Math.abs(shipSpeed) / WARSHIP.MAX);
  if (AMB.ship > 0) { AMB.wind = Math.max(AMB.wind, AMB.ship * 0.55); AMB.sea = Math.max(AMB.sea, 0.6); }
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

function Hero({ t, heroRef, focusRef, onHud, carRef, dimsRef, boardRef, playerRef, movement, c, gearRef, shipRef }: { shipRef: React.MutableRefObject<ZsWarship | null>; t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3>; focusRef: React.MutableRefObject<THREE.Vector3>; onHud: (h: Hud) => void; carRef: React.MutableRefObject<ZsCar | null>; dimsRef: React.MutableRefObject<CarDims | null>; boardRef: React.MutableRefObject<BoardPose>; playerRef: React.MutableRefObject<THREE.Group | null>; movement: React.MutableRefObject<THREE.Vector3>; c: Palette; gearRef: { glider: BoardPose; skate: BoardPose } }) {
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
  /** agachado, o Espaço levantou: não pula enquanto ele não for solto (02/11) */
  const crouchStand = useRef(false);
  /** em cima do deck da rampa de voo livre no quadro anterior (02/11) */
  const onRamp = useRef(false);
  /** caverna: na poça (anda mais devagar) · quanto da distância da câmera cabe sem entrar na rocha (0..1) */
  const caveWade = useRef(false), camFit = useRef(1);
  /** câmera DE CIMA (03/11): 0 = ombro, 1 = de cima — anda suave na troca (e vira ombro sozinha na caverna) */
  const mobaK = useRef(useZsCam.getState().mode === 'cima' ? 1 : 0);
  const action = useRef<HeroAction>('idle');
  const speed = useRef(0);
  const vy = useRef(0);
  /** velocidade NA ÁGUA (embalo do nado) */
  const swimVel = useRef(new THREE.Vector2());
  const bodysurf = useRef(false);
  /** profundidade do mergulho (m abaixo da posição de nadar); C desce, soltou sobe */
  const dive = useRef(0);
  const grounded = useRef(true);
  /** em pé no CONVÉS do navio de guerra (quadro anterior) — o navio andando/girando leva junto (01/11) */
  const onDeck = useRef(false);
  /** em pé no convés do navio de OUTRO jogador (id dele) + o tique do "levar junto" já aplicado (online, 01/11) */
  const onRemoteDeck = useRef<string | null>(null), remoteCarryTick = useRef(-1);
  /** CARRO COM VIDA (01/11): dirigindo, o dano que viria no herói vai aqui (vehicleShield); zerou = explode */
  const carShield = useMemo(() => (dmg: number, from: string) => {
    const c = carRef.current;
    if (!c || c.wreckT !== null) return false;
    const boom = damageCar(c, dmg), st = useGameStore.getState();
    if (boom) { audioManager.playWorld('cannon', 1); st.setMessage(`🔥 Seu carro EXPLODIU (${from})! Construa outro na garagem, na praia do Arpoador (E).`); }
    else st.setMessage(`💥 ${from} acertou o carro! −${dmg} (carro ${c.hp}/${CAR.HP})`);
    return true;
  }, [carRef]);
  useEffect(() => () => { vehicleShield.absorb = null; }, []);
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
  /** água funda o bastante pro casco do navio de guerra: mar, canal do Jardim de Alah e Lagoa (01/11) */
  const shipSwim = useMemo(() => (x: number, z: number) => zsNavigable(t, x, z, WARSHIP.MIN_DEPTH), [t]);

  useFrame((frame, dtRaw) => {
    const dt = Math.min(0.05, dtRaw), clockT = frame.clock.elapsedTime;
    const p = heroRef.current, k = input.keys;
    zsBoardWake.active = false; // o surf liga de novo se estiver em pé na onda neste quadro
    // câmera de cima: o "ver através" e o teto da casa só ligam lá embaixo, na câmera a pé (carro/navio/mapa = desligado)
    zsSeeThrough.on.value = 0; housePlayerInside.current = false;
    // CAVERNA (30/10): dentro dela (ou perto da boca) a caverna desenha; quanto mais fundo, mais escuro (lanterna acende)
    {
      const inside = drive.mode === 'foot' && caveInside(p.x, p.y, p.z), md = caveMouthDist(p.x, p.y, p.z);
      layers.inside = inside; layers.player = inside && caveDeep(p.x, p.y, p.z, md) ? 1 : 0;
      zsCave.inCave = inside;
      const want = inside && !input.overview ? Math.min(1, Math.max(0, (md - 6) / 28)) : 0;
      zsCave.dark += (want * want * (3 - 2 * want) - zsCave.dark) * Math.min(1, dt * 2.5);
      if (zsCave.dark < 0.002) zsCave.dark = 0;
      zsCave.near = inside || md < 170 || input.overview;
      zsCave.deep = zsCave.dark > 0.97;
      zsCave.seaOff = inside && md > 20;
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
      if (hudAcc.current > 0.25) { hudAcc.current = 0; onHud({ x: o.x, z: o.z, y: o.alt, state: `vista do mapa (${Math.round(o.alt)} m)`, near: '', overview: true }); }
      return;
    }
    if (wasOverview.current) { wasOverview.current = false; fog.near = 200; fog.far = 2200; }
    { // caverna: breu ao longe — no ABISMO (02/11 noite) a névoa vai mais longe: de cima se vê o fundo do poço
      const d2 = zsCave.dark * zsCave.dark, ab = zsCave.inCave && Math.hypot(p.x - CAVE_ABYSS.x, p.z - CAVE_ABYSS.z) < CAVE_ABYSS.near;
      fog.near = 200 + (5 - 200) * d2; fog.far = 2200 + ((ab ? CAVE_ABYSS.fogFar : 75) - 2200) * d2;
    }
    const car = carRef.current, ship = shipRef.current, now = performance.now();
    const gs = useGameStore.getState();
    // ONLINE (igual ao Vale): a pose vai pra rede COM A ALTURA — quem está na caverna aparece NA caverna pros outros.
    // 01/11: + o NAVIO e o CARRO de carona (Pedro online: "um no barco, outro na praia — não vejo o barco") — os outros
    // desenham (zs-remote-vehicles) e podem subir no convés do navio
    const r2 = (n: number) => Math.round(n * 100) / 100, r3 = (n: number) => Math.round(n * 1000) / 1000;
    netVehicles.length = 0;
    if (ship && !warshipGone(ship)) netVehicles.push({ k: 's', x: r2(ship.x), z: r2(ship.z), yaw: r3(ship.yaw), s: r2(ship.speed), h: ship.hp });
    if (car && !carGone(car)) netVehicles.push({ k: 'c', x: r2(car.x), z: r2(car.z), yaw: r3(car.yaw), y: r2(car.y), h: car.hp });
    caronaMine.car = car && !carGone(car) ? car : null; caronaMine.dims = dimsRef.current; // quem pega carona comigo senta no banco
    // 02/11 (Pedro online: "não vejo o skate dele; na prancha em pé"): o EQUIPAMENTO em uso vai junto (asa > skate > prancha)
    { const gp = gearRef.glider, sp = gearRef.skate, bp = boardRef.current;
      const src = gp.visible ? gp : sp.visible ? sp : bp.visible ? bp : null;
      if (src) { netGear[0] = src === gp ? ZS_GEAR.glider : src === sp ? ZS_GEAR.skate : ZS_GEAR.board; netGear[1] = r2(src.y - p.y); netGear[2] = r3(src.yaw); netGear[3] = r3(src.roll); netGear[4] = r3(src.pitch ?? 0); } }
    const gearOn = gearRef.glider.visible || gearRef.skate.visible || boardRef.current.visible;
    broadcastPose(p.x, p.z, yawNow.current, action.current, gs.player.level, gs.player.hp, gs.player.maxHp, p.y, selectedItemId(gs), netVehicles, gearOn ? netGear : null);
    // RENASCER na zona segura (praia do Arpoador) quando o tempo da morte acaba — igual ao Vale
    if (gs.player.dead && gs.player.respawnAt > 0 && Date.now() >= gs.player.respawnAt) {
      // renasce na CAMA da base, se já tiver uma; senão na zona segura (igual ao Vale)
      const core = gs.playerBase?.pieces.find((pc) => pc.kind === 'core');
      const sp = core ? cellCenter(core.cell) : { x: SAFE_ZONE.x, z: SAFE_ZONE.z };
      useGameStore.setState(s => ({ player: { ...s.player, hp: s.player.maxHp, dead: false, respawnAt: 0, position: { x: sp.x, z: sp.z } }, ui: { ...s.ui, message: core ? 'Você reviveu na sua base.' : 'Você reviveu na zona segura.', deathBy: null } }));
      drive.mode = 'foot'; ride.current = null; swimVel.current.set(0, 0); vy.current = 0; grounded.current = true; dive.current = 0;
      p.set(sp.x, zsHeightAt(t, sp.x, sp.z), sp.z); movement.current.set(p.x, 0, p.z);
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
    // (câmera de cima: só GIRA — o ângulo é fixo)
    if (vl.dx || vl.dy) { const sens = 0.005 * aimSensitivityScale(); input.yaw -= vl.dx * sens; if (!mobaOn()) input.pitch = Math.max(-0.5, Math.min(1.35, input.pitch + vl.dy * sens)); input.lookAt = now; noteManualLook(); }
    // posição no JOGO (inimigos, tiro, piloto, coleta) — ~7×/s, como no Vale
    posAcc.current += dt;
    if (posAcc.current > 0.15) { posAcc.current = 0; const cur = gs.player.position; if (cur.x !== p.x || cur.z !== p.z) useGameStore.setState(s => ({ player: { ...s.player, position: { x: p.x, z: p.z } } })); }
    zsCtx.driving = drive.mode === 'driving';
    // CARRO COM VIDA (01/11): no volante, o dano que viria no herói vai no carro (vehicleShield); explodiu = você cai
    vehicleShield.absorb = (drive.mode === 'driving' || drive.mode === 'entering') && car && car.wreckT === null ? carShield : null;
    if (car && car.wreckT !== null && (drive.mode === 'driving' || drive.mode === 'entering')) {
      drive.mode = 'foot'; vehicleShield.absorb = null;
      if (group.current) group.current.visible = true;
      const pc = camera as THREE.PerspectiveCamera; if (pc.fov !== CHASE_FOV) { pc.fov = CHASE_FOV; pc.updateProjectionMatrix(); }
      const side = (dimsRef.current?.width ?? 2.2) / 2 + 1.5;
      p.x = car.x - Math.cos(car.yaw) * side; p.z = car.z + Math.sin(car.yaw) * side; p.y = Math.max(p.y, car.y);
      movement.current.set(p.x, 0, p.z); vy.current = 2; grounded.current = false;
    }
    // NAVIO DE GUERRA a pé (01/11): o que o E faz agora — no convés perto do timão = pilotar; no convés longe = descer
    // (pula na água); fora, perto do CASCO = subir a bordo (qualquer nível: amigo/inimigo sobe — pirataria). Também no
    // navio de OUTRO jogador (online): sobe e desce (pilotar só o seu — o leme dele está na tela dele). `who` = id dele.
    const shipSel: { act: 'pilotar' | 'descer' | 'subir' | 'construir' | 'construir_carro'; who: string | null } | null = (() => {
      if (drive.mode !== 'foot' || dead) return null;
      // o MEU carro explodiu: perto da garagem = construir outro (01/11) — mesmo canal de ação (E / botão do arco)
      const gg = carGarage.at;
      if (car && carGone(car) && gg && Math.hypot(gg.x - p.x, gg.z - p.z) < CAR.BUILD_NEAR) return { act: 'construir_carro', who: null };
      // o MEU afundou: perto da âncora = construir outro (recurso da bolsa — 01/11)
      const dk = warshipDock.at;
      if (ship && warshipGone(ship) && dk && Math.hypot(dk.x - p.x, dk.z - p.z) < WARSHIP.BUILD_NEAR) return { act: 'construir', who: null };
      if (onDeck.current && ship) { const h = warshipWorld(ship, 0, HELM_U * WARSHIP.LENGTH); return { act: Math.hypot(h.x - p.x, h.z - p.z) < WARSHIP.HELM_REACH ? 'pilotar' : 'descer', who: null }; }
      if (onRemoteDeck.current) return remoteDecks.has(onRemoteDeck.current) ? { act: 'descer', who: onRemoteDeck.current } : null;
      if (ship && ship.sinkT === null && nearWarshipHull(ship, p.x, p.z, warshipHalfBeam(), WARSHIP.BOARD_MARGIN)) return { act: 'subir', who: null };
      for (const d of remoteDecks.values()) if (nearWarshipHull(d.pose, p.x, p.z, warshipHalfBeam(), WARSHIP.BOARD_MARGIN)) return { act: 'subir', who: d.id };
      return null;
    })();
    const shipAct = shipSel?.act ?? null;
    /** pose do navio da ação (o meu ou o do outro) */
    const selPose = shipSel?.who ? remoteDecks.get(shipSel.who)?.pose ?? null : ship;
    // CARONA (02/11): carro de ALIADO perto (a pé) — E senta num banco livre dele
    const caronaCar = drive.mode === 'foot' && !dead && remoteCars.size ? caronaCarNear(p.x, p.z, remoteCars.values(), (id) => { const n = useNet.getState(); return n.players[id]?.side === 'enemy' || n.selfSide === 'enemy'; }) : null;
    {
      const tc = useZsTouch.getState(), drv = drive.mode === 'driving', wet = zsCtx.inWater && drive.mode === 'foot';
      const near = (!!car && car.wreckT === null && drive.mode === 'foot' && !dead && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST) || !!caronaCar;
      const sail = drive.mode === 'sailing', act = near ? null : shipAct, nearSh = !!act, cr = zsCrouch.on, rid = drive.mode === 'riding';
      if (tc.driving !== drv || tc.nearCar !== near || tc.inWater !== wet || tc.sailing !== sail || tc.nearShip !== nearSh || tc.shipAct !== act || tc.crouched !== cr || tc.riding !== rid) useZsTouch.setState({ driving: drv, nearCar: near, inWater: wet, sailing: sail, nearShip: nearSh, shipAct: act, crouched: cr, riding: rid });
    }
    ambAcc.current += dt;
    if (ambAcc.current > 0.1) { ambAcc.current = 0; zsAmbience.update(ambienceAt(t, p, car, ride.current?.mode === 'ride' ? ride.current.speed : 0, ship && (drive.mode === 'sailing' || onDeck.current) ? ship.speed : 0)); }
    // E: entra (perto do carro) / sai A QUALQUER MOMENTO (Pedro 31/10: "no carro apertar e em qualquer momento pode sair
    // dele; se estiver voando cai do alto e desce normal, então só esperar") — no ar o herói cai com a gravidade de sempre
    if (input.eTap) {
      input.eTap = false;
      const lvl = useGameStore.getState().player.level;
      if (drive.mode === 'foot' && car && car.wreckT === null && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST && !isUnlocked('flying_car', lvl)) {
        useGameStore.getState().setMessage(lockedMessage('O carro voador', 'flying_car'));
      } else if (drive.mode === 'foot' && car && car.wreckT === null && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST) {
        drive.mode = 'entering'; drive.enterAt = now; facing.current = Math.atan2(car.x - p.x, car.z - p.z);
      } else if (drive.mode === 'driving' && car) {
        drive.mode = 'foot';
        if (group.current) group.current.visible = true;
        const pc = camera as THREE.PerspectiveCamera; if (pc.fov !== CHASE_FOV) { pc.fov = CHASE_FOV; pc.updateProjectionMatrix(); }
        const side = (dimsRef.current?.width ?? 2.2) / 2 + 1.1; // desce pelo lado do motorista (direita: o volante do modelo é desse lado)
        p.x = car.x - Math.cos(car.yaw) * side; p.z = car.z + Math.sin(car.yaw) * side;
        const g = zsHeightAt(t, p.x, p.z), seatY = car.y + (dimsRef.current?.height ?? 1.4) * SEAT_FOOT_K;
        facing.current = car.yaw; vy.current = 0;
        // rente ao chão: desce do lado, em pé (igual antes); no ar: sai na altura do banco e CAI (o carro vazio desce sozinho)
        if (car.altitude < CAR.EXIT_MAX_ALT || seatY <= g + 0.3) { p.y = g; grounded.current = true; }
        else { p.y = seatY; grounded.current = false; }
      } else if (drive.mode === 'riding') {
        // SAI DA CARONA (02/11): desce pelo lado do banco; no ar, sai na altura do banco e CAI (igual ao motorista)
        const rc = drive.rideWho ? remoteCars.get(drive.rideWho) : undefined;
        drive.mode = 'foot'; drive.rideWho = null;
        if (group.current) group.current.visible = true;
        if (rc) {
          const sx = ((CAR_SEATS[drive.seat]?.x ?? 0.12) >= 0 ? 1 : -1) * ((dimsRef.current?.width ?? 2.2) / 2 + 1.1);
          p.x = rc.x + Math.cos(rc.yaw) * sx; p.z = rc.z - Math.sin(rc.yaw) * sx;
          const g = zsHeightAt(t, p.x, p.z), seatY = carSeatWorld(rc, drive.seat, dimsRef.current).y;
          facing.current = rc.yaw; vy.current = 0;
          if (seatY - g < CAR.EXIT_MAX_ALT + 0.6) { p.y = g; grounded.current = true; } else { p.y = seatY; grounded.current = false; }
          movement.current.set(p.x, 0, p.z);
        }
        useGameStore.getState().setMessage('🚗 Desceu da carona.');
      } else if (drive.mode === 'foot' && caronaCar) {
        // PEGA CARONA (02/11): banco livre do carro do ALIADO — qualquer nível (o nível só trava quem dirige)
        const others = Object.values(useNet.getState().players).filter((o) => o.id !== caronaCar.id).map((o) => ({ x: o.x, z: o.z }));
        const seat = freeCarSeat(caronaCar, dimsRef.current, others), who = useNet.getState().players[caronaCar.id]?.name ?? 'outro jogador';
        if (seat === null) useGameStore.getState().setMessage(`🚗 O carro de ${who} está cheio.`);
        else {
          drive.mode = 'riding'; drive.rideWho = caronaCar.id; drive.seat = seat;
          ride.current = null; dive.current = 0; swimVel.current.set(0, 0); vy.current = 0; zsCrouch.on = false;
          useGameStore.getState().setMessage(`🚗 De carona com ${who}! E = descer`);
        }
      } else if (ship && shipAct === 'pilotar' && !shipSel?.who) {
        // NAVIO DE GUERRA (01/11): no convés, no TIMÃO (popa) → pilota (nível 70)
        if (!isUnlocked(WARSHIP.UNLOCK_ID, lvl)) useGameStore.getState().setMessage(lockedMessage('Pilotar o navio de guerra', WARSHIP.UNLOCK_ID));
        else {
          drive.mode = 'sailing'; ride.current = null; dive.current = 0; swimVel.current.set(0, 0); vy.current = 0; onDeck.current = false;
          camTarget.current.set(ship.x, p.y + 6, ship.z);
          useGameStore.getState().setMessage('⚓ No timão! W/S vela · A/D leme · segure o botão direito pra mirar · clique = canhões · E solta o timão');
        }
      } else if (ship && shipAct === 'construir' && warshipDock.at) {
        // o MEU navio afundou: constrói outro na âncora com recurso da BOLSA (tabela dos veículos, 01/11)
        const r = useGameStore.getState().spendItems(WARSHIP.BUILD_COST);
        if (!r.ok) useGameStore.getState().setMessage('🔨 Pra construir o navio falta: ' + costText(r.missing));
        else {
          const d = warshipDock.at;
          shipRef.current = newWarship(d.x, d.z, d.yaw);
          useGameStore.getState().setMessage('🔨⚓ Navio de guerra construído na âncora! (−' + costText(WARSHIP.BUILD_COST).replace(/ \+ /g, ', −') + ')');
        }
      } else if (car && shipAct === 'construir_carro' && carGarage.at) {
        // o MEU carro explodiu: constrói outro na garagem (nível do carro + recurso da bolsa — 01/11)
        if (!isUnlocked('flying_car', lvl)) useGameStore.getState().setMessage(lockedMessage('O carro voador', 'flying_car'));
        else {
          const r = useGameStore.getState().spendItems(VEHICLE_COST.flying_car);
          if (!r.ok) useGameStore.getState().setMessage('🔨 Pra construir o carro falta: ' + costText(r.missing));
          else {
            const gg = carGarage.at;
            carRef.current = newCar(gg.x, gg.z, gg.yaw, t);
            useGameStore.getState().setMessage('🔨🚗 Carro voador construído na garagem! (−' + costText(VEHICLE_COST.flying_car).replace(/ \+ /g, ', −') + ')');
          }
        }
      } else if (selPose && shipAct === 'descer') {
        // no convés (o meu ou o do outro), longe do timão → DESCE: pula na água do lado mais perto (fora do casco)
        const lp = warshipLocal(selPose, p.x, p.z), side = Math.sign(lp.u || 1), out = warshipWorld(selPose, side * (warshipHalfBeam() + 2.5), lp.v);
        p.x = out.x; p.z = out.z; vy.current = 2.5; grounded.current = false; onDeck.current = false; onRemoteDeck.current = null;
        movement.current.set(p.x, 0, p.z); facing.current = selPose.yaw + side * Math.PI / 2;
      } else if (selPose && shipAct === 'subir') {
        // SOBE A BORDO (qualquer nível — Pedro: "amigos e inimigos sobem também, pirataria"): no convés, do lado de quem chegou
        const rd = shipSel?.who ? remoteDecks.get(shipSel.who) : null;
        const at = rd ? warshipBoardSpot(rd.pose, p.x, p.z, rd.c) : warshipBoardSpot(selPose, p.x, p.z);
        if (at) {
          ride.current = null; dive.current = 0; swimVel.current.set(0, 0); vy.current = 0;
          p.set(at.x, at.y, at.z); movement.current.set(p.x, 0, p.z); grounded.current = true;
          onDeck.current = !rd; onRemoteDeck.current = rd ? rd.id : null;
          useGameStore.getState().setMessage(rd ? '🏴‍☠️ No navio de outro jogador! E = descer (pula na água)'
            : isUnlocked(WARSHIP.UNLOCK_ID, lvl) ? '⚓ A bordo! Vá até o timão (popa) e aperte E pra pilotar · E longe do timão = descer' : '⚓ A bordo! (pilotar: nível ' + unlockLevel(WARSHIP.UNLOCK_ID) + ') · E = descer');
        }
      } else if (drive.mode === 'sailing' && ship) {
        // SOLTA O TIMÃO: fica em pé no convés, no timão (o navio segue no embalo e leva quem está nele)
        drive.mode = 'foot'; warshipAim.on = false; input.cannonAim = false; if (document.pointerLockElement) document.exitPointerLock();
        syncWarshipDeck(ship, clockT);
        const h = warshipWorld(ship, 0, HELM_U * WARSHIP.LENGTH), at = warshipBoardSpot(ship, h.x, h.z) ?? { ...h, y: p.y };
        p.set(at.x, at.y, at.z); movement.current.set(p.x, 0, p.z); facing.current = ship.yaw; grounded.current = true; onDeck.current = true;
        if (group.current) { group.current.visible = true; group.current.rotation.set(0, ship.yaw, 0); }
      } else if (drive.mode === 'foot' && !dead) useGameStore.getState().collectNearest(); // longe do carro: E = pegar/colher (igual ao Vale)
    }
    if (drive.mode === 'entering' && now - drive.enterAt >= ENTER_MS) { drive.mode = 'driving'; input.dist = Math.max(input.dist, 12); if (car) camTarget.current.set(car.x, car.y + 1.8, car.z); }
    // carro ESTACIONADO também tem física (sem comando): boia na onda e é levado por ela (Pedro: "se o hover car estiver
    // parado a onda empurra ele") — antes ele só se mexia com alguém dirigindo
    // sem motorista no AR (saiu voando): desce normal, sozinho
    if (drive.mode !== 'driving' && car) carStep(t, car, { throttle: 0, steer: 0, down: drive.mode === 'foot' && car.altitude > 0.3 }, dt, now);
    // ===== DE CARONA (02/11): sentado no banco do carro do aliado, na pose suavizada dele (a mesma do desenho) =====
    if (drive.mode === 'riding') {
      const rc = drive.rideWho ? remoteCars.get(drive.rideWho) : undefined;
      if (!rc || rc.hp <= 0) {
        // o carro sumiu (ele saiu da sala / guardou) ou EXPLODIU: cai de onde está
        drive.mode = 'foot'; drive.rideWho = null; vy.current = 0; grounded.current = false;
        if (group.current) group.current.visible = true;
        useGameStore.getState().setMessage(rc ? '🔥 O carro explodiu — você caiu!' : '🚗 A carona acabou (o carro sumiu).');
      } else {
        const st = carSeatWorld(rc, drive.seat, dimsRef.current);
        p.set(st.x, st.y, st.z); movement.current.set(p.x, 0, p.z); focusRef.current.copy(p);
        grounded.current = true; vy.current = 0; facing.current = rc.yaw; yawNow.current = rc.yaw;
        if (group.current) { group.current.position.set(st.x, st.y, st.z); group.current.rotation.y = rc.yaw; group.current.visible = true; }
        action.current = 'drive'; speed.current = 0;
        // câmera atrás do carro (a mesma de quem dirige), segue amortecida e gira junto com o carro
        if (now - input.lookAt > 1500) { let d = rc.yaw + Math.PI - input.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; input.yaw += d * Math.min(1, dt * 3); }
        const ct = camTarget.current, follow = 1 - Math.exp(-8 * dt);
        ct.x += (rc.x - ct.x) * follow; ct.y += (rc.y + 1.8 - ct.y) * follow; ct.z += (rc.z - ct.z) * follow;
        const dist = Math.max(input.dist, 10), cp = Math.cos(input.pitch);
        const cx = ct.x + Math.sin(input.yaw) * cp * dist, cz = ct.z + Math.cos(input.yaw) * cp * dist;
        let cyy = ct.y + Math.sin(input.pitch) * dist;
        const gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.6; if (cyy < gcam) cyy = gcam;
        camera.position.set(cx, cyy, cz); camera.lookAt(ct.x, ct.y, ct.z);
        if (sun.current) followSun(sun.current, p);
        hudAcc.current += dt;
        if (hudAcc.current > 0.25) {
          hudAcc.current = 0;
          const who = useNet.getState().players[drive.rideWho!]?.name ?? 'outro jogador';
          onHud({ x: p.x, z: p.z, y: p.y, state: 'de carona com ' + who + ' · E desce (no ar você cai)', near: '', overview: false });
        }
        return;
      }
    }
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
      if (sun.current) followSun(sun.current, p); // sol/luar do relógio do jogo
      hudAcc.current += dt;
      if (hudAcc.current > 0.25) {
        hudAcc.current = 0;
        const cd =Math.max(0, Math.ceil((car.cooldownUntil - now) / 1000)), en = Math.ceil(car.energy);
        const voo = cd > 0 ? 'recarga do voo ' + cd + ' s' : 'Espaço sobe · C desce · energia ' + en + ' s · Shift turbo';
        onHud({ x: car.x, z: car.z, y: car.y, state: 'dirigindo · ' + Math.round(Math.abs(car.speed) * 3.6) + ' km/h · altura ' + car.altitude.toFixed(1) + ' m' + (car.overWater ? ' · sobre a água' : ''), near: '', overview: false, car: voo + ' · V câmera ' + (inside ? 'de fora' : 'de dentro') + ' · E sai (a qualquer hora — no ar você cai)', carTouch: cd > 0 ? 'recarga do voo ' + cd + ' s' : 'energia do voo ' + en + ' s' });
      }
      return;
    }
    // ===== NAVIO DE GUERRA (01/11) — parado: só perde o embalo; navegando: modo próprio, como o carro (encerra o quadro) =====
    if (ship && drive.mode !== 'sailing') {
      const before = { x: ship.x, z: ship.z, yaw: ship.yaw };
      warshipStep(shipSwim, ship, { throttle: 0, steer: 0 }, dt);
      syncWarshipDeck(ship, clockT);
      // em pé no CONVÉS: o navio no embalo leva junto (posição e giro)
      if (onDeck.current && drive.mode === 'foot' && (ship.x !== before.x || ship.z !== before.z || ship.yaw !== before.yaw)) {
        const c = carryOnDeck(before, ship, p.x, p.z), dy = ship.yaw - before.yaw;
        p.x = c.x; p.z = c.z; facing.current += dy; yawNow.current += dy;
        const m = carryOnDeck(before, ship, movement.current.x, movement.current.z); movement.current.set(m.x, 0, m.z);
      }
    }
    // em pé no convés do navio de OUTRO jogador (online): o navio dele andando leva junto — 1× por tique do desenho dele
    if (onRemoteDeck.current && drive.mode === 'foot') {
      const d = remoteDecks.get(onRemoteDeck.current);
      if (!d) onRemoteDeck.current = null; // ele saiu da sala / o navio sumiu: cai onde está
      else if (d.tick !== remoteCarryTick.current) {
        remoteCarryTick.current = d.tick;
        const c = carryOnDeck(d.prev, d.pose, p.x, p.z), dy = d.pose.yaw - d.prev.yaw;
        p.x = c.x; p.z = c.z; facing.current += dy; yawNow.current += dy;
        const m = carryOnDeck(d.prev, d.pose, movement.current.x, movement.current.z); movement.current.set(m.x, 0, m.z);
      }
    }
    // AFUNDOU com você no timão (01/11): cai na água do lado, nadando
    if (ship && ship.sinkT !== null && drive.mode === 'sailing') {
      drive.mode = 'foot'; warshipAim.on = false; input.cannonAim = false; if (document.pointerLockElement) document.exitPointerLock();
      const out = warshipWorld(ship, warshipHalfBeam() + 3, 0);
      p.set(out.x, zsWaterYAt(out.x, out.z), out.z); movement.current.set(p.x, 0, p.z);
      vy.current = 0; grounded.current = false; onDeck.current = false;
      if (group.current) group.current.visible = true;
    }
    if (ship && drive.mode === 'sailing') {
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.stick.z - virtualMove.z;
      const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x + virtualMove.x;
      warshipStep(shipSwim, ship, { throttle: Math.max(-1, Math.min(1, throttle)), steer: Math.max(-1, Math.min(1, steer)) }, dt);
      syncWarshipDeck(ship, clockT);
      const wy = zsWaterYAt(ship.x, ship.z), keelY = wy - WARSHIP_DRAFT, fx = Math.sin(ship.yaw), fz = Math.cos(ship.yaw);
      // herói no TIMÃO (popa), em pé, olhando pra frente
      const hu = HELM_U * WARSHIP.LENGTH, hx = ship.x + fx * hu, hz = ship.z + fz * hu, hy = keelY + warshipDims.helmY;
      p.set(hx, hy, hz); focusRef.current.copy(p);
      if (group.current) { group.current.position.set(hx, hy, hz); group.current.rotation.set(0, ship.yaw, 0); group.current.visible = true; }
      action.current = 'idle'; speed.current = 0; yawNow.current = ship.yaw;
      audioManager.setFootsteps(false); // no timão não é caminhada (os passos ficavam ligados de quando andava no convés)
      // câmera: atrás do navio, alto e longe (o navio tem 32 m); mirando, fica onde você pôs (escolhe o costado)
      const aiming = input.cannonAim || touchLayout.on;
      if (!input.cannonAim && now - input.lookAt > 2500) { let d = ship.yaw + Math.PI - input.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; input.yaw += d * Math.min(1, dt * 1.2); }
      const ct = camTarget.current, follow = 1 - Math.exp(-5 * dt);
      ct.x += (ship.x - ct.x) * follow; ct.y += (keelY + 9 - ct.y) * follow; ct.z += (ship.z - ct.z) * follow;
      const dist = Math.max(34, input.dist * 3.2), cp = Math.cos(input.pitch);
      const cx = ct.x + Math.sin(input.yaw) * cp * dist, cz = ct.z + Math.cos(input.yaw) * cp * dist;
      let cyy = ct.y + Math.sin(input.pitch) * dist;
      const gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.8; if (cyy < gcam) cyy = gcam;
      const persp = camera as THREE.PerspectiveCamera; if (Math.abs(persp.fov - CHASE_FOV) > 0.05) { persp.fov = CHASE_FOV; persp.updateProjectionMatrix(); }
      camera.position.set(cx, cyy, cz); camera.lookAt(ct.x, ct.y, ct.z);
      // MIRA: o costado sai de pra onde a câmera olha; a inclinação dela dá o alcance (arco + anel de onde cai)
      const viewYaw = input.yaw + Math.PI, side = cannonSide(ship.yaw, viewYaw), elev = cannonElevation(input.pitch);
      // a mira GIRA pra frente/trás do través seguindo a câmera (Pedro 01/11: "mirar mais pra frente ou pra trás")
      const swingOf = (sd: WarshipSide) => (sd === side ? cannonSwing(ship, sd, viewYaw) : 0);
      const gunY = keelY + warshipDims.gunY;
      // onde a bala cai: chão/água — e o CONVÉS do navio de outro jogador (online, 01/11: a bala bate no navio inimigo e
      // o splash acerta quem está nele, em vez de atravessar o casco e cair na água)
      const surfaceAt = (x: number, z: number) => {
        let y = Math.max(zsHeightAt(t, x, z), zsWaterYAt(x, z));
        for (const d of remoteDecks.values()) { const g = shipGround(d.c, x, z, 1e6); if (g && 'y' in g) y = Math.max(y, g.y); }
        return y;
      };
      if (aiming) { const mid = cannonSalvo(ship, side, elev, gunY, swingOf(side))[1]!; warshipAim.on = true; warshipAim.ball = mid; warshipAim.land = ballLanding(mid, surfaceAt); }
      else warshipAim.on = false;
      // TIRO: salva de 3 balas do costado (recarga por lado)
      if (input.cannonFire) {
        const sd: WarshipSide = input.cannonFire === 'aim' ? side : input.cannonFire;
        input.cannonFire = null;
        const nome = sd === 'port' ? 'bombordo' : 'boreste';
        if (ship.reload[sd] > 0) useGameStore.getState().setMessage(`🔄 Canhões de ${nome} recarregando (${Math.ceil(ship.reload[sd])} s).`);
        else {
          const salvo = cannonSalvo(ship, sd, elev, gunY, swingOf(sd));
          const lands = salvo.map((b) => ballLanding(b, surfaceAt));
          salvo.forEach((b, i) => { warshipFx.balls.push({ b, t0: now + i * WARSHIP.SALVO_GAP_MS, land: lands[i]!, hit: false }); });
          // ONLINE (01/11): os outros VEEM e OUVEM a salva (o dano é resolvido aqui, no impacto — cannonHit)
          broadcastCannon(salvo.map((b) => [b.ox, b.oy, b.oz, b.vx, b.vy, b.vz]), lands.map((l) => [l.x, l.y, l.z, l.t]), WARSHIP.SALVO_GAP_MS);
          ship.reload[sd] = WARSHIP.RELOAD_S;
          for (let i = 0; i < salvo.length; i++) window.setTimeout(() => audioManager.playWorld('cannon', 1), i * WARSHIP.SALVO_GAP_MS); // cada bala, o seu estrondo
          useGameStore.getState().setMessage(`💥 Fogo de ${nome}!`);
        }
      }
      if (sun.current) followSun(sun.current, p);
      hudAcc.current += dt;
      if (hudAcc.current > 0.25) {
        hudAcc.current = 0;
        const rl = (s: WarshipSide) => (ship.reload[s] > 0 ? Math.ceil(ship.reload[s]) + ' s' : 'pronto');
        onHud({ x: ship.x, z: ship.z, y: wy, state: 'navio de guerra · casco ' + ship.hp + '/' + WARSHIP.HP + ' · ' + Math.round(Math.abs(ship.speed) * 3.6) + ' km/h · bombordo ' + rl('port') + ' · boreste ' + rl('starboard'), near: '', overview: false, car: 'W/S vela · A/D leme · segure o botão direito = mira (o lado pra onde a câmera olha; mais alto = mais longe) · clique = canhões · E desembarca' });
      }
      return;
    }
    warshipAim.on = false;
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
      if (gl || sk) zsCrouch.on = false; // na asa/no skate não tem agachado
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
        if (sun.current) followSun(sun.current, p);
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
    // NAVIO: em pé no convés não é "nadar", mesmo com o mar embaixo (zs-ship) — o galeão encalhado e o navio de guerra
    const deckAt = (x: number, z: number, feetY: number) => {
      const a = shipGround(zsShip.c, x, z, feetY) ?? shipGround(zsWarshipDeck.c, x, z, feetY);
      if (a) return a;
      for (const d of remoteDecks.values()) { const g = shipGround(d.c, x, z, feetY); if (g) return g; } // navio de outro jogador
      return null;
    };
    const deckNow = drive.mode === 'foot' ? deckAt(p.x, p.z, p.y) : null;
    const water0 = caveNow || (deckNow && !('wall' in deckNow)) ? { swimming: false, wading: false } : zsWaterState(zsHeightAt(t, p.x, p.z));
    const shift = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.stick.x, input.stick.z) > 0.92 || Math.hypot(virtualMove.x, virtualMove.z) > 0.92;
    const moveBonus = 1 + effectiveAttributes(gs.player).moveSpeed / 100; // atributo Velocidade (igual ao Vale)
    let autoRun = false, dodging = false;
    // AGACHAR (02/11, PvP): Ctrl/botão alterna — só a pé, em terra (na água, no carro, no navio, morto: em pé)
    const landFoot = drive.mode === 'foot' && !dead && !water0.swimming && !water0.wading;
    if (input.crouchTap) { input.crouchTap = false; if (landFoot) zsCrouch.on = !zsCrouch.on; }
    if (!landFoot) zsCrouch.on = false;
    const run = shift && !water0.swimming && !zsCrouch.on; // agachado não corre
    const wantMove = Math.hypot(wx, wz) > 0.05 && drive.mode === 'foot';
    // Piloto automático também na ÁGUA: sem input manual, o nado/vadeio segue o alvo do piloto (movement.current),
    // igual ao branch de TERRA mais abaixo. Sem isto o herói fica boiando preso quando o AUTO manda caçar e ele está
    // na água (não sai sozinho). SÓ com o AUTO ligado (31/10): no manual o alvo fica velho na areia (a água não o atualiza)
    // e soltar a tecla nadando fazia o herói voltar sozinho até onde entrou no mar.
    let awx = wx, awz = wz, aWantMove = wantMove;
    if (!wantMove && !dead && drive.mode === 'foot' && gs.objectives.mode === 'idle') {
      const af = autoFollowDir(movement.current.x, movement.current.z, p.x, p.z);
      if (af.has) { awx = af.x; awz = af.z; aWantMove = true; }
    }
    let v = (zsCrouch.on ? ZS_CROUCH_SPEED : run ? ZS_RUN : ZS_WALK) * (water0.wading ? 0.75 : 1) * moveBonus;
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
      // RASTRO da prancha (Pedro 01/11): em pé na onda (não no ar), sai da rabeta
      if (r.mode === 'ride' && !r.air) {
        const by = boardYaw.current;
        zsBoardWake.active = true; zsBoardWake.x = p.x - Math.sin(by) * 0.9; zsBoardWake.z = p.z - Math.cos(by) * 0.9; zsBoardWake.yaw = by; zsBoardWake.speed = r.speed;
      }
      swimVel.current.set(r.mode === 'paddle' ? r.vx : 0, r.mode === 'paddle' ? r.vz : 0);
      bodysurf.current = false; tumble.current = 0;
    } else if ((water0.swimming || water0.wading) && drive.mode === 'foot') {
      // NA ÁGUA (nadando ou no raso) com embalo: a velocidade vai suave até a desejada (e desliza ao soltar)
      const sv = swimVel.current, target = !aWantMove ? 0 : water0.swimming ? (shift ? ZS_SWIM_FAST : ZS_SWIM) : v;
      const kk = 1 - Math.exp(-ZS_SWIM_GLIDE * dt);
      sv.x += (awx * target - sv.x) * kk; sv.y += (awz * target - sv.y) * kk;
      v = sv.length(); moving = v > 0.35;
      // a onda leva quem está nadando (espuma forte, face média) — somado à braçada. JACARÉ (surf de peito, Pedro 28/10):
      // nadando A FAVOR da onda (rumo à praia) você "pega" ela e vai um pouco mais rápido que ela (corpo desliza pouco)
      let pw = 0;
      if (water0.swimming && zsWaterPushAt(p.x, p.z, HERO_PUSH, p.y + 0.3)) {
        const pm = Math.hypot(HERO_PUSH.x, HERO_PUSH.z), along = aWantMove ? Math.max(0, (awx * HERO_PUSH.x + awz * HERO_PUSH.z) / pm) : 0;
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
        if (al > 0.15) { mx = ax / al; mz = az / al; mv = ZS_RUN * moveBonus; autoRun = true; zsCrouch.on = false; } // o piloto corre (em pé)
      }
      // atacar PARA o herói no chão; no AR (pulando atirando, 02/11) o pulo segue o embalo
      if ((atkT.current > 0 && grounded.current) || isGrabbed() || dead || drive.mode !== 'foot') { mx = 0; mz = 0; }
      const dreq = takeDodgeRequest();
      if (dreq && !isGrabbed() && !dead && drive.mode === 'foot') {
        const d = dreq.dir ?? (mx || mz ? { x: mx, z: mz } : { x: Math.sin(facing.current), z: Math.cos(facing.current) });
        if (startDodge(d.x, d.z)) atkT.current = 0;
      }
      const dg = activeDodge(); dodging = !!dg;
      if (dg) zsCrouch.on = false; // rolou: levanta
      const wadeK = caveNow && caveWade.current ? 0.7 : 1; // poça da caverna: água no joelho
      let dx = mx * mv * dt * wadeK, dz = mz * mv * dt * wadeK;
      if (dg) { const sp = dodgeSpeed(dg.t); dx = dg.dirX * sp * dt; dz = dg.dirZ * sp * dt; }
      const shove = takeKnockback('player', dt); if (shove) { dx += shove.x; dz += shove.z; }
      // CAVERNA: dentro (ou entrando pela boca) o chão e as paredes são os dela; fora, o mapa como sempre
      const cm = drive.mode === 'foot' && (caveNow || dx || dz) ? caveMove(t, p.x, p.z, p.y, dx, dz) : null;
      caveWade.current = !!cm?.wading;
      // RAMPA DE VOO LIVRE (02/11): em cima do deck anda livre (o barranco embaixo não é "parede"); o parapeito segura dos lados
      const onRampNow = !cm && zsRampFloor(p.x, p.z, p.y) > -Infinity;
      st = cm ? { x: cm.x, z: cm.z, ground: cm.ground, swimming: false, wading: cm.wading }
        : onRampNow && (dx || dz) ? (() => { const q = rampStep(p.x, p.z, dx, dz); return { x: q.x, z: q.z, ground: zsHeightAt(t, q.x, q.z), swimming: false, wading: false }; })()
        : dx || dz ? zsStep(t, p.x, p.z, dx, dz) : { x: p.x, z: p.z, ground: zsHeightAt(t, p.x, p.z), ...water0 };
      moving = Math.hypot(dx, dz) > 0.05 * dt; v = Math.hypot(dx, dz) / dt;
      swimVel.current.set(dx / dt, dz / dt); // entra na água com o embalo de quem vinha
      if (dg) facing.current = Math.atan2(dg.dirX, dg.dirZ);
      else if (moving && (mx || mz)) facing.current = Math.atan2(mx, mz);
    }
    // BASE (igual ao Vale): parede da casa (a do andar dos pés) e cerca (muro/torre) são sólidas; entra pela porta/portão
    if (drive.mode === 'foot' && !st.swimming && !zsCave.inCave && (st.x !== p.x || st.z !== p.z)) {
      let [bx, bz] = pushOutHouseWalls(st.x, st.z, HERO_RADIUS, p.y);
      [bx, bz] = pushOutBasePieces(bx, bz, HERO_RADIUS);
      if (bx !== st.x || bz !== st.z) st = { ...st, x: bx, z: bz, ground: zsHeightAt(t, bx, bz) };
    }
    zsCtx.inWater = st.swimming;
    shiftWas.current = shift;
    // NAVIO: o convés é chão; o casco é PAREDE pra quem vem de baixo (água/areia); a prancha é rampa
    if (drive.mode === 'foot') {
      let sg = deckAt(st.x, st.z, p.y);
      if (sg && 'wall' in sg) { st = { ...st, x: p.x, z: p.z }; sg = deckAt(p.x, p.z, p.y); }
      if (sg && !('wall' in sg)) st = { ...st, ground: sg.y, swimming: false, wading: false };
      // no convés do NAVIO DE GUERRA (não do galeão) = vai junto quando ele anda — o MEU ou o de OUTRO jogador
      const stand = !!sg && !('wall' in sg) && p.y > ZS_WATER_Y + 0.5 && !shipGround(zsShip.c, st.x, st.z, p.y);
      const mineG = stand ? shipGround(zsWarshipDeck.c, st.x, st.z, p.y) : null;
      onDeck.current = !!mineG && !('wall' in mineG);
      let rem: string | null = null;
      if (stand && !onDeck.current) for (const d of remoteDecks.values()) { const g = shipGround(d.c, st.x, st.z, p.y); if (g && !('wall' in g)) { rem = d.id; break; } }
      onRemoteDeck.current = rem;
    } else if (drive.mode !== 'sailing') { onDeck.current = false; onRemoteDeck.current = null; }
    p.x = st.x; p.z = st.z;
    // caverna: chão bem abaixo do pé (o buraco da boca, a beirada) = cai de verdade; o teto segura o pulo
    if (caveNow || caveInside(p.x, p.y, p.z)) {
      if (grounded.current && st.ground < p.y - 0.8) { grounded.current = false; vy.current = 0; }
      if (!grounded.current && vy.current > 0 && caveField(p.x, p.y + 1.85, p.z) > -0.05) vy.current = 0;
    }
    // vertical: pulo (só fora d'água funda) + chão / nado
    // agachado: o Espaço LEVANTA (não pula — igual aos jogos de tiro); só pula de novo depois de soltar
    if (k.has('Space') && zsCrouch.on) { zsCrouch.on = false; crouchStand.current = true; }
    if (!k.has('Space')) crouchStand.current = false;
    if (k.has('Space') && !crouchStand.current && grounded.current && !st.swimming && drive.mode === 'foot' && !dead) { vy.current = 6.2; grounded.current = false; }
    dive.current = st.swimming && drive.mode === 'foot' ? zsDiveStep(dive.current, k.has('KeyC'), ZS_WATER_Y - st.ground, dt) : 0;
    // altura de quem nada vai junto: dentro do tubo o nível é o chão da cavidade (dá pra entrar), por fora é o topo
    const rm = ride.current?.mode, rolling = rm === 'wipe' || tumble.current > 0;
    if (rm) dive.current = 0;
    const waterY = st.swimming ? zsWaterYAt(p.x, p.z, p.y + 0.3) : 0;
    // rampa de voo livre (02/11): o deck é chão; saiu pela PONTA (o chão some lá embaixo) = cai de verdade (a asa abre)
    const rampY = !st.swimming && !zsCave.inCave ? zsRampFloor(p.x, p.z, p.y) : -Infinity;
    if (onRamp.current && rampY === -Infinity && grounded.current && st.ground < p.y - 0.8) { grounded.current = false; vy.current = 0; }
    onRamp.current = rampY > -Infinity;
    const floor = !st.swimming ? (!zsCave.inCave ? Math.max(st.ground, houseFloorSurfaceY(p.x, p.z), houseWalkFloorY(p.x, p.z, p.y), rampY) : st.ground)
      : rm === 'popup' || rm === 'ride' ? waterY + BOARD_DECK                 // em pé no deck
      : rm === 'paddle' ? waterY + BOARD_DECK + 0.07                         // deitado EM CIMA do deck (acima da água)
      : rolling ? waterY - 0.6                                               // vaca: embaixo da espuma
      : waterY - (moving || dive.current > 0.3 ? ZS_SWIM_SINK_MOVE : ZS_SWIM_SINK) - dive.current; // boia NA onda
    if (!grounded.current) { vy.current -= 15 * dt; p.y += vy.current * dt; if (p.y <= floor) { p.y = floor; grounded.current = true; vy.current = 0; } }
    else if (rm === 'ride' && ride.current?.air) p.y = ride.current.y + BOARD_DECK; // AÉREO: a altura é a do voo
    else p.y += (floor - p.y) * Math.min(1, dt * (rm === 'ride' || rm === 'popup' ? 12 : st.swimming ? 3 : 30)); // em pé gruda na face; nadando sobe/desce macio
    if (drive.mode === 'foot') action.current = dead ? 'death' : rm === 'paddle' ? 'paddle' : rm === 'popup' ? 'popup' : rm === 'ride' ? 'surf' : rolling ? 'swim'
      : st.swimming ? (moving || dive.current > 0.3 ? 'swim' : 'tread') : dodging ? 'dodge'
      // PvP (02/11): atirando NO AR = pulo + tiro por cima; agachado parado/andando/atirando
      : atkT.current > 0 ? (!grounded.current ? 'jump_shoot' : zsCrouch.on ? 'crouch_attack' : 'attack')
      : !grounded.current ? 'jump' : zsCrouch.on ? (moving ? 'crouch_walk' : 'crouch') : moving ? (run || autoRun ? 'run' : 'walk') : 'idle';
    if (import.meta.env.DEV) (window as unknown as { __zsHero?: unknown }).__zsHero = { action: action.current, crouch: zsCrouch }; // testes de tela
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
    // CÂMERA DE CIMA (MOBA, 03/11 — zs-camera.ts): ângulo fixo, lente longa e distância própria; mirando desce pro ombro
    // (a inclinação do ombro, `input.pitch`, fica guardada); na caverna vira ombro sozinha e volta ao sair
    const wantMoba = useZsCam.getState().mode === 'cima' && !zsCave.inCave ? 1 : 0;
    mobaK.current += (wantMoba - mobaK.current) * Math.min(1, dt * ZS_MOBA.BLEND);
    if (Math.abs(wantMoba - mobaK.current) < 0.002) mobaK.current = wantMoba;
    const mk = mobaK.current;
    const baseDist = input.dist + (input.mobaDist - input.dist) * mk;
    const basePitch = input.pitch + (ZS_MOBA.PITCH - input.pitch) * mk * (1 - ak);
    const baseFov = CHASE_FOV + (ZS_MOBA.FOV - CHASE_FOV) * mk;
    let camDist = baseDist + (TUBE_CAM_DIST - baseDist) * tk;
    camDist += ((touchAim ? AIM_DIST_TOUCH : AIM_DIST) - camDist) * ak;
    const camPitch = basePitch + (TUBE_CAM_PITCH - basePitch) * tk - recoil.current.x; // coice levanta a mira
    const yawC = input.yaw + recoil.current.y;
    const persp = camera as THREE.PerspectiveCamera;
    const wantFov = baseFov + ((touchAim ? AIM_FOV_TOUCH : AIM_FOV) / Math.max(1, aim.zoom) - baseFov) * ak;
    if (Math.abs(persp.fov - wantFov) > 0.05) { persp.fov = wantFov; persp.updateProjectionMatrix(); }
    // câmera em órbita, sem entrar no chão; mirando, o apoio vai pro ombro (celular: o OUTRO ombro, longe dos botões)
    const sh = AIM_SHOULDER * ak * (touchAim ? -1 : 1);
    zsCrouch.k += ((zsCrouch.on ? 1 : 0) - zsCrouch.k) * Math.min(1, dt * 8); // agachado: a câmera desce junto (02/11)
    const tx = p.x + Math.cos(yawC) * sh, ty = p.y + 1.6 - 0.05 * ak - ZS_CROUCH_CAM_DROP * zsCrouch.k + (rm === 'ride' ? SURF_LIFT * 0.6 : 0), tz = p.z - Math.sin(yawC) * sh;
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
      let gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.6;
      // no convés do navio de guerra: a câmera não desce pra dentro do casco
      const camDeck = onDeck.current ? zsWarshipDeck.c : onRemoteDeck.current ? remoteDecks.get(onRemoteDeck.current)?.c ?? null : null;
      if (camDeck) { const dg = shipGround(camDeck, cx, cz, 1e6); if (dg && 'y' in dg) gcam = Math.max(gcam, dg.y + 0.6); }
      if (cyy < gcam) cyy = gcam;
      camera.position.set(cx, cyy, cz);
    }
    camera.lookAt(tx, ty, tz);
    if (mk > 0.5) {
      // de cima: a árvore NA FRENTE do herói some em pontilhado (zs-see-through) — mirando (no ombro) não
      if (ak < 0.5 && !zsCave.inCave) { zsSeeThrough.on.value = 1; zsSeeThrough.cam.value.copy(camera.position); zsSeeThrough.hero.value.set(p.x, ty - 0.5, p.z); }
      // dentro da casa da base: o telhado some (igual à câmera de cima do Vale); no 2º andar, o de cima
      housePlayerFeetY.current = houseWalkFloorY(p.x, p.z, p.y);
      housePlayerInside.current = !zsCave.inCave && houseFloorSurfaceY(p.x, p.z) !== -Infinity;
      // PC: TIRO LIVRE no cursor (chão na altura do herói), como no Vale — "fresco" enquanto o mouse se mexe
      if (!touchLayout.on && input.mouse.at > 0) {
        zsCursorRay.setFromCamera(zsCursorNdc.set(input.mouse.x, input.mouse.y), camera);
        zsCursorPlane.constant = -p.y;
        if (zsCursorRay.ray.intersectPlane(zsCursorPlane, zsCursorHit)) setIsoCursor(zsCursorHit.x, zsCursorHit.z, input.mouse.at);
      }
    }
    const shake = impactShake(); // soco de impacto quando um golpe acerta
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3; camera.position.z += (Math.random() - 0.5) * shake * 0.3; }
    // sol + sombra seguem o herói
    if (sun.current) followSun(sun.current, p); // sol/luar do relógio do jogo
    hudAcc.current += dt;
    if (hudAcc.current > 0.25) {
      hudAcc.current = 0;
      let best = '', bd = 700;
      for (const l of ZS_LANDMARKS) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd) { bd = d; best = `${l.name} (${Math.round(d)} m)`; } }
      if (zsCave.inCave) best = `${caveRoomName(p.x, p.z)} (caverna, ${Math.max(0, Math.round(zsHeightAt(t, p.x, p.z) - p.y))} m de rocha em cima)`;
      const nearCar = car && car.wreckT === null && drive.mode === 'foot' && Math.hypot(car.x - p.x, car.z - p.z) < CAR.ENTER_DIST;
      const shipTxt = nearCar || !shipAct ? '' : shipAct === 'construir' ? 'seu navio afundou · E = construir outro (' + costText(WARSHIP.BUILD_COST) + ')'
        : shipAct === 'construir_carro' ? 'seu carro explodiu · E = construir outro (' + costText(VEHICLE_COST.flying_car) + ')'
        : shipAct === 'subir' ? 'E = subir no navio de guerra'
        : shipAct === 'pilotar' ? 'E = pilotar (timão' + (isUnlocked(WARSHIP.UNLOCK_ID, gs.player.level) ? '' : ', nível ' + unlockLevel(WARSHIP.UNLOCK_ID)) + ')'
        : shipSel?.who ? 'no navio de outro jogador · E = descer (pula na água)' : 'no convés · timão na popa · E = descer (pula na água)';
      const surfTxt = rm === 'paddle' ? (popOk.current ? 'a onda te pegou — ESPAÇO levanta!' : 'remando na prancha · Shift rema forte · espere a onda')
        : rm === 'popup' ? 'levantando…' : rm === 'ride' && ride.current ? (ride.current.trickT > 0 ? ride.current.trick.toUpperCase() + ' · ' : '') + (ride.current.air ? 'NO AR! segure A ou D pra girar' : 'SURFANDO ' + Math.round(ride.current.speed * 3.6) + ' km/h · A/D vira (carving) · W acelera · S freia · Shift = boost · desça a face = ganha velocidade · suba rápido no lip = aéreo') + (ride.current.airs ? ' · aéreos: ' + ride.current.airs : '')
        : rolling ? 'tomou a vaca! girando com a espuma…' : '';
      onHud({ canPop: rm === 'paddle' && popOk.current, x: p.x, z: p.z, y: p.y, state: surfTxt ? surfTxt : drive.mode === 'entering' ? 'entrando no carro' : st.swimming && dive.current > 0.3 ? 'mergulhando · ' + dive.current.toFixed(1) + ' m (solte o C pra subir)' : st.swimming && bodysurf.current ? 'pegando jacaré!' : st.swimming ? (moving ? 'nadando · C mergulha' : 'boiando · C mergulha') : st.wading ? 'na água rasa' : !grounded.current ? 'pulando' : zsCrouch.on ? (moving ? 'andando agachado' : 'agachado') : run && moving ? 'correndo' : moving ? 'andando' : 'parado', near: best, overview: false, car: nearCar ? 'E = entrar no carro voador' : shipTxt || undefined,
        carTouch: !nearCar && (shipAct === 'construir' || shipAct === 'construir_carro') ? shipTxt.replace(' · E = ', ' · ') : undefined });
    }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={2.1} color="#fff4e0" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-camera-far={300} shadow-bias={-0.0004} />
      <group ref={group}>
        <HeroNameplate />
        <Suspense fallback={null}>
          <LocalHeroBody actionRef={action} speedRef={speed} autoHeight={HERO_HEIGHT * 1.04} customClips={HERO_CLIPS} customClipCut={HERO_CUT} preview rangedAttack weapon={<HeldItem c={c} />} />
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

/** "Sair do site?" só enquanto o Ctrl (agachar) está apertado — Ctrl+W fecha a aba e o navegador não deixa o jogo
 *  impedir; com isto ele pergunta antes. Solto o Ctrl, sai (recarregar a página segue normal). */
const leaveGuard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
let leaveGuardOff = 0;
function armLeaveGuard() { window.clearTimeout(leaveGuardOff); window.addEventListener('beforeunload', leaveGuard); }
function releaseLeaveGuard() { window.clearTimeout(leaveGuardOff); leaveGuardOff = window.setTimeout(() => window.removeEventListener('beforeunload', leaveGuard), 400); }

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
      // AGACHAR (02/11): Ctrl alterna. No navegador Ctrl+W FECHA A ABA (o jogo não pode impedir) → enquanto o Ctrl está
      // apertado o jogo liga o "Sair do site?" (esbarrou no W: pergunta antes de fechar). Ctrl+A/S/D/Espaço: o jogo segura.
      if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat) { input.crouchTap = true; armLeaveGuard(); }
      if (e.ctrlKey && (e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space')) e.preventDefault();
      // V a pé = troca a câmera de JOGO: ombro ↔ de cima (MOBA), igual ao V e ao botão Câmera do Vale (03/11 — antes
      // levava pra vista do mapa, solta do herói; essa segue no K). Na vista do mapa, V volta pro jogo. Dirigindo = carro.
      if (e.code === 'KeyV' && !e.repeat) {
        if (drive.mode === 'driving') { input.carCam = input.carCam === 'chase' ? 'cockpit' : 'chase'; input.cockYaw = 0; input.cockPitch = 0; }
        else if (input.overview) input.overview = false;
        else toggleZsCam();
      }
      input.keys.add(e.code); if (e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => { input.keys.delete(e.code); if (e.code === 'ControlLeft' || e.code === 'ControlRight') releaseLeaveGuard(); };
    const blur = () => { input.keys.clear(); releaseLeaveGuard(); };
    const look = new Map<number, { x: number; y: number }>(), stick = new Map<number, { x: number; y: number }>();
    /** PINÇA (03/11, celular): os DEDOS (não o mouse) que estão no mundo — com 2, abrir/fechar = zoom, sem girar */
    const touchLook = new Set<number>();
    let pinchSpan = 0;
    const span = () => {
      let a: { x: number; y: number } | undefined, b: { x: number; y: number } | undefined;
      for (const id of touchLook) { const v = look.get(id); if (!v) continue; if (!a) a = v; else if (!b) b = v; }
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    /** clique ESQUERDO curto (sem arrastar) = atacar; arrastar = girar a câmera */
    let press: { x: number; y: number; at: number } | null = null;
    const locked = () => document.pointerLockElement === el;
    const canFight = () => !zsPause.on && drive.mode === 'foot' && !input.overview;
    // NAVIO DE GUERRA (01/11): clique = salva de canhão pro lado pra onde a câmera olha (o quadro do herói resolve)
    const fire = () => { if (drive.mode === 'sailing' && !zsPause.on) { input.cannonFire = 'aim'; return; } if (!canFight()) return; if (!(useAim.getState().active && aimFire())) zsAttack.fn?.(); };
    // o MUNDO inteiro (canvas + plaquinhas de vida/nome em HTML por cima): clicar num bicho com plaquinha na frente
    // também ataca (29/10: o clique caía na plaquinha e o golpe não saía). Botões/campos da tela ficam de fora.
    const host = (el.parentElement ?? el) as HTMLElement;
    const ui = (e: Event) => e.target instanceof Element && !!e.target.closest('button, input, textarea, select, a');
    // BOTÕES DO MOUSE pelos eventos de MOUSE (igual ao Vale): com o direito segurado (mirando), o clique do esquerdo
    // NÃO gera "pointerdown" (botões juntos viram só "pointermove" pela regra dos eventos de ponteiro) — o tiro mirando
    // não saía. "mousedown" avisa cada botão.
    const mdown = (e: MouseEvent) => {
      if (ui(e)) return;
      // navio: segura o direito = mira dos canhões — com o mouse PRESO como na mira a pé (Pedro 01/11: "a seta do mouse
      // aparecendo fica ruim pra jogar"): some a seta e o movimento gira a mira/elevação
      if (e.button === 2 && drive.mode === 'sailing') { input.cannonAim = true; if (!zsPause.on) el.requestPointerLock?.(); return; }
      if (e.button === 2) { if (canFight()) { setAiming(true); el.requestPointerLock?.(); } return; } // MIRA: segura o direito
      if (e.button !== 0) return;
      if (locked() || useAim.getState().active) { fire(); return; } // mirando: clicou, atirou
      press = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 2) { input.cannonAim = false; setAiming(false); if (locked()) document.exitPointerLock(); }
      if (e.button === 0 && press && performance.now() - press.at < 350) fire(); // clique curto (sem arrastar) = ataque
      if (e.button === 0) press = null;
    };
    const down = (e: PointerEvent) => {
      if (ui(e)) return;
      host.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse' && e.button !== 0) return; // direito = mira (mdown); arrastar gira só com o esquerdo
      // celular: com os controles do JOGO na tela (joystick/atacar/poderes), o dedo no mundo só gira a câmera
      if (e.pointerType === 'touch' && !touchLayout.on && e.clientX < el.clientWidth * 0.45) stick.set(e.pointerId, { x: e.clientX, y: e.clientY });
      else {
        look.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (e.pointerType === 'touch') { touchLook.add(e.pointerId); pinchSpan = span(); }
      }
    };
    const move = (e: PointerEvent) => {
      if (locked()) { // mira com o mouse preso: giro pelo movimento (sensibilidade cai com o zoom)
        const sens = 0.0025 * aimSensitivityScale();
        input.yaw -= e.movementX * sens; input.pitch = Math.max(-0.5, Math.min(1.35, input.pitch + e.movementY * sens));
        input.lookAt = performance.now(); noteManualLook();
        return;
      }
      // mouse no PC (câmera de cima: o tiro livre vai no cursor)
      if (e.pointerType === 'mouse') {
        const r = el.getBoundingClientRect();
        input.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; input.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1; input.mouse.at = performance.now();
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
        // PINÇA: 2 dedos no mundo = zoom (de cima: a distância dela; ombro/carro: a de sempre; mapa: a altura)
        if (touchLook.size >= 2 && touchLook.has(e.pointerId)) {
          l.x = e.clientX; l.y = e.clientY;
          const sp = span();
          if (pinchSpan > 0 && sp > 0 && !useAim.getState().active) {
            if (input.overview) input.ov.alt = pinchDist(input.ov.alt, pinchSpan, sp, 60, 2600);
            else if (mobaOn()) input.mobaDist = pinchDist(input.mobaDist, pinchSpan, sp, ZS_MOBA.MIN, ZS_MOBA.MAX);
            else input.dist = pinchDist(input.dist, pinchSpan, sp, ZS_SHOULDER_DIST.MIN, ZS_SHOULDER_DIST.MAX);
          }
          pinchSpan = sp;
          return;
        }
        input.yaw -= (e.clientX - l.x) * 0.006;
        if (input.overview) input.ov.pitch = Math.max(0.35, Math.min(1.5, input.ov.pitch + (e.clientY - l.y) * 0.004));
        else if (!mobaOn()) input.pitch = Math.max(-0.15, Math.min(1.35, input.pitch + (e.clientY - l.y) * 0.005)); // de cima: só gira
        l.x = e.clientX; l.y = e.clientY;
      }
      const s = stick.get(e.pointerId);
      if (s) { input.stick.x = Math.max(-1, Math.min(1, (e.clientX - s.x) / 60)); input.stick.z = Math.max(-1, Math.min(1, (e.clientY - s.y) / 60)); }
    };
    const up = (e: PointerEvent) => {
      look.delete(e.pointerId); if (stick.delete(e.pointerId)) { input.stick.x = 0; input.stick.z = 0; }
      if (touchLook.delete(e.pointerId)) pinchSpan = span();
    };
    const menu = (e: MouseEvent) => e.preventDefault(); // botão direito é a mira, não o menu do navegador
    const wheel = (e: WheelEvent) => {
      if (useAim.getState().active) { aimZoomStep(e.deltaY < 0 ? 1 : -1); e.preventDefault(); return; } // mirando: zoom da mira
      const f = e.deltaY > 0 ? 1.12 : 0.89;
      if (input.overview) input.ov.alt = Math.max(60, Math.min(2600, input.ov.alt * f));
      else if (mobaOn()) input.mobaDist = Math.max(ZS_MOBA.MIN, Math.min(ZS_MOBA.MAX, input.mobaDist * f)); // de cima: a dela
      else input.dist = Math.max(ZS_SHOULDER_DIST.MIN, Math.min(ZS_SHOULDER_DIST.MAX, input.dist * f));
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
        {/* celular (Pedro 02/11: "um card muito grande, horrível"): sem "Espaço sobe · C desce · E sai…" — são os botões do arco */}
        {(touch ? hud.carTouch : hud.car) && <em>{touch ? hud.carTouch : hud.car}</em>}
        <small className="zs-hud__keys">{hud.overview
          ? 'VISTA DO MAPA · WASD move · Shift rápido · roda sobe/desce · K volta'
          : touch ? 'joystick anda · arraste gira a câmera · 2 dedos = zoom' : 'WASD anda · clique ataca · botão direito mira · Espaço pula · Ctrl agacha · E carro/pegar · C mergulha · V câmera (ombro/de cima) · K mapa · P FPS'}</small>
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

/** O MAR (água + ondas): some lá dentro da caverna (`zsCave.seaOff`) — o plano da água cortava o túnel abaixo do nível do mar. */
function ZsSea({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => { if (g.current) g.current.visible = !zsCave.seaOff; });
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

/** Teclas que um botão de SEGURAR do arco está apertando agora (soltas à força se o botão sumir com o dedo em cima). */
const ARC_HELD = new Set<string>();
/** Botão de SEGURAR (celular): enquanto o dedo está nele, a tecla fica apertada. */
function holdBtn(id: string, label: string, icon: React.ReactNode, code: string): ArcButton {
  return {
    id, label, icon,
    onPress: () => { input.keys.add(code); ARC_HELD.add(code); },
    onRelease: () => { if (ARC_HELD.delete(code)) input.keys.delete(code); },
  };
}
const carBtn = (label: string, icon: React.ReactNode): ArcButton => ({ id: 'zs-car', label, icon, onPress: () => { input.eTap = true; } });

/** CELULAR (31/10, Pedro: "os botões do carro grandes, retangulares, em cima dos outros — horrível; no mesmo sistema dos
 *  poderes, embaixo"): os comandos da Zona Sul entram no ARCO, redondos, e só quando servem. Dirigindo, o anel de dentro
 *  vira o painel do carro (Subir · Descer · Turbo — segurar — e Sair); a pé, "Carro" perto do carro e "Mergulhar" nadando,
 *  na frente do anel de fora. Correr a pé = empurrar o joystick até a borda (25/10). */
function ZsTouchArc() {
  const driving = useZsTouch(s => s.driving), nearCar = useZsTouch(s => s.nearCar), inWater = useZsTouch(s => s.inWater);
  const sailing = useZsTouch(s => s.sailing), nearShip = useZsTouch(s => s.nearShip), shipAct = useZsTouch(s => s.shipAct);
  const crouched = useZsTouch(s => s.crouched), riding = useZsTouch(s => s.riding);
  const shipLabel = shipAct === 'pilotar' ? 'Pilotar (timão)' : shipAct === 'descer' ? 'Descer do navio' : shipAct === 'construir' ? 'Construir navio' : shipAct === 'construir_carro' ? 'Construir carro' : 'Subir no navio';
  useEffect(() => {
    if (sailing) {
      // NAVIO DE GUERRA (01/11): canhões de cada costado + desembarcar; o joystick é o leme/vela; a mira aparece sozinha
      const fire = (side: WarshipSide): ArcButton['onPress'] => () => { input.cannonFire = side; };
      useArcExtras.setState({
        inner: [{ id: 'zs-cannon-port', label: 'Canhões ⟵', icon: <ArrowLeft />, onPress: fire('port') },
          { id: 'zs-cannon-star', label: 'Canhões ⟶', icon: <ArrowRight />, onPress: fire('starboard') }, carBtn('Soltar o timão', <LogOut />)],
        outer: [],
      });
    } else if (riding) {
      // DE CARONA (02/11): só o botão de descer
      useArcExtras.setState({ inner: null, outer: [carBtn('Sair da carona', <LogOut />)] });
    } else if (driving) {
      useArcExtras.setState({
        inner: [holdBtn('zs-up', 'Subir', <ArrowUp />, 'Space'), holdBtn('zs-down', 'Descer', <ArrowDown />, 'KeyC'),
          holdBtn('zs-turbo', 'Turbo', <Gauge />, 'ShiftLeft'), carBtn('Sair do carro', <LogOut />)],
        outer: [],
      });
    } else {
      useArcExtras.setState({
        inner: null,
        outer: [...(nearCar ? [carBtn('Entrar no carro', <Car />)] : []), ...(nearShip ? [carBtn(shipLabel, <Ship />)] : []), ...(inWater ? [holdBtn('zs-dive', 'Mergulhar', <ArrowDownToLine />, 'KeyC')] : []),
          // AGACHAR (02/11, PvP): toque alterna (em terra) — o ícone vira "levantar"
          ...(!inWater ? [{ id: 'zs-crouch', label: crouched ? 'Levantar' : 'Agachar', icon: crouched ? <ChevronsUp /> : <ChevronsDown />, onPress: () => { input.crouchTap = true; } }] : [])],
      });
    }
    // trocou o momento com o dedo num botão de segurar: a tecla não fica presa
    return () => { for (const k of ARC_HELD) input.keys.delete(k); ARC_HELD.clear(); useArcExtras.setState({ inner: null, outer: [] }); };
  }, [driving, nearCar, inWater, sailing, nearShip, shipLabel, crouched, riding]);
  return null;
}

function ZonaSulWorld({ paused = false, onAttack }: { paused?: boolean; onAttack?: () => void }) {
  const [t, setT] = useState<ZsTerrain | null>(null);
  /** terreno dos SORTEIOS (o de 28/10 — os postes também saem dele, no mesmo lugar de sempre) */
  const [spawnT, setSpawnT] = useState<ZsTerrain | null>(null);
  /** fauna/acampamentos/perfil prontos (precisam do terreno) — só aí o combate entra na cena */
  const [ready, setReady] = useState(false);
  /** o herói pro combate (inimigos, poderes, piloto) e o destino do piloto automático */
  const playerRef = useRef<THREE.Group | null>(null);
  const movement = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  const c = useMemo(() => palette(), []);
  /** Árvore de FARM no tom da mata da Zona Sul (Pedro 01/11: "a cor das de farm um pouco mais no tom das árvores
   *  originais"): a folha (oliva do Vale) vai 50% pro verde da mata — um pouco mais clara ainda, dá pra achar qual se colhe.
   *  Só a folha; tronco/pedra/rótulo iguais. */
  const cFarm = useMemo(() => ({ ...c, leaf: zsFarmLeaf(c.leaf, ZS_MATA_LEAF), 'leaf-light': zsFarmLeaf(c['leaf-light'], ZS_MATA_LEAF_LIGHT) }), [c]);
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
  /** NAVIO DE GUERRA (01/11): ancorado no mar fundo perto do Arpoador (lado de Ipanema, fora da onda) */
  const shipRef = useRef<ZsWarship | null>(null);
  const boardRef = useRef<BoardPose>(newBoardPose());
  /** poses da ASA-DELTA e do SKATE (o herói escreve; as vistas leem) */
  const gliderPose = useRef<BoardPose>(newBoardPose()), skatePose = useRef<BoardPose>(newBoardPose());
  const gearRef = useMemo(() => ({ get glider() { return gliderPose.current; }, get skate() { return skatePose.current; } }), []);
  const perfRef = useRef<HTMLDivElement>(null);
  // só em desenvolvimento: os testes de tela leem posição/estado (o jogo publicado não expõe nada)
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zs?: unknown }).__zs = { hero: heroRef.current, car: carRef, terrain: () => t, store: useGameStore, movement, setEpoch: setWorldEpoch, nightFactor, worldEpoch, amb: () => ({ ...AMB }), ship: zsShip, warship: shipRef, drive, input, aim: warshipAim, muzzle: heroMuzzle, warshipDeck: zsWarshipDeck, touch: useZsTouch, net: useNet, remoteDecks, ramp: zsRamp, cam: useZsCam, see: zsSeeThrough };
  useEffect(() => {
    zsPause.on = paused;
    if (paused) { input.keys.clear(); input.stick.x = 0; input.stick.z = 0; }
  }, [paused]);
  // NAVIO 5K DE VIDA (Pedro 01/11): canhão de jogador INIMIGO acertou o MEU navio (a rede já conferiu a inimizade)
  useEffect(() => {
    registerShipHitHandler((hit) => {
      const s = shipRef.current;
      if (!s || s.sinkT !== null) return;
      const sank = damageWarship(s, hit.damage);
      // 02/11: tiro de ARMA de mão (fuzil/arco/espada pela mira) também tira — a mensagem diz qual foi
      const what = hit.w === 'gun' ? `tiro de ${hit.fromName}` : `canhão de ${hit.fromName}`;
      useGameStore.getState().setMessage(sank ? `🔥 Seu navio AFUNDOU — ${what}! Construa outro na âncora (E).`
        : `💥 ${what[0]!.toUpperCase() + what.slice(1)} no seu navio! −${Math.round(hit.damage)} (casco ${s.hp}/${WARSHIP.HP})`);
    });
    // CARRO (02/11, Pedro: "fuzil tirando vida do navio/carro"): tiro de jogador INIMIGO no MEU carro (parado ou dirigindo)
    registerCarHitHandler((hit) => {
      const c = carRef.current;
      if (!c || c.wreckT !== null) return;
      const boom = damageCar(c, hit.damage), st = useGameStore.getState();
      if (boom) { audioManager.playWorld('cannon', 1); st.setMessage(`🔥 Seu carro EXPLODIU — tiro de ${hit.fromName}! Construa outro na garagem (E).`); }
      else st.setMessage(`💥 Tiro de ${hit.fromName} no seu carro! −${Math.round(hit.damage)} (carro ${c.hp}/${CAR.HP})`);
    });
    return () => { registerShipHitHandler(null); registerCarHitHandler(null); };
  }, []);
  useEffect(() => {
    // entrou no mapa: a pé, câmera no herói; 1ª vez = ganha a prancha
    drive.mode = 'foot'; input.overview = false; input.keys.clear(); hudNow = null;
    zsAmbience.arm(); // som do mar/carro/vento (liga no 1º clique/tecla)
    // PRANCHA: quem garante é a casa do jogo (routes/index.tsx) — item fixo, volta sempre que faltar
    let alive = true;
    // o mapa de agora + o TERRENO DOS SORTEIOS (o de 28/10: tudo que é sorteado nasce onde sempre nasceu — 02/11)
    Promise.all([loadZsTerrain(), loadZsTerrain(ZS_SPAWN_TERRAIN_URL)]).then(([tt, st]) => {
      if (!alive) return;
      setCaveTerrain(tt); // a caverna precisa do chão do mapa (bocas) antes de qualquer conta
      const at = readZsPos(tt);
      heroRef.current.set(at.x, at.y ?? zsHeightAt(tt, at.x, at.z), at.z); focusRef.current.copy(heroRef.current);
      movement.current.set(at.x, 0, at.z);
      carGarage.at = { x: at.x + 3, z: at.z - 2, yaw: 0 }; // GARAGEM: onde ele nasce e onde se constrói outro (01/11)
      // NAVIO e CARRO SALVOS (02/11): voltam onde estavam, com a vida que tinham (afundou/explodiu = constrói outro)
      const saved = readZsVehicles();
      carRef.current = restoreCar(saved?.car, carGarage.at, tt);
      { const swim = (x: number, z: number) => zsSwimmable(tt, x, z, WARSHIP.MIN_DEPTH), dock = findWarshipDock(swim, WARSHIP.DOCK_NEAR); warshipDock.at = dock; shipRef.current = restoreWarship(saved?.ship, dock, swim); }
      // o JOGO passa a viver na Zona Sul: chão/terra/limites/zona segura/acampamentos dela + a fauna por região
      const query = zsQuery(st); // SORTEIOS no terreno de 28/10 (bichos, farm, acampamentos, bandidos, tubarões)
      const prof = zsWorldProfile(tt, zsQuery(tt), query);
      setWorldProfile(prof);
      useGameStore.getState().enterWorld('zona-sul', {
        creatures: (() => {
          const base = [...createZsWildlife(query, undefined, ZS_FAUNA, prof.camps), ...createCaveCreatures(), ...createZsSharks(query, zsSharkPeaks(st)), ...createZsBandits(query, prof.camps),
            ...createZsNewAreaCreatures(zsQuery(tt), query.bounds, prof.camps)]; // + bichos e bandidos da Gávea/São Conrado (02/11)
          // + BICHOS ESPALHADOS (03/11): zonas novas longe de tudo que já tem na superfície (caverna e mar não contam)
          const surface = base.filter((c) => !/^(wild_cave_|zs_cave_|wild_shark_)/.test(c.id)).map((c) => c.position);
          return [...base, ...createZsSpreadFauna(zsQuery(tt), surface, prof.camps).creatures, ...createZsSpreadBandits(zsQuery(tt), base, prof.camps)];
        })(),
        // + árvores de farm da área nova (Gávea/São Conrado, no terreno de agora) + veios de ferro da caverna (02/11)
        // + FARM ESPALHADA nos vazios do mapa (03/11; nada na boca da caverna)
        harvestNodes: (() => {
          const base = createZsHarvestNodes(query), withNew = [...base, ...createZsNewAreaTrees(zsQuery(tt), query.bounds, base)];
          const spread = [...withNew, ...createZsSpreadHarvest(zsQuery(tt), withNew, undefined, caveMouthClear)];
          // + FARM NA MATA (03/11: "30, 40 árvores de cenário e 1 de farm"): árvores de farm espalhadas no verde todo
          return [...spread, ...createZsForestFarm(zsQuery(tt), spread, undefined, caveMouthClear), ...createCaveOreNodes()];
        })(),
        position: { x: at.x, z: at.z },
      });
      setSpawnT(st); setT(tt); setReady(true);
    }).catch((e) => alive && setErr(String(e)));
    const keep = window.setInterval(() => { if (carRef.current) { saveZsPos(heroRef.current); saveZsVehicles(shipRef.current, carRef.current); } }, 2000);
    return () => {
      alive = false; window.clearInterval(keep); if (carRef.current) { saveZsPos(heroRef.current); saveZsVehicles(shipRef.current, carRef.current); } zsPause.on = false; input.keys.clear();
      zsCtx.inWater = false; zsCtx.driving = false; audioManager.setFootsteps(false); zsAmbience.mute();
      resetLayers(); zsCave.inCave = false; zsCave.dark = 0; zsCave.near = false; zsCave.deep = false; zsCave.seaOff = false; setCaveTerrain(null);
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
            <AssetBoundary label="ZsPostes" fallback={null}><Suspense fallback={null}><ZsLamps t={t} spotsFrom={spawnT ?? t} heroRef={heroRef} /></Suspense></AssetBoundary>
            {/* NAVIO encalhado entre Ipanema e Leblon (dá pra subir pela prancha) */}
            <AssetBoundary label="ZsNavio" fallback={null}><Suspense fallback={null}><ZsShip t={t} /></Suspense></AssetBoundary>
            {/* NAVIO DE GUERRA (nível 70, 01/11): ancorado perto do Arpoador; E embarca, canhões no botão direito/clique */}
            <AssetBoundary label="ZsNavioGuerra" fallback={null}><Suspense fallback={null}><ZsWarshipView shipRef={shipRef} heroRef={heroRef} /></Suspense></AssetBoundary>
            {/* ONLINE (01/11): o navio e o carro dos OUTROS jogadores (de carona na pose) — e o convés do navio deles */}
            <AssetBoundary label="ZsVeiculosRemotos" fallback={null}><Suspense fallback={null}><ZsRemoteVehicles myShip={shipRef} myCar={carRef} /></Suspense></AssetBoundary>
            <ZsTerrainMesh t={t} heroRef={focusRef} />
            <ZsSea>
              <ZsWater t={t} />
              {/* RASTRO na água (01/11): navio de guerra (da popa) e prancha em pé (da rabeta) */}
              <ZsWake look={WAKE_SHIP} source={() => { const s = shipRef.current; if (!s) return null; const k = WARSHIP.LENGTH * 0.47; return { active: true, x: s.x - Math.sin(s.yaw) * k, z: s.z - Math.cos(s.yaw) * k, yaw: s.yaw, speed: s.speed }; }} />
              <ZsWake look={WAKE_BOARD} source={() => zsBoardWake} />
              {/* o PICO da onda é achado no terreno dos sorteios (02/11): o do Arpoador escolhia entre pontos da faixa de
                  borda antiga (mar raso ao sul), que agora tem a profundidade de verdade — sem isso a onda mudava de lugar */}
              {SURF_ON && <SurfBreak t={spawnT ?? t} shoreX={ZS_SPAWN.x} shoreZ={ZS_SPAWN.z} />}
              {/* SORRISO: no meio de Copacabana (Pedro 30/10) */}
              {SURF_ON && <SorrisoBreak t={spawnT ?? t} />}
            </ZsSea>
            <ZsVegetation t={t} heroRef={focusRef} />
            {/* GRAMA LEVE (02/11): só em volta do herói, no verde; some no fundo da caverna junto com a superfície */}
            <ZsGrass t={t} heroRef={focusRef} />
            {/* RAMPA DE VOO LIVRE da Pedra Bonita (02/11): deck pisável; saindo pela ponta com a asa-delta ela abre */}
            <ZsRampView t={t} />
            {/* PEDRAS EM VOLTA DA BOCA do Pico da Tijuca (02/11 noite) */}
            <ZsCaveMouthRocks t={t} />
          </ZsSurface>
          {/* CAVERNA (30/10): Rebouças → galerias → águas → grande caverna → salão do chefe; ramal até o Leblon */}
          <ZsCave t={t} heroRef={heroRef} />
          <Hero t={t} heroRef={heroRef} focusRef={focusRef} onHud={pushHud} carRef={carRef} dimsRef={dimsRef} boardRef={boardRef} playerRef={playerRef} movement={movement} c={c} gearRef={gearRef} shipRef={shipRef} />
          {/* COMBATE — as mesmas peças do Vale, no chão da Zona Sul (perfil do mapa) */}
          {/* cada peça com a sua rede de carregamento (29/10: um bicho novo carregando o modelo ESCONDIA o mundo inteiro
              por um instante — o React esconde até a rede mais próxima) e proteção contra modelo quebrado (igual ao Vale) */}
          {ready && (
            <AssetBoundary label="ZsCombate" fallback={null}>
              {/* acampamentos e recursos são da SUPERFÍCIE: no fundo da caverna somem junto com ela (1/11: as 48 árvores de
                  coleta eram desenhadas embaixo da rocha — 851 mil triângulos que ninguém via) */}
              <Suspense fallback={null}><ZsSurface><Camps c={c} /></ZsSurface></Suspense>
              {/* recursos de colher (madeira na mata, pedra no campo — PR #14): a mesma peça do Vale, VISÍVEIS */}
              <Suspense fallback={null}><ZsSurface><HarvestNodes c={cFarm} seeThrough={withSeeThrough} /></ZsSurface></Suspense>
              {/* MINÉRIO DA CAVERNA (02/11): os nós da camada de baixo, fora da superfície (que some no fundo da caverna) */}
              <Suspense fallback={null}><HarvestNodes c={cFarm} layer={1} /></Suspense>
              <Suspense fallback={null}><Enemies c={c} playerRef={playerRef} cameraMode="third" /></Suspense>
              <Suspense fallback={null}><CombatFeedback /></Suspense>
              <Suspense fallback={null}><Projectiles /></Suspense>
              <Suspense fallback={null}><HeroPowers playerRef={playerRef} paused={paused} /></Suspense>
              {/* BASE (31/10): reivindicar/construir, casa, torres, muros, tropas, poderes, fogo e luz — a mesma do Vale */}
              <AssetBoundary label="ZsBase" fallback={null}><Suspense fallback={null}><PlayerBase c={c} playerRef={playerRef} paused={paused} /></Suspense></AssetBoundary>
              <BaseFireFX />
              <BaseNightLights />
              <Suspense fallback={null}><TargetRoute playerRef={playerRef} /></Suspense>
              {/* ONLINE (31/10): bases e jogadores dos outros (com a altura real — caverna/casa), mundo do host */}
              <AssetBoundary label="ZsOnline" fallback={null}>
                <Suspense fallback={null}><NetBases c={c} /></Suspense>
                <Suspense fallback={null}><RemotePlayers zs={ZS_REMOTE_KIT} /></Suspense>
                <MultiplayerWorldSync />
              </AssetBoundary>
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
      {touch && t && !paused && <ZsTouchArc />}
      <div className="zs-credit">Relevo: AWS Terrain Tiles (SRTM) · Mapa: © OpenStreetMap contributors (ODbL)</div>
      {!t && !err && <div className="world-loading">Chegando na Zona Sul…</div>}
      {err && <div className="world-loading" style={{ color: '#ef4444' }}>Erro: {err}</div>}
    </div>
  );
}

/** memo: a casa do jogo re-renderiza (relógio 1×/s, vida, XP…) e o mundo 3D NÃO vai junto — só muda com `paused`. */
export default memo(ZonaSulWorld);
