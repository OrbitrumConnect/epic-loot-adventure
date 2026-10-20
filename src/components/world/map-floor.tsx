import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { registerTerrain } from './terrain-collision';

/**
 * Chão principal do mapa: GLB rio-wasteland FIXO no código (determinístico, vai pro
 * online/mobile — ao contrário da colocação pelo Editor, que fica só no localStorage).
 * Mesma normalização do PlacedObject do editor (span→4 + pivô) e o transform que o
 * Pedro ajustou. De-shine (matte, mantém cor) + colisão (registerTerrain/BVH): o
 * player pisa em cima, e os props (árvore/pedra/camp/fábrica) assentam via glbSurfaceY.
 */
const URL = '/models/map/rio-wasteland-iconic.glb';
const POS: [number, number, number] = [2.2, 9.6, 22.5];
const YAW = -1.3;
const SCALE: [number, number, number] = [80.3, 78.3, 71.2];

/** Tira brilho mantendo cor (mesmo princípio do makeMatte/editor). */
function matte(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const pm = mat as THREE.MeshStandardMaterial;
      if (!pm || !('roughness' in pm)) continue;
      pm.metalnessMap = null; pm.metalness = 0;
      pm.roughnessMap = null; pm.roughness = 1;
      pm.envMapIntensity = 0;
      pm.needsUpdate = true;
    }
  });
}

export function MapFloor() {
  const { scene } = useGLTF(URL);
  const ref = useRef<THREE.Group>(null);
  const { model, pivot } = useMemo(() => {
    const clone = scene.clone(true);
    matte(clone);
    const box = new THREE.Box3().setFromObject(clone);
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
    clone.scale.setScalar(4 / span);
    clone.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(clone);
    return { model: clone, pivot: b2.getCenter(new THREE.Vector3()) };
  }, [scene]);
  useEffect(() => {
    if (!ref.current) return;
    return registerTerrain(ref.current);
  }, [model]);
  const [px, py, pz] = POS;
  const [sx, sy, sz] = SCALE;
  return (
    <group ref={ref} position={[px + pivot.x * sx, py + pivot.y * sy, pz + pivot.z * sz]} rotation={[0, YAW, 0]} scale={SCALE}>
      <group position={[-pivot.x, -pivot.y, -pivot.z]}><primitive object={model} /></group>
    </group>
  );
}

useGLTF.preload(URL);
