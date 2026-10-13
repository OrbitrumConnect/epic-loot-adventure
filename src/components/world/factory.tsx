import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { FACTORY_SITES, terrainHeight } from './world-kit';

/**
 * Complexo industrial desativado (prédio GLB, texturas embutidas) — ÁREA DE
 * ENERGIA no leste vazio, base pra futura raid (fiação/caixa de luz → ilumina a
 * base). O terreno é achatado num PAD sob cada site (world-kit) porque o prédio
 * tem CHÃO RETO. Colisão por círculo em STATIC_COLLIDERS. Aditivo, só cenário.
 */
const URL = '/models/factory/factory.glb';
const TARGET_H = 11;

export function Factory() {
  const { scene } = useGLTF(URL);
  const proto = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
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

  return (
    <>
      {FACTORY_SITES.map((f, i) => (
        <primitive
          key={i}
          object={proto.clone()}
          position={[f.x, terrainHeight(f.x, f.z), f.z]}
          rotation={[0, f.rot, 0]}
        />
      ))}
    </>
  );
}

useGLTF.preload(URL);
