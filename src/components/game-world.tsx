import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { CAMPS, CAMP_PLACEMENTS, RUINS_POSITION } from '@/game/data/camps';
import { AutoPilot } from './world/auto-pilot';
import { HarvestNodes } from './world/harvest-nodes';
import { queueNearestNode } from './world/objective-bridge';
import { CombatFeedback } from './world/combat-feedback';
import { Projectiles } from './world/projectiles';
import { HeldItem, selectedItemId } from './world/held-weapon';
import { weaponFor } from '@/game/data/weapons';
import { OcclusionFader } from './world/occlusion-fader';
import {
  makeInstanceFadeMaterial, registerInstancedFade, useFadeGroup, type FadeSphere,
} from './world/occlusion';
import { TargetRoute } from './world/target-route';
import { Camps, Enemies } from './world/world-entities';
import {
  MAP_HALF, LAKE_CENTERS, LAKE_WATER_Y, RIVER_POINTS, RIVER_HALF_WIDTH, impactShake, lakeWaterY,
  markPointerConsumed, palette, rand, riverDistance, terrainHeight, wasPointerConsumed,
  type Palette,
} from './world/world-kit';
import { dayNight, nightFactor } from '@/game/systems/dayNightSystem';
import { effectiveAttributes } from '@/game/systems/attributesSystem';

export type WorldProps = {
  mode: string;
  attack: number;
  onCollect: () => void;
  onPosition: (x: number, z: number) => void;
  onAttack?: () => void;
  paused: boolean;
  cameraMode?: 'iso' | 'third';
};

// Ponte caminhável: mesmo centro/rotação/medidas do grupo renderizado lá
// embaixo. Sobre o tabuado o chão do jogador vira o topo do deck; nas pontas
// uma rampa curta sobe do terreno até o deck pra não ter degrau brusco.
const BRIDGE = { cx: -2, cz: 2.5, cos: Math.cos(0.64), sin: Math.sin(0.64), halfLen: 3.75, halfWidth: 1.35, deckTop: 0.67, ramp: 1.4 };

function bridgeSurfaceY(px: number, pz: number): number {
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
  const list: Collider[] = [{ x: RUINS_POSITION.x, z: RUINS_POSITION.z, r: 2.2 }];
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
    // Acende forte à noite, discreta de dia (consistente com as luminárias). +20%.
    if (ref.current) ref.current.intensity = (2.4 + nightFactor() * 6) + Math.sin(clock.elapsedTime * 8) * 0.8;
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
  cameraMode: 'iso' | 'third';
}) {
  const body = useRef<THREE.Group>(null);
  const sword = useRef<THREE.Group>(null);
  // Rig articulado (grupos de junta, pivô no quadril/joelho/ombro/cotovelo).
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

  useEffect(() => {
    if (attackPhase.current === 'idle') {
      attackPhase.current = 'anticipation';
      attackTimer.current = 0;
    }
    // Vira de frente pro bicho vivo mais próximo, dentro do alcance da arma.
    const b = body.current;
    if (b) {
      const st = useGameStore.getState();
      const range = weaponFor(selectedItemId(st)).range + 1;
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
        useGameStore.setState(s => ({
          player: { ...s.player, hp: s.player.maxHp, dead: false, respawnAt: 0, position: { x: 0, z: 0 } },
          ui: { ...s.ui, message: 'Você reviveu!' },
        }));
        body.current.position.set(0, terrainHeight(0, 0), 0);
        velocity.current.set(0, 0);
      }
      return;
    }

    const k = keys.current;

    const dx = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const dz = Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp'));

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
    const MAX_SPEED = (sprinting ? 6.5 : 4.5) * (inLake ? 0.4 : 1) * moveBonus;

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

    // Jump
    if (k.has('Space') && isGrounded.current) {
      jumpVelocity.current = 5;
      isGrounded.current = false;
      k.delete('Space');
    }

    const groundY = Math.max(
      terrainHeight(body.current.position.x, body.current.position.z),
      bridgeSurfaceY(body.current.position.x, body.current.position.z),
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

  const noRaycast = useCallback((raycaster: any, intersects: any[]) => {}, []);

  return (
    <group ref={body} position={[0, 0, 1]} raycast={noRaycast}>
      {/* Selection ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.53, 0.57, 32]} />
        <meshBasicMaterial color={c.gold} transparent opacity={0.7} />
      </mesh>

      {/* Pernas articuladas: quadril → coxa → joelho → canela → pé */}
      <group ref={leftHip} position={[-0.14, 0.6, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <boxGeometry args={[0.19, 0.3, 0.21]} />
          <meshStandardMaterial color={c.dark} />
        </mesh>
        <group ref={leftKnee} position={[0, -0.3, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <mesh position={[0, -0.15, 0.01]} castShadow>
            <boxGeometry args={[0.16, 0.28, 0.18]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <mesh position={[0, -0.28, 0.07]} castShadow>
            <boxGeometry args={[0.18, 0.1, 0.3]} />
            <meshStandardMaterial color={c.metal} />
          </mesh>
        </group>
      </group>
      <group ref={rightHip} position={[0.14, 0.6, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <boxGeometry args={[0.19, 0.3, 0.21]} />
          <meshStandardMaterial color={c.dark} />
        </mesh>
        <group ref={rightKnee} position={[0, -0.3, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <mesh position={[0, -0.15, 0.01]} castShadow>
            <boxGeometry args={[0.16, 0.28, 0.18]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          <mesh position={[0, -0.28, 0.07]} castShadow>
            <boxGeometry args={[0.18, 0.1, 0.3]} />
            <meshStandardMaterial color={c.metal} />
          </mesh>
        </group>
      </group>

      {/* Body */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.62, 0.67, 0.36]} />
        <meshStandardMaterial color={c.armor} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.48, 0]} castShadow>
        <boxGeometry args={[0.42, 0.43, 0.4]} />
        <meshStandardMaterial color={c.metal} />
      </mesh>
      <mesh position={[0, 1.47, 0.205]}>
        <boxGeometry args={[0.29, 0.1, 0.03]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>

      {/* Cloak */}
      <mesh position={[0, 0.91, -0.25]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.93, 0.09]} />
        <meshStandardMaterial color={c.cloak} />
      </mesh>

      {/* Braço esquerdo articulado + escudo no antebraço */}
      <group ref={leftShoulder} position={[-0.38, 1.12, 0.02]}>
        <mesh castShadow>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color={c.armor} />
        </mesh>
        <mesh position={[0, -0.14, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.28, 6]} />
          <meshStandardMaterial color={c.armor} />
        </mesh>
        <group ref={leftElbow} position={[0, -0.28, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          <mesh position={[0, -0.13, 0.01]} castShadow>
            <cylinderGeometry args={[0.08, 0.07, 0.26, 6]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          <mesh position={[0, -0.27, 0.02]} castShadow>
            <boxGeometry args={[0.11, 0.11, 0.13]} />
            <meshStandardMaterial color={c.dark} />
          </mesh>
          {/* Escudo preso ao antebraço */}
          <mesh position={[0, -0.14, 0.13]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.08, 12]} />
            <meshStandardMaterial color={c.trunk} />
          </mesh>
        </group>
      </group>

      {/* Braço direito articulado — segura a arma na mão (socket hand_R) */}
      <group ref={rightShoulder} position={[0.38, 1.12, 0.02]}>
        <mesh castShadow>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color={c.armor} />
        </mesh>
        <mesh position={[0, -0.14, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.08, 0.28, 6]} />
          <meshStandardMaterial color={c.armor} />
        </mesh>
        <group ref={rightElbow} position={[0, -0.28, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          <mesh position={[0, -0.13, 0.01]} castShadow>
            <cylinderGeometry args={[0.08, 0.07, 0.26, 6]} />
            <meshStandardMaterial color={c.armor} />
          </mesh>
          <mesh position={[0, -0.27, 0.02]} castShadow>
            <boxGeometry args={[0.11, 0.11, 0.13]} />
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
  }, [scene]);

  useFrame(() => {
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

// Pontos da estrada (coord. de mundo). Compartilhados entre o asfalto e as
// luminárias, pra os postes ficarem exatamente na beira do caminho.
const ROAD_POINTS: [number, number][] = [
  [-60, 40], [-40, 28], [-18, 12], [-7, 6], [0, 1], [4, -3], [7, -8], [16, -14], [28, -22], [45, -38], [60, -55],
];

/** Poste de luz da estrada: apaga de dia, acende (tremeluzindo) ao anoitecer. */
function RoadLamp({ x, y, z }: { x: number; y: number; z: number }) {
  const light = useRef<THREE.PointLight>(null);
  const bulb = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const nf = nightFactor();
    const flick = 0.9 + Math.sin(performance.now() * 0.006 + x * 1.3) * 0.1;
    if (light.current) light.current.intensity = nf * 6.6 * flick;
    if (bulb.current) bulb.current.emissiveIntensity = nf * 2.4 * flick;
  });
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 2.6, 6]} />
        <meshStandardMaterial color="#3a3a42" />
      </mesh>
      <mesh position={[0, 2.68, 0]}>
        <boxGeometry args={[0.26, 0.32, 0.26]} />
        <meshStandardMaterial ref={bulb} color="#ffd98a" emissive="#ffb040" emissiveIntensity={0} />
      </mesh>
      <pointLight ref={light} position={[0, 2.6, 0]} color="#ffcf87" intensity={0} distance={13} decay={1.6} />
    </group>
  );
}

function TerrainMesh({ c, onAttack, paused }: { c: Palette; onAttack?: (() => void) | undefined; paused?: boolean | undefined }) {
  const geo = useMemo(() => {
    const size = MAP_HALF * 2 + 40;
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
    return g;
  }, []);

  // Sem handler de ponteiro aqui de propósito: o ataque por clique é tratado
  // uma única vez pelo listener de `mousedown` em `WorldScene`. Antes os dois
  // disparavam e um clique valia dois ataques.
  void onAttack;
  void paused;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow geometry={geo}>
      <meshStandardMaterial color={c.ground} />
    </mesh>
  );
}

function WorldScene(props: WorldProps & { c: Palette; cameraMode: 'iso' | 'third' }) {
  const { c, cameraMode } = props;
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

  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(12, Math.min(33, size.width / 32));
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseMove = (e: MouseEvent) => {
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

    // Zoom (scroll) na terceira pessoa: distância 3–8, suavizada no frame.
    const onWheel = (e: WheelEvent) => {
      if (cameraMode !== 'third') return;
      e.preventDefault();
      camDistTarget.current = THREE.MathUtils.clamp(camDistTarget.current + e.deltaY * 0.01, 3, 8);
    };

    const onClick = () => {
      if (cameraMode === 'third' && !pointerLocked.current && !props.paused) {
        canvas.requestPointerLock();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      // Clique já consumido por um inimigo / estrutura / recurso não ataca.
      if (wasPointerConsumed(e)) return;
      if (e.button === 0 && !props.paused && props.onAttack) {
        if (pointerLocked.current || e.target === canvas) {
          props.onAttack();
        }
      }
    };

    // Touch (mobile): arrastar 1 dedo gira a câmera no 3ª pessoa (yaw/pitch),
    // igual ao mouse. Tap sem arrastar continua atacando (não damos preventDefault
    // no start, só no move), então o clique sintetizado ainda dispara.
    let lastTX = 0, lastTY = 0, dragging = false;
    const onTouchStart = (e: TouchEvent) => {
      if (cameraMode !== 'third' || props.paused || e.touches.length !== 1) return;
      lastTX = e.touches[0]!.clientX;
      lastTY = e.touches[0]!.clientY;
      dragging = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging || cameraMode !== 'third' || e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const dx = t.clientX - lastTX;
      const dy = t.clientY - lastTY;
      lastTX = t.clientX;
      lastTY = t.clientY;
      const sensitivity = 0.005;
      cameraYaw.current -= dx * sensitivity;
      cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current - dy * sensitivity, -1.0, 0.65);
      e.preventDefault(); // só enquanto gira: evita o scroll/zoom da página
    };
    const onTouchEnd = () => { dragging = false; };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      if (pointerLocked.current) document.exitPointerLock();
    };
  }, [gl, cameraMode, props.paused]);

  useEffect(() => {
    if (cameraMode === 'iso' && pointerLocked.current) {
      document.exitPointerLock();
    }
  }, [cameraMode]);

  useFrame(() => {
    const p = playerRef.current;
    if (!p) return;

    const px = p.position.x;
    const py = p.position.y;
    const pz = p.position.z;

    const modeChanged = prevCameraMode.current !== cameraMode;
    prevCameraMode.current = cameraMode;

    if (cameraMode === 'iso') {
      const isoOffset = new THREE.Vector3(24, 29, 24);
      const wantPos = new THREE.Vector3(px + isoOffset.x, isoOffset.y, pz + isoOffset.z);
      const lerpFactor = modeChanged ? 1 : 0.06;
      camTarget.current.lerp(wantPos, lerpFactor);
      camera.position.copy(camTarget.current);
      camLookAt.current.lerp(new THREE.Vector3(px, py, pz), lerpFactor);
      camera.lookAt(camLookAt.current);
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

  const trees = useMemo(
    () =>
      Array.from({ length: 400 }, (_, i) => ({
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
        })),
    [],
  );

  const path = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(ROAD_POINTS.map(([x, z]) => new THREE.Vector3(x, 0.025, z)));
    const pts = curve.getPoints(100);
    const v: number[] = [];
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
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, []);

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
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, []);


  return (
    <>
      <DayNightLighting c={c} />
      <Moon />

      <TerrainMesh c={c} onAttack={props.onAttack} paused={props.paused} />

      <mesh geometry={path} receiveShadow>
        <meshStandardMaterial color={c.path} side={THREE.DoubleSide} />
      </mesh>

      {/* Luminárias da estrada — acendem ao anoitecer */}
      {lamps.map((l, i) => <RoadLamp key={`lamp${i}`} {...l} />)}

      {/* Lakes — local water discs sitting at the terrain edge height */}
      {LAKE_CENTERS.map((lake, i) => (
        <mesh key={`lake${i}`} position={[lake.x, lakeWaterY(lake), lake.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[lake.r * 0.92, 32]} />
          <meshStandardMaterial color={c.water} roughness={0.2} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}

      {/* River — fita ondulada que desemboca no laginho */}
      <mesh geometry={river} receiveShadow>
        <meshStandardMaterial color={c.water} roughness={0.25} transparent opacity={0.82} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Bridge — tabuado elevado com vigas, pilares e guarda-corpo; leva a estrada por cima do córrego, na frente do nascedouro */}
      <group position={[-2, 0, 2.5]} rotation={[0, 0.64, 0]}>
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
      </group>

      {trees.map((p, i) => <Tree key={i} {...p} c={c} />)}
      <RockInstances c={c} />
      <GrassPatches c={c} count={900} />

      <Ruins c={c} />
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
      <Camps c={c} />
      <Enemies c={c} playerRef={playerRef} />

      <TargetRoute playerRef={playerRef} />
      <CombatFeedback />
      <Projectiles />
      <OcclusionFader playerRef={playerRef} paused={props.paused} />

      <AutoPilot playerRef={playerRef} movement={target} paused={props.paused} />

      <Character c={c} attack={props.attack} movement={target} onPosition={props.onPosition} paused={props.paused} playerRef={playerRef} cameraYawRef={cameraYaw} cameraMode={cameraMode} />
    </>
  );
}

export default function GameWorld(props: WorldProps) {
  const c = useMemo(palette, []);
  const cameraMode = props.cameraMode ?? 'iso';

  return (
    <Canvas shadows dpr={[1, 1]} gl={{ antialias: false, powerPreference: 'high-performance' }} onContextMenu={e => e.preventDefault()}>
      {cameraMode === 'iso' ? (
        <OrthographicCamera makeDefault position={[24, 29, 24]} zoom={33} near={0.1} far={200} />
      ) : (
        <PerspectiveCamera makeDefault position={[0, 3, -5]} fov={65} near={0.1} far={300} />
      )}
      <WorldScene {...props} c={c} cameraMode={cameraMode} />
    </Canvas>
  );
}
