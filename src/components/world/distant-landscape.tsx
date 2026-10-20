import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_HALF, type Palette } from './world-kit';
import { pbrMaps } from './pbr-materials';

/** Scenic ring outside the playable square. No collision or simulation changes. */
export function DistantLandscape({ c }: { c: Palette }) {
  const geometry = useMemo(() => {
    const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
    const segments = 192, rows = 32;
    const stone = new THREE.Color(c['rock-light']).lerp(new THREE.Color('white'), 0.75);
    // Mescla com o CHÃO caminhável (grass, meio desértico) + mantém um pouco de
    // verde (leaf) → montanha coerente com o mapa, não verdão (pedido do Pedro).
    const moss = new THREE.Color(c.grass).lerp(new THREE.Color(c.leaf), 0.4).lerp(new THREE.Color('white'), 0.5);
    const color = new THREE.Color();
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        const dx = Math.cos(angle), dz = Math.sin(angle);
        const square = Math.max(Math.abs(dx), Math.abs(dz));
        const radius = MAP_HALF + 12 + t * 115;
        const x = dx / square * radius, z = dz / square * radius;
        const massif = 5 + 20 * Math.pow(Math.sin(angle * 3 + 0.8), 10) + 15 * Math.pow(Math.sin(angle * 5 - 1), 16);
        const ridge = 1 - Math.abs(Math.sin(angle * 23 + t * 9)) * 0.16 - Math.abs(Math.sin(angle * 47 - t * 13)) * 0.07;
        const y = Math.pow(Math.sin(t * Math.PI), 1.5) * massif * ridge - 1.2;
        positions.push(x, y, z);
        uv.push(x / 12, z / 12);
        color.copy(moss).lerp(stone, THREE.MathUtils.smoothstep(y, 8, 30));
        colors.push(color.r, color.g, color.b);
        if (row < rows && i < segments) {
          const a = row * (segments + 1) + i, b = a + segments + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [c]);
  return <mesh geometry={geometry} raycast={() => {}}>
    <meshStandardMaterial {...pbrMaps('worn_rock_natural_01')} vertexColors roughness={1} side={THREE.DoubleSide} />
  </mesh>;
}
