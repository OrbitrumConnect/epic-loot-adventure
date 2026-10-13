import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LAKE_CENTERS, RIVER_POINTS, rand, terrainHeight, type Palette } from './world-kit';
import { pbrMaps } from './pbr-materials';

type Placement = { matrix: THREE.Matrix4; shade: number };
const noRaycast = () => {};
const curve = new THREE.CatmullRomCurve3(RIVER_POINTS.map(p => new THREE.Vector3(p.x, 0, p.z)));

// Same bridge footprint as the scene, with clearance for its approaches.
function clearBank(x: number, z: number) {
  const dx = x + 2, dz = z - 2.5;
  const lx = dx * Math.cos(0.64) - dz * Math.sin(0.64);
  const lz = dx * Math.sin(0.64) + dz * Math.cos(0.64);
  return !(Math.abs(lx) < 6.2 && Math.abs(lz) < 2.6)
    && LAKE_CENTERS.every(l => Math.hypot(x - l.x, z - l.z) > l.r + 0.5);
}

function bankPoint(t: number, side: number, offset: number) {
  const p = curve.getPoint(t), tangent = curve.getTangent(t);
  return { x: p.x - tangent.z * offset * side, z: p.z + tangent.x * offset * side };
}

function bankGeometry(c: Palette) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const wet = new THREE.Color(c.ground).lerp(new THREE.Color(c.dark), 0.22);
  const sand = new THREE.Color(c.path).lerp(new THREE.Color(c.ground), 0.55);
  const outer = new THREE.Color(c.ground);
  const rows = 241;
  for (const side of [-1, 1]) {
    const start = positions.length / 3;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const wave = Math.sin(t * 71 + side) * 0.12 + Math.sin(t * 167) * 0.065;
      // Water has a visual half-width of 2 m. The inner lip overlaps it,
      // while the outer edge sinks into the existing terrain.
      const offsets = [1.86 + wave, 2.13 + wave, 2.52 + wave * 1.5, 3.02 + wave * 2];
      offsets.forEach((offset, j) => {
        const p = bankPoint(t, side, offset);
        const lift = [0.075, 0.12, 0.055, -0.025][j]!;
        positions.push(p.x, terrainHeight(p.x, p.z) + lift, p.z);
        const color = (j === 0 ? wet : j === 1 ? sand : outer).clone();
        color.multiplyScalar(0.94 + rand(i * 7 + j + side * 301) * 0.12);
        colors.push(color.r, color.g, color.b);
      });
      if (i === 0) continue;
      const a = bankPoint(t, side, 2.4), b = bankPoint((i - 1) / (rows - 1), side, 2.4);
      if (!clearBank(a.x, a.z) || !clearBank(b.x, b.z)) continue;
      for (let j = 0; j < 3; j++) {
        const a0 = start + (i - 1) * 4 + j, b0 = start + i * 4 + j;
        if (side > 0) indices.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
        else indices.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function stoneGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const bulge = 1 + Math.sin(x * 5 + z * 3) * 0.12 + Math.sin(y * 7 - x * 4) * 0.07;
    vertices.setXYZ(i, x * bulge, y * bulge * (y > 0 ? 0.83 : 1), z * bulge);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function reedGeometry() {
  const geometry = new THREE.ConeGeometry(0.025, 1, 5, 4);
  geometry.translate(0, 0.5, 0);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const y = vertices.getY(i);
    vertices.setX(i, vertices.getX(i) + y * y * 0.18);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function placements() {
  const stones: Placement[] = [], reeds: Placement[] = [], leaves: Placement[] = [];
  const object = new THREE.Object3D();
  const put = (list: Placement[], x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, tilt = 0) => {
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.rotation.set(tilt, rand(seed + 17) * Math.PI * 2, tilt * 0.6);
    object.updateMatrix();
    list.push({ matrix: object.matrix.clone(), shade: 0.76 + rand(seed + 83) * 0.34 });
  };
  for (let i = 0; i < 290; i++) {
    const seed = i + 912;
    const t = (i + rand(seed)) / 290;
    const side = i % 2 ? 1 : -1;
    const p = bankPoint(t, side, 2.05 + rand(seed + 1) * 1.1);
    if (!clearBank(p.x, p.z)) continue;
    // Clusters alternate with exposed sediment; avoid a uniform rock wall.
    if (rand(seed + 2) > 0.21) {
      const size = 0.14 + Math.pow(rand(seed + 3), 2) * 0.65;
      const sy = size * (0.48 + rand(seed + 4) * 0.35);
      put(stones, p.x, terrainHeight(p.x, p.z) + sy * 0.24, p.z,
        size * 1.15, sy, size * (0.7 + rand(seed + 6) * 0.4), seed, (rand(seed + 5) - 0.5) * 0.3);
    }
    if (rand(seed + 7) < 0.32) {
      const clump = bankPoint(t, side, 2.8 + rand(seed + 8) * 0.85);
      if (!clearBank(clump.x, clump.z)) continue;
      for (let j = 0; j < 7; j++) {
        const s = seed * 11 + j;
        const x = clump.x + (rand(s) - 0.5) * 0.55;
        const z = clump.z + (rand(s + 1) - 0.5) * 0.55;
        const h = 0.26 + rand(s + 2) * 0.51;
        put(reeds, x, terrainHeight(x, z) - 0.035, z, 0.8, h, 0.8, s, (rand(s + 3) - 0.5) * 0.3);
        if (j % 2 === 0) put(leaves, x, terrainHeight(x, z) + h * 0.19, z,
          0.065, h * 0.48, 0.022, s, 0.45 + rand(s + 4) * 0.5);
      }
    }
  }
  return { stones, reeds, leaves };
}

function BankInstances({ geometry, items, color, roughness, shadow = false }: {
  geometry: THREE.BufferGeometry; items: Placement[]; color: string; roughness: number; shadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const shade = new THREE.Color();
    items.forEach((item, i) => {
      ref.current!.setMatrixAt(i, item.matrix);
      ref.current!.setColorAt(i, shade.setScalar(item.shade));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, undefined, items.length]} castShadow={shadow} receiveShadow raycast={noRaycast}>
    <meshStandardMaterial {...(shadow ? pbrMaps('worn_rock_natural_01') : {})} color={shadow ? '#ffffff' : color} roughness={shadow ? 1 : roughness} metalness={0} />
  </instancedMesh>;
}

/** Four static draw calls; cosmetic only, preserving traversal and water levels. */
export function RiverBanks({ c }: { c: Palette }) {
  const sediment = useMemo(() => bankGeometry(c), [c]);
  const stone = useMemo(stoneGeometry, []);
  const reed = useMemo(reedGeometry, []);
  const leaf = useMemo(() => new THREE.SphereGeometry(1, 6, 4), []);
  const items = useMemo(placements, []);
  return <group name="river-bank-dressing">
    <mesh geometry={sediment} receiveShadow raycast={noRaycast}>
      <meshStandardMaterial vertexColors roughness={0.84} side={THREE.DoubleSide} />
    </mesh>
    <BankInstances geometry={stone} items={items.stones} color={c.rock} roughness={0.73} shadow />
    <BankInstances geometry={reed} items={items.reeds} color={c.grass} roughness={0.94} />
    <BankInstances geometry={leaf} items={items.leaves} color={c.leaf} roughness={0.91} />
  </group>;
}
