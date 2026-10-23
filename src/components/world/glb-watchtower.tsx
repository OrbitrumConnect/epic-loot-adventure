import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { palette, terrainHeight } from './world-kit';
import { resolveTowerLevel, towerHeight } from '@/game/systems/towerLevelSystem';
import type { BasePiece } from '@/game/types/playerbase';
import { pieceGroundY } from './base-ground';
import { useTerrainVersion } from './terrain-collision';

/**
 * Torre watchtower (GLB, PBR embutido) reutilizável:
 * - `GlbWatchTowers`: 1 por célula `tower` da base (esconde a procedural em
 *   player-base por `USE_GLB_TOWER`; a COLISÃO da peça continua).
 * - `WatchtowerModel`: 1 instância solta (usada tbm no acampamento inimigo).
 */
const WATCH_URL = '/models/watchtower/watchtower.glb';        // acampamentos + topo da montanha
const LOUD_URL = '/models/watchtower/loudspeaker_tower.glb';  // 4 pontas da base (alarme/defesa que atira)
const ORNAMENT_URLS = [
  '/models/castle/tower-square-base.glb',
  '/models/castle/tower-square-mid.glb',
  '/models/castle/tower-square-top-roof.glb',
];

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

/** Atalaia solta (watchtower) — acampamentos/montanha. Base em y=0 (o pai posiciona). */
export function WatchtowerModel({ height = 5.3 }: { height?: number }) {
  const { scene } = useGLTF(WATCH_URL);
  const model = useMemo(() => buildTower(scene, height), [scene, height]);
  return <primitive object={model} />;
}

/** Uma instância estável por peça: dano/recarga não recriam GLBs nem materiais. */
function LeveledTower({ piece, onClick }: { piece: BasePiece; onClick?: ((pieceId: string, e: ThreeEvent<PointerEvent>) => void) | undefined }) {
  useTerrainVersion(); // re-assenta quando o chão GLB do mapa termina de carregar
  const { scene } = useGLTF(LOUD_URL);
  const ornaments = useGLTF(ORNAMENT_URLS);
  const baseScene = ornaments[0]!.scene;
  const midScene = ornaments[1]!.scene;
  const roofScene = ornaments[2]!.scene;
  const level = resolveTowerLevel(piece.tier, piece.level);
  const height = towerHeight(piece.tier, level);
  const { model, materials } = useMemo(() => {
    const colors = palette();
    const tint = level < 8 ? colors.trunk : level < 15 ? colors['rock-light'] : colors.metal;
    const owned: THREE.Material[] = [];
    const paint = (object: THREE.Object3D, color: string, metalness: number) => {
      const clones = new Map<THREE.Material, THREE.Material>();
      object.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const clone = (source: THREE.Material) => {
          if (clones.has(source)) return clones.get(source)!;
          const material = source.clone();
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.set(color);
            material.metalness = metalness;
            material.roughness = metalness > 0 ? 0.4 : 0.85;
          }
          clones.set(source, material);
          owned.push(material);
          return material;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      });
    };
    const model = buildTower(scene, height);
    paint(model, tint, level >= 15 ? 0.65 : 0);
    const adorn = (source: THREE.Object3D, width: number, tall: number, y: number, color = tint, x = 0) => {
      const part = buildTower(source, 1);
      const size = new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3());
      part.scale.set(width / (size.x || 1), tall, width / (size.z || 1));
      part.position.set(x, y, 0);
      paint(part, color, level >= 15 ? 0.65 : 0);
      model.add(part);
    };
    // Quatro marcos cumulativos: pedestal, plataforma, cobertura e coroas douradas.
    if (level >= 5) adorn(baseScene, 2.8, 0.8, 0);
    if (level >= 10) adorn(midScene, 2.5, 0.65, height * 0.45);
    if (level >= 15) adorn(roofScene, 2.8, 0.9, height * 0.72);
    if (level >= 20) {
      adorn(roofScene, 0.7, 0.65, height - 0.3, colors.gold, -0.85);
      adorn(roofScene, 0.7, 0.65, height - 0.3, colors.gold, 0.85);
    }
    return { model, materials: owned };
  }, [scene, baseScene, midScene, roofScene, level, height]);
  useEffect(() => () => { materials.forEach(material => material.dispose()); }, [materials]);
  const ctr = cellCenter(piece.cell);
  return <primitive object={model} dispose={null}
    position={[ctr.x, pieceGroundY(ctr.x, ctr.z), ctr.z]}
    rotation={[0, (piece.rotation * Math.PI) / 180, 0]}
    {...(onClick ? { onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      // Mouse travado (3ª pessoa): o clique é da mira central, não do cursor parado.
      if (typeof document !== 'undefined' && document.pointerLockElement) return;
      e.stopPropagation();
      onClick(piece.id, e);
    } } : {})} />;
}

/** Torres das 4 pontas da BASE = loudspeaker (torre de alarme/defesa que atira).
 *  `onPieceClick` só na base REMOTA (atacar torre inimiga no PvP); a local segue sem clique. */
export function GlbWatchTowers({ pieces: remotePieces, onPieceClick }: {
  pieces?: BasePiece[]; onPieceClick?: (pieceId: string, e: ThreeEvent<PointerEvent>) => void;
} = {}) {
  const localPieces = useGameStore((s) => s.playerBase?.pieces);
  const pieces = remotePieces ?? localPieces;
  const towers = useMemo(() => (pieces ?? []).filter((p) => p.kind === 'tower'), [pieces]);
  if (towers.length === 0) return null;
  return (
    <>
      {towers.map(p => <LeveledTower key={p.id} piece={p} onClick={onPieceClick} />)}
    </>
  );
}

// Preload sob demanda: watchtower/loudspeaker/ornamentos carregam via useGLTF na montagem
// (Suspense + AssetBoundary). Sem preload de import p/ não baixar no boot fora de cena.
