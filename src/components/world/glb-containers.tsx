import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_HALF, rand, terrainHeight, riverDistance, RIVER_HALF_WIDTH } from './world-kit';

/**
 * Containers industriais 3D espalhados (pós-colapso) — substituem o billboard
 * `debris` chapado que girava. Poucos (landmarks), estáticos, cada um clonado do
 * mesmo GLB (1 mesh → barato de desenhar). Longe do nascedouro e do rio.
 */
const URL = '/models/props/container.glb';
const COUNT = 8;
const TARGET_H = 2.6; // altura ~container real

export function GlbContainers() {
  const { scene } = useGLTF(URL);

  const items = useMemo(() => {
    // escala pra TARGET_H a partir do modelo base (1 vez)
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y || 1;
    const s = TARGET_H / h;

    const out: { key: number; x: number; z: number; y: number; yaw: number; obj: THREE.Object3D }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const x = (rand(i + 9101) - 0.5) * MAP_HALF * 1.7;
      const z = (rand(i + 9201) - 0.5) * MAP_HALF * 1.7;
      if (Math.hypot(x, z) < 16) continue;            // longe do nascedouro
      if (riverDistance(x, z) < RIVER_HALF_WIDTH + 3) continue; // fora do rio
      const obj = scene.clone(true);
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      // base no chão
      const b2 = new THREE.Box3().setFromObject(obj);
      out.push({ key: i, x, z, y: terrainHeight(x, z) - b2.min.y * s, yaw: rand(i + 9301) * Math.PI * 2, obj });
      void s;
    }
    // aplica a escala no grupo (abaixo)
    return out.map((it) => ({ ...it, s }));
  }, [scene]);

  return (
    <group>
      {items.map((it) => (
        <group key={it.key} position={[it.x, it.y, it.z]} rotation={[0, it.yaw, 0]} scale={it.s}>
          <primitive object={it.obj} />
        </group>
      ))}
    </group>
  );
}

useGLTF.preload(URL);
