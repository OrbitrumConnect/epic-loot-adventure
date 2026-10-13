import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

/**
 * Base como forte Kenney (Castle Kit, texturizado via colormap). 1 clone por peça
 * da `playerBase`: muro→wall, porta→gate, TORRE→base+mid+roof empilhados (torre
 * completa). wall.glb é 2×2 = BASE_GRID(2m) → escala 1. Reversível (USE_GLB_BASE).
 */
const U = {
  wall: '/models/castle/wall.glb',
  tbase: '/models/castle/tower-square-base.glb',
  tmid: '/models/castle/tower-square-mid.glb',
  troof: '/models/castle/tower-square-top-roof.glb',
  gate: '/models/castle/gate.glb',
} as const;

function groundOffset(s: THREE.Object3D) {
  return -new THREE.Box3().setFromObject(s).min.y;
}
function spanY(s: THREE.Object3D) {
  const b = new THREE.Box3().setFromObject(s);
  return b.max.y - b.min.y;
}

export function GlbBaseCastle({ scale = 1, yawOffset = 0 }: { scale?: number; yawOffset?: number }) {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const wall = useGLTF(U.wall);
  const tbase = useGLTF(U.tbase);
  const tmid = useGLTF(U.tmid);
  const troof = useGLTF(U.troof);
  const gate = useGLTF(U.gate);

  // Torre completa pré-montada (base+mid+roof), base no y=0.
  const towerProto = useMemo(() => {
    const g = new THREE.Group();
    let y = 0;
    for (const src of [tbase.scene, tmid.scene, troof.scene]) {
      const o = src.clone(true);
      o.position.y = y + groundOffset(o);
      g.add(o);
      y += spanY(o);
    }
    return g;
  }, [tbase.scene, tmid.scene, troof.scene]);

  const offWall = useMemo(() => groundOffset(wall.scene), [wall.scene]);
  const offGate = useMemo(() => groundOffset(gate.scene), [gate.scene]);

  const nodes = useMemo(() => {
    if (!pieces) return [];
    const out: THREE.Object3D[] = [];
    for (const p of pieces) {
      let obj: THREE.Object3D | null = null;
      let yoff = 0;
      if (p.kind === 'wall') {
        obj = wall.scene.clone(true);
        yoff = offWall;
      } else if (p.kind === 'door') {
        obj = gate.scene.clone(true);
        yoff = offGate;
      } else if (p.kind === 'tower') {
        obj = towerProto.clone(true);
        yoff = 0; // proto já tem a base em y=0
      }
      if (!obj) continue;
      obj.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      const ctr = cellCenter(p.cell);
      obj.position.set(ctr.x, terrainHeight(ctr.x, ctr.z) + yoff * scale, ctr.z);
      obj.rotation.set(0, (p.rotation * Math.PI) / 180 + yawOffset, 0);
      obj.scale.setScalar(scale);
      out.push(obj);
    }
    return out;
  }, [pieces, wall.scene, gate.scene, towerProto, offWall, offGate, scale, yawOffset]);

  return <>{nodes.map((o, i) => <primitive key={i} object={o} />)}</>;
}

useGLTF.preload(U.wall);
useGLTF.preload(U.tbase);
useGLTF.preload(U.tmid);
useGLTF.preload(U.troof);
useGLTF.preload(U.gate);
