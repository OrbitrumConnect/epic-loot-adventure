import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';
import { registerTerrain } from './terrain-collision';

/**
 * Terreno do deserto (modelos Meshy decimados) — planície (chão novo) + montanhas
 * rochosas climáveis. O jogador ANDA/SOBE na malha real (ver terrain-collision.ts:
 * cada terreno aqui se registra pra colisão por raycast/BVH). Acampamento, casa e
 * fábrica têm colisão PRÓPRIA e não são afetados (a malha só ergue o piso).
 */
const PLAIN_URL = '/models/terrain/desert-plain.glb';
const MOUNTAIN_URL = '/models/terrain/mountain.glb';
const MOUNTAIN_CAVE_URL = '/models/terrain/mountain-cave.glb';

/** Deixa o material FOSCO (reflete pouco como a planície original — sem glare do sol). */
function makeMatte(c: THREE.Object3D, shadow: 'receive' | 'cast') {
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (shadow === 'receive') m.receiveShadow = true; else m.castShadow = true;
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

/** Registra o grupo do terreno p/ colisão de malha ao montar (BVH). */
function useTerrainCollision(ref: React.RefObject<THREE.Group | null>) {
  useEffect(() => {
    if (!ref.current) return;
    return registerTerrain(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function DesertPlain({ size = 196, x = 0, z = 0, rotY = (3 * Math.PI) / 4 + (37 * Math.PI) / 180 }: { size?: number; x?: number; z?: number; rotY?: number }) {
  const { scene } = useGLTF(PLAIN_URL);
  const ref = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const c = scene.clone(true);
    makeMatte(c, 'receive');
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
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
  useTerrainCollision(ref);
  return (
    <group ref={ref} position={[x, terrainHeight(x, z), z]} rotation={[0, rotY, 0]}>
      <primitive object={model} />
    </group>
  );
}

/**
 * Montanha rochosa — assenta a BASE no chão e sobe; climável (registra colisão).
 * `url` troca o modelo (rocha simples ou a montanha-caverna com passarela).
 */
export function DesertMountain({ size = 70, x = 0, z = 0, rotY = 0, url = MOUNTAIN_URL }: { size?: number; x?: number; z?: number; rotY?: number; url?: string }) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const c = scene.clone(true);
    makeMatte(c, 'cast');
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    return c;
  }, [scene, size]);
  useTerrainCollision(ref);
  return (
    <group ref={ref} position={[x, terrainHeight(x, z), z]} rotation={[0, rotY, 0]}>
      <primitive object={model} />
    </group>
  );
}

export const MOUNTAIN_CAVE = MOUNTAIN_CAVE_URL;

useGLTF.preload(PLAIN_URL);
useGLTF.preload(MOUNTAIN_URL);
useGLTF.preload(MOUNTAIN_CAVE_URL);
