import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Stats, useGLTF } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { CAMPS, CAMP_PLACEMENTS, RUINS_POSITION } from '@/game/data/camps';
import { AutoPilot } from './world/auto-pilot';
import { HarvestNodes } from './world/harvest-nodes';
import { queueNearestNode } from './world/objective-bridge';
import { CombatFeedback } from './world/combat-feedback';
import { Projectiles } from './world/projectiles';
import { HeldItem, selectedItemId } from './world/held-weapon';
import { AdventurerDetails } from './world/adventurer-details';
import { GlbHero, type HeroAction } from './world/glb-hero';
import { GlbHeroMixamo } from './world/glb-hero-mixamo';
import { LandmarkTree } from './world/landmark-tree';
import { RemotePlayers } from './world/remote-players';
import { terrainMeshY, registerWall, wallHeightAt, glbSurfaceY, useTerrainVersion } from './world/terrain-collision';
import { broadcastPose } from '@/net/multiplayer';
import { Factory } from './world/factory';
import { FactoryRubble } from './world/factory-rubble';
import { GlbContainers } from './world/glb-containers';
import { weaponFor, weaponRangeFor } from '@/game/data/weapons';
import { OcclusionFader } from './world/occlusion-fader';
import {
  makeInstanceFadeMaterial, registerInstancedFade, useFadeGroup, type FadeSphere,
} from './world/occlusion';
import { TargetRoute } from './world/target-route';
import { PlayerBase, NetBases } from './world/player-base';
import { BaseFireFX } from './world/base-fire';
import { audioManager } from '@/game/audio/audio-manager';
import { BaseNightLights } from './world/base-night-lights';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { isBuildActive } from './world/build-mode';
import { Camps, Enemies, MultiplayerWorldSync } from './world/world-entities';
import { Billboards, groundTexture } from './world/billboards';
import { AshlandPilot } from './world/ashland-glb-pilot';
import { CelShade } from './world/cel-shade';
import { Atmosphere } from './world/atmosphere';
import { EnvironmentLight } from './world/environment-light';
import { RuinMasonry } from './world/ruin-masonry';
import { RiverBanks } from './world/river-banks';
import { pbrMaps } from './world/pbr-materials';
import { DistantLandscape } from './world/distant-landscape';
import { CEL } from './world/cel-style';
import { housePlayerInside } from './world/house-collider';
import { factoryClip } from './world/factory-collider';
import { houseFloorSurfaceY, pushOutHouseWalls, pushOutBasePieces, pushOutFactoryWalls, factoryRoofCutY } from './world/base-collision';
import {
  MAP_HALF, LAKE_CENTERS, LAKE_WATER_Y, RIVER_POINTS, RIVER_HALF_WIDTH, impactShake, lakeWaterY,
  markPointerConsumed, palette, rand, riverDistance, terrainHeight, wasPointerConsumed,
  SNOW_MOUNTAIN, snowMountainBump, FACTORY_SITES, FACTORY_PAD_R, SAFE_ZONE, HERO_HEIGHT,
  type Palette,
} from './world/world-kit';
import { dayNight, nightFactor } from '@/game/systems/dayNightSystem';
import { effectiveAttributes } from '@/game/systems/attributesSystem';
import {
  getFreeCam, setFreeCamActive, adjustFreeCamSpeed, adjustFreeCamFar,
  FREE_SPEED_MIN, FREE_SPEED_MAX, type FreeCamInspect,
} from './world/free-cam';
import { FreeCamOverlay } from './world/free-cam-overlay';
import { EditorWorldLayer } from './editor/editor-world';
import { isEditorActive, useEditorStore as useEditorStoreCam } from './editor/editor-store';

export type WorldProps = {
  mode: string;
  attack: number;
  onCollect: () => void;
  onPosition: (x: number, z: number) => void;
  onAttack?: () => void;
  paused: boolean;
  cameraMode?: CameraMode;
};

/** `free` = câmera de depuração que voa pela cena com a simulação rodando. */
export type CameraMode = 'iso' | 'third' | 'free';

// Ponte caminhável: mesmo centro/rotação/medidas do grupo renderizado lá
// embaixo. Sobre o tabuado o chão do jogador vira o topo do deck; nas pontas
// uma rampa curta sobe do terreno até o deck pra não ter degrau brusco.
const BRIDGE = { cx: -2, cz: 2.5, cos: Math.cos(0.64), sin: Math.sin(0.64), halfLen: 3.75, halfWidth: 1.35, deckTop: 0.67, ramp: 1.4 };

/** Ponte de madeira no meio do mapa. Pedro 20/10: OFF (visual + superfície caminhável).
 *  Reversível: true volta a ponte. */
const SHOW_BRIDGE = false;

function bridgeSurfaceY(px: number, pz: number): number {
  if (!SHOW_BRIDGE) return -Infinity;
  const dx = px - BRIDGE.cx;
  const dz = pz - BRIDGE.cz;
  const lx = dx * BRIDGE.cos - dz * BRIDGE.sin;
  const lz = dx * BRIDGE.sin + dz * BRIDGE.cos;
  if (Math.abs(lz) > BRIDGE.halfWidth) return -Infinity;
  const a = Math.abs(lx);
  if (a <= BRIDGE.halfLen) return BRIDGE.deckTop;
  if (a <= BRIDGE.halfLen + BRIDGE.ramp) {
    return BRIDGE.deckTop * (1 - (a - BRIDGE.halfLen) / BRIDGE.ramp);
  }
  return -Infinity;
}

// ------------------------------------------------------------------ *
// Colisão seletiva
//
// Sólido onde o jogador INTERAGE: nós de colheita grandes (árvore, rocha,
// veios, cristal — pedregulho não), estruturas de acampamento (tenda, torre,
// paliçada, totem, jaula — fogueira não) e as ruínas. Cenário puro (árvore
// decorativa, pedra decorativa, grama, ponte, rio) continua atravessável.
// Nó esgotado perde o colisor (o toco/escombro não bloqueia).
// ------------------------------------------------------------------ *
type Collider = { x: number; z: number; r: number };

const PLAYER_RADIUS = 0.5;

/** Raio do colisor por tipo de nó de colheita; ausente = sem colisão. */
const NODE_COLLIDER_R: Record<string, number> = {
  tree: 0.55, rock: 0.8, iron_vein: 0.9, gold_vein: 0.9, crystal: 0.75,
};

/** Raio do colisor por estrutura de acampamento; ausente (bonfire) = sem colisão. */
const STRUCT_COLLIDER_R: Record<string, number> = {
  tent: 1.1, watchtower: 1.0, palisade: 0.45, totem: 0.5, cage: 1.0,
};

// Colisores fixos (acampamentos + ruínas): dados estáticos, calculados uma vez.
const STATIC_COLLIDERS: Collider[] = (() => {
  const list: Collider[] = [
    { x: RUINS_POSITION.x, z: RUINS_POSITION.z, r: 2.2 },
    // fábrica NÃO é círculo sólido: tem colisão de PAREDE (entra pela abertura).
  ];
  for (const placement of CAMP_PLACEMENTS) {
    const def = CAMPS[placement.defId];
    if (!def) continue;
    for (const s of def.structures) {
      const r = STRUCT_COLLIDER_R[s.kind];
      if (r == null) continue;
      list.push({ x: placement.position.x + s.offset.x, z: placement.position.z + s.offset.z, r: r * (s.scale ?? 1) });
    }
  }
  return list;
})();

/** Empurra (x,z) para fora de um círculo sólido, gerando deslize natural. */
function pushOut(x: number, z: number, ox: number, oz: number, r: number): [number, number] {
  const dx = x - ox, dz = z - oz;
  const d = Math.hypot(dx, dz);
  const min = r + PLAYER_RADIUS;
  if (d < min && d > 1e-4) {
    const push = min - d;
    return [x + (dx / d) * push, z + (dz / d) * push];
  }
  return [x, z];
}

const TREE_SPHERES: FadeSphere[] = [[0, 2.7, 0, 1.5], [0, 1.2, 0, 0.5]];

function Tree({ x, z, size = 1, seed, c }: { x: number; z: number; size?: number; seed: number; c: Palette }) {
  const y = terrainHeight(x, z);
  const ref = useRef<THREE.Group>(null);
  useFadeGroup(ref, TREE_SPHERES);
  return (
    <group ref={ref} position={[x, y, z]} scale={size}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.2, 2.6, 6]} />
        <meshStandardMaterial color={c.trunk} />
      </mesh>
      {seed % 3 === 0 ? (
        <>
          {[1.8, 2.6, 3.3].map((ty, i) => (
            <mesh key={ty} position={[0, ty, 0]} castShadow>
              <coneGeometry args={[1.3 - i * 0.28, 1.8, 7]} />
              <meshStandardMaterial color={i === 1 ? c.leaf : c.pine} flatShading />
            </mesh>
          ))}
        </>
      ) : seed % 3 === 1 ? (
        <>
          <mesh position={[0, 3, 0]} scale={[1.3, 1, 1.2]} castShadow>
            <icosahedronGeometry args={[1.45, 1]} />
            <meshStandardMaterial color={seed % 2 ? c.leaf : c['leaf-light']} flatShading />
          </mesh>
          <mesh position={[0.7, 2.6, 0.35]} castShadow>
            <icosahedronGeometry args={[0.95, 1]} />
            <meshStandardMaterial color={c.leaf} flatShading />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 2.8, 0]} castShadow>
            <sphereGeometry args={[1.2, 6, 5]} />
            <meshStandardMaterial color={c['leaf-light']} flatShading />
          </mesh>
          <mesh position={[-0.5, 2.4, 0.3]} castShadow>
            <sphereGeometry args={[0.7, 5, 4]} />
            <meshStandardMaterial color={c.leaf} flatShading />
          </mesh>
          <mesh position={[0.4, 2.2, -0.3]} castShadow>
            <sphereGeometry args={[0.6, 5, 4]} />
            <meshStandardMaterial color={c.pine} flatShading />
          </mesh>
        </>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[1.2, 8]} />
        <meshStandardMaterial color={c['ground-light']} />
      </mesh>
    </group>
  );
}

const ROCK_SPHERES: FadeSphere[] = [[0, 0, 0, 0.8]];

/** `fade={false}`: o pai (ruína, cristal) registra o grupo inteiro. */
function Rock({ x, z, size = 1, c, fade = true }: { x: number; z: number; size?: number; c: Palette; fade?: boolean }) {
  const y = terrainHeight(x, z);
  const ref = useRef<THREE.Mesh>(null);
  useFadeGroup(ref, fade ? ROCK_SPHERES : null);
  return (
    <mesh
      ref={ref}
      position={[x, y + 0.35 * size, z]}
      scale={[size, 0.7 * size, 0.85 * size]}
      rotation={[0.15, x * 0.5, 0.1]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.8, 0]} />
      <meshStandardMaterial color={c.rock} flatShading />
    </mesh>
  );
}

const RUIN_SPHERES: FadeSphere[] = [
  [-3, 2, -2, 1.3], [-3, 4.3, -2, 1.3], [3, 2, -2, 1.3], [3, 4.3, -2, 1.3],
  [-2, 1.4, -2.1, 1.5], [0, 1.4, -2.1, 1.5], [2, 1.4, -2.1, 1.5],
  [-3, 1.3, 1, 1.4], [3, 1.3, 1, 1.4],
];

function Ruins({ c }: { c: Palette }) {
  const y = terrainHeight(7, -8);
  const ref = useRef<THREE.Group>(null);
  useFadeGroup(ref, RUIN_SPHERES);
  return (
    <group ref={ref} position={[7, y, -8]} rotation={[0, -0.2, 0]}>
      <RuinMasonry c={c} />
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[7, 0.3, 5]} />
        <meshStandardMaterial color={c['rock-light']} />
      </mesh>
      {[-3, 3].map(x => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[1, 2.4, 5]} />
            <meshStandardMaterial color={c.rock} />
          </mesh>
          {[-1.8, 0, 1.8].map(zz => (
            <mesh key={zz} position={[0, 2.6, zz]} castShadow>
              <boxGeometry args={[1.12, 0.55, 0.7]} />
              <meshStandardMaterial color={c['rock-light']} />
            </mesh>
          ))}
          <mesh position={[0, 3, -2]} castShadow>
            <cylinderGeometry args={[0.9, 1, 5, 6]} />
            <meshStandardMaterial color={c.rock} flatShading />
          </mesh>
          <mesh position={[0, 5.65, -2]} castShadow>
            <coneGeometry args={[1.1, 1.6, 6]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.4, -2.1]} castShadow>
        <boxGeometry args={[6, 2.8, 0.8]} />
        <meshStandardMaterial color={c.rock} />
      </mesh>
      <mesh position={[0, 1.7, -1.65]}>
        <boxGeometry args={[1.7, 2.4, 0.12]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh position={[3.6, 2.9, -1.3]}>
        <boxGeometry args={[0.07, 1.6, 1]} />
        <meshStandardMaterial color={c.cloak} side={THREE.DoubleSide} />
      </mesh>
      <Rock x={-3.5} z={3} size={0.9} c={c} fade={false} />
      <Rock x={2} z={3.5} size={0.6} c={c} fade={false} />
    </group>
  );
}

const CRYSTAL_SPHERES: FadeSphere[] = [[0, 0.5, 0, 1.1]];
const CHEST_SPHERES: FadeSphere[] = [[0, 0, 0, 0.5]];
const TOWER_SPHERES: FadeSphere[] = [[0, 1, 0, 0.8], [0, 2.3, 0, 0.6]];

/** Grupo que apaga quando esconde o jogador (props de grupo repassadas). */
function FadeGroup({
  spheres, children, ...rest
}: { spheres: FadeSphere[]; children: React.ReactNode } & React.ComponentProps<'group'>) {
  const ref = useRef<THREE.Group>(null);
  useFadeGroup(ref, spheres);
  return <group ref={ref} {...rest}>{children}</group>;
}

function Campfire({ c, position: pos }: { c: Palette; position: [number, number, number] }) {
  const ref = useRef<THREE.PointLight>(null);
  const y = terrainHeight(pos[0], pos[2]);
  useFrame(({ clock }) => {
    const l = ref.current;
    if (!l) return;
    // Culling por distância: longe do jogador a luz sai do shader (o fogo visual fica).
    const p = useGameStore.getState().player.position;
    audioManager.updateCampfireDistance(Math.hypot(p.x - pos[0], p.z - pos[2]));
    l.visible = (p.x - pos[0]) * (p.x - pos[0]) + (p.z - pos[2]) * (p.z - pos[2]) < LIGHT_CULL_D2;
    // Acende forte à noite, discreta de dia (consistente com as luminárias). +20%.
    if (l.visible) l.intensity = (2.4 + nightFactor() * 6) + Math.sin(clock.elapsedTime * 8) * 0.8;
  });
  return (
    <group position={[pos[0], y, pos[2]]}>
      {[0, 1.2, 2.4, 3.6, 5].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3]} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.35]} />
          <meshStandardMaterial color={c.rock} />
        </mesh>
      ))}
      <pointLight ref={ref} position={[0, 0.6, 0]} color="#ff8844" intensity={3} distance={10} />
      <mesh position={[0, 0.3, 0]}>
        <coneGeometry args={[0.15, 0.5, 4]} />
        <meshStandardMaterial color="#ff6622" emissive="#ff4400" emissiveIntensity={2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

/** Liga o herói GLB (Quaternius) no lugar do boneco de blocos. Reversível pela flag. */
const USE_GLB_HERO = true;
/** Survivor Red (rig Mixamo) no lugar do Kael (rig Unreal/UAL). Reversível: false volta o Kael. */
const USE_RED_HERO = true;

/** Chão central jogável (PlaneGeometry texturado). Pedro 20/10: OFF p/ avaliar o mapa
 *  novo em GLB. NÃO afeta ficar em pé — personagens/coisas usam `terrainHeight` (matemático).
 *  Reversível: true volta o chão. O backdrop distante (`DistantLandscape`) não é afetado. */
const SHOW_CENTRAL_GROUND = false;

function Character({
  c, attack, movement, onPosition, paused, playerRef, cameraYawRef, cameraMode,
}: {
  c: Palette;
  attack: number;
  movement: React.RefObject<THREE.Vector3>;
  onPosition: WorldProps['onPosition'];
  paused: boolean;
  playerRef: React.RefObject<THREE.Group | null>;
  cameraYawRef: React.RefObject<number>;
  cameraMode: CameraMode;
}) {
  const body = useRef<THREE.Group>(null);
  const sword = useRef<THREE.Group>(null);
  // Rig articulado (grupos de junta, pivô no quadril/joelho/ombro/cotovelo).
  const heroAction = useRef<HeroAction>('idle');
  const heroSpeed = useRef(0);
  const leftHip = useRef<THREE.Group>(null);
  const rightHip = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);
  const leftShoulder = useRef<THREE.Group>(null);
  const rightShoulder = useRef<THREE.Group>(null);
  const leftElbow = useRef<THREE.Group>(null);
  const rightElbow = useRef<THREE.Group>(null);
  const keys = useRef(new Set<string>());
  const pulse = useRef(0);
  const attackPhase = useRef<'idle' | 'anticipation' | 'strike' | 'impact' | 'recovery'>('idle');
  const attackTimer = useRef(0);
  const tick = useRef(0);
  const velocity = useRef(new THREE.Vector2(0, 0));
  const jumpVelocity = useRef(0);
  const isGrounded = useRef(true);
  const walkCycle = useRef(0);
  const targetRotY = useRef(0);
  const currentRotY = useRef(0);
  const idleTime = useRef(0);
  const prevSpecial = useRef(0);
  const spinTimer = useRef(0);

  useEffect(() => {
    if (body.current && playerRef) (playerRef as any).current = body.current;
  });

  // Posição ao montar o mundo:
  //  - LOGIN (1º load da sessão): sempre na ZONA SEGURA, mesmo com save antigo
  //    (o Pedro quer entrar no jogo direto na zona de respawn).
  //  - Voltar da aba Cidade (mesma sessão): retoma onde estava (store fresca).
  useEffect(() => {
    const b = body.current;
    if (!b) return;
    let px: number, pz: number;
    if (!didInitialSpawn) {
      didInitialSpawn = true;
      px = SAFE_ZONE.x; pz = SAFE_ZONE.z;
      useGameStore.setState(s => ({ player: { ...s.player, position: { x: px, z: pz } } }));
    } else {
      const pos = useGameStore.getState().player.position;
      px = pos.x; pz = pos.z;
    }
    b.position.set(px, terrainHeight(px, pz), pz);
    velocity.current.set(0, 0);
    // Alinha o ALVO de movimento ao ponto onde nasceu, senão o personagem
    // caminha sozinho até o alvo padrão (0,0,1 ≈ ponte) logo ao entrar.
    movement.current?.set(px, 0, pz);
  }, []);

  useEffect(() => {
    if (attackPhase.current === 'idle') {
      attackPhase.current = 'anticipation';
      attackTimer.current = 0;
    }
    // Vira de frente pro bicho vivo mais próximo, dentro do alcance da arma.
    const b = body.current;
    if (b) {
      const st = useGameStore.getState();
      const range = weaponRangeFor(selectedItemId(st), st.player.level) + 1;
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const cr of st.creatures) {
        if (cr.behavior === 'dead') continue;
        const dx = cr.position.x - b.position.x;
        const dz = cr.position.z - b.position.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = cr.position; }
      }
      if (best && bestD < range * range) {
        targetRotY.current = Math.atan2(best.x - b.position.x, best.z - b.position.z);
      }
    }
  }, [attack]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useFrame((_state, delta) => {
    if (!body.current || paused) return;
    const dt = Math.min(delta, 0.05);

    const ps = useGameStore.getState().player;
    if (ps.dead) {
      if (ps.respawnAt > 0 && Date.now() >= ps.respawnAt) {
        // Renasce na CAMA da base, se já tiver uma; senão na ZONA SEGURA do spawn.
        const pb = useGameStore.getState().playerBase;
        const core = pb?.pieces.find(p => p.kind === 'core');
        const sp = core ? cellCenter(core.cell) : { x: SAFE_ZONE.x, z: SAFE_ZONE.z };
        useGameStore.setState(s => ({
          player: { ...s.player, hp: s.player.maxHp, dead: false, respawnAt: 0, position: { x: sp.x, z: sp.z } },
          ui: { ...s.ui, message: core ? 'Você reviveu na sua base.' : 'Você reviveu na zona segura.' },
        }));
        body.current.position.set(sp.x, terrainHeight(sp.x, sp.z), sp.z);
        velocity.current.set(0, 0);
      }
      return;
    }

    const k = keys.current;

    // Câmera livre: WASD dirige a câmera, não o herói. O jogador continua sendo
    // simulado (pelo piloto / clique-pra-andar), só não responde ao WASD.
    const freeCam = cameraMode === 'free';
    const dx = freeCam ? 0 : Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const dz = freeCam ? 0 : Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'));

    let targetVx = 0;
    let targetVz = 0;

    if (dx || dz) {
      movement.current.copy(body.current.position);
      if (cameraMode === 'third') {
        const yaw = cameraYawRef.current;
        const fwdX = Math.sin(yaw);
        const fwdZ = Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);
        targetVx = fwdX * -dz - rightX * dx;
        targetVz = fwdZ * -dz - rightZ * dx;
        const len = Math.sqrt(targetVx * targetVx + targetVz * targetVz);
        if (len > 0) { targetVx /= len; targetVz /= len; }
      } else {
        targetVx = (dx + dz) * 0.707;
        targetVz = (dz - dx) * 0.707;
      }
    } else {
      const diff = movement.current.clone().sub(body.current.position);
      if (diff.length() > 0.15) {
        diff.normalize();
        targetVx = diff.x;
        targetVz = diff.z;
      }
    }

    // Piloto / clique-pra-andar (sem WASD, seguindo um destino) corre no sprint.
    const autoFollowing = !dx && !dz && (targetVx !== 0 || targetVz !== 0);
    const sprinting = k.has('ShiftLeft') || k.has('ShiftRight') || autoFollowing;
    const ACCEL = 22;
    const DECEL = 28;
    const px = body.current.position.x;
    const pz = body.current.position.z;
    const inLake = LAKE_CENTERS.some(l => (px - l.x) ** 2 + (pz - l.z) ** 2 < l.r * l.r);
    const moveBonus = 1 + effectiveAttributes(useGameStore.getState().player).moveSpeed / 100;
    // Andar/correr com redução de 10%: correr 4.8→4.32, andar 2.0→1.8.
    const MAX_SPEED = (sprinting ? 4.32 : 1.8) * (inLake ? 0.4 : 1) * moveBonus;

    if (targetVx !== 0 || targetVz !== 0) {
      const len = Math.sqrt(targetVx * targetVx + targetVz * targetVz);
      const nx = targetVx / len;
      const nz = targetVz / len;
      velocity.current.x += (nx * MAX_SPEED - velocity.current.x) * Math.min(ACCEL * dt, 1);
      velocity.current.y += (nz * MAX_SPEED - velocity.current.y) * Math.min(ACCEL * dt, 1);
    } else {
      const factor = Math.max(0, 1 - DECEL * dt);
      velocity.current.x *= factor;
      velocity.current.y *= factor;
      if (Math.abs(velocity.current.x) < 0.01) velocity.current.x = 0;
      if (Math.abs(velocity.current.y) < 0.01) velocity.current.y = 0;
    }

    const moving = velocity.current.length() > 0.1;
    heroAction.current = attackPhase.current !== 'idle'
      ? 'attack'
      : !isGrounded.current
        ? 'jump'
        : moving
          ? (sprinting ? 'run' : 'walk')
          : 'idle';
    heroSpeed.current = velocity.current.length();

    let nx = body.current.position.x + velocity.current.x * dt;
    let nz = body.current.position.z + velocity.current.y * dt;

    // Colisão seletiva: empurra pra fora de estruturas e nós sólidos (deslize).
    for (const col of STATIC_COLLIDERS) [nx, nz] = pushOut(nx, nz, col.x, col.z, col.r);
    for (const node of useGameStore.getState().harvestNodes) {
      if (node.depleted) continue;
      const r = NODE_COLLIDER_R[node.kind];
      if (r == null) continue;
      [nx, nz] = pushOut(nx, nz, node.position.x, node.position.z, r);
    }
    // Paredes da casa da base: sólidas (entra só pela porta).
    [nx, nz] = pushOutHouseWalls(nx, nz, PLAYER_RADIUS);
    // Cerca da base (muro + torre): sólida; entra pelo portão.
    [nx, nz] = pushOutBasePieces(nx, nz, PLAYER_RADIUS);
    // Paredes das fábricas: sólidas (entra pela abertura).
    [nx, nz] = pushOutFactoryWalls(nx, nz, PLAYER_RADIUS);
    // Paredes do LABIRINTO: no XZ do player, se a malha da parede está alta (acima
    // do chão + 0.8m) = parede → bloqueia. Testa por eixo pra DESLIZAR (não travar).
    {
      const ox = body.current.position.x, oz = body.current.position.z;
      const inWall = (wx: number, wz: number) => wallHeightAt(wx, wz) > terrainHeight(wx, wz) + 0.8;
      if (inWall(nx, nz)) {
        if (!inWall(nx, oz)) nz = oz;
        else if (!inWall(ox, nz)) nx = ox;
        else { nx = ox; nz = oz; }
      }
    }

    body.current.position.x = THREE.MathUtils.clamp(nx, -MAP_HALF, MAP_HALF);
    body.current.position.z = THREE.MathUtils.clamp(nz, -MAP_HALF, MAP_HALF);

    if (moving) {
      targetRotY.current = Math.atan2(velocity.current.x, velocity.current.y);
    }
    let rotDiff = targetRotY.current - currentRotY.current;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    currentRotY.current += rotDiff * Math.min(15 * dt, 1);
    body.current.rotation.y = currentRotY.current;

    // Multiplayer: transmite a pose do jogador local (throttla sozinho ~11Hz).
    const netPlayer = useGameStore.getState().player;
    broadcastPose(body.current.position.x, body.current.position.z, currentRotY.current, heroAction.current, netPlayer.level, netPlayer.hp, netPlayer.maxHp);

    // Especial (Q/R): pulo pro 'jump', giro 360° pro 'spin'. O dano/feedback
    // acontece no store; aqui é só a animação. O soco de impacto vem dos eventos.
    const gs = useGameStore.getState();
    if (gs.specialTick !== prevSpecial.current) {
      prevSpecial.current = gs.specialTick;
      if (gs.specialKind === 'jump' && isGrounded.current) { jumpVelocity.current = 7; isGrounded.current = false; }
      else if (gs.specialKind === 'spin') spinTimer.current = 0.45;
    }
    if (spinTimer.current > 0) {
      spinTimer.current = Math.max(0, spinTimer.current - dt);
      const p = 1 - spinTimer.current / 0.45;
      body.current.rotation.y = currentRotY.current + p * Math.PI * 2;
    }

    // Jump — desligado na câmera livre (Espaço sobe a câmera, não pula o herói).
    if (!freeCam && k.has('Space') && isGrounded.current) {
      jumpVelocity.current = 5;
      isGrounded.current = false;
      k.delete('Space');
    }

    const houseFloor = houseFloorSurfaceY(body.current.position.x, body.current.position.z);
    // Teto some SÓ no top-down/moba (iso). No ombro (third) mantém o teto.
    housePlayerInside.current = houseFloor !== -Infinity && cameraMode === 'iso';
    // Mesmo pra fábrica: dentro + iso → corta o teto; senão prédio inteiro.
    const facCut = factoryRoofCutY(body.current.position.x, body.current.position.z);
    factoryClip.constant = facCut !== null && cameraMode === 'iso' ? facCut : 1e9;
    // Malha das montanhas: pega o CHÃO logo abaixo dos pés (não o topo). Quando há
    // malha (player sobre montanha/caverna), ELA manda — inclusive piso de caverna
    // ABAIXO do chão procedural (senão o Math.max prende o player em 0 e a "colisão
    // acaba" dentro da cave). Fora das montanhas, terreno normal (camp/casa/fábrica).
    const bx = body.current.position.x, bz = body.current.position.z;
    const mountainY = terrainMeshY(bx, bz, body.current.position.y);
    // Sem caverna agora: o player NUNCA fica abaixo do chão base. Pega a superfície
    // MAIS ALTA entre a malha (GLB/rocha), o terreno procedural, a ponte e a casa.
    // Assim a malha do GLB só ERGUE o player (pisar em pedra), nunca o faz cair
    // pra baixo do mapa quando a geometria do GLB fica sob o chão.
    const groundY = Math.max(
      mountainY > -Infinity ? mountainY : -Infinity,
      terrainHeight(bx, bz),
      bridgeSurfaceY(bx, bz),
      houseFloor,
    );

    if (!isGrounded.current) {
      jumpVelocity.current -= 15 * dt;
      body.current.position.y += jumpVelocity.current * dt;
      if (body.current.position.y <= groundY) {
        body.current.position.y = groundY;
        isGrounded.current = true;
        jumpVelocity.current = 0;
      }
    } else {
      body.current.position.y = groundY;
    }

    // Walk + idle animation — coxa balança no quadril, joelho dobra em contratempo;
    // ombro balança oposto à perna, cotovelo mantém leve flexão.
    if (moving && isGrounded.current) {
      idleTime.current = 0;
      walkCycle.current += dt * 12;
      const wc = walkCycle.current;
      const swing = Math.sin(wc) * 0.6;
      const bob = Math.abs(Math.sin(wc * 2)) * 0.04;
      if (leftHip.current) leftHip.current.rotation.x = swing;
      if (rightHip.current) rightHip.current.rotation.x = -swing;
      if (leftKnee.current) leftKnee.current.rotation.x = 0.1 + Math.max(0, Math.sin(wc)) * 0.8;
      if (rightKnee.current) rightKnee.current.rotation.x = 0.1 + Math.max(0, -Math.sin(wc)) * 0.8;
      if (leftShoulder.current) leftShoulder.current.rotation.x = -swing * 0.6;
      if (rightShoulder.current) rightShoulder.current.rotation.x = swing * 0.6;
      if (leftElbow.current) leftElbow.current.rotation.x = 0.25 + Math.abs(swing) * 0.4;
      if (rightElbow.current) rightElbow.current.rotation.x = 0.25 + Math.abs(swing) * 0.4;
      body.current.position.y += bob;
    } else {
      walkCycle.current = 0;
      idleTime.current += dt;
      const breath = Math.sin(idleTime.current * 2.2) * 0.012;
      const sway = Math.sin(idleTime.current * 1.1) * 0.008;
      if (leftHip.current) leftHip.current.rotation.x = 0;
      if (rightHip.current) rightHip.current.rotation.x = 0;
      if (leftKnee.current) leftKnee.current.rotation.x = 0.1;
      if (rightKnee.current) rightKnee.current.rotation.x = 0.1;
      if (leftShoulder.current) leftShoulder.current.rotation.x = sway;
      if (rightShoulder.current) rightShoulder.current.rotation.x = -sway;
      if (leftElbow.current) leftElbow.current.rotation.x = 0.3;
      if (rightElbow.current) rightElbow.current.rotation.x = 0.3;
      body.current.position.y += breath;
    }

    // Ataque — 4 fases. O BRAÇO direito faz o golpe (ergue → desce); a arma
    // acompanha na mão. Sobrescreve a animação do braço direito só enquanto ataca.
    if (sword.current) {
      attackTimer.current += dt;
      const phase = attackPhase.current;
      const t = attackTimer.current;
      let armX = 0;   // <0 ergue o braço, >0 golpe pra baixo/frente
      let wrist = 0;  // pequeno snap do punho no impacto

      if (phase === 'anticipation') {
        armX = -2.5 * Math.min(t / 0.12, 1);   // ergue bem mais o braço
        if (t >= 0.12) { attackPhase.current = 'strike'; attackTimer.current = 0; }
      } else if (phase === 'strike') {
        armX = -2.5 + 3.0 * Math.min(t / 0.08, 1);  // desce e PARA em +0.5 (não passa pra trás)
        wrist = 0.35 * Math.min(t / 0.08, 1);
        if (t >= 0.08) { attackPhase.current = 'impact'; attackTimer.current = 0; }
      } else if (phase === 'impact') {
        armX = 0.5; wrist = 0.35;
        if (t >= 0.06) { attackPhase.current = 'recovery'; attackTimer.current = 0; }
      } else if (phase === 'recovery') {
        const k = Math.max(0, 1 - t / 0.15);
        armX = 0.5 * k; wrist = 0.35 * k;
        if (t >= 0.15) { attackPhase.current = 'idle'; attackTimer.current = 0; }
      }

      const ranged = weaponFor(selectedItemId(useGameStore.getState())).ranged;
      if (phase !== 'idle') {
        if (ranged) {
          // Arma de longe: aponta pra frente e recua um pouco no tiro (não bate).
          const shooting = phase === 'strike' || phase === 'impact';
          if (rightShoulder.current) rightShoulder.current.rotation.x = -1.5 + (shooting ? 0.22 : 0);
          if (rightElbow.current) rightElbow.current.rotation.x = 0.1;
          sword.current.rotation.x = -0.4;  // alinha a arma na horizontal (mira)
        } else {
          if (rightShoulder.current) rightShoulder.current.rotation.x = armX;
          if (rightElbow.current) rightElbow.current.rotation.x = 0.2 + Math.max(0, -armX) * 0.3;
          sword.current.rotation.x = wrist;
        }
      } else {
        sword.current.rotation.x = ranged ? -0.4 : 0;
      }
    }

    tick.current += dt;
    if (tick.current > 0.15) {
      useGameStore.setState(s => ({
        player: { ...s.player, position: { x: body.current!.position.x, z: body.current!.position.z } },
      }));
      onPosition(body.current.position.x, body.current.position.z);
      tick.current = 0;
    }
  });

  const noRaycast = useCallback((raycaster: any, intersects: any[]) => { }, []);

  return (
    <group ref={body} position={[0, 0, 1]} raycast={noRaycast}>
      {/* Selection ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.53, 0.57, 32]} />
        <meshBasicMaterial color={c.gold} transparent opacity={0.7} />
      </mesh>

      {USE_GLB_HERO && (USE_RED_HERO
        ? <GlbHeroMixamo actionRef={heroAction} speedRef={heroSpeed} autoHeight={HERO_HEIGHT * 1.04} rangedAttack weapon={<HeldItem c={c} />} />
        : <GlbHero actionRef={heroAction} speedRef={heroSpeed} autoHeight={HERO_HEIGHT} weapon={<HeldItem c={c} />} />)}

      <group visible={!USE_GLB_HERO}>
        {/* Pernas articuladas: quadril → coxa → joelho → canela → pé */}
        <group ref={leftHip} position={[-0.14, 0.6, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow>
            <capsuleGeometry args={[0.095, 0.15, 8, 20]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <group ref={leftKnee} position={[0, -0.3, 0]}>
            <AdventurerDetails c={c} part="shin" />
            <mesh castShadow>
              <sphereGeometry args={[0.1, 24, 16]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            <mesh position={[0, -0.15, 0.01]} castShadow>
              <capsuleGeometry args={[0.078, 0.14, 8, 20]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            <mesh position={[0, -0.28, 0.07]} scale={[0.091, 0.059, 0.156]} castShadow>
              <sphereGeometry args={[1, 24, 16]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            {/* Cano da bota (couro médio) sobre a canela escura */}
            <mesh position={[0, -0.1, 0.02]} castShadow>
              <cylinderGeometry args={[0.091, 0.082, 0.16, 24]} />
              <meshStandardMaterial color={c.trunk} roughness={0.9} />
            </mesh>
          </group>
        </group>
        <group ref={rightHip} position={[0.14, 0.6, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow>
            <capsuleGeometry args={[0.095, 0.15, 8, 20]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <group ref={rightKnee} position={[0, -0.3, 0]}>
            <AdventurerDetails c={c} part="shin" />
            <mesh castShadow>
              <sphereGeometry args={[0.1, 24, 16]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            <mesh position={[0, -0.15, 0.01]} castShadow>
              <capsuleGeometry args={[0.078, 0.14, 8, 20]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            <mesh position={[0, -0.28, 0.07]} scale={[0.091, 0.059, 0.156]} castShadow>
              <sphereGeometry args={[1, 24, 16]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            {/* Cano da bota (couro médio) sobre a canela escura */}
            <mesh position={[0, -0.1, 0.02]} castShadow>
              <cylinderGeometry args={[0.091, 0.082, 0.16, 24]} />
              <meshStandardMaterial color={c.trunk} roughness={0.9} />
            </mesh>
          </group>
        </group>

        <AdventurerDetails c={c} part="body" />
        <AdventurerDetails c={c} part="torso" />
        <AdventurerDetails c={c} part="skull" />
        <AdventurerDetails c={c} part="hair" />
        <AdventurerDetails c={c} part="head" />
        <AdventurerDetails c={c} part="coat" />
        {/* Goggles follow the curved head; the leather strap wraps the skull. */}
        <mesh position={[0, 1.54, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.92, 1]}>
          <torusGeometry args={[0.184, 0.022, 10, 40]} />
          <meshStandardMaterial color={c.dark} roughness={0.84} />
        </mesh>
        {[-0.085, 0.085].map(lx => (
          <mesh key={lx} position={[lx, 1.54, 0.182]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.048, 0.048, 0.022, 28]} />
            <meshStandardMaterial color={c.metal} metalness={0.65} roughness={0.2} emissive={c.crystal} emissiveIntensity={0.12} />
          </mesh>
        ))}

        {/* Braço esquerdo articulado + escudo no antebraço */}
        <group ref={leftShoulder} position={[-0.38, 1.12, 0.02]}>
          <AdventurerDetails c={c} part="shoulder" />
          <mesh castShadow>
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          {/* Placa de ombro (osso), como no sprite */}
          <mesh position={[0, -0.14, 0]} castShadow>
            <capsuleGeometry args={[0.078, 0.16, 8, 20]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          <group ref={leftElbow} position={[0, -0.28, 0]}>
            <AdventurerDetails c={c} part="bracer" />
            <AdventurerDetails c={c} part="shield" />
            <mesh castShadow>
              <sphereGeometry args={[0.08, 24, 16]} />
              <meshStandardMaterial color={c.armor} />
            </mesh>
            <mesh position={[0, -0.13, 0.01]} castShadow>
              <capsuleGeometry args={[0.068, 0.14, 8, 20]} />
              <meshStandardMaterial color={c.armor} />
            </mesh>
            <mesh position={[0, -0.27, 0.02]} scale={[0.059, 0.069, 0.066]} castShadow>
              <sphereGeometry args={[1, 20, 14]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            {/* Escudo preso ao antebraço */}
            <mesh position={[0, -0.14, 0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.287, 0.275, 0.065, 48]} />
              <meshStandardMaterial color={c.trunk} />
            </mesh>
          </group>
        </group>

        {/* Braço direito articulado — segura a arma na mão (socket hand_R) */}
        <group ref={rightShoulder} position={[0.38, 1.12, 0.02]}>
          <AdventurerDetails c={c} part="shoulder" />
          <mesh castShadow>
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          {/* Placa de ombro menor, lado direito — couro escuro (contrapeso ao osso) */}
          <mesh position={[0, -0.14, 0]} castShadow>
            <capsuleGeometry args={[0.078, 0.16, 8, 20]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          <group ref={rightElbow} position={[0, -0.28, 0]}>
            <AdventurerDetails c={c} part="bracer" />
            <mesh castShadow>
              <sphereGeometry args={[0.08, 24, 16]} />
              <meshStandardMaterial color={c.armor} />
            </mesh>
            <mesh position={[0, -0.13, 0.01]} castShadow>
              <capsuleGeometry args={[0.068, 0.14, 8, 20]} />
              <meshStandardMaterial color={c.armor} />
            </mesh>
            <mesh position={[0, -0.27, 0.02]} scale={[0.059, 0.069, 0.066]} castShadow>
              <sphereGeometry args={[1, 20, 14]} />
              <meshStandardMaterial color={c.dark} />
            </mesh>
            {/* Pose-base da mão; o ataque gira o grupo interno `sword`. */}
            <group position={[0, -0.3, 0.08]} rotation={[0.5, 0, 0]}>
              <group ref={sword}>
                <HeldItem c={c} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}


function GrassPatches({ c, count }: { c: Palette; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.ConeGeometry(0.09, 0.35, 3), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: c.grass }), [c.grass]);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = (rand(i + 1400) - 0.5) * MAP_HALF * 2;
      const z = (rand(i + 1900) - 0.5) * MAP_HALF * 2;
      const y = terrainHeight(x, z) + 0.1;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rand(i) * 6, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  return <instancedMesh ref={ref} args={[geo, mat, count]} />;
}

function RockInstances({ c }: { c: Palette }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.DodecahedronGeometry(0.8, 0), []);
  const mat = useMemo(
    () => makeInstanceFadeMaterial(new THREE.MeshStandardMaterial({ color: c.rock, flatShading: true })),
    [c.rock],
  );

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    const count = 100;
    for (let i = 0; i < count; i++) {
      const x = (rand(i + 911) - 0.5) * MAP_HALF * 1.8;
      const z = (rand(i + 1200) - 0.5) * MAP_HALF * 1.8;
      const size = 0.25 + rand(i + 90) * 0.9;
      const y = terrainHeight(x, z) + 0.35 * size;
      dummy.position.set(x, y, z);
      dummy.scale.set(size, 0.7 * size, 0.85 * size);
      dummy.rotation.set(0.15, x * 0.5, 0.1);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    return registerInstancedFade(ref.current, [[0, 0, 0, 0.8]]);
  }, []);

  return <instancedMesh ref={ref} args={[geo, mat, 100]} castShadow receiveShadow />;
}

/**
 * Luz + névoa guiadas pelo ciclo dia/noite (30 min reais = 1 dia). Atualiza sol,
 * ambiente, fundo e névoa a cada quadro a partir do relógio real; não mexe em
 * regra de jogo nenhuma — é só iluminação.
 */
function DayNightLighting({ c }: { c: Palette }) {
  const dir = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const fog = useRef(new THREE.Fog(c.ground, 80, 180));
  const bg = useRef(new THREE.Color(c.ground));

  useEffect(() => {
    scene.fog = fog.current;
    scene.background = bg.current;
    // A sombra NÃO precisa re-renderizar todo quadro: o sol anda devagar. Desligo
    // o autoUpdate e marco needsUpdate a ~15 Hz (ver abaixo) — corta ~75% dos
    // passes de sombra (o mais caro da cena, com ~70 criaturas) sem perda visível.
    const d = dir.current;
    if (d) { d.shadow.autoUpdate = false; d.shadow.needsUpdate = true; }
  }, [scene]);

  const shadowAccum = useRef(0);
  useFrame((_s, delta) => {
    const s = dayNight();
    if (dir.current) {
      dir.current.position.set(s.sunPos[0], s.sunPos[1], s.sunPos[2]);
      dir.current.color.set(s.sunColor);
      dir.current.intensity = s.sunIntensity;
    }
    if (amb.current) {
      amb.current.color.set(s.ambientColor);
      amb.current.intensity = s.ambientIntensity;
    }
    fog.current.color.set(s.fogColor);
    fog.current.near = s.fogNear;
    fog.current.far = s.fogFar;
    bg.current.set(s.fogColor);

    // Re-renderiza o shadow map ~15x/s (não 60): sombra de objeto em movimento
    // atualiza fluido o bastante, mas pulamos ~3/4 dos passes.
    shadowAccum.current += delta;
    if (dir.current && shadowAccum.current >= 1 / 15) {
      shadowAccum.current = 0;
      dir.current.shadow.needsUpdate = true;
    }
  });

  return (
    <>
      <ambientLight ref={amb} intensity={1.5} color={c.light} />
      <directionalLight
        ref={dir}
        position={[-12, 25, 8]}
        intensity={2.8}
        color={c.light}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.001}
        shadow-normalBias={0.035}
        shadow-camera-far={180}
      />
    </>
  );
}

/**
 * Lua (meia-lua) no céu noturno. Billboard: dois discos que encaram a câmera —
 * um pálido (a lua) e um escuro deslocado por cima, que "recorta" a meia-lua.
 * Aparece ao anoitecer (`nightFactor`) e some de dia. Só clima/leitura, lift
 * suave na noite pra não ficar breu. Sem custo por quadro além do lookAt.
 */
function Moon() {
  const grp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const nf = nightFactor();
    g.visible = nf > 0.12;
    if (nf > 0.12) {
      g.lookAt(camera.position);
      g.scale.setScalar(0.7 + nf * 0.35);
    }
  });
  return (
    <group ref={grp} position={[62, 80, -96]}>
      <mesh renderOrder={1}>
        <circleGeometry args={[7, 32]} />
        <meshBasicMaterial color="#eef1f8" fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[3, 0.9, 0]} renderOrder={2}>
        <circleGeometry args={[7.1, 32]} />
        <meshBasicMaterial color="#141f38" fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Marco da ZONA SEGURA no chão (no spawn): anel verde + preenchimento suave,
 * igual ao círculo dos acampamentos. Aqui nenhum inimigo/boss entra
 * (a barreira vive em `pushOutSafeZone`, na IA hostil). Só visual, sem custo.
 */
function SafeZoneMarker() {
  const y = terrainHeight(SAFE_ZONE.x, SAFE_ZONE.z) + 0.05;
  return (
    <group position={[SAFE_ZONE.x, y, SAFE_ZONE.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[SAFE_ZONE.radius - 0.6, SAFE_ZONE.radius, 56]} />
        <meshBasicMaterial color="#6fe3b0" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[SAFE_ZONE.radius, 56]} />
        <meshBasicMaterial color="#2fa877" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Sol: disco claro e chapado, baixo no céu, que nasce/cruza/se põe com o ciclo
 * (`dayNight().sunPos`) e some à noite (a lua assume). É MALHA na cena (não um
 * sprite no pós) de propósito: o bloom o acende de graça, o relevo o recorta no
 * horizonte e ele concorda com a direção da luz direcional (mesma `sunPos`).
 * Billboard: encara a câmera como a lua. `depthWrite=false` pra não ganhar
 * contorno — e é justamente por não escrever profundidade que o filtro consegue
 * poupá-lo: os pixels do disco continuam sendo "fundo", e a máscara de tela em
 * volta da posição projetada do sol (`uSunScreen`/`uSunScreenR`, em
 * cel-style.ts) os deixa intactos. Se o relevo cobre o sol, aquele pixel passa
 * a ter profundidade de terreno e a máscara se desliga sozinha — a oclusão
 * continua correta.
 *
 * MEDIDO em 3ª pessoa: virando a câmera pro sol, o disco entra no quadro
 * (sunU 0.43 / sunV 0.62 às 17h36; sunU 0.66 / sunV 0.63 às 7h30) — o jogador
 * alcança o sol de manhã e no fim da tarde. Ao meio-dia ele fica acima do
 * quadro (sunV 1.53) e só o halo de horizonte lê. Em iso o sol nunca aparece
 * (sunV -6.6 medido): lá o efeito inteiro é um no-op.
 * Desliga junto com `CEL.sky.enabled`.
 */
function Sun() {
  const grp = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const day = 1 - nightFactor();
    g.visible = CEL.sky.enabled && day > 0.02;
    if (!g.visible) return;
    const s = dayNight();
    const len = Math.hypot(s.sunPos[0], s.sunPos[1], s.sunPos[2]) || 1;
    const R = CEL.sky.sunDistance;
    g.position.set((s.sunPos[0] / len) * R, (s.sunPos[1] / len) * R, (s.sunPos[2] / len) * R);
    g.lookAt(camera.position);
  });
  return (
    <group ref={grp}>
      <mesh>
        <circleGeometry args={[CEL.sky.sunRadius, 40]} />
        <meshBasicMaterial color={CEL.sky.sunColor} depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Pontos da estrada (coord. de mundo). Compartilhados entre o asfalto e as
// luminárias, pra os postes ficarem exatamente na beira do caminho.
const ROAD_POINTS: [number, number][] = [
  [-60, 40], [-40, 28], [-18, 12], [-7, 6], [0, 1], [4, -3], [7, -8], [16, -14], [28, -22], [45, -38], [60, -55],
];

/** Poste de luz da estrada: apaga de dia, acende (tremeluzindo) ao anoitecer. */
/** Distância² (m²) além da qual uma luz de cenário é desligada (sai do shader).
 *  Alcance das luzes é ~9-13 m, então ~24 m já não ilumina nada perto do jogador. */
const LIGHT_CULL_D2 = 24 * 24;

/** Falso só no 1º load da sessão (vira true após spawnar na zona segura).
 *  Reinicia a cada reload de página = cada login entra na zona segura. */
let didInitialSpawn = false;

const LIGHT_POST_URL = '/models/props/light-post.glb';
const LIGHT_POST_H = 4.2; // +30% (Pedro) — poste Mad Max mais alto

function RoadLamp({ x, y, z }: { x: number; y: number; z: number }) {
  const light = useRef<THREE.PointLight>(null);
  const { scene } = useGLTF(LIGHT_POST_URL);
  // Modelo GLB escalado + fincado no chão + centrado (clone por instância; GLB cacheado).
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    const box = new THREE.Box3().setFromObject(c);
    const h = box.max.y - box.min.y || 1;
    c.scale.setScalar(LIGHT_POST_H / h);
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    return c;
  }, [scene]);
  useFrame(() => {
    const nf = nightFactor();
    const flick = 0.9 + Math.sin(performance.now() * 0.006 + x * 1.3) * 0.1;
    const l = light.current;
    if (!l) return;
    // Culling de luz: de dia (nf~0) ou longe do jogador, a luz SAI do shader.
    const p = useGameStore.getState().player.position;
    const near = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < LIGHT_CULL_D2;
    l.visible = nf > 0.04 && near;
    if (l.visible) l.intensity = nf * 6.6 * flick;
  });
  return (
    <group position={[x, y, z]}>
      <primitive object={model} />
      <pointLight ref={light} position={[0, LIGHT_POST_H * 0.9, 0]} color="#ffcf87" intensity={0} distance={13} decay={1.6} />
    </group>
  );
}
useGLTF.preload(LIGHT_POST_URL);

const MAZE_URL = '/models/props/maze.glb';
/** Labirinto gigante (Meshy decimado ~100k tris) numa área aberta distante — o
 *  personagem anda por ele. Escalado p/ `size` m de lado. Visual (colisão = TODO). */
function Maze({ x, z, size = 52, yaw = 0 }: { x: number; z: number; size?: number; yaw?: number }) {
  const { scene } = useGLTF(MAZE_URL);
  const ref = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    return c;
  }, [scene, size]);
  // Paredes do labirinto = colisão horizontal (anda nos corredores, barra na parede).
  useEffect(() => {
    if (!ref.current) return;
    return registerWall(ref.current);
  }, []);
  const tv = useTerrainVersion();
  const y = useMemo(() => glbSurfaceY(x, z, terrainHeight(x, z)), [x, z, tv]);
  return <group ref={ref} position={[x, y, z]} rotation={[0, yaw, 0]}><primitive object={model} /></group>;
}
useGLTF.preload(MAZE_URL);

function TerrainMesh({ c, onAttack, paused }: { c: Palette; onAttack?: (() => void) | undefined; paused?: boolean | undefined }) {
  const size = MAP_HALF * 2 + 40;
  const geo = useMemo(() => {
    const segments = 200;
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    // A malha é um PlaneGeometry girado -90° em X: o Y local do plano vira o
    // -Z do mundo. O jogador, árvores e acampamentos amostram terrainHeight(x,
    // z) em coordenadas de mundo, então aqui passamos -y para a altura casar
    // exatamente com o chão que se pisa (senão afunda no relevo).
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, terrainHeight(x, -y));
    }
    g.computeVertexNormals();

    // Manchas de cor no chão (cores de vértice): o terreno chapado e uniforme
    // lia como um banho sépia único — a referência tem terra requeimada com
    // placas de terra clara, areia e crosta escura. Ruído de baixa frequência
    // mistura ground → escuro (crosta) / claro (poeira+areia), dando famílias
    // de cor separadas e o contraste de pôster (quebra a uniformidade do
    // terminador plano). Puramente cor; não mexe no relevo nem na colisão.
    const base = new THREE.Color(c.ground);
    const scorch = new THREE.Color(c.dark).lerp(new THREE.Color(c.trunk), 0.45); // crosta quase preta
    const dust = new THREE.Color(c['ground-light']);  // poeira
    const sand = new THREE.Color(c.path);             // areia clara
    const bone = new THREE.Color(c.light).lerp(new THREE.Color(c.path), 0.5);    // placa clara de pó
    const burnt = new THREE.Color(c['rock']);         // placa cinza-terra
    // Cores da montanha IGUAIS às laterais do Caio (distant-landscape): moss →
    // stone → neve, pra a montanha andável harmonizar com o horizonte.
    const mossCol = new THREE.Color(c.leaf).lerp(new THREE.Color('#ffffff'), 0.5);
    const stoneCol = new THREE.Color(c['rock-light']).lerp(new THREE.Color('#ffffff'), 0.72);
    const snowCol = new THREE.Color('#f2f5fa');       // neve do topo
    const nz = (x: number, z: number, s: number) =>
      Math.sin(x * s + 1.7) * Math.cos(z * s + 2.3) + Math.sin((x + z) * s * 0.7 + 0.5) * 0.5;
    const colors = new Float32Array(pos.count * 3);
    // Mistura dirt↔grass: a MESMA placa de baixa frequência que escolhe a cor
    // de vértice também decide onde entra a textura de grama seca. Crosta
    // escura (scorch) fica terra pelada. Multiplica com a cor de vértice no
    // shader, então a variação requeimada sobrevive.
    const blend = new Float32Array(pos.count);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = -pos.getY(i);
      const n = nz(x, z, 0.09) * 0.55 + nz(x, z, 0.22) * 0.3 + nz(x, z, 0.5) * 0.18; // ~[-1.1,1.1]
      const patch = nz(x, z, 0.035); // placas grandes (qual família de clara)
      tmp.copy(base);
      if (n < -0.04) {
        tmp.lerp(scorch, Math.min(1, (-0.04 - n) / 0.7));       // crosta escura (funda)
      } else if (n > 0.06) {
        const t = Math.min(1, (n - 0.06) / 0.7);
        tmp.lerp(patch > 0.25 ? bone : (patch > -0.2 ? sand : dust), t); // pó claro / areia / poeira
      } else if (patch > 0.5) {
        tmp.lerp(burnt, 0.5);                                   // placa cinza-terra
      }
      // Montanha: moss (verde no pé) → stone (rocha clara) → neve no topo —
      // mesma leitura das montanhas laterais (distant-landscape do Caio).
      const mh = snowMountainBump(x, z);
      let snowGrass = 1;
      if (mh > 0.5) {
        tmp.lerp(mossCol, Math.min(1, mh / 2) * 0.35);                         // verdinho SÓ no pezinho (fraco)
        tmp.lerp(stoneCol, Math.min(1, Math.max(0, (mh - 1.5) / 5)));          // ROCHA cedo e forte (realista)
        const snowT = Math.min(1, Math.max(0, (mh - SNOW_MOUNTAIN.peak * 0.38) / (SNOW_MOUNTAIN.peak * 0.35)));
        tmp.lerp(snowCol, snowT);                                              // neve no alto
        snowGrass = Math.max(0, 1 - mh / 3); // sem grama já na rocha baixa
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      // Grama nas placas (patch alto), apagada na crosta escura.
      let grassAmt = THREE.MathUtils.clamp((patch + 0.15) / 0.65, 0, 1);
      if (n < -0.02) grassAmt *= 0.18;
      blend[i] = grassAmt * snowGrass;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aBlend', new THREE.BufferAttribute(blend, 1));
    return g;
  }, [c, size]);

  // Photographic PBR surface at a 3 m tile; macro vegetation tint stays subtle.
  const mat = useMemo(() => {
    const repeat = size / 3;
    // A chapa jogável usa a textura terrosa que também aparece fora do mapa.
    // O GLB do deserto permanece intacto e continua sendo outra camada.
    const groundMaps = pbrMaps('worn_rock_natural_01', repeat);
    const m = new THREE.MeshStandardMaterial({ ...groundMaps, roughness: 1, normalScale: new THREE.Vector2(0.75, 0.75) });
    m.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBlend;\nvarying float vBlend;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = aBlend;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBlend;')
        .replace('#include <map_fragment>', /* glsl */ `
          #ifdef USE_MAP
            diffuseColor.rgb *= texture2D(map, vMapUv).rgb;
            // A textura original continua visível, mas recebe uma mistura
            // uniforme de areia/barro para reduzir o verde excessivo do chão.
            // O relevo, a malha e a colisão permanecem exatamente iguais.
            // Barro/sertão discreto: aquece e escurece o marrom sem puxar para vermelho.
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.55, 0.40, 0.24 ), 0.42 );
            // Aproxima o chão jogável do tom do anel externo, sem mudar relevo ou água.
            diffuseColor.rgb *= vec3( 0.75, 0.66, 0.53 );
            // Dica leve de grama (olive dessaturado) só onde vBlend é alto.
            diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.97, 1.0, 0.88 ), vBlend * 0.15 );
          #endif
        `);
    };
    m.customProgramCacheKey = () => 'ground-pbr-v6-sertão-earth-match-dark';
    return m;
  }, [size]);

  // Sem handler de ponteiro aqui de propósito: o ataque por clique é tratado
  // uma única vez pelo listener de `mousedown` em `WorldScene`. Antes os dois
  // disparavam e um clique valia dois ataques.
  void onAttack;
  void paused;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow geometry={geo} material={mat} />
  );
}

// WATER_MOTION — ajustes da água gráfica; distâncias em metros, tempo em segundos.
const WATER_MOTION = {
  riverSpeed: 0.85,
  riverFrequency: 2.4,
  riverCrossFrequency: 3.2,
  riverBend: 0.45,
  lakeFrequency: 2.1,
  lakeCrossFrequency: 1.3,
  lakeSpeed: 1.15,
  lakeCrossWeight: 0.3,
  darkThreshold: -0.25,
  lightThreshold: 0.65,
  darkTone: 0.95,
  lightTone: 1.035,
  lakeOpacity: 0.75,
  riverOpacity: 0.82,
};

function WaterMaterial({ color, time, river = false }: {
  color: string;
  time: { value: number };
  river?: boolean;
}) {
  const onBeforeCompile = useCallback<THREE.MeshStandardMaterial['onBeforeCompile']>((shader) => {
    const w = WATER_MOTION;
    const f = (n: number) => n.toFixed(5);
    shader.uniforms['uWaterTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterCoord;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWaterCoord = ${river ? 'uv' : 'position.xy'};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWaterCoord;
        uniform float uWaterTime;
        float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float waterNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(waterHash(cell), waterHash(cell + vec2(1.0, 0.0)), f.x),
            mix(waterHash(cell + vec2(0.0, 1.0)), waterHash(cell + vec2(1.0)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        ${river ? `
          // Advecção no sentido crescente da curva, inclusive nas curvas fechadas.
          float phase = (vWaterCoord.x - uWaterTime * ${f(w.riverSpeed)}) * ${f(w.riverFrequency)};
          float crossWave = cos(vWaterCoord.y * ${f(w.riverCrossFrequency)});
          float wave = sin(phase + crossWave * ${f(w.riverBend)});
        ` : `
          // Nós espaciais fixos: oscila no lugar, sem corrente nem translação.
          float pulse = uWaterTime * ${f(w.lakeSpeed)};
          float rings = cos(length(vWaterCoord) * ${f(w.lakeFrequency)});
          float crossed = cos(vWaterCoord.x * ${f(w.lakeCrossFrequency)})
                        * cos(vWaterCoord.y * ${f(w.lakeCrossFrequency)});
          float wave = rings * cos(pulse)
                     + crossed * sin(pulse) * ${f(w.lakeCrossWeight)};
        `}
        float waterTone = mix(${f(w.darkTone)}, 1.0, smoothstep(-0.7, 0.3, wave));
        waterTone = mix(waterTone, ${f(w.lightTone)}, smoothstep(0.55, 1.0, wave));
        diffuseColor.rgb *= waterTone;
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 rippleCoord = vWaterCoord * vec2(1.0, ${river ? '2.0' : '1.0'});
        vec2 flow = rippleCoord + vec2(-uWaterTime * 0.23, uWaterTime * 0.037);
        float detailVisibility = 1.0 - smoothstep(0.2, 0.8, length(fwidth(rippleCoord * 9.0)));
        float ripple = waterNoise(flow * 3.1) * 0.025
          + waterNoise(flow * 7.7 + vec2(19.2, uWaterTime * 0.08)) * 0.006 * detailVisibility;
        vec3 waterDx = dFdx(-vViewPosition), waterDy = dFdy(-vViewPosition);
        vec3 waterR1 = cross(waterDy, normal), waterR2 = cross(normal, waterDx);
        float waterDet = dot(waterDx, waterR1);
        vec3 waterGradient = sign(waterDet) * (dFdx(ripple) * waterR1 + dFdy(ripple) * waterR2);
        normal = normalize(abs(waterDet) * normal - waterGradient);
      `);
  }, [river, time]);
  const cacheKey = useCallback(() => `water-ripple-pbr-v2-${river ? 'river' : 'lake'}`, [river]);

  return (
    <meshStandardMaterial
      color={color}
      roughness={0.3}
      metalness={0}
      transparent
      opacity={river ? WATER_MOTION.riverOpacity : WATER_MOTION.lakeOpacity}
      depthWrite={false}
      side={river ? THREE.DoubleSide : THREE.FrontSide}
      onBeforeCompile={onBeforeCompile}
      customProgramCacheKey={cacheKey}
    />
  );
}

/** Rótulos legíveis dos nós de colheita para a inspeção da câmera livre. */
const NODE_LABEL: Record<string, string> = {
  tree: 'Árvore', pebble: 'Seixo', rock: 'Rocha',
  iron_vein: 'Veio de ferro', gold_vein: 'Veio de ouro', crystal: 'Cristal arcano',
};

/**
 * Inspeção da câmera livre: projeta criaturas / nós / peças da base na tela e
 * escolhe o que está mais perto da mira central (retículo). Roda ~4x/s, então
 * pode projetar (aloca só o estritamente necessário via `scratch` reutilizado).
 * Escreve em `out` no lugar — sem criar objeto por chamada.
 */
function inspectCenter(camera: THREE.Camera, scratch: THREE.Vector3, out: FreeCamInspect) {
  const st = useGameStore.getState();
  const THRESH = 0.12; // raio em NDC (tela [-1,1]) ao redor do centro
  let bestD = THRESH;
  let found = false;

  const consider = (
    x: number, y: number, z: number,
    kind: FreeCamInspect['kind'], name: string, hp: string, state: string, id: string,
  ) => {
    scratch.set(x, y, z);
    scratch.project(camera);
    if (scratch.z < -1 || scratch.z > 1) return; // fora do frustum (perto/longe)
    const d = Math.hypot(scratch.x, scratch.y);
    if (d >= bestD) return;
    bestD = d;
    found = true;
    out.kind = kind; out.name = name; out.hp = hp; out.state = state; out.id = id;
  };

  for (const cr of st.creatures) {
    if (cr.behavior === 'dead') continue;
    const y = terrainHeight(cr.position.x, cr.position.z) + 1;
    consider(cr.position.x, y, cr.position.z, 'creature', cr.name,
      `${Math.round(cr.hp)} / ${cr.maxHp}`, `behavior: ${cr.behavior}`, cr.id);
  }
  for (const n of st.harvestNodes) {
    if (n.depleted) continue;
    const y = terrainHeight(n.position.x, n.position.z) + 0.6;
    consider(n.position.x, y, n.position.z, 'node', NODE_LABEL[n.kind] ?? n.kind,
      '', `${n.quantity} / ${n.maxQuantity}`, n.id);
  }
  const pb = st.playerBase;
  if (pb) {
    for (const piece of pb.pieces) {
      const c = cellCenter(piece.cell);
      consider(c.x, terrainHeight(c.x, c.z) + 1, c.z, 'base', `Base · ${piece.kind}`,
        `${Math.round(piece.hp)} / ${piece.maxHp}`, `tier ${piece.tier}`, piece.id);
    }
  }

  if (!found && out.kind !== null) {
    out.kind = null; out.name = ''; out.hp = ''; out.state = ''; out.id = '';
  }
}

function WorldScene(props: WorldProps & { c: Palette; cameraMode: CameraMode }) {
  const { c, cameraMode } = props;
  const [showAshlandPilot, setShowAshlandPilot] = useState(false);
  useEffect(() => {
    setShowAshlandPilot(new URLSearchParams(window.location.search).get('asset-pilot') === 'ashland');
  }, []);
  const waterTime = useRef({ value: 0 }).current;
  const target = useRef(new THREE.Vector3(0, 0, 1));
  const { camera, size, gl } = useThree();
  const camTarget = useRef(new THREE.Vector3(24, 29, 25));
  const camLookAt = useRef(new THREE.Vector3(0, 0, 1));
  const playerRef = useRef<THREE.Group | null>(null);
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(-0.3);
  const camDist = useRef(5);
  const camDistTarget = useRef(5);
  const pointerLocked = useRef(false);
  const prevCameraMode = useRef(cameraMode);
  const isoYaw = useRef(0);            // giro 360° da câmera de cima (MOBA): botão direito / 1 dedo
  const isoDragging = useRef(false);   // arrastando o botão direito pra girar
  const isoZoom = useRef<number | null>(null);
  const editorPan = useRef(new THREE.Vector3()); // deslocamento da câmera MOBA no modo edit (pan)
  const editorPanning = useRef(false);           // arrastando (botão direito) p/ mover a câmera no editor
  const prevSel = useRef<string | null>(null);   // último objeto selecionado (p/ focar a câmera ao trocar)

  // Câmera livre (dev): teclas, posição e vetores de rascunho (criados 1x, nunca
  // alocados por quadro). Métrica/inspeção escrevem no bridge `free-cam.ts`.
  const freeKeys = useRef(new Set<string>());
  const freePos = useRef(new THREE.Vector3(0, 10, 0));
  const freeInit = useRef(false);
  const freeLook = useRef(new THREE.Vector3());
  const probe = useRef(new THREE.Vector3());
  const metricAccum = useRef({ frames: 0, time: 0, next: 0 });

  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      const defaultZoom = Math.max(12, Math.min(33, size.width / 32));
      isoZoom.current = isoZoom.current === null
        ? defaultZoom
        : THREE.MathUtils.clamp(isoZoom.current, 12, Math.max(36, defaultZoom));
      camera.zoom = isoZoom.current;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseMove = (e: MouseEvent) => {
      // Editor: arrastar c/ botão DIREITO move a câmera de cima pelo mapa (pan), desacoplada do player.
      if (editorPanning.current) {
        const a = isoYaw.current;
        const z = isoZoom.current ?? 20;
        const speed = 1.6 / z; // mais zoom → pan mais fino
        const dx = -e.movementX * speed, dz = -e.movementY * speed;
        editorPan.current.x += dx * Math.cos(a) - dz * Math.sin(a);
        editorPan.current.z += dx * Math.sin(a) + dz * Math.cos(a);
        return;
      }
      // Câmera de cima (MOBA): arrastar c/ botão DIREITO gira 360° ao redor do boneco.
      if (isoDragging.current) {
        isoYaw.current -= e.movementX * 0.006;
        return;
      }
      if (!pointerLocked.current) return;
      const sensitivity = 0.0025;
      cameraYaw.current -= e.movementX * sensitivity;
      cameraPitch.current = THREE.MathUtils.clamp(
        cameraPitch.current - e.movementY * sensitivity, -1.0, 0.65,
      );
    };

    const onLockChange = () => {
      pointerLocked.current = document.pointerLockElement === canvas;
    };

    // Zoom: na MOBA afasta/aproxima em faixa limitada; na terceira pessoa muda
    // a distância e na câmera livre ajusta a velocidade-base de voo.
    const onWheel = (e: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      if (cameraMode === 'free') {
        e.preventDefault();
        adjustFreeCamSpeed(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        return;
      }
      if (cameraMode === 'iso') {
        e.preventDefault();
        if (!(camera instanceof THREE.OrthographicCamera)) return;
        const defaultZoom = Math.max(12, Math.min(33, size.width / 32));
        isoZoom.current = THREE.MathUtils.clamp((isoZoom.current ?? defaultZoom) - e.deltaY * 0.025, 12, Math.max(36, defaultZoom));
        camera.zoom = isoZoom.current;
        camera.updateProjectionMatrix();
        return;
      }
      if (cameraMode !== 'third') return;
      e.preventDefault();
      camDistTarget.current = THREE.MathUtils.clamp(camDistTarget.current + e.deltaY * 0.01, 3, 8);
    };

    const onClick = () => {
      if (isEditorActive()) return;
      if ((cameraMode === 'third' || cameraMode === 'free') && !pointerLocked.current && !props.paused && !isBuildActive()) {
        canvas.requestPointerLock();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isEditorActive()) {
        // No editor, câmera MOBA (iso): botão DIREITO arrasta pra mover a câmera pelo mapa.
        if (e.button === 2 && cameraMode === 'iso') editorPanning.current = true;
        return;
      }
      // Botão DIREITO no modo de cima: inicia o giro 360° da câmera (não ataca/anda).
      if (e.button === 2 && cameraMode === 'iso') { isoDragging.current = true; return; }
      // Câmera livre (Caio): clique nunca ataca — a inspeção é pela mira central.
      if (cameraMode === 'free') return;
      // Clique já consumido por um inimigo / estrutura / recurso não ataca.
      if (wasPointerConsumed(e)) return;
      // Modo de construção: o clique é do arrasto de muro, nunca ataque.
      if (isBuildActive()) return;
      if (e.button === 0 && !props.paused && props.onAttack) {
        if (pointerLocked.current || e.target === canvas) {
          props.onAttack();
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) { isoDragging.current = false; editorPanning.current = false; }
    };
    // Botão direito gira a câmera no modo de cima → suprime o menu de contexto do navegador.
    const onContextMenu = (e: MouseEvent) => { if (cameraMode === 'iso') e.preventDefault(); };

    // Touch (mobile): arrastar 1 dedo gira a câmera no 3ª pessoa; TAP no chão
    // anda até o ponto (modo manual). Reusa a infra de "clique-pra-andar": basta
    // setar o alvo `target` que o personagem já persegue quando não há WASD.
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const tmpNdc = new THREE.Vector2();
    const tmpHit = new THREE.Vector3();
    const walkTo = (clientX: number, clientY: number) => {
      if (useGameStore.getState().objectives.mode === 'idle') return; // só no manual
      const r = canvas.getBoundingClientRect();
      tmpNdc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(tmpNdc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, tmpHit)) target.current.set(tmpHit.x, 0, tmpHit.z);
    };

    let startX = 0, startY = 0, lastTX = 0, lastTY = 0, moved = false;
    const onTouchStart = (e: TouchEvent) => {
      if (props.paused || e.touches.length !== 1 || isBuildActive()) return;
      const t = e.touches[0]!;
      startX = lastTX = t.clientX; startY = lastTY = t.clientY; moved = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      if (Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY) > 10) moved = true;
      if (cameraMode === 'third') {
        const sensitivity = 0.005;
        cameraYaw.current -= (t.clientX - lastTX) * sensitivity;
        cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current - (t.clientY - lastTY) * sensitivity, -1.0, 0.65);
        e.preventDefault(); // enquanto gira: evita scroll/zoom da página
      } else if (cameraMode === 'iso' && moved) {
        // Câmera de cima: arrastar 1 dedo gira 360° (o TAP continua andando até o ponto).
        isoYaw.current -= (t.clientX - lastTX) * 0.006;
        e.preventDefault();
      }
      lastTX = t.clientX; lastTY = t.clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!moved && t && !props.paused && !isBuildActive()) {
        walkTo(t.clientX, t.clientY);
        e.preventDefault(); // suprime o mousedown sintetizado (tap não ataca)
      }
      moved = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    // Captura antes de overlays transparentes/HUD; o filtro acima mantém a roda
    // da sidebar fora do controle da câmera.
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('wheel', onWheel, true);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      if (pointerLocked.current) document.exitPointerLock();
    };
  }, [gl, cameraMode, props.paused]);

  useEffect(() => {
    isoDragging.current = false; // ao trocar de modo, nunca fica "preso" girando
    if (cameraMode === 'iso' && pointerLocked.current) {
      document.exitPointerLock();
    }
  }, [cameraMode]);

  // Teclado da câmera livre. Vive à parte do movimento do herói: WASD/Q/E/Space/
  // Ctrl voam; [ ] mudam o alcance de visão (far) na borda da tecla. O bridge
  // sinaliza ao HUD que o modo está ativo e reinicia a posição na entrada.
  useEffect(() => {
    setFreeCamActive(cameraMode === 'free');
    if (cameraMode !== 'free') { freeKeys.current.clear(); freeInit.current = false; return undefined; }
    const FREE_CODES = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'Space',
      'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight',
    ]);
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'BracketLeft') { adjustFreeCamFar(-20); return; }
      if (e.code === 'BracketRight') { adjustFreeCamFar(20); return; }
      if (FREE_CODES.has(e.code)) { if (e.code === 'Space') e.preventDefault(); freeKeys.current.add(e.code); }
    };
    const up = (e: KeyboardEvent) => freeKeys.current.delete(e.code);
    const clear = () => freeKeys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      freeKeys.current.clear();
    };
  }, [cameraMode]);

  useFrame(({ clock }, delta) => {
    waterTime.value = clock.elapsedTime;
    const p = playerRef.current;
    if (!p) return;

    const px = p.position.x;
    const py = p.position.y;
    const pz = p.position.z;

    const modeChanged = prevCameraMode.current !== cameraMode;
    prevCameraMode.current = cameraMode;

    if (cameraMode === 'iso') {
      // Offset horizontal (24,24) GIRADO por isoYaw → vê os outros lados (360°).
      // Altura fixa em 29. Com isoYaw=0 é idêntico ao ângulo atual (sem regressão).
      const a = isoYaw.current;
      const rx = 24 * Math.cos(a) - 24 * Math.sin(a);
      const rz = 24 * Math.sin(a) + 24 * Math.cos(a);
      // Modo edit: `editorPan` desacopla a câmera do player p/ navegar/editar de cima.
      // Fora do editor zera → volta a centrar no player (sem regressão).
      if (!isEditorActive()) { editorPan.current.set(0, 0, 0); prevSel.current = null; }
      else {
        // Focar ao SELECIONAR: ao trocar de objeto, centra a câmera nele (como no Max/
        // Blender) — resolve "clico, seleciono e fico preso" quando o objeto está longe.
        const ed = useEditorStoreCam.getState();
        if (ed.selectedId !== prevSel.current) {
          prevSel.current = ed.selectedId;
          const o = ed.objects.find(x => x.id === ed.selectedId);
          if (o) editorPan.current.set(o.transform.position[0] - px, 0, o.transform.position[2] - pz);
        }
      }
      const cx = px + editorPan.current.x, cz = pz + editorPan.current.z;
      const wantPos = new THREE.Vector3(cx + rx, 29, cz + rz);
      const lerpFactor = modeChanged ? 1 : 0.06;
      camTarget.current.lerp(wantPos, lerpFactor);
      camera.position.copy(camTarget.current);
      camLookAt.current.lerp(new THREE.Vector3(cx, py, cz), lerpFactor);
      camera.lookAt(camLookAt.current);
    } else if (cameraMode === 'free') {
      const free = getFreeCam();
      const yaw = cameraYaw.current;
      const pitch = cameraPitch.current;
      // Direção de visão (inclui o pitch: WASD voam no plano da tela).
      const fx = Math.sin(yaw) * Math.cos(pitch);
      const fy = Math.sin(pitch);
      const fz = Math.cos(yaw) * Math.cos(pitch);
      // Lateral no plano do chão (strafe) — perpendicular ao yaw.
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);

      if (modeChanged || !freeInit.current) {
        // Entra onde a câmera do jogo já estava, para não teletransportar a vista.
        freePos.current.copy(camera.position);
        freeInit.current = true;
        // Sincroniza o far ao plano atual da câmera, reiniciando no padrão.
        if (camera instanceof THREE.PerspectiveCamera) free.far = camera.far;
      }

      const k = freeKeys.current;
      const mf = Number(k.has('KeyW')) - Number(k.has('KeyS'));
      // Lateral da câmera: A = direita e D = esquerda no referencial atual do mundo.
      // Invertido aqui para corresponder ao arrasto visual da câmera livre.
      const mr = Number(k.has('KeyA')) - Number(k.has('KeyD'));
      const mu = Number(k.has('KeyE') || k.has('Space')) - Number(k.has('KeyQ') || k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight'));
      let speed = free.speed;
      if (k.has('ShiftLeft') || k.has('ShiftRight')) speed *= 3;
      if (k.has('AltLeft') || k.has('AltRight')) speed *= 0.25;
      const step = THREE.MathUtils.clamp(speed, FREE_SPEED_MIN, FREE_SPEED_MAX) * Math.min(delta, 0.05);

      freePos.current.x += (fx * mf + rx * mr) * step;
      freePos.current.y += (fy * mf + mu) * step;
      freePos.current.z += (fz * mf + rz * mr) * step;
      // Não mergulha no terreno: piso mínimo acima do chão.
      const floorY = terrainHeight(freePos.current.x, freePos.current.z) + 0.6;
      if (freePos.current.y < floorY) freePos.current.y = floorY;

      camera.position.copy(freePos.current);
      freeLook.current.set(freePos.current.x + fx, freePos.current.y + fy, freePos.current.z + fz);
      camera.lookAt(freeLook.current);

      // Aplica o alcance de visão (far). Lower far = frustum culling corta o longe,
      // menos draw calls quando a câmera livre olha o mapa inteiro.
      if (camera instanceof THREE.PerspectiveCamera && camera.far !== free.far) {
        camera.far = free.far;
        camera.updateProjectionMatrix();
      }

      // Inspeção pela mira central + métricas — no máximo ~4x/s (nunca por quadro).
      const acc = metricAccum.current;
      acc.frames++;
      acc.time += delta;
      if (clock.elapsedTime >= acc.next) {
        acc.next = clock.elapsedTime + 0.25;
        if (acc.time > 0) {
          free.metrics.fps = Math.round(acc.frames / acc.time);
          free.metrics.ms = (acc.time / acc.frames) * 1000;
        }
        free.metrics.calls = gl.info.render.calls;
        free.metrics.triangles = gl.info.render.triangles;
        acc.frames = 0;
        acc.time = 0;
        inspectCenter(camera, probe.current, free.inspect);
        free.version++;
      }
    } else {
      const yaw = cameraYaw.current;
      const pitch = cameraPitch.current;
      camDist.current = THREE.MathUtils.lerp(camDist.current, camDistTarget.current, 0.1);
      const dist = camDist.current;
      const shoulderOffset = 0.7;

      const camX = px - Math.sin(yaw) * Math.cos(pitch) * dist + Math.cos(yaw) * shoulderOffset;
      const camY = py + 2.8 - Math.sin(pitch) * dist;
      const camZ = pz - Math.cos(yaw) * Math.cos(pitch) * dist - Math.sin(yaw) * shoulderOffset;
      let wantPos = new THREE.Vector3(camX, camY, camZ);

      // Colisão de câmera: marcha da cabeça até a posição desejada; se um morro
      // bloqueia a linha, para no último ponto livre (aproxima). Libera → volta suave.
      {
        const hx = px, hy = py + 1.5, hz = pz;
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const sx = hx + (camX - hx) * t;
          const sy = hy + (camY - hy) * t;
          const sz = hz + (camZ - hz) * t;
          if (sy < terrainHeight(sx, sz) + 0.3) {
            const safeT = (i - 1) / steps;
            wantPos = new THREE.Vector3(hx + (camX - hx) * safeT, hy + (camY - hy) * safeT, hz + (camZ - hz) * safeT);
            break;
          }
        }
      }

      if (modeChanged) {
        camTarget.current.copy(wantPos);
        const lookX = px + Math.sin(yaw) * 4;
        const lookZ = pz + Math.cos(yaw) * 4;
        camLookAt.current.set(lookX, py + 1.2, lookZ);
      }

      camTarget.current.lerp(wantPos, 0.12);
      camera.position.copy(camTarget.current);

      const lookAhead = 4;
      const lookX = px + Math.sin(yaw) * lookAhead;
      const lookZ = pz + Math.cos(yaw) * lookAhead;
      const lookY = py + 1.2 + Math.sin(pitch) * 2;
      camLookAt.current.lerp(new THREE.Vector3(lookX, lookY, lookZ), 0.12);
      camera.lookAt(camLookAt.current);
    }

    // Soco de impacto: tremor curto da câmera quando um golpe acerta.
    const shake = impactShake();
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.3;
      camera.position.y += (Math.random() - 0.5) * shake * 0.3;
      camera.position.z += (Math.random() - 0.5) * shake * 0.3;
    }

    if (camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
  });

  /**
   * Clique num recurso: normal coleta (como antes), Shift enfileira
   * `gather_node`. Marca o clique como consumido para não virar ataque.
   */
  const resourceClick = useCallback((e: ThreeEvent<PointerEvent>, x: number, z: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    markPointerConsumed(e.nativeEvent);
    if (e.shiftKey) queueNearestNode(x, z);
    else props.onCollect();
  }, [props.onCollect]);

  // Árvores decorativas REDUZIDAS (era 400→340; agora 80) — o grosso do verde vem
  // dos nós farmáveis (harvest-nodes). Mais leve, sem ficar pelado.
  const trees = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        x: (rand(i + 1) - 0.5) * MAP_HALF * 2,
        z: (rand(i + 301) - 0.5) * MAP_HALF * 2,
        size: 0.65 + rand(i + 701) * 0.7,
        seed: i,
      }))
        .filter(p => Math.abs(p.x) > 4.5 || Math.abs(p.z) > 10)
        .filter(p => !(p.x > 2 && p.x < 12 && p.z < -3 && p.z > -13))
        .filter(p => !LAKE_CENTERS.some(l => (p.x - l.x) ** 2 + (p.z - l.z) ** 2 < (l.r + 2) ** 2))
        // Fora do leito do córrego: árvore não nasce dentro d'água.
        .filter(p => riverDistance(p.x, p.z) > RIVER_HALF_WIDTH + 2)
        // Acampamento é clareira: árvore dentro da tenda atrapalha a leitura
        // da cena e o clique nas estruturas.
        .filter(p => CAMP_PLACEMENTS.every(camp => {
          const def = CAMPS[camp.defId];
          if (!def) return true;
          const dx = p.x - camp.position.x;
          const dz = p.z - camp.position.z;
          return Math.sqrt(dx * dx + dz * dz) > def.radius + 2;
        }))
        // Fábrica é zona plana: árvore dentro do prédio atrapalha.
        .filter(p => FACTORY_SITES.every(f => Math.hypot(p.x - f.x, p.z - f.z) > FACTORY_PAD_R)),
    [],
  );

  const path = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROAD_POINTS.map(([x, z]) => new THREE.Vector3(x, 0.025, z)));
    const pts = curve.getPoints(100);
    const v: number[] = [];
    const uv: number[] = [];
    // UV planar em espaço de mundo (~3 m por tile) pra a textura da estrada
    // repetir ao longo da fita sem esticar.
    const TILE = 3;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const d = b.clone().sub(a).normalize();
      const p = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.95);
      const q = [
        a.clone().add(p), a.clone().sub(p), b.clone().add(p),
        b.clone().add(p), a.clone().sub(p), b.clone().sub(p),
      ];
      q.forEach(n => {
        const ty = terrainHeight(n.x, n.z) + 0.03;
        v.push(n.x, ty, n.z);
        uv.push(n.x / TILE, n.z / TILE);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }, []);

  const roadTex = useMemo(() => groundTexture('/assets/style/ground/road.webp', 1), []);

  // Luminárias ao longo da estrada, espaçadas ~14 m, deslocadas pra beira.
  const lamps = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROAD_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const pts = curve.getPoints(120);
    const out: { x: number; y: number; z: number }[] = [];
    let acc = 14;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!;
      acc += b.distanceTo(a);
      if (acc >= 14) {
        acc = 0;
        const d = b.clone().sub(a).normalize();
        const lx = b.x + -d.z * 1.6;
        const lz = b.z + d.x * 1.6;
        out.push({ x: lx, y: terrainHeight(lx, lz), z: lz });
      }
    }
    return out;
  }, []);

  // Rio: fita que segue RIVER_POINTS, ondulando na frente do nascedouro e
  // desembocando no laginho. Cada vértice acompanha a altura do terreno (ou a
  // superfície do lago, na foz), então a água nunca voa nem afunda.
  const river = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(RIVER_POINTS.map(p => new THREE.Vector3(p.x, 0, p.z)));
    const pts = curve.getPoints(90);
    const half = 2;
    const yOf = (x: number, z: number) => {
      const inLake = LAKE_CENTERS.some(l => (x - l.x) ** 2 + (z - l.z) ** 2 < l.r * l.r);
      return inLake ? LAKE_WATER_Y + 0.03 : terrainHeight(x, z) + 0.07;
    };
    const v: number[] = [];
    const uv: number[] = [];
    let distance = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * half, pz = (dx / len) * half;
      const corners = [
        { x: a.x + px, z: a.z + pz }, { x: a.x - px, z: a.z - pz },
        { x: b.x + px, z: b.z + pz }, { x: b.x - px, z: b.z - pz },
      ].map(p => ({ ...p, y: yOf(p.x, p.z) }));
      const [aL, aR, bL, bR] = corners as [typeof corners[0], typeof corners[0], typeof corners[0], typeof corners[0]];
      v.push(aL.x, aL.y, aL.z, aR.x, aR.y, aR.z, bL.x, bL.y, bL.z);
      v.push(bL.x, bL.y, bL.z, aR.x, aR.y, aR.z, bR.x, bR.y, bR.z);
      // Coordenadas contínuas: distância ao longo da curva e largura em metros.
      const nextDistance = distance + Math.hypot(dx, dz);
      uv.push(distance, -half, distance, half, nextDistance, -half);
      uv.push(nextDistance, -half, distance, half, nextDistance, half);
      distance = nextDistance;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }, []);


  return (
    <>
      <DayNightLighting c={c} />
      <EnvironmentLight c={c} />
      <Moon />
      <Sun />
      <Atmosphere c={c} paused={props.paused} />

      {SHOW_CENTRAL_GROUND && <TerrainMesh c={c} onAttack={props.onAttack} paused={props.paused} />}
      <EditorWorldLayer />

      <mesh geometry={path} receiveShadow>
        <meshStandardMaterial map={roadTex} bumpMap={roadTex} bumpScale={0.045} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>

      {/* Luminárias da estrada — acendem ao anoitecer */}
      {lamps.map((l, i) => <RoadLamp key={`lamp${i}`} {...l} />)}

      {/* Lakes — local water discs sitting at the terrain edge height */}
      {LAKE_CENTERS.map((lake, i) => (
        <mesh key={`lake${i}`} position={[lake.x, lakeWaterY(lake), lake.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[lake.r * 0.92, 32]} />
          <WaterMaterial color={c.water} time={waterTime} />
        </mesh>
      ))}

      {/* River — fita ondulada que desemboca no laginho */}
      <mesh geometry={river} receiveShadow>
        <WaterMaterial color={c.water} time={waterTime} river />
      </mesh>
      <RiverBanks c={c} />
      <DistantLandscape c={c} />

      {/* Bridge — tabuado elevado com vigas, pilares e guarda-corpo; leva a estrada por cima do córrego, na frente do nascedouro */}
      {SHOW_BRIDGE && <group position={[-2, 0, 2.5]} rotation={[0, 0.64, 0]}>
        {/* Tabuado (anda ao longo do X local, atravessando a água) */}
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={`plank${i}`} position={[(i - 7.5) * 0.5, 0.6, 0]} receiveShadow castShadow>
            <boxGeometry args={[0.46, 0.14, 2.8]} />
            <meshStandardMaterial color={i % 2 ? c.trunk : c.path} />
          </mesh>
        ))}
        {/* Vigas longitudinais sob o tabuado */}
        {[-1.15, 1.15].map(z => (
          <mesh key={`beam${z}`} position={[0, 0.45, z]} castShadow>
            <boxGeometry args={[8, 0.18, 0.22]} />
            <meshStandardMaterial color={c.trunk} />
          </mesh>
        ))}
        {/* Pilares de sustentação, descem até o leito */}
        {[-3.6, -1.2, 1.2, 3.6].flatMap(x => [-1.2, 1.2].map(z => (
          <mesh key={`post${x}_${z}`} position={[x, -0.15, z]} castShadow>
            <cylinderGeometry args={[0.12, 0.15, 1.6, 6]} />
            <meshStandardMaterial color={c.trunk} />
          </mesh>
        )))}
        {/* Guarda-corpo dos dois lados: corrimão + balaústres */}
        {[-1.35, 1.35].map(z => (
          <group key={`rail${z}`}>
            <mesh position={[0, 1.18, z]} castShadow>
              <boxGeometry args={[8, 0.1, 0.1]} />
              <meshStandardMaterial color={c.trunk} />
            </mesh>
            {Array.from({ length: 9 }, (_, i) => (
              <mesh key={`bal${i}`} position={[(i - 4) * 0.95, 0.88, z]} castShadow>
                <boxGeometry args={[0.08, 0.6, 0.08]} />
                <meshStandardMaterial color={c.trunk} />
              </mesh>
            ))}
          </group>
        ))}
      </group>}

      <Billboards trees={trees} c={c} />
      {showAshlandPilot && <AshlandPilot />}

      <Factory />
      <FactoryRubble c={c} />
      {/* Árvores-marco gigantes (gnarled): uma perto do nascedouro + ~5 espalhadas (não muito longe). */}
      {[
        { x: 11, z: -22, scale: 6 },      // perto do centro do nascedouro
        { x: -18, z: -10, scale: 5.5, yaw: 0.8 },
        { x: 34, z: -48, scale: 6.5, yaw: 2.1 },
        { x: -32, z: -42, scale: 5, yaw: 1.3 },
        { x: 42, z: 8, scale: 6, yaw: 3.0 },
        { x: -40, z: 24, scale: 5.5, yaw: 0.4 },
      ].map((t, i) => <LandmarkTree key={`tree-g-${i}`} editorId={`map-tree-gnarled-0${i + 1}`} x={t.x} z={t.z} scale={t.scale} yaw={t.yaw ?? 0} />)}
      {/* ~10 árvores split-trunk espalhadas perto do nascedouro (a "outra" árvore). */}
      {[
        { x: 20, z: -12, scale: 4.5 }, { x: -10, z: -40, scale: 5, yaw: 1.1 },
        { x: 28, z: -30, scale: 4, yaw: 2.3 }, { x: -24, z: -20, scale: 4.8, yaw: 0.5 },
        { x: 38, z: -14, scale: 4.2, yaw: 3.1 }, { x: -36, z: -4, scale: 5, yaw: 1.8 },
        { x: 18, z: 4, scale: 4.5, yaw: 0.9 }, { x: -14, z: 14, scale: 4, yaw: 2.6 },
        { x: 46, z: -36, scale: 4.6, yaw: 0.2 }, { x: 2, z: -50, scale: 5, yaw: 1.5 },
      ].map((t, i) => <LandmarkTree key={`tree-s-${i}`} url="/models/trees/tree-split.glb" x={t.x} z={t.z} scale={t.scale} yaw={t.yaw ?? 0} />)}
      {/* Labirinto (área aberta a oeste do lago). -19% + mais pro oeste. */}
      <Maze x={-8} z={56} size={57} />
      {/* Postes de luz DENTRO do labirinto. */}
      {[[-8, 56], [-24, 44], [10, 44], [-24, 70], [10, 70], [-8, 80]].map(([lx, lz], i) => (
        <RoadLamp key={`maze-lamp-${i}`} x={lx!} y={terrainHeight(lx!, lz!)} z={lz!} />
      ))}
      {/* Multiplayer: avatares dos outros jogadores (online). */}
      <RemotePlayers />
      {/* Terrenos GLB (planície do deserto + 2 montanhas) REMOVIDOS por hora (Pedro 19/10):
          ficavam nas bordas / abaixo do chão original e serão trocados pelo novo mapa.
          O chão real continua sendo o `terrainHeight` procedural (bichos e player usam ele);
          sem as montanhas registradas, o player cai sempre no terrainHeight (igual aos bichos).
          Histórico no git (commit e8212f0) p/ restaurar se precisar. */}
      <GlbContainers />
      {/* Montanha antiga ZERADA (Pedro 16/10): atalaia do topo removida junto;
          montanhas GLB novas + crista de pedra da planície entram no lugar. */}
      <Campfire c={c} position={[-1, 0, 4]} />
      <Campfire c={c} position={[10, 0, -6]} />
      <Campfire c={c} position={[-15, 0, -12]} />

      {/* Crystal resource */}
      <FadeGroup spheres={CRYSTAL_SPHERES} position={[-3, terrainHeight(-3, -2), -2]} onPointerDown={e => resourceClick(e, -3, -2)}>
        <Rock x={0} z={0} size={1.25} c={c} fade={false} />
        {[-0.4, 0, 0.4].map((x, i) => (
          <mesh key={x} position={[x, 0.9 + i * 0.1, 0.1]} rotation={[0, 0, x]} castShadow>
            <coneGeometry args={[0.18, 0.9, 5]} />
            <meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.25} />
          </mesh>
        ))}
      </FadeGroup>

      {/* Chest */}
      <FadeGroup spheres={CHEST_SPHERES} position={[2, terrainHeight(2, 3) + 0.2, 3]} onPointerDown={e => resourceClick(e, 2, 3)}>
        <mesh castShadow>
          <boxGeometry args={[0.65, 0.4, 0.42]} />
          <meshStandardMaterial color={c.trunk} />
        </mesh>
        <mesh position={[0, 0.13, 0.22]}>
          <boxGeometry args={[0.09, 0.18, 0.025]} />
          <meshStandardMaterial color={c.gold} />
        </mesh>
      </FadeGroup>

      {/* Crystal tower */}
      <FadeGroup spheres={TOWER_SPHERES} position={[4, terrainHeight(4, 5), 5]}>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.3, 0.5, 2, 6]} />
          <meshStandardMaterial color={c.rock} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <octahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.4} />
        </mesh>
      </FadeGroup>

      {/* Acampamentos inimigos e todas as criaturas da store (lobos + saqueadores) */}
      <HarvestNodes c={c} />
      <PlayerBase c={c} playerRef={playerRef} paused={Boolean(props.paused)} />
      {/* Online: base dos outros jogadores (+ transmite a local). */}
      <NetBases c={c} />
      <BaseFireFX />
      <BaseNightLights />
      <SafeZoneMarker />
      <Camps c={c} />
      <MultiplayerWorldSync />
      <Enemies c={c} playerRef={playerRef} />

      <TargetRoute playerRef={playerRef} />
      <CombatFeedback />
      <Projectiles />
      <OcclusionFader playerRef={playerRef} paused={props.paused} />

      <AutoPilot playerRef={playerRef} movement={target} paused={props.paused} />

      <CelShade />


      <Character c={c} attack={props.attack} movement={target} onPosition={props.onPosition} paused={props.paused} playerRef={playerRef} cameraYawRef={cameraYaw} cameraMode={cameraMode} />
    </>
  );
}

export default function GameWorld(props: WorldProps) {
  const c = useMemo(palette, []);
  const cameraMode = props.cameraMode ?? 'iso';

  return (
    <>
      <Canvas shadows="percentage" dpr={1} performance={{ min: 0.5 }} gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }} onContextMenu={e => e.preventDefault()}>
        {cameraMode === 'iso' ? (
          <OrthographicCamera makeDefault position={[24, 29, 24]} zoom={33} near={0.1} far={160} />
        ) : (
          <PerspectiveCamera makeDefault position={[0, 3, -5]} fov={65} near={0.1} far={160} />
        )}
        <WorldScene {...props} c={c} cameraMode={cameraMode} />
        {/* Medidor de FPS — SÓ em dev (localhost); nunca vai pra produção. */}
        {import.meta.env.DEV && <Stats />}
      </Canvas>
      {/* HUD da câmera livre (fora do Canvas; só renderiza com o modo ativo). */}
      <FreeCamOverlay />
    </>
  );
}
