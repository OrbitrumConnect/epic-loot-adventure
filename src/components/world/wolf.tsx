/**
 * Lobo do Vale: anatomia facetada, pelagem em camadas e presas.
 * IA e parâmetros originais preservados em `useHostileAI` / `WOLF_TUNING`.
 */
import { memo, useRef, useState } from 'react';
import { EliteAura } from './elite-aura';
import * as THREE from 'three';
import type { Position } from '@/game/types';
import { EnemyLabel, SelectionRing } from './enemy-label';
import { useEnemyClick, useHostileAI, WOLF_TUNING } from './hostile-ai';
import { mixColor, terrainHeight, type Palette } from './world-kit';
import { GlbCreature } from './glb-creature';

/** Lobo do Vale = GLB (fox, anim própria, tint cinza). Visual troca; IA/HP ficam. */
const USE_GLB_WOLF = true;

const furGeometry = new THREE.SphereGeometry(0.5, 10, 8);
const earGeometry = new THREE.ConeGeometry(0.5, 1, 5);
const furMaterials = new Map<string, THREE.MeshStandardMaterial>();
function fur(color: string, glow = false) {
  const key = `${color}:${glow}`;
  if (!furMaterials.has(key)) furMaterials.set(key, new THREE.MeshStandardMaterial({
    color, roughness: 0.94, flatShading: true,
    emissive: glow ? color : 0, emissiveIntensity: glow ? 0.65 : 0,
  }));
  return furMaterials.get(key)!;
}

function WolfImpl({
  c, creatureId, name, start, renderBody, playerRef,
}: {
  c: Palette;
  creatureId: string;
  name: string;
  start: Position;
  renderBody: boolean;
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
  const movingRef = useRef(false);
  const onClick = useEnemyClick(creatureId, name);
  const [elite, setElite] = useState(false); // Enfurecido → fumaça vermelha
  const eliteNow = useRef(false);

  useHostileAI({
    creatureId,
    bodyRadius: 0.6,
    tuning: WOLF_TUNING,
    group: ref,
    playerRef,
    label,
    hpFill,
    hpGroup,
    ring,
    onAnimate: anim => {
      if (anim.elite !== eliteNow.current) { eliteNow.current = anim.elite; setElite(anim.elite); }
      movingRef.current = anim.moving; // dirige a anim do GLB
      if (USE_GLB_WOLF) return;        // GLB anima sozinho; pula pernas procedurais
      const swingAmount = anim.moving ? Math.sin(anim.walkCycle) * 0.5 : 0;
      if (frontLeftLeg.current) frontLeftLeg.current.rotation.x = swingAmount;
      if (frontRightLeg.current) frontRightLeg.current.rotation.x = -swingAmount;
      if (backLeftLeg.current) backLeftLeg.current.rotation.x = -swingAmount;
      if (backRightLeg.current) backRightLeg.current.rotation.x = swingAmount;
    },
  });

  const y = terrainHeight(start.x, start.z);
  const coat = fur(mixColor(c.rock, c.dark, 0.65));
  const mane = fur(c.rock);
  const pale = fur(c['rock-light']);
  const dark = fur(c.dark);

  return (
    <group ref={ref} position={[start.x, y, start.z]} onPointerDown={onClick}>
      {renderBody && <>
      {elite && <EliteAura height={1.1} />}
      <SelectionRing ring={ring} radius={0.6} c={c} />
      <EnemyLabel name={name} height={1.5} hpGroup={hpGroup} label={label} hpFill={hpFill} c={c} />
      {USE_GLB_WOLF && <GlbCreature url="/models/animals/fox.glb" movingRef={movingRef} height={1.2} yaw={0} tint="#3f434b" />}
      <group visible={!USE_GLB_WOLF}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} scale={[0.44, 0.5, 1.04]} geometry={furGeometry} material={coat} castShadow />
      <mesh position={[0, 0.57, 0.28]} scale={[0.5, 0.61, 0.5]} rotation={[-0.3, 0, 0]} geometry={furGeometry} material={mane} castShadow />
      <mesh position={[0, 0.51, -0.28]} scale={[0.39, 0.43, 0.44]} geometry={furGeometry} material={coat} castShadow />
      {/* Head */}
      <mesh position={[0, 0.7, 0.48]} scale={[0.38, 0.4, 0.5]} geometry={furGeometry} material={mane} castShadow />
      {/* Snout */}
      <mesh position={[0, 0.64, 0.74]} scale={[0.21, 0.18, 0.32]} geometry={furGeometry} material={pale} />
      <mesh position={[0, 0.67, 0.88]} scale={[0.14, 0.09, 0.07]} geometry={furGeometry} material={dark} />
      {[-1, 1].map(side => <group key={side}>
        <mesh position={[side * 0.18, 0.62, 0.45]} rotation={[0, 0, side * 0.6]} scale={[0.13, 0.27, 0.23]} geometry={earGeometry} material={mane} />
        <mesh position={[side * 0.074, 0.57, 0.76]} rotation={[Math.PI, 0, 0]} scale={[0.035, 0.085, 0.035]} geometry={earGeometry} material={pale} />
      </group>)}
      {/* Eyes */}
      <mesh position={[-0.12, 0.78, 0.65]}>
        <sphereGeometry args={[0.045, 4, 3]} />
        <primitive object={fur(c.cloak, true)} attach="material" />
      </mesh>
      <mesh position={[0.12, 0.78, 0.65]}>
        <sphereGeometry args={[0.045, 4, 3]} />
        <primitive object={fur(c.cloak, true)} attach="material" />
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
        <cylinderGeometry args={[0.065, 0.045, 0.45, 6]} />
        <primitive object={coat} attach="material" />
        <mesh position={[0, -0.17, 0.035]} scale={[0.12, 0.1, 0.2]} geometry={furGeometry} material={dark} />
      </mesh>
      <mesh ref={frontRightLeg} position={[0.14, 0.22, 0.25]} castShadow>
        <cylinderGeometry args={[0.065, 0.045, 0.45, 6]} />
        <primitive object={coat} attach="material" />
        <mesh position={[0, -0.17, 0.035]} scale={[0.12, 0.1, 0.2]} geometry={furGeometry} material={dark} />
      </mesh>
      {/* Back legs */}
      <mesh ref={backLeftLeg} position={[-0.14, 0.22, -0.3]} castShadow>
        <cylinderGeometry args={[0.08, 0.04, 0.45, 6]} />
        <primitive object={coat} attach="material" />
        <mesh position={[0, -0.17, 0.035]} scale={[0.12, 0.1, 0.2]} geometry={furGeometry} material={dark} />
      </mesh>
      <mesh ref={backRightLeg} position={[0.14, 0.22, -0.3]} castShadow>
        <cylinderGeometry args={[0.08, 0.04, 0.45, 6]} />
        <primitive object={coat} attach="material" />
        <mesh position={[0, -0.17, 0.035]} scale={[0.12, 0.1, 0.2]} geometry={furGeometry} material={dark} />
      </mesh>
      {/* Tail */}
      <mesh position={[0, 0.48, -0.62]} rotation={[0.6, 0, 0]} scale={[0.18, 0.2, 0.58]} geometry={furGeometry} material={coat} castShadow />
      </group>
      </>}
    </group>
  );
}

export const Wolf = memo(WolfImpl);
Wolf.displayName = 'Wolf';
