import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { rand, type Palette } from './world-kit';

/** Surface masonry follows the original ruin footprint; collision stays unchanged. */
export function RuinMasonry({ c }: { c: Palette }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const stones = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; yaw: number }[] = [];
    for (const side of [-1, 1]) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
          const z = -2.07 + col * 0.81 + (row % 2) * 0.12;
          for (const face of [-1, 1]) out.push({
            p: [side * 3 + face * 0.5, 0.38 + row * 0.44, z],
            s: [0.14, 0.40, 0.75], yaw: 0,
          });
        }
      }
    }
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) {
        const x = -2.64 + col * 0.75;
        if (Math.abs(x) < 1.0 && row < 5) continue;
        out.push({ p: [x, 0.3 + row * 0.43, -1.65], s: [0.69, 0.39, 0.16], yaw: 0 });
      }
    }
    for (let i = 0; i < 12; i++) out.push({
      p: [(rand(i + 70) - 0.5) * 5.6, 0.32, 1.0 + rand(i + 110) * 1.25],
      s: [0.48 + rand(i + 12) * 0.4, 0.18, 0.38], yaw: rand(i + 53) * Math.PI,
    });
    return out;
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const base = new THREE.Color(c.rock);
    const light = new THREE.Color(c['rock-light']);
    stones.forEach((stone, i) => {
      dummy.position.set(...stone.p);
      dummy.scale.set(...stone.s);
      dummy.rotation.set(0, stone.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(base).lerp(light, rand(i + 923) * 0.7);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [stones, c]);
  return <>
    <instancedMesh ref={ref} args={[undefined, undefined, stones.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.96} />
    </instancedMesh>
    {[-1, 1].map(side => <group key={side}>
      {[0.42, 1.1, 1.78, 2.46].map(y => <mesh key={y} position={[side * 0.97, y, -1.49]} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.62, 0.26]} /><meshStandardMaterial color={c['rock-light']} roughness={0.92} />
      </mesh>)}
      <mesh position={[side * 3, 3.5, -2]} castShadow>
        <cylinderGeometry args={[1.005, 1.025, 0.2, 12]} /><meshStandardMaterial color={c['rock-light']} roughness={0.9} />
      </mesh>
      <mesh position={[side * 3, 5.13, -2]} castShadow>
        <cylinderGeometry args={[1.07, 0.96, 0.3, 12]} /><meshStandardMaterial color={c['rock-light']} roughness={0.9} />
      </mesh>
      <mesh position={[side * 1.7, 1.45, -1.5]} castShadow>
        <boxGeometry args={[0.10, 0.45, 0.2]} /><meshStandardMaterial color={c.metal} metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[side * 1.7, 1.77, -1.42]}>
        <octahedronGeometry args={[0.12]} /><meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={1.8} />
      </mesh>
    </group>)}
    <mesh position={[0, 2.77, -1.49]} castShadow>
      <boxGeometry args={[2.25, 0.34, 0.35]} /><meshStandardMaterial color={c['rock-light']} roughness={0.9} />
    </mesh>
    <mesh position={[0, 2.82, -1.27]} rotation={[0, 0, Math.PI / 4]}>
      <boxGeometry args={[0.25, 0.25, 0.08]} /><meshStandardMaterial color={c.gold} metalness={0.6} roughness={0.45} />
    </mesh>
  </>;
}
