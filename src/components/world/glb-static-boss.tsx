import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroAction } from './glb-hero';

/** Bounding box a partir das GEOMETRIAS (estável; independe de pose/timing). */
function measureGeo(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3(); const tmp = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) { tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); box.union(tmp); }
    }
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return box;
}

/**
 * BOSS de modelo SEM esqueleto (kaiju, samurai…): não anima por osso, então o
 * movimento é PROCEDURAL — o modelo inteiro balança (idle), gingado (walk) e dá
 * uma investida pra frente (attack). Dirigido por `actionRef` (igual o glb-hero),
 * sem re-render. Mesma medição por geometria + textura via parser do glb-creature.
 */
export function GlbStaticBoss({
  url, actionRef, height = 3, yaw = Math.PI, tint, groundBias = 0,
}: {
  url: string;
  actionRef: React.MutableRefObject<HeroAction>;
  height?: number;
  yaw?: number;
  tint?: string | undefined;
  groundBias?: number;
}) {
  const inner = useRef<THREE.Group>(null);
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group; parser: { json: { textures?: unknown[]; materials?: { name?: string }[] }; getDependency: (t: string, i: number) => Promise<unknown> } };
  const { scene } = gltf;
  const cloned = useMemo(() => skeletonClone(scene), [scene]);

  // Liga baseColor embutida (modelos "demo" não ligam → ficam brancos).
  useEffect(() => {
    const texCount = gltf.parser.json.textures?.length ?? 0;
    if (texCount === 0) return;
    const jsonMats = gltf.parser.json.materials ?? [];
    let alive = true;
    const meshes: THREE.Mesh[] = [];
    cloned.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    (async () => {
      for (const mesh of meshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mm of mats) {
          const sm = mm as THREE.MeshStandardMaterial;
          if (!sm || sm.map) continue;
          const mi = jsonMats.findIndex((m) => m.name === sm.name);
          const ti = Math.max(0, Math.min(texCount - 1, mi < 0 ? 0 : mi));
          try {
            const tex = (await gltf.parser.getDependency('texture', ti)) as THREE.Texture;
            if (!alive) return;
            tex.colorSpace = THREE.SRGBColorSpace;
            sm.map = tex; sm.color.set('#ffffff'); sm.metalness = 0; sm.roughness = 0.85; sm.needsUpdate = true;
          } catch { /* fica o tint */ }
        }
      }
    })();
    return () => { alive = false; };
  }, [gltf, cloned]);

  // Escala pra `height`, centra em XZ e planta os pés em y=0.
  const model = useMemo(() => {
    cloned.updateMatrixWorld(true);
    const box = measureGeo(cloned);
    const h = box.max.y - box.min.y || 1;
    cloned.scale.setScalar(height / h);
    cloned.updateMatrixWorld(true);
    const b2 = measureGeo(cloned);
    cloned.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        if (m.geometry && !m.geometry.userData['_inflated']) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= 1.8;
          m.geometry.userData['_inflated'] = true;
        }
        if (tint) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) { const sm = mm as THREE.MeshStandardMaterial; if (sm && sm.color) { sm.color.set(tint); sm.metalness = 0; sm.roughness = 0.9; } }
        }
      }
    });
    return cloned;
  }, [cloned, height, tint]);

  const phase = useRef(0);
  const lunge = useRef(0);
  useFrame((_s, dt) => {
    const g = inner.current;
    if (!g) return;
    const act = actionRef.current;
    phase.current += dt * (act === 'walk' ? 7 : 2.2);
    // attack = investida: sobe rápido, volta devagar
    lunge.current = act === 'attack'
      ? Math.min(1, lunge.current + dt * 6)
      : Math.max(0, lunge.current - dt * 3.5);
    const L = Math.sin(lunge.current * Math.PI); // 0→1→0 durante o golpe
    const bob = act === 'walk' ? Math.abs(Math.sin(phase.current)) * 0.18 : Math.sin(phase.current) * 0.05;
    g.position.y = groundBias + bob - L * 0.12;
    g.position.z = L * 0.7;              // avança no golpe
    g.rotation.x = -L * 0.22;            // inclina pra frente no golpe
    g.rotation.z = act === 'walk' ? Math.sin(phase.current) * 0.04 : 0; // gingado
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} position={[0, groundBias, 0]}>
      <primitive object={model} />
    </group>
  );
}
