import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { BASE_GRID, type BasePiece } from '@/game/types/playerbase';
import { terrainHeight } from './world-kit';
import { AssetBoundary } from './asset-boundary';
import { pieceGroundY } from './base-ground';
import { useTerrainVersion } from './terrain-collision';

/**
 * Muros da base em GLB (pedra / metal), que ENTRAM no lugar do muro procedural de
 * madeira quando a casa evolui (pedra no nível 10, metal acima do 20). O jogador
 * ergue os muros do mesmo jeito (botão "Erguer" → `constructNextWall`); só a SKIN
 * acompanha o tier da base — igual à casa central (`BaseHouse`).
 *
 * Uma `InstancedMesh` só (geometria + material do GLB, PBR embutido) desenha todos
 * os muros do perímetro — barato, no espírito de `BaseStructures`. Muros não têm
 * colisão no jogo (só a casa tem), então aqui é puramente visual + alvo da horda.
 */
const STONE_URL = '/models/base/stone-wall.glb';
const METAL_URL = '/models/base/metal-wall.glb';

const CAP = 64; // uma célula por quadrícula do claim (teto seguro)
const TARGET_W = BASE_GRID * 1.05; // preenche a célula (2 m) com leve sobra p/ não abrir fresta
const HEIGHT_MULT = 1.45;          // estica a altura p/ o muro ficar alto como o procedural

const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ';

/** Extrai geometria + material do GLB já normalizados: centro em XZ, base em y=0,
 *  largura = TARGET_W (altura esticada por HEIGHT_MULT). */
function prepareWall(scene: THREE.Object3D): { geo: THREE.BufferGeometry; mat: THREE.Material } | null {
  scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  scene.traverse((m) => { const n = m as THREE.Mesh; if (!mesh && n.isMesh) mesh = n; });
  if (!mesh) return null;
  const src = mesh as THREE.Mesh;
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld); // baka o transform do nó (flatten já deixa ~identidade)
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const w = bb.max.x - bb.min.x || 1;
  const s = TARGET_W / w;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); // centro XZ, base em 0
  geo.scale(s, s * HEIGHT_MULT, s);
  const material = (Array.isArray(src.material) ? src.material[0]! : src.material).clone();
  material.side = THREE.DoubleSide;
  return { geo, mat: material };
}

function WallInstances({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const prep = useMemo(() => prepareWall(scene), [scene]);
  const mesh = useMemo(() => {
    if (!prep) return null;
    const im = new THREE.InstancedMesh(prep.geo, prep.mat, CAP);
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    return im;
  }, [prep]);

  useEffect(() => () => {
    mesh?.dispose();
    prep?.geo.dispose();
    prep?.mat.dispose();
  }, [mesh, prep]);

  const last = useRef<BasePiece[] | null | undefined>(undefined);
  const tv = useTerrainVersion();
  const lastTv = useRef(-1);
  useFrame(() => {
    if (!mesh) return;
    const pieces = useGameStore.getState().playerBase?.pieces ?? null;
    if (pieces === last.current && tv === lastTv.current) return;
    last.current = pieces;
    lastTv.current = tv;
    let n = 0;
    if (pieces) {
      for (const p of pieces) {
        if (p.kind !== 'wall' || n >= CAP) continue;
        const ctr = cellCenter(p.cell);
        dummy.position.set(ctr.x, pieceGroundY(ctr.x, ctr.z), ctr.z);
        dummy.rotation.set(0, (p.rotation * Math.PI) / 180, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  });

  if (!mesh) return null;
  return <primitive object={mesh} />;
}

/** Muros GLB da base LOCAL: só montam quando a casa já evoluiu (pedra/metal). */
export function GlbBaseWalls() {
  const evolved = useGameStore((s) => s.baseEvolved ?? false);
  const metal = useGameStore((s) => s.baseMetal ?? false);
  if (!evolved && !metal) return null;
  return (
    <AssetBoundary label="GlbBaseWalls" fallback={null}>
      <Suspense fallback={null}>
        <WallInstances url={metal ? METAL_URL : STONE_URL} />
      </Suspense>
    </AssetBoundary>
  );
}
