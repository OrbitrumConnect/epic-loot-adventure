import { useEffect, useMemo } from 'react';
import { BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, Vector3 } from 'three';
import { mixColor, type Palette } from './world-kit';

type Part = 'torso' | 'shin' | 'shoulder' | 'bracer' | 'shield' | 'head' | 'body' | 'skull' | 'coat';

/** Continuous elliptical sections form a fitted silhouette, rather than stacked boxes. */
function fittedGeometry(profile: number[][]) {
  const curve = new CatmullRomCurve3(profile.map(([y, width, depth]) => new Vector3(width, y, depth)));
  const positions: number[] = [], indices: number[] = [];
  const rows = 32, sides = 40;
  for (let row = 0; row <= rows; row++) {
    const p = curve.getPoint(row / rows);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(Math.sin(angle) * p.x, p.y, Math.cos(angle) * p.z);
      if (row < rows && side < sides) {
        const a = row * (sides + 1) + side, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function clothGeometry(front = false) {
  const positions: number[] = [], indices: number[] = [];
  const rows = 32, columns = 48;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns * 2 - 1;
      const width = front ? 0.24 + t * 0.055 : 0.24 + t * 0.15;
      const fold = Math.cos(u * Math.PI * 4.5 + t * 0.5) * (0.007 + t * 0.028);
      const y = (front ? 0.73 : 1.25) - t * (front ? 0.45 : 0.99) + t ** 8 * (0.022 * Math.cos(u * 13) + Math.abs(u) * 0.075);
      const z = front ? 0.18 + t * 0.045 + fold : -0.18 - t * 0.16 - Math.sin(t * Math.PI) * 0.07 + u * u * 0.09 + fold;
      positions.push(u * width, y, z);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function TailoredSurface({ kind, color }: { kind: 'body' | 'skull' | 'cape' | 'coat'; color: string }) {
  const geometry = useMemo(() => {
    if (kind === 'cape' || kind === 'coat') return clothGeometry(kind === 'coat');
    return fittedGeometry(kind === 'body'
      ? [[0.58, 0.01, 0.01], [0.61, 0.24, 0.155], [0.76, 0.225, 0.15], [0.98, 0.28, 0.18], [1.14, 0.3, 0.155], [1.23, 0.16, 0.115], [1.25, 0.01, 0.01]]
      : [[1.29, 0.01, 0.01], [1.33, 0.125, 0.13], [1.42, 0.18, 0.17], [1.55, 0.2, 0.184], [1.66, 0.145, 0.139], [1.705, 0.001, 0.001]]);
  }, [kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.94} side={DoubleSide} /></mesh>;
}

/** All cosmetic parts retain the existing animated joint and equipment sockets. */
export function AdventurerDetails({ c, part }: { c: Palette; part: Part }) {
  const steel = mixColor(c.metal, c.light, 0.28);
  const metal = <meshStandardMaterial color={steel} metalness={0.78} roughness={0.36} />;
  const gold = <meshStandardMaterial color={c.gold} metalness={0.72} roughness={0.38} />;
  if (part === 'body') return <TailoredSurface kind="body" color={c.trunk} />;
  if (part === 'skull') return <TailoredSurface kind="skull" color={c.light} />;
  if (part === 'coat') return <TailoredSurface kind="coat" color={c.trunk} />;
  if (part === 'torso') return <>
    <TailoredSurface kind="cape" color={c.cloak} />
    <mesh position={[0, 1.015, 0.13]} scale={[0.267, 0.235, 0.107]} castShadow><sphereGeometry args={[1, 32, 24]} />{metal}</mesh>
    {[0.79, 0.85, 0.91].map(y => <mesh key={y} position={[0, y, 0.055]} scale={[1, 0.55, 0.69]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.215, 0.027, 10, 36, Math.PI]} />{metal}</mesh>)}
    <mesh position={[0, 0.64, 0]} scale={[1, 0.48, 0.68]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.24, 0.055, 12, 40]} /><meshStandardMaterial color={c.dark} roughness={0.84} /></mesh>
    <mesh position={[0, 0.65, 0.198]} scale={[1, 0.8, 0.35]}><torusGeometry args={[0.047, 0.013, 8, 24]} />{gold}</mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * 0.255, 0.71, 0.02]} scale={[0.072, 0.11, 0.085]} castShadow><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={c.trunk} roughness={0.88} /></mesh>
      <mesh position={[side * 0.17, 1.16, 0.19]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.035, 0.035, 0.018, 20]} />{gold}</mesh>
    </group>)}
    <mesh position={[0, 1.05, 0.239]} scale={[1, 1, 0.35]}><octahedronGeometry args={[0.044]} /><meshStandardMaterial color={c.crystal} emissive={c.crystal} emissiveIntensity={0.28} metalness={0.3} roughness={0.25} /></mesh>
  </>;
  if (part === 'shin') return <>
    <mesh position={[0, -0.115, 0.084]} scale={[0.087, 0.164, 0.04]} castShadow><sphereGeometry args={[1, 24, 16]} />{metal}</mesh>
    <mesh position={[0, 0.005, 0.086]} scale={[0.09, 0.075, 0.043]} castShadow><sphereGeometry args={[1, 24, 16]} />{metal}</mesh>
    {[-0.21, -0.06].map(y => <mesh key={y} position={[0, y, 0.01]} scale={[1, 1, 1.1]}><cylinderGeometry args={[0.086, 0.084, 0.025, 24]} /><meshStandardMaterial color={c.trunk} roughness={0.88} /></mesh>)}
  </>;
  if (part === 'shoulder') return <>
    {[0, 1, 2].map(i => <mesh key={i} position={[0, 0.025 - i * 0.045, 0]} scale={[1.12 - i * 0.08, 0.68, 1]} castShadow><sphereGeometry args={[0.17, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.61]} />{metal}</mesh>)}
    <mesh position={[0, 0.052, 0.158]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.035, 0.035, 0.012, 20]} />{gold}</mesh>
  </>;
  if (part === 'bracer') return <>
    <mesh position={[0, -0.14, 0.015]} castShadow><cylinderGeometry args={[0.087, 0.068, 0.19, 24]} />{metal}</mesh>
    {[-0.22, -0.06].map((y, i) => <mesh key={y} position={[0, y, 0.015]}><cylinderGeometry args={[i ? 0.09 : 0.074, i ? 0.09 : 0.074, 0.018, 24]} />{gold}</mesh>)}
  </>;
  if (part === 'shield') return <group position={[0, -0.14, 0.182]}>
    <mesh castShadow><torusGeometry args={[0.277, 0.024, 12, 48]} />{metal}</mesh>
    <mesh position={[0, 0, 0.008]} scale={[1, 1, 0.4]} castShadow><sphereGeometry args={[0.084, 24, 16]} />{gold}</mesh>
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 6) * 0.25, Math.sin(i * Math.PI / 6) * 0.25, 0.012]}><sphereGeometry args={[0.011, 8, 6]} />{gold}</mesh>)}
  </group>;
  return <>
    {[-0.085, 0.085].map(x => <mesh key={x} position={[x, 1.54, 0.183]}><torusGeometry args={[0.053, 0.011, 12, 28]} />{gold}</mesh>)}
    {[1.385, 1.42, 1.635].map((y, i) => <mesh key={y} position={[0, y, 0]} scale={[1, 0.8, 0.9]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[i === 2 ? 0.171 : 0.175, 0.012, 8, 40]} /><meshStandardMaterial color={mixColor(c.armor, c.light, 0.7)} roughness={1} /></mesh>)}
    {[0, 1, 2].map(i => <mesh key={i} position={[0, 1.265 + i * 0.034, 0.017]} scale={[1, 0.8, 0.89]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.156 + i * 0.009, 0.043, 12, 36]} /><meshStandardMaterial color={c.armor} roughness={1} /></mesh>)}
  </>;
}
