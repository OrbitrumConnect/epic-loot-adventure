import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';

export type WorldProps = {
  mode: string;
  attack: number;
  onCollect: () => void;
  onPosition: (x: number, z: number) => void;
  onAttack?: () => void;
  paused: boolean;
  cameraMode?: 'iso' | 'third';
};

const names = [
  'ground', 'ground-light', 'grass', 'pine', 'leaf', 'leaf-light', 'trunk',
  'path', 'rock', 'rock-light', 'water', 'water-light', 'armor', 'cloak',
  'metal', 'crystal', 'gold', 'dark', 'light',
] as const;

type Palette = Record<(typeof names)[number], string>;

function palette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  return Object.fromEntries(
    names.map(name => {
      if (!ctx) return [name, css.getPropertyValue(`--world-${name}`).trim()];
      ctx.fillStyle = css.getPropertyValue(`--world-${name}`).trim();
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [name, `rgb(${r},${g},${b})`];
    }),
  ) as Palette;
}

function rand(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function terrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.08) * 0.15 +
    Math.cos(z * 0.07) * 0.12 +
    Math.sin((x + z) * 0.04) * 0.2
  );
}

const MAP_HALF = 45;

function Tree({ x, z, size = 1, seed, c }: { x: number; z: number; size?: number; seed: number; c: Palette }) {
  const y = terrainHeight(x, z);
  return (
    <group position={[x, y, z]} scale={size}>
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

function Rock({ x, z, size = 1, c }: { x: number; z: number; size?: number; c: Palette }) {
  const y = terrainHeight(x, z);
  return (
    <mesh
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

function Ruins({ c }: { c: Palette }) {
  const y = terrainHeight(7, -8);
  return (
    <group position={[7, y, -8]} rotation={[0, -0.2, 0]}>
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
      <Rock x={-3.5} z={3} size={0.9} c={c} />
      <Rock x={2} z={3.5} size={0.6} c={c} />
    </group>
  );
}

function Campfire({ c, position: pos }: { c: Palette; position: [number, number, number] }) {
  const ref = useRef<THREE.PointLight>(null);
  const y = terrainHeight(pos[0], pos[2]);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = 3 + Math.sin(clock.elapsedTime * 8) * 0.8;
  });
  return (
    <group position={[pos[0], y, pos[2]]}>
      {[0, 1.2, 2.4, 3.6, 5].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3]} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.35]} />
          <meshStandardMaterial color={c.rock} />
        </mesh>
      ))}
      <pointLight ref={ref} position={[0, 0.6, 0]} color="#ff8844" intensity={3} distance={8} />
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
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
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

  useEffect(() => {
    if (body.current && playerRef) (playerRef as any).current = body.current;
  });

  useEffect(() => {
    if (attackPhase.current === 'idle') {
      attackPhase.current = 'anticipation';
      attackTimer.current = 0;
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

    const sprinting = k.has('ShiftLeft') || k.has('ShiftRight');
    const ACCEL = 22;
    const DECEL = 28;
    const MAX_SPEED = sprinting ? 6.5 : 4.5;

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

    body.current.position.x = THREE.MathUtils.clamp(
      body.current.position.x + velocity.current.x * dt, -MAP_HALF, MAP_HALF,
    );
    body.current.position.z = THREE.MathUtils.clamp(
      body.current.position.z + velocity.current.y * dt, -MAP_HALF, MAP_HALF,
    );

    if (moving) {
      targetRotY.current = Math.atan2(velocity.current.x, velocity.current.y);
    }
    let rotDiff = targetRotY.current - currentRotY.current;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    currentRotY.current += rotDiff * Math.min(15 * dt, 1);
    body.current.rotation.y = currentRotY.current;

    // Jump
    if (k.has('Space') && isGrounded.current) {
      jumpVelocity.current = 5;
      isGrounded.current = false;
      k.delete('Space');
    }

    const groundY = terrainHeight(body.current.position.x, body.current.position.z);

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

    // Walk + idle animation
    if (moving && isGrounded.current) {
      idleTime.current = 0;
      walkCycle.current += dt * 12;
      const swing = Math.sin(walkCycle.current) * 0.6;
      const bob = Math.abs(Math.sin(walkCycle.current * 2)) * 0.04;
      if (leftLeg.current) leftLeg.current.rotation.x = swing;
      if (rightLeg.current) rightLeg.current.rotation.x = -swing;
      if (leftArm.current) leftArm.current.rotation.x = -swing * 0.5;
      body.current.position.y += bob;
    } else {
      walkCycle.current = 0;
      idleTime.current += dt;
      const breath = Math.sin(idleTime.current * 2.2) * 0.012;
      const sway = Math.sin(idleTime.current * 1.1) * 0.008;
      if (leftLeg.current) leftLeg.current.rotation.x = 0;
      if (rightLeg.current) rightLeg.current.rotation.x = 0;
      if (leftArm.current) leftArm.current.rotation.x = sway;
      body.current.position.y += breath;
    }

    // Attack — 4 phases
    if (sword.current) {
      attackTimer.current += dt;
      const phase = attackPhase.current;
      const t = attackTimer.current;
      let swordX = 0;
      let lungeDelta = 0;

      if (phase === 'anticipation') {
        swordX = -0.8 * Math.min(t / 0.1, 1);
        if (t >= 0.1) { attackPhase.current = 'strike'; attackTimer.current = 0; }
      } else if (phase === 'strike') {
        swordX = -0.8 + 2.6 * Math.min(t / 0.08, 1);
        lungeDelta = 0.35 * Math.min(t / 0.08, 1);
        if (t >= 0.08) { attackPhase.current = 'impact'; attackTimer.current = 0; }
      } else if (phase === 'impact') {
        swordX = 1.8;
        if (t >= 0.06) { attackPhase.current = 'recovery'; attackTimer.current = 0; }
      } else if (phase === 'recovery') {
        swordX = 1.8 * Math.max(0, 1 - t / 0.15);
        if (t >= 0.15) { attackPhase.current = 'idle'; attackTimer.current = 0; }
      }

      sword.current.rotation.x = swordX;
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

      {/* Legs - animated */}
      <mesh ref={leftLeg} position={[-0.14, 0.3, 0]} castShadow>
        <boxGeometry args={[0.2, 0.6, 0.22]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh ref={rightLeg} position={[0.14, 0.3, 0]} castShadow>
        <boxGeometry args={[0.2, 0.6, 0.22]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>

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

      {/* Left arm - animated */}
      <mesh ref={leftArm} position={[-0.48, 0.92, 0.08]} rotation={[0, 0, -0.15]} castShadow>
        <cylinderGeometry args={[0.12, 0.1, 0.6, 6]} />
        <meshStandardMaterial color={c.armor} />
      </mesh>

      {/* Shield on left arm */}
      <mesh position={[-0.48, 0.92, 0.08]} rotation={[0, 0, -0.15]} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.1, 6]} />
        <meshStandardMaterial color={c.trunk} />
      </mesh>

      {/* Right arm + Sword */}
      <group ref={sword} position={[0.45, 1, 0.15]}>
        <mesh position={[0, 0, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <boxGeometry args={[0.08, 1.1, 0.07]} />
          <meshStandardMaterial color={c.metal} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <boxGeometry args={[0.34, 0.07, 0.07]} />
          <meshStandardMaterial color={c.gold} />
        </mesh>
      </group>
    </group>
  );
}

function Wolf({ c, creatureId, playerRef }: { c: Palette; creatureId: string; playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const frontLeftLeg = useRef<THREE.Mesh>(null);
  const frontRightLeg = useRef<THREE.Mesh>(null);
  const backLeftLeg = useRef<THREE.Mesh>(null);
  const backRightLeg = useRef<THREE.Mesh>(null);
  const walkCycle = useRef(0);
  const wanderAngle = useRef(Math.random() * Math.PI * 2);
  const wanderTimer = useRef(0);
  const attackCooldown = useRef(0);
  const currentRotY = useRef(0);
  const homePos = useRef<{ x: number; z: number } | null>(null);
  const syncTimer = useRef(0);
  const chaseTimer = useRef(0);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    const dt = Math.min(delta, 0.05);

    const store = useGameStore.getState();
    const creature = store.creatures.find(cr => cr.id === creatureId);
    if (!creature) { ref.current.visible = false; return; }
    if (creature.behavior === 'dead') {
      ref.current.visible = false;
      if (creature.respawnAt && Date.now() >= creature.respawnAt) {
        const home = homePos.current ?? creature.position;
        useGameStore.setState(s => ({
          creatures: s.creatures.map(cr =>
            cr.id === creatureId ? { ...cr, hp: cr.maxHp, behavior: 'patrol' as const, respawnAt: null, position: { ...home } } : cr,
          ),
        }));
        ref.current.position.set(home.x, terrainHeight(home.x, home.z), home.z);
      }
      return;
    }
    ref.current.visible = true;

    if (!homePos.current) homePos.current = { ...creature.position };

    const player = playerRef.current;
    if (!player) return;

    const px = player.position.x;
    const pz = player.position.z;
    const wx = ref.current.position.x;
    const wz = ref.current.position.z;
    const distToPlayer = Math.sqrt((px - wx) * (px - wx) + (pz - wz) * (pz - wz));

    const AGGRO_RANGE = 10;
    const ATTACK_RANGE = 2.5;
    const LEASH_RANGE = 25;
    const WOLF_SPEED = 4.0;
    const WANDER_SPEED = 1.0;

    let moving = false;
    let targetX = wx;
    let targetZ = wz;

    const distToHome = Math.sqrt(
      (wx - homePos.current.x) * (wx - homePos.current.x) +
      (wz - homePos.current.z) * (wz - homePos.current.z),
    );

    const CHASE_TIMEOUT = 12;

    if (distToPlayer < AGGRO_RANGE && distToHome < LEASH_RANGE && chaseTimer.current < CHASE_TIMEOUT) {
      chaseTimer.current += dt;
      if (distToPlayer <= ATTACK_RANGE) chaseTimer.current = 0;
      const angle = Math.atan2(px - wx, pz - wz);
      if (distToPlayer > ATTACK_RANGE * 0.6) {
        targetX = wx + Math.sin(angle) * WOLF_SPEED * dt;
        targetZ = wz + Math.cos(angle) * WOLF_SPEED * dt;
        moving = true;
      }
      if (distToPlayer <= ATTACK_RANGE) {
        attackCooldown.current -= dt;
        if (attackCooldown.current <= 0) {
          attackCooldown.current = creature.attackCooldown;
          const dmg = Math.max(1, creature.attackPower);
          useGameStore.setState(s => {
            if (s.player.dead) return {};
            const hp = Math.max(0, s.player.hp - dmg);
            if (hp <= 0) {
              return {
                player: { ...s.player, hp: 0, dead: true, respawnAt: Date.now() + 15_000 },
                ui: { ...s.ui, message: `${creature.name} te matou! Respawn em 15s.` },
              };
            }
            return {
              player: { ...s.player, hp },
              ui: { ...s.ui, message: `${creature.name} mordeu! -${dmg} HP (${hp}/${s.player.maxHp})` },
            };
          });
        }
      }
    } else {
      chaseTimer.current = 0;
      wanderTimer.current -= dt;
      if (wanderTimer.current <= 0) {
        wanderAngle.current = Math.random() * Math.PI * 2;
        wanderTimer.current = 2 + Math.random() * 3;
      }
      const homeAngle = Math.atan2(homePos.current.x - wx, homePos.current.z - wz);
      const blend = distToHome > 5 ? 0.8 : 0.2;
      const moveAngle = wanderAngle.current * (1 - blend) + homeAngle * blend;
      targetX = wx + Math.sin(moveAngle) * WANDER_SPEED * dt;
      targetZ = wz + Math.cos(moveAngle) * WANDER_SPEED * dt;
      moving = true;
    }

    ref.current.position.x = THREE.MathUtils.clamp(targetX, -MAP_HALF, MAP_HALF);
    ref.current.position.z = THREE.MathUtils.clamp(targetZ, -MAP_HALF, MAP_HALF);
    ref.current.position.y = terrainHeight(ref.current.position.x, ref.current.position.z);

    syncTimer.current += dt;
    if (syncTimer.current > 0.2) {
      syncTimer.current = 0;
      useGameStore.setState(s => ({
        creatures: s.creatures.map(cr =>
          cr.id === creatureId ? { ...cr, position: { x: ref.current!.position.x, z: ref.current!.position.z } } : cr,
        ),
      }));
    }

    if (moving) {
      const desiredRot = Math.atan2(targetX - wx, targetZ - wz);
      let diff = desiredRot - currentRotY.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      currentRotY.current += diff * Math.min(8 * dt, 1);
    }
    ref.current.rotation.y = currentRotY.current;

    if (moving) {
      const speed = distToPlayer < AGGRO_RANGE ? 16 : 8;
      walkCycle.current += dt * speed;
      const swing = Math.sin(walkCycle.current) * 0.5;
      if (frontLeftLeg.current) frontLeftLeg.current.rotation.x = swing;
      if (frontRightLeg.current) frontRightLeg.current.rotation.x = -swing;
      if (backLeftLeg.current) backLeftLeg.current.rotation.x = -swing;
      if (backRightLeg.current) backRightLeg.current.rotation.x = swing;
    } else {
      walkCycle.current = 0;
      if (frontLeftLeg.current) frontLeftLeg.current.rotation.x = 0;
      if (frontRightLeg.current) frontRightLeg.current.rotation.x = 0;
      if (backLeftLeg.current) backLeftLeg.current.rotation.x = 0;
      if (backRightLeg.current) backRightLeg.current.rotation.x = 0;
    }
  });

  const store = useGameStore.getState();
  const creature = store.creatures.find(cr => cr.id === creatureId);
  const startPos = creature ? creature.position : { x: 0, z: 0 };
  const y = terrainHeight(startPos.x, startPos.z);

  return (
    <group ref={ref} position={[startPos.x, y, startPos.z]}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.4, 0.45, 0.9]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.68, 0.48]} castShadow>
        <boxGeometry args={[0.35, 0.36, 0.45]} />
        <meshStandardMaterial color={c.rock} />
      </mesh>
      {/* Snout */}
      <mesh position={[0, 0.62, 0.75]}>
        <boxGeometry args={[0.2, 0.15, 0.2]} />
        <meshStandardMaterial color={c['rock-light']} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.12, 0.78, 0.65]}>
        <sphereGeometry args={[0.045, 4, 3]} />
        <meshStandardMaterial color="#cc2200" emissive="#cc2200" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.12, 0.78, 0.65]}>
        <sphereGeometry args={[0.045, 4, 3]} />
        <meshStandardMaterial color="#cc2200" emissive="#cc2200" emissiveIntensity={0.5} />
      </mesh>
      {/* Ears */}
      {[-0.12, 0.12].map(x => (
        <mesh key={x} position={[x, 0.95, 0.4]}>
          <coneGeometry args={[0.08, 0.22, 3]} />
          <meshStandardMaterial color={c.dark} />
        </mesh>
      ))}
      {/* Front legs */}
      <mesh ref={frontLeftLeg} position={[-0.14, 0.22, 0.25]} castShadow>
        <boxGeometry args={[0.1, 0.45, 0.12]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh ref={frontRightLeg} position={[0.14, 0.22, 0.25]} castShadow>
        <boxGeometry args={[0.1, 0.45, 0.12]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      {/* Back legs */}
      <mesh ref={backLeftLeg} position={[-0.14, 0.22, -0.3]} castShadow>
        <boxGeometry args={[0.1, 0.45, 0.12]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      <mesh ref={backRightLeg} position={[0.14, 0.22, -0.3]} castShadow>
        <boxGeometry args={[0.1, 0.45, 0.12]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0.6, -0.6]} rotation={[0.9, 0, 0]}>
        <boxGeometry args={[0.1, 0.1, 0.5]} />
        <meshStandardMaterial color={c.dark} />
      </mesh>
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
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: c.rock, flatShading: true }), [c.rock]);

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
  }, []);

  return <instancedMesh ref={ref} args={[geo, mat, 100]} castShadow receiveShadow />;
}

function TerrainMesh({ c, onAttack, paused }: { c: Palette; onAttack?: (() => void) | undefined; paused?: boolean | undefined }) {
  const geo = useMemo(() => {
    const size = MAP_HALF * 2 + 40;
    const segments = 80;
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, terrainHeight(x, y));
    }
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      geometry={geo}
      onPointerDown={e => {
        e.stopPropagation();
        if (paused) return;
        if (e.button === 0 && onAttack) onAttack();
      }}
    >
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

    const onClick = () => {
      if (cameraMode === 'third' && !pointerLocked.current && !props.paused) {
        canvas.requestPointerLock();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && !props.paused && props.onAttack) {
        if (pointerLocked.current || e.target === canvas) {
          props.onAttack();
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('click', onClick);
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
      const dist = 5;
      const shoulderOffset = 0.7;

      const camX = px - Math.sin(yaw) * Math.cos(pitch) * dist + Math.cos(yaw) * shoulderOffset;
      const camY = py + 2.8 - Math.sin(pitch) * dist;
      const camZ = pz - Math.cos(yaw) * Math.cos(pitch) * dist - Math.sin(yaw) * shoulderOffset;
      const wantPos = new THREE.Vector3(camX, camY, camZ);

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

    if (camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
  });

  const trees = useMemo(
    () =>
      Array.from({ length: 180 }, (_, i) => ({
        x: (rand(i + 1) - 0.5) * MAP_HALF * 2,
        z: (rand(i + 301) - 0.5) * MAP_HALF * 2,
        size: 0.65 + rand(i + 701) * 0.7,
        seed: i,
      }))
        .filter(p => Math.abs(p.x) > 4.5 || Math.abs(p.z) > 10)
        .filter(p => !(p.x > 2 && p.x < 12 && p.z < -3 && p.z > -13)),
    [],
  );

  const path = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-30, 0.025, 20),
      new THREE.Vector3(-18, 0.025, 12),
      new THREE.Vector3(-7, 0.025, 6),
      new THREE.Vector3(0, 0.025, 1),
      new THREE.Vector3(4, 0.025, -3),
      new THREE.Vector3(7, 0.025, -8),
      new THREE.Vector3(16, 0.025, -14),
      new THREE.Vector3(28, 0.025, -22),
    ]);
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


  return (
    <>
      <color attach="background" args={[c.ground]} />
      <fog attach="fog" args={[c.ground, 50, 100]} />
      <ambientLight intensity={1.5} color={c.light} />
      <directionalLight
        position={[-12, 25, 8]}
        intensity={2.8}
        color={c.light}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-35}
        shadow-camera-right={35}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
        shadow-bias={-0.001}
      />

      <TerrainMesh c={c} onAttack={props.onAttack} paused={props.paused} />

      <mesh geometry={path} receiveShadow>
        <meshStandardMaterial color={c.path} side={THREE.DoubleSide} />
      </mesh>

      {/* River */}
      <mesh position={[-10, 0.05, -2]} rotation={[-Math.PI / 2, 0, 0.35]}>
        <planeGeometry args={[5, 100]} />
        <meshStandardMaterial color={c.water} roughness={0.3} transparent opacity={0.85} />
      </mesh>
      {Array.from({ length: 25 }, (_, i) => (
        <mesh key={`water${i}`} position={[-10 + (rand(i + 50) - 0.5) * 3, 0.07, (rand(i + 80) - 0.5) * 60]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.4 + rand(i) * 1.2, 0.05]} />
          <meshBasicMaterial color={c['water-light']} transparent opacity={0.35} />
        </mesh>
      ))}

      {/* Bridge */}
      <group position={[-9, terrainHeight(-9, 7) + 0.19, 7]} rotation={[0, -0.35, 0]}>
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[(i - 8) * 0.35, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[0.32, 0.18, 2.1]} />
            <meshStandardMaterial color={i % 2 ? c.trunk : c.path} />
          </mesh>
        ))}
      </group>

      {trees.map((p, i) => <Tree key={i} {...p} c={c} />)}
      <RockInstances c={c} />
      <GrassPatches c={c} count={350} />

      <Ruins c={c} />
      <Campfire c={c} position={[-1, 0, 4]} />
      <Campfire c={c} position={[10, 0, -6]} />
      <Campfire c={c} position={[-15, 0, -12]} />

      {/* Crystal resource */}
      <group position={[-3, terrainHeight(-3, -2), -2]} onClick={e => { e.stopPropagation(); props.onCollect(); }}>
        <Rock x={0} z={0} size={1.25} c={c} />
        {[-0.4, 0, 0.4].map((x, i) => (
          <mesh key={x} position={[x, 0.9 + i * 0.1, 0.1]} rotation={[0, 0, x]} castShadow>
            <coneGeometry args={[0.18, 0.9, 5]} />
            <meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>

      {/* Chest */}
      <group position={[2, terrainHeight(2, 3) + 0.2, 3]} onClick={e => { e.stopPropagation(); props.onCollect(); }}>
        <mesh castShadow>
          <boxGeometry args={[0.65, 0.4, 0.42]} />
          <meshStandardMaterial color={c.trunk} />
        </mesh>
        <mesh position={[0, 0.13, 0.22]}>
          <boxGeometry args={[0.09, 0.18, 0.025]} />
          <meshStandardMaterial color={c.gold} />
        </mesh>
      </group>

      {/* Crystal tower */}
      <group position={[4, terrainHeight(4, 5), 5]}>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.3, 0.5, 2, 6]} />
          <meshStandardMaterial color={c.rock} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <octahedronGeometry args={[0.4, 0]} />
          <meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.4} />
        </mesh>
      </group>

      <Wolf c={c} creatureId="wolf_1" playerRef={playerRef} />
      <Wolf c={c} creatureId="wolf_2" playerRef={playerRef} />
      <Wolf c={c} creatureId="wolf_3" playerRef={playerRef} />

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
