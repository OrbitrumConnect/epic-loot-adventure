import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { terrainHeight } from './world-kit';

/**
 * Cristal da Essência Arcana como GLB (magic crystal, textura embutida). Visual
 * SÓ — `raycast` desligado, então o clique atravessa e acerta o nó procedural
 * atrás (mantém colheita/label intactos, sem regressão). O nó procedural fica
 * invisível (colorWrite off em harvest-nodes) enquanto `USE_GLB_CRYSTAL`.
 */
const URL = '/models/crystal/crystal.glb';
const TARGET_H = 1.5;

function noRaycast() {}

export function GlbCrystals() {
  const nodes = useGameStore((s) => s.harvestNodes);
  const { scene } = useGLTF(URL);

  const proto = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.raycast = noRaycast; }
    });
    const box = new THREE.Box3().setFromObject(o);
    const h = box.max.y - box.min.y || 1;
    o.scale.setScalar(TARGET_H / h);
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const wrap = new THREE.Group();
    wrap.add(o);
    return wrap;
  }, [scene]);

  const live = useMemo(
    () => nodes.filter((n) => n.kind === 'crystal' && !n.depleted),
    [nodes],
  );
  if (live.length === 0) return null;

  return (
    <>
      {live.map((n) => (
        <primitive
          key={n.id}
          object={proto.clone()}
          position={[n.position.x, terrainHeight(n.position.x, n.position.z), n.position.z]}
          rotation={[0, (n.seed % 360) * (Math.PI / 180), 0]}
        />
      ))}
    </>
  );
}

useGLTF.preload(URL);
