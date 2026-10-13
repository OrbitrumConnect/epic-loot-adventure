import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

/**
 * Torre da base como GLB (watch tower remasterizada, textura PBR embutida) em vez
 * da torre procedural. 1 instância por célula `tower`, auto-escalada pra TOWER_H,
 * no chão e orientada pela rotação da peça. ADITIVO (a procedural é escondida em
 * player-base por `USE_GLB_TOWER`; a COLISÃO da peça continua valendo).
 */
const URL = '/models/watchtower/watchtower.glb';
const TOWER_H = 7.0; // um pouco maior que a torre procedural (~5,9 m)

export function GlbWatchTowers() {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const { scene } = useGLTF(URL);

  const proto = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    const box = new THREE.Box3().setFromObject(o);
    const h = box.max.y - box.min.y || 1;
    o.scale.setScalar(TOWER_H / h);
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const wrap = new THREE.Group();
    wrap.add(o);
    return wrap;
  }, [scene]);

  const towers = useMemo(() => (pieces ?? []).filter((p) => p.kind === 'tower'), [pieces]);
  if (towers.length === 0) return null;

  return (
    <>
      {towers.map((p) => {
        const ctr = cellCenter(p.cell);
        return (
          <primitive
            key={p.id}
            object={proto.clone()}
            position={[ctr.x, terrainHeight(ctr.x, ctr.z), ctr.z]}
            rotation={[0, (p.rotation * Math.PI) / 180, 0]}
          />
        );
      })}
    </>
  );
}

useGLTF.preload(URL);
