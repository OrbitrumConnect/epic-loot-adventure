import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';

/**
 * Árvore-marco GIGANTE (modelo Meshy detalhado, decimado 3,6M→108k triângulos).
 * Poucas no mapa (1-2) como landmark "bolado". Não é a fauna/floresta normal.
 * O modelo tem o pé ~0,97 abaixo da origem (raízes) → planta pela base.
 */
const URL = '/models/trees/tree-gnarled.glb';
const BASE_BELOW = 0.97; // minY do modelo (nativo) → compensa p/ fincar no chão

export function LandmarkTree({ x, z, scale = 5.5, yaw = 0 }: { x: number; z: number; scale?: number; yaw?: number }) {
  const { scene } = useGLTF(URL);
  const tree = useMemo(() => {
    const c = scene.clone();
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  const y = terrainHeight(x, z);
  return (
    <group position={[x, y + BASE_BELOW * scale, z]} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={tree} />
    </group>
  );
}

useGLTF.preload(URL);
