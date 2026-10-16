import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';

/**
 * PLANÍCIE do deserto (Meshy decimado) como novo CHÃO do mapa. 1ª passada VISUAL:
 * escala pro tamanho do mapa e ASSENTA A SUPERFÍCIE DO CENTRO no marco 0 (nível
 * caminhável atual). O modelo tem relevo (varia ~20m depois de escalar) e é
 * quantizado, então achamos a superfície por RAYCAST pra baixo no centro (o
 * three.js dequantiza sozinho) e descemos o modelo até esse ponto ficar em y=0.
 * (Colisão ainda é a procedural flat — terreno "de verdade" seguindo o relevo = próximo.)
 */
const URL = '/models/terrain/desert-plain.glb';

export function DesertPlain({ size = 210, x = 0, z = 0 }: { size?: number; x?: number; z?: number }) {
  const { scene } = useGLTF(URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    // Escala pela largura (XZ) pro tamanho do mapa.
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    const s = size / w;
    c.scale.setScalar(s);
    // Centra em XZ e assenta a base em 0 (provisório).
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    c.updateMatrixWorld(true);
    // Acha a superfície REAL no centro (0,0) por raycast de cima pra baixo e
    // desce o modelo até ela ficar no marco 0.
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, b2.max.y - b2.min.y + 50, 0),
      new THREE.Vector3(0, -1, 0),
    );
    const hits = ray.intersectObject(c, true);
    const surfaceY = hits.length > 0 ? hits[0]!.point.y : 0;
    c.position.y -= surfaceY;
    return c;
  }, [scene, size]);
  return (
    <group position={[x, terrainHeight(x, z), z]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(URL);
