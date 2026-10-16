import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';

/**
 * PLANÍCIE do deserto (Meshy decimado ~60k tris) como novo CHÃO do mapa. 1ª passada
 * VISUAL: escala pro tamanho do mapa e assenta a superfície no nível do terreno atual.
 * (Colisão ainda é a procedural flat — terreno "de verdade" seguindo o relevo = próximo.)
 */
const URL = '/models/terrain/desert-plain.glb';

export function DesertPlain({ size = 210, x = 0, z = 0 }: { size?: number; x?: number; z?: number }) {
  const { scene } = useGLTF(URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    const s = size / w;
    c.scale.setScalar(s);
    // Centra em XZ e assenta a BASE da superfície em y=0 (nível caminhável atual).
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    return c;
  }, [scene, size]);
  return (
    <group position={[x, terrainHeight(x, z), z]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(URL);
