import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';

/**
 * Torre watchtower (GLB, PBR embutido) reutilizável:
 * - `GlbWatchTowers`: 1 por célula `tower` da base (esconde a procedural em
 *   player-base por `USE_GLB_TOWER`; a COLISÃO da peça continua).
 * - `WatchtowerModel`: 1 instância solta (usada tbm no acampamento inimigo).
 */
const URL = '/models/watchtower/watchtower.glb';
const BASE_TOWER_H = 5.3; // base (as 4 estavam "grandonas"); ajustável

/** Clona o GLB, escala pra `height`, centra em XZ e põe a base em y=0. */
function buildTower(scene: THREE.Object3D, height: number): THREE.Group {
  const o = scene.clone(true);
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  const box = new THREE.Box3().setFromObject(o);
  const h = box.max.y - box.min.y || 1;
  o.scale.setScalar(height / h);
  const b2 = new THREE.Box3().setFromObject(o);
  o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  const wrap = new THREE.Group();
  wrap.add(o);
  return wrap;
}

/** Uma torre solta, base em y=0 (quem posiciona é o pai). */
export function WatchtowerModel({ height = BASE_TOWER_H }: { height?: number }) {
  const { scene } = useGLTF(URL);
  const model = useMemo(() => buildTower(scene, height), [scene, height]);
  return <primitive object={model} />;
}

export function GlbWatchTowers() {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const { scene } = useGLTF(URL);
  const proto = useMemo(() => buildTower(scene, BASE_TOWER_H), [scene]);
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
