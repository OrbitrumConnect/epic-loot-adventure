import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { MAP_HALF, rand, terrainHeight, riverDistance, RIVER_HALF_WIDTH, SNOW_MOUNTAIN, LAKE_CENTERS } from './world-kit';
import { FOREST_ZONES } from '@/game/systems/harvestSystem';
import { CAMP_PLACEMENTS, CAMPS } from '@/game/data/camps';

/**
 * Containers industriais 3D espalhados (pós-colapso) — substituem o billboard
 * `debris` chapado que girava. Poucos, estáticos, clonados do mesmo GLB (1 mesh).
 * NÃO caem em cima de floresta (árvores), de acampamento (torre) nem na montanha
 * — fica em terreno aberto. Metade ganha um tint de outra cor (variedade).
 */
const URL = '/models/props/container.glb';
const COUNT = 0;                // Pedro 20/10: containers REMOVIDOS (era 8) p/ o mapa novo. Religar = subir o número.
const TARGET_H = 3.0;            // +15% (era 2.6)
const ALT_TINT = '#5a7d9a';     // 2ª cor (azul-aço) p/ metade dos containers

/** Posição aberta: fora do spawn, rio, lago, floresta, camps e montanha. */
function openSpot(i: number): { x: number; z: number } | null {
  for (let t = 0; t < 12; t++) {
    const seed = i * 131 + t * 17;
    const x = (rand(seed + 9101) - 0.5) * MAP_HALF * 1.7;
    const z = (rand(seed + 9201) - 0.5) * MAP_HALF * 1.7;
    if (Math.hypot(x, z) < 16) continue;                           // nascedouro
    if (riverDistance(x, z) < RIVER_HALF_WIDTH + 3) continue;      // rio
    if (LAKE_CENTERS.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + 3)) continue; // lago
    if (FOREST_ZONES.some((f) => Math.hypot(x - f.x, z - f.z) < f.spread * 0.9 + 6)) continue; // árvores
    if (CAMP_PLACEMENTS.some((p) => Math.hypot(x - p.position.x, z - p.position.z) < (CAMPS[p.defId]?.radius ?? 8) + 5)) continue; // torre do camp
    if (Math.hypot(x - SNOW_MOUNTAIN.x, z - SNOW_MOUNTAIN.z) < SNOW_MOUNTAIN.r * 0.8) continue; // montanha
    return { x, z };
  }
  return null;
}

export function GlbContainers() {
  const { scene } = useGLTF(URL);

  const items = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y || 1;
    const s = TARGET_H / h;

    const out: { key: number; x: number; z: number; y: number; yaw: number; s: number; obj: THREE.Object3D }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const spot = openSpot(i);
      if (!spot) continue;
      const obj = scene.clone(true);
      if (i % 2 === 1) {
        // metade: tint de outra cor (variedade), sem trocar de asset (o 2º é 91MB).
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          m.material = mats.map((mm) => { const c = (mm as THREE.Material).clone() as THREE.MeshStandardMaterial; if (c.color) c.color.multiplyScalar(0.7).lerp(new THREE.Color(ALT_TINT), 0.5); return c; });
        });
      }
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const b2 = new THREE.Box3().setFromObject(obj);
      out.push({ key: i, x: spot.x, z: spot.z, y: terrainHeight(spot.x, spot.z) - b2.min.y * s, yaw: rand(i + 9301) * Math.PI * 2, s, obj });
    }
    return out;
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
