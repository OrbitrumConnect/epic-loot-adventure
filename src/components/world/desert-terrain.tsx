import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';

/**
 * Terreno do deserto (modelos Meshy decimados) — planície (chão novo) + montanhas
 * rochosas climáveis. 1ª passada VISUAL (colisão de malha com caverna = fase
 * seguinte via three-mesh-bvh; hoje a colisão segue a procedural `terrainHeight`).
 */
const PLAIN_URL = '/models/terrain/desert-plain.glb';
const MOUNTAIN_URL = '/models/terrain/mountain.glb';

/** Deixa o material FOSCO (reflete pouco como a planície original — sem glare do sol). */
function makeMatte(c: THREE.Object3D) {
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const pm = mat as THREE.MeshStandardMaterial;
      if (pm && 'roughness' in pm) {
        pm.roughness = 1;
        pm.metalness = 0;
        pm.envMapIntensity = 0;
        pm.needsUpdate = true;
      }
    }
  });
}

export function DesertPlain({ size = 196, x = 0, z = 0, rotY = (3 * Math.PI) / 4 + (37 * Math.PI) / 180 }: { size?: number; x?: number; z?: number; rotY?: number }) {
  const { scene } = useGLTF(PLAIN_URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    makeMatte(c);
    // Escala pela largura (XZ) pro tamanho do mapa.
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
    // Centra em XZ e assenta a base em 0 (provisório).
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    c.updateMatrixWorld(true);
    // A planície tem relevo: raycast pra baixo no centro acha a superfície real e
    // desce o modelo até ela ficar no marco 0 (senão o chão caminhável fica no alto).
    const ray = new THREE.Raycaster(new THREE.Vector3(0, b2.max.y - b2.min.y + 50, 0), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(c, true);
    c.position.y -= hits.length > 0 ? hits[0]!.point.y : 0;
    return c;
  }, [scene, size]);
  return (
    <group position={[x, terrainHeight(x, z), z]} rotation={[0, rotY, 0]}>
      <primitive object={model} />
    </group>
  );
}

/**
 * Montanha rochosa (Desert_rocky_mountain) — assenta a BASE no chão e sobe. 1ª
 * passada VISUAL pra travar posição; colisão climável/caverna entra depois.
 */
export function DesertMountain({ size = 70, x = 0, z = 0, rotY = 0 }: { size?: number; x?: number; z?: number; rotY?: number }) {
  const { scene } = useGLTF(MOUNTAIN_URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    makeMatte(c);
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
    // Centra em XZ e assenta a BASE no 0 (fica em cima do chão, sobe daí).
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    return c;
  }, [scene, size]);
  return (
    <group position={[x, terrainHeight(x, z), z]} rotation={[0, rotY, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(PLAIN_URL);
useGLTF.preload(MOUNTAIN_URL);
