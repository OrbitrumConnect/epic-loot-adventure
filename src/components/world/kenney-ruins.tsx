import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';
import { modelUrl } from '@/game/asset-path';

/**
 * Ruínas/estruturas Kenney espalhadas pelo mundo (pós-colapso) — landmarks de
 * exploração. Aditivo, só cenário (não toca gameplay). Texturizado (colormap).
 */
const URLS = [
  modelUrl('castle/tower-square-base.glb'),
  modelUrl('castle/tower-square-mid.glb'),
  modelUrl('castle/wall.glb'),
  modelUrl('castle/gate.glb'),
] as const;

// Posições nas bordas do mapa (longe do spawn/base). {m:índice do modelo}
const RUINS: { m: number; x: number; z: number; ry: number; s: number }[] = [
  { m: 0, x: 34, z: -28, ry: 0.4, s: 1.6 },
  { m: 2, x: 37, z: -25, ry: 0.4, s: 1.5 },
  { m: 2, x: 31, z: -31, ry: 1.9, s: 1.5 },
  { m: 0, x: -38, z: 22, ry: 2.2, s: 1.8 },
  { m: 1, x: -35, z: 24, ry: 2.2, s: 1.4 },
  { m: 3, x: -22, z: -40, ry: 1.1, s: 1.4 },
  { m: 2, x: 40, z: 18, ry: 3.0, s: 1.4 },
  { m: 0, x: 8, z: 42, ry: 0.7, s: 1.5 },
];

export function KenneyRuins() {
  const g0 = useGLTF(URLS[0]);
  const g1 = useGLTF(URLS[1]);
  const g2 = useGLTF(URLS[2]);
  const g3 = useGLTF(URLS[3]);

  const nodes = useMemo(() => {
    const srcs = [g0.scene, g1.scene, g2.scene, g3.scene];
    return RUINS.map((r) => {
      const o = srcs[r.m]!.clone(true);
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      const off = -new THREE.Box3().setFromObject(o).min.y;
      o.position.set(r.x, terrainHeight(r.x, r.z) + off * r.s, r.z);
      o.rotation.y = r.ry;
      o.scale.setScalar(r.s);
      return o;
    });
  }, [g0.scene, g1.scene, g2.scene, g3.scene]);

  return <>{nodes.map((o, i) => <primitive key={i} object={o} />)}</>;
}
