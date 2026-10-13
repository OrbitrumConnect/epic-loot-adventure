import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

/**
 * Base como FORTE medieval (Kenney Castle Kit). Renderiza um GLB por peça da
 * `playerBase` (muro→wall, torre→tower, porta→gate) no centro da célula, no
 * chão. O wall.glb é 2×2 = BASE_GRID → escala 1 encaixa. Reversível via flag no
 * player-base. Conectada ao mesmo estado (base↔Clash).
 */
const URLS = {
  wall: '/models/castle/wall.glb',
  tower: '/models/castle/tower-square-base.glb',
  door: '/models/castle/gate.glb',
} as const;

export function GlbBaseCastle({ scale = 1, yawOffset = 0 }: { scale?: number; yawOffset?: number }) {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const wall = useGLTF(URLS.wall);
  const tower = useGLTF(URLS.tower);
  const gate = useGLTF(URLS.door);

  // Offset vertical por tipo: levanta a peça pra base encostar no terreno.
  const off = useMemo(() => {
    const g = (s: THREE.Object3D) => -new THREE.Box3().setFromObject(s).min.y;
    return { wall: g(wall.scene), tower: g(tower.scene), door: g(gate.scene) };
  }, [wall.scene, tower.scene, gate.scene]);

  const nodes = useMemo(() => {
    if (!pieces) return [];
    const srcFor = (kind: string): THREE.Object3D | null =>
      kind === 'wall' ? wall.scene : kind === 'tower' ? tower.scene : kind === 'door' ? gate.scene : null;
    const out: THREE.Object3D[] = [];
    for (const p of pieces) {
      const src = srcFor(p.kind);
      if (!src) continue;
      const obj = src.clone(true);
      obj.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      const ctr = cellCenter(p.cell);
      const yoff = (off as Record<string, number>)[p.kind] ?? 0;
      obj.position.set(ctr.x, terrainHeight(ctr.x, ctr.z) + yoff * scale, ctr.z);
      obj.rotation.set(0, (p.rotation * Math.PI) / 180 + yawOffset, 0);
      obj.scale.setScalar(scale);
      out.push(obj);
    }
    return out;
  }, [pieces, wall.scene, tower.scene, gate.scene, off, scale, yawOffset]);

  return <>{nodes.map((o, i) => <primitive key={i} object={o} />)}</>;
}

useGLTF.preload(URLS.wall);
useGLTF.preload(URLS.tower);
useGLTF.preload(URLS.door);
