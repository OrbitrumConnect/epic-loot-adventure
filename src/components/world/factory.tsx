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
const TARGET_H = 7.7; // -30% (porta proporcional ao boneco)
/** Afunda 10 cm: o chão RETO do prédio fica logo abaixo do nosso → nossa terra
 *  cobre a emenda (o chão do GLB não casa 100% com o do jogo). */
const FACTORY_SINK = 0.1;

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

    // Esconde o CHÃO/lote de concreto do próprio GLB (laje larga, fina e baixa)
    // → aparece o chão do MAPA (dirt) por baixo = textura igual, sem emenda.
    o.updateMatrixWorld(true);
    const full = new THREE.Box3().setFromObject(o);
    const modelH = full.max.y - full.min.y || 1;
    const spanXZ = Math.max(full.max.x - full.min.x, full.max.z - full.min.z) || 1;
    const bb = new THREE.Box3();
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      bb.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      const flat = sy < 0.22 * Math.max(sx, sz);
      const low = bb.min.y < full.min.y + modelH * 0.14;
      const wide = Math.max(sx, sz) > 0.5 * spanXZ;
      if (flat && low && wide) mesh.visible = false; // laje de chão → esconde
    });

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
          position={[f.x, terrainHeight(f.x, f.z) - FACTORY_SINK, f.z]}
          rotation={[0, f.rot, 0]}
        />
      ))}
    </>
  );
}

useGLTF.preload(URL);
