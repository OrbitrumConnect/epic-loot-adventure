/**
 * Pack 01 geometry pilot. All visuals are authored as Three.js meshes/groups;
 * source concept PNGs are never rendered as planes. Enable with
 * `?asset-pilot=ashland` to inspect the four assets in the live world.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';

const MAT = {
  bark: new THREE.MeshStandardMaterial({ color: '#342923', roughness: 0.94, flatShading: true }),
  barkLight: new THREE.MeshStandardMaterial({ color: '#66503b', roughness: 0.9, flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: '#51483e', metalness: 0.68, roughness: 0.62, flatShading: true }),
  rust: new THREE.MeshStandardMaterial({ color: '#a34e2d', metalness: 0.3, roughness: 0.82, flatShading: true }),
  cloth: new THREE.MeshStandardMaterial({ color: '#262321', roughness: 1, flatShading: true }),
  scarf: new THREE.MeshStandardMaterial({ color: '#9d3d22', roughness: 0.92, flatShading: true }),
  bone: new THREE.MeshStandardMaterial({ color: '#c8b590', roughness: 0.9, flatShading: true }),
  cyan: new THREE.MeshStandardMaterial({ color: '#36e8df', emissive: '#00c9d2', emissiveIntensity: 2.1, roughness: 0.28 }),
  hide: new THREE.MeshStandardMaterial({ color: '#81705b', roughness: 1, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: '#191714', roughness: 0.95, flatShading: true }),
};

function Segment({ from, to, radius, material, sides = 6 }: {
  from: [number, number, number]; to: [number, number, number]; radius: number;
  material: THREE.Material; sides?: number;
}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = useRef<THREE.Mesh>(null);
  return (
    <mesh ref={mesh} position={a.clone().add(b).multiplyScalar(0.5).toArray()} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())} castShadow material={material}>
      <cylinderGeometry args={[radius * 0.78, radius, direction.length(), sides]} />
    </mesh>
  );
}

function AshTree({ position }: { position: [number, number, number] }) {
  const crown = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (crown.current) crown.current.rotation.z = Math.sin(clock.elapsedTime * 0.55) * 0.018; });
  return (
    <group position={position}>
      <mesh position={[0, 1.05, 0]} rotation={[0, 0, -0.035]} castShadow material={MAT.bark}>
        <cylinderGeometry args={[0.21, 0.39, 2.1, 7]} />
      </mesh>
      <group ref={crown}>
        <Segment from={[0, 0.92, 0]} to={[-0.92, 1.86, 0.02]} radius={0.14} material={MAT.bark} />
        <Segment from={[-0.92, 1.86, 0.02]} to={[-1.25, 2.35, 0.02]} radius={0.075} material={MAT.barkLight} />
        <Segment from={[-0.78, 1.72, 0]} to={[-1.48, 1.83, 0.04]} radius={0.09} material={MAT.bark} />
        <Segment from={[0.02, 1.15, 0]} to={[0.78, 2.08, -0.03]} radius={0.15} material={MAT.bark} />
        <Segment from={[0.78, 2.08, -0.03]} to={[1.12, 2.57, -0.02]} radius={0.075} material={MAT.barkLight} />
        <Segment from={[0.7, 2, 0]} to={[1.47, 2.08, 0.02]} radius={0.085} material={MAT.bark} />
        <Segment from={[0, 1.3, 0]} to={[0.08, 2.42, 0.04]} radius={0.12} material={MAT.bark} />
        <Segment from={[0.08, 2.42, 0.04]} to={[-0.12, 2.93, 0.04]} radius={0.065} material={MAT.barkLight} />
        {/* Cyan sap follows trunk and branch seams as actual emissive geometry. */}
        <Segment from={[0.06, 0.22, 0.235]} to={[-0.02, 1.13, 0.22]} radius={0.026} material={MAT.cyan} sides={5} />
        <Segment from={[-0.02, 1.13, 0.22]} to={[-0.55, 1.62, 0.16]} radius={0.018} material={MAT.cyan} sides={5} />
        <Segment from={[0.02, 1.4, 0.17]} to={[0.49, 1.91, 0.13]} radius={0.018} material={MAT.cyan} sides={5} />
      </group>
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.3, 0.09, 0]} rotation={[0, 0, side * 0.36]} castShadow material={MAT.bark}>
        <coneGeometry args={[0.34, 0.62, 5]} />
      </mesh>)}
    </group>
  );
}

function AshCleaver({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Grip and hand guard */}
      <mesh position={[0, 0.25, 0]} rotation={[0, 0, -0.04]} castShadow material={MAT.bark}>
        <cylinderGeometry args={[0.065, 0.08, 0.54, 7]} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[0, 0.06 + i * 0.09, 0.02]} rotation={[0, 0, 0.25]} material={MAT.hide}>
        <boxGeometry args={[0.14, 0.035, 0.12]} />
      </mesh>)}
      <mesh position={[0, 0.55, 0]} castShadow material={MAT.rust}><boxGeometry args={[0.34, 0.09, 0.12]} /></mesh>
      {/* Heavy asymmetric cleaver head */}
      <mesh position={[0.08, 0.88, 0]} rotation={[0, 0, -0.12]} castShadow material={MAT.metal}>
        <boxGeometry args={[0.58, 0.62, 0.14]} />
      </mesh>
      <mesh position={[0.12, 0.91, 0.084]} rotation={[0, 0, -0.12]} material={MAT.rust}>
        <boxGeometry args={[0.45, 0.47, 0.018]} />
      </mesh>
      <mesh position={[0.08, 0.9, 0.105]} material={MAT.cyan}><boxGeometry args={[0.2, 0.12, 0.026]} /></mesh>
      <mesh position={[-0.04, 1.22, 0]} rotation={[0, 0, -0.2]} castShadow material={MAT.rust}><boxGeometry args={[0.16, 0.11, 0.19]} /></mesh>
      {[-0.14, 0.14].map(x => <mesh key={x} position={[x, 0.62, 0.09]} material={MAT.bone}><sphereGeometry args={[0.028, 5, 4]} /></mesh>)}
    </group>
  );
}

function AshHero({ position }: { position: [number, number, number] }) {
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const weapon = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const gait = Math.sin(t * 3.2);
    if (leftArm.current) leftArm.current.rotation.x = gait * 0.22 - 0.06;
    if (rightArm.current) rightArm.current.rotation.x = -gait * 0.22 - 0.12;
    if (leftLeg.current) leftLeg.current.rotation.x = -gait * 0.25;
    if (rightLeg.current) rightLeg.current.rotation.x = gait * 0.25;
    if (torso.current) torso.current.position.y = Math.abs(Math.sin(t * 6.4)) * 0.025 + Math.sin(t * 1.4) * 0.012;
    if (weapon.current) weapon.current.rotation.x = -0.12 + Math.sin(t * 1.6) * 0.035;
  });
  return (
    <group position={position}>
      {/* Stable attachment points for future equipment swaps. */}
      <group name="head" position={[0, 1.82, 0]} />
      <group name="chest" position={[0, 1.03, 0.22]} />
      <group name="back" position={[0, 1.03, -0.42]} />
      <group name="hand_L" position={[-0.39, 0.57, 0.1]} />
      <group name="foot_L" position={[-0.16, 0.02, 0.08]} />
      <group name="foot_R" position={[0.16, 0.02, 0.08]} />
      {/* proportions scaled to the existing ~1.8m player rig */}
      <group ref={torso}>
        <mesh position={[0, 0.98, 0]} castShadow material={MAT.cloth}><capsuleGeometry args={[0.27, 0.42, 3, 7]} /></mesh>
        <mesh position={[0, 1.03, 0.04]} castShadow material={MAT.metal}><boxGeometry args={[0.58, 0.49, 0.34]} /></mesh>
        <mesh position={[0, 0.76, 0.03]} material={MAT.bark}><boxGeometry args={[0.64, 0.12, 0.39]} /></mesh>
        <mesh position={[0, 0.76, 0.235]} material={MAT.rust}><boxGeometry args={[0.12, 0.1, 0.035]} /></mesh>
        {/* Hood, respirator, and cyan lenses */}
        <mesh position={[0, 1.55, 0]} castShadow material={MAT.hide}><dodecahedronGeometry args={[0.27, 0]} /></mesh>
        <mesh position={[0, 1.51, 0.226]} castShadow material={MAT.dark}><boxGeometry args={[0.27, 0.31, 0.15]} /></mesh>
        <mesh position={[0, 1.37, 0.29]} material={MAT.metal}><cylinderGeometry args={[0.1, 0.12, 0.11, 7]} /></mesh>
        {[-0.09, 0.09].map(x => <mesh key={x} position={[x, 1.59, 0.253]} material={MAT.cyan}><sphereGeometry args={[0.052, 8, 6]} /></mesh>)}
        {/* Distinct burnt scarf collar and trailing tabs */}
        <mesh position={[0, 1.29, 0.02]} castShadow material={MAT.scarf}><torusGeometry args={[0.23, 0.08, 5, 9]} /></mesh>
        <mesh position={[-0.19, 0.96, -0.27]} rotation={[0.08, 0, -0.09]} castShadow material={MAT.scarf}><boxGeometry args={[0.19, 0.76, 0.045]} /></mesh>
        <mesh position={[0.13, 0.9, -0.28]} rotation={[0.05, 0, 0.12]} castShadow material={MAT.bone}><boxGeometry args={[0.17, 0.66, 0.04]} /></mesh>
        {/* Scrap pack with paired cyan cells */}
        <mesh position={[0, 1.03, -0.28]} castShadow material={MAT.bark}><boxGeometry args={[0.42, 0.5, 0.22]} /></mesh>
        {[-0.13, 0.13].map(x => <group key={x} position={[x, 1.07, -0.41]}>
          <mesh castShadow material={MAT.rust}><cylinderGeometry args={[0.075, 0.075, 0.36, 7]} /></mesh>
          <mesh material={MAT.cyan}><cylinderGeometry args={[0.052, 0.052, 0.23, 7]} /></mesh>
          <mesh position={[0, 0.2, 0]} material={MAT.metal}><cylinderGeometry args={[0.085, 0.085, 0.045, 7]} /></mesh>
        </group>)}
        {/* Chest strap and segmented utility pouches */}
        <mesh position={[-0.11, 1.05, 0.22]} rotation={[0, 0, -0.42]} material={MAT.hide}><boxGeometry args={[0.065, 0.68, 0.04]} /></mesh>
        {[-0.22, 0, 0.22].map(x => <mesh key={x} position={[x, 0.79, 0.24]} castShadow material={MAT.rust}><boxGeometry args={[0.14, 0.16, 0.1]} /></mesh>)}
        {/* Shoulder armor plates */}
        {[-1, 1].map(side => <group key={side} position={[side * 0.35, 1.22, 0]}>
          <mesh rotation={[0, 0, side * -0.25]} castShadow material={side < 0 ? MAT.bone : MAT.rust}><dodecahedronGeometry args={[0.19, 0]} /></mesh>
          <mesh position={[side * 0.12, 0.05, 0.08]} material={MAT.metal}><sphereGeometry args={[0.025, 5, 4]} /></mesh>
        </group>)}
      </group>
      {/* Arms: upper arm → elbow pivot → forearm → hand/socket */}
      {[-1, 1].map(side => {
        const armRef = side < 0 ? leftArm : rightArm;
        return <group key={side} ref={armRef} position={[side * 0.39, 1.2, 0]}>
          <mesh position={[0, -0.16, 0]} rotation={[0, 0, side * -0.12]} castShadow material={MAT.hide}><capsuleGeometry args={[0.095, 0.18, 3, 6]} /></mesh>
          <mesh position={[0, -0.3, 0]} castShadow material={MAT.metal}><sphereGeometry args={[0.09, 6, 5]} /></mesh>
          <group position={[0, -0.32, 0]}>
            <mesh position={[0, -0.13, 0]} rotation={[0, 0, side * -0.08]} castShadow material={MAT.hide}><capsuleGeometry args={[0.075, 0.17, 3, 6]} /></mesh>
            <mesh position={[0, -0.27, 0.03]} material={MAT.dark}><boxGeometry args={[0.12, 0.11, 0.13]} /></mesh>
          {side > 0 && <group ref={weapon} name="hand_R" position={[0, -0.31, 0.11]} rotation={[0.35, 0, -0.08]}><AshCleaver position={[0, -0.12, 0]} rotation={[0, 0, -0.25]} /></group>}
          </group>
        </group>;
      })}
      {/* Legs: hip pivots, knee volumes, shin armor and boots */}
      {[-1, 1].map(side => {
        const legRef = side < 0 ? leftLeg : rightLeg;
        return <group key={side} ref={legRef} position={[side * 0.16, 0.68, 0]}>
          <mesh position={[0, -0.17, 0]} castShadow material={MAT.cloth}><capsuleGeometry args={[0.105, 0.2, 3, 6]} /></mesh>
          <mesh position={[0, -0.32, 0.07]} castShadow material={MAT.rust}><dodecahedronGeometry args={[0.13, 0]} /></mesh>
          <mesh position={[0, -0.52, 0]} castShadow material={MAT.hide}><capsuleGeometry args={[0.08, 0.22, 3, 6]} /></mesh>
          <mesh position={[0, -0.66, 0.08]} castShadow material={MAT.metal}><boxGeometry args={[0.2, 0.12, 0.31]} /></mesh>
          {[-0.045, 0, 0.045].map(dx => <mesh key={dx} position={[dx, -0.51, 0.09]} material={MAT.rust}><boxGeometry args={[0.018, 0.16, 0.035]} /></mesh>)}
        </group>;
      })}
    </group>
  );
}

function AshStalker({ position }: { position: [number, number, number] }) {
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 2.8;
    legs.forEach((leg, i) => { if (leg.current) leg.current.rotation.x = Math.sin(t + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.12; });
    if (body.current) body.current.position.y = Math.abs(Math.sin(t * 2)) * 0.018;
  });
  return (
    <group position={position}>
      <group ref={body}>
        <mesh position={[0, 0.66, -0.05]} scale={[0.54, 0.43, 0.88]} castShadow material={MAT.hide}><icosahedronGeometry args={[0.62, 1]} /></mesh>
        <mesh position={[0, 0.75, 0.49]} scale={[0.84, 0.75, 0.72]} castShadow material={MAT.bark}><dodecahedronGeometry args={[0.44, 1]} /></mesh>
        <mesh position={[0, 0.67, 0.84]} castShadow material={MAT.dark}><coneGeometry args={[0.2, 0.43, 6]} /></mesh>
        <mesh position={[0, 0.52, 0.91]} material={MAT.bone}><boxGeometry args={[0.22, 0.07, 0.23]} /></mesh>
        {[-1, 1].map(side => <group key={side}>
          <mesh position={[side * 0.25, 0.79, 0.58]} material={MAT.cyan}><sphereGeometry args={[0.045, 7, 5]} /></mesh>
          <mesh position={[side * 0.27, 1.09, 0.49]} rotation={[0.12, 0, side * -0.22]} castShadow material={MAT.rust}><coneGeometry args={[0.11, 0.37, 5]} /></mesh>
          <mesh position={[side * 0.37, 0.8, -0.24]} rotation={[0.12, 0, side * 0.25]} castShadow material={MAT.barkLight}><coneGeometry args={[0.13, 0.31, 5]} /></mesh>
          <mesh position={[side * 0.12, 0.57, 0.4]} material={MAT.cyan}><boxGeometry args={[0.035, 0.2, 0.04]} /></mesh>
        </group>)}
        {/* Four articulated legs with visible joints and claws. */}
        {[
          [-0.33, 0.46, 0.39], [0.33, 0.46, 0.39], [-0.34, 0.45, -0.52], [0.34, 0.45, -0.52],
        ].map(([x, y, z], i) => <group key={i} ref={legs[i]!} position={[x!, y!, z!]}>
          <mesh position={[0, -0.12, 0]} castShadow material={MAT.hide}><capsuleGeometry args={[0.09, 0.23, 3, 6]} /></mesh>
          <mesh position={[0, -0.27, 0.04]} material={MAT.bark}><sphereGeometry args={[0.085, 6, 5]} /></mesh>
          <mesh position={[0, -0.39, 0.08]} castShadow material={MAT.dark}><capsuleGeometry args={[0.065, 0.2, 3, 5]} /></mesh>
          <mesh position={[0, -0.49, 0.17]} castShadow material={MAT.bark}><boxGeometry args={[0.18, 0.09, 0.23]} /></mesh>
          {[-1, 1].map(claw => <mesh key={claw} position={[claw * 0.055, -0.5, 0.27]} rotation={[0.25, 0, claw * 0.12]} material={MAT.bone}><coneGeometry args={[0.035, 0.14, 4]} /></mesh>)}
        </group>)}
        <Segment from={[0, 0.57, -0.65]} to={[0.08, 0.42, -1.02]} radius={0.085} material={MAT.hide} />
        <Segment from={[0.08, 0.42, -1.02]} to={[0.24, 0.31, -1.28]} radius={0.045} material={MAT.bark} />
      </group>
    </group>
  );
}

export function AshlandPilot() {
  const coords: [number, number][] = [[-3.4, -3.2], [-1.1, -3.2], [1.1, -3.2], [3.6, -3.2]];
  const positions = coords.map(([x, z]) => [x, terrainHeight(x, z), z] as [number, number, number]);
  return (
    <group>
      <AshTree position={positions[0]!} />
      <AshCleaver position={[positions[1]![0], positions[1]![1] + 0.05, positions[1]![2]]} rotation={[0.18, 0, -0.12]} />
      <AshHero position={positions[2]!} />
      <AshStalker position={positions[3]!} />
    </group>
  );
}
