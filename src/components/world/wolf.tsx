/**
 * Lobo do Vale. Visual e números idênticos aos originais de `game-world.tsx`;
 * a IA agora vem de `useHostileAI` com `WOLF_TUNING` (mesmos valores).
 */
import { useRef } from 'react';
import * as THREE from 'three';
import type { Position } from '@/game/types';
import { EnemyLabel, SelectionRing } from './enemy-label';
import { useEnemyClick, useHostileAI, WOLF_TUNING } from './hostile-ai';
import { terrainHeight, type Palette } from './world-kit';

export function Wolf({
  c, creatureId, name, start, playerRef,
}: {
  c: Palette;
  creatureId: string;
  name: string;
  start: Position;
  playerRef: React.RefObject<THREE.Group | null>;
}) {
  const ref = useRef<THREE.Group>(null);
  const frontLeftLeg = useRef<THREE.Mesh>(null);
  const frontRightLeg = useRef<THREE.Mesh>(null);
  const backLeftLeg = useRef<THREE.Mesh>(null);
  const backRightLeg = useRef<THREE.Mesh>(null);
  const hpGroup = useRef<THREE.Group>(null);
  const label = useRef<THREE.Group>(null);
  const hpFill = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Object3D>(null);
  const onClick = useEnemyClick(creatureId, name);

  useHostileAI({
    creatureId,
    tuning: WOLF_TUNING,
    group: ref,
    playerRef,
    label,
    hpFill,
    hpGroup,
    ring,
    onAnimate: anim => {
      const swingAmount = anim.moving ? Math.sin(anim.walkCycle) * 0.5 : 0;
      if (frontLeftLeg.current) frontLeftLeg.current.rotation.x = swingAmount;
      if (frontRightLeg.current) frontRightLeg.current.rotation.x = -swingAmount;
      if (backLeftLeg.current) backLeftLeg.current.rotation.x = -swingAmount;
      if (backRightLeg.current) backRightLeg.current.rotation.x = swingAmount;
    },
  });

  const y = terrainHeight(start.x, start.z);

  return (
    <group ref={ref} position={[start.x, y, start.z]} onPointerDown={onClick}>
      <SelectionRing ring={ring} radius={0.6} c={c} />
      <EnemyLabel name={name} height={1.5} hpGroup={hpGroup} label={label} hpFill={hpFill} c={c} />
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
