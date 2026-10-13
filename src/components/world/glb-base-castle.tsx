import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

/**
 * Base como forte Kenney (Castle Kit, texturizado via colormap). 1 peça por célula:
 * muro→wall, porta→gate, TORRE→base+mid+roof empilhados. Cada peça é CENTRALIZADA
 * em XZ (origem no centro) antes de rotacionar — gira no próprio eixo e encaixa na
 * vizinha (sem buracos). wall ~2×2 = BASE_GRID(2m). Reversível (USE_GLB_BASE).
 */
const U = {
  wall: '/models/castle/wall.glb',
  tbase: '/models/castle/tower-square-base.glb',
  tmid: '/models/castle/tower-square-mid.glb',
  troof: '/models/castle/tower-square-top-roof.glb',
  gate: '/models/castle/gate.glb',
} as const;

const WALL_H = 2.6; // muros/portão mais altos
const WALL_W = 1.5; // alarga pra encostar na vizinha (muro era mais estreito que o grid)
const TOWER_H = 1.5;

export function GlbBaseCastle({ scale = 1, yawOffset = Math.PI / 2 }: { scale?: number; yawOffset?: number }) {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const wall = useGLTF(U.wall);
  const tbase = useGLTF(U.tbase);
  const tmid = useGLTF(U.tmid);
  const troof = useGLTF(U.troof);
  const gate = useGLTF(U.gate);

  // Torre completa (base+mid+roof), base no y=0.
  const towerProto = useMemo(() => {
    const g = new THREE.Group();
    let y = 0;
    for (const src of [tbase.scene, tmid.scene, troof.scene]) {
      const o = src.clone(true);
      const b = new THREE.Box3().setFromObject(o);
      o.position.y = y - b.min.y;
      g.add(o);
      y += b.max.y - b.min.y;
    }
    return g;
  }, [tbase.scene, tmid.scene, troof.scene]);

  const nodes = useMemo(() => {
    if (!pieces) return [];
    // Clona a peça, centraliza XZ na origem e põe a base em y=0 → gira/escala no eixo.
    const make = (src: THREE.Object3D, sxz: number, sy: number) => {
      const o = src.clone(true);
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      const b = new THREE.Box3().setFromObject(o);
      o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      const wrap = new THREE.Group();
      wrap.add(o);
      wrap.scale.set(sxz, sy, sxz);
      return wrap;
    };
    const out: THREE.Object3D[] = [];
    for (const p of pieces) {
      let w: THREE.Object3D | null = null;
      if (p.kind === 'wall') w = make(wall.scene, scale * WALL_W, scale * WALL_H);
      else if (p.kind === 'door') w = make(gate.scene, scale * WALL_W, scale * WALL_H);
      else if (p.kind === 'tower') w = make(towerProto, scale * 1.1, scale * TOWER_H);
      if (!w) continue;
      const ctr = cellCenter(p.cell);
      w.position.set(ctr.x, terrainHeight(ctr.x, ctr.z), ctr.z);
      w.rotation.y = (p.rotation * Math.PI) / 180 + yawOffset;
      out.push(w);
    }
    return out;
  }, [pieces, wall.scene, gate.scene, towerProto, scale, yawOffset]);

  return <>{nodes.map((o, i) => <primitive key={i} object={o} />)}</>;
}

useGLTF.preload(U.wall);
useGLTF.preload(U.tbase);
useGLTF.preload(U.tmid);
useGLTF.preload(U.troof);
useGLTF.preload(U.gate);
