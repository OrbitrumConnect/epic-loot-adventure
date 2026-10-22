import { TransformControls, useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';
import { glbSurfaceY, useTerrainVersion } from './terrain-collision';
import { useEditorStore } from '../editor/editor-store';
import { modelUrl } from '@/game/asset-path';

/**
 * Árvore-marco GIGANTE (modelo Meshy detalhado, decimado 3,6M→108k triângulos).
 * Poucas no mapa (1-2) como landmark "bolado". Não é a fauna/floresta normal.
 * O modelo tem o pé ~0,97 abaixo da origem (raízes) → planta pela base.
 */
const GNARLED = modelUrl('trees/tree-gnarled.glb');
const BASE_BELOW = 0.89; // minY do modelo → finca no chão (-~0.5 do que era; raiz tava alta)

export function LandmarkTree({ x, z, scale = 5.5, yaw = 0, url = GNARLED, editorId }: { x: number; z: number; scale?: number; yaw?: number; url?: string; editorId?: string }) {
  const { scene } = useGLTF(url);
  const tree = useMemo(() => {
    const c = scene.clone();
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  const pivot = useMemo(() => { const box = new THREE.Box3().setFromObject(tree); const center = box.getCenter(new THREE.Vector3()); return { center, minY: box.min.y }; }, [tree]);
  const edited = useEditorStore(s => editorId ? s.objects.find(o => o.id === editorId) : undefined);
  const tx = edited?.transform.position[0] ?? x; const ty = edited?.transform.position[1] ?? 0; const tz = edited?.transform.position[2] ?? z;
  const rs = edited?.transform.scale[0] ?? scale; const ry = edited?.transform.rotation[1] ?? yaw;
  // Assenta na superfície do GLB de terreno (recomputa quando o GLB carrega); fora
  // do GLB cai no terrainHeight procedural.
  const tv = useTerrainVersion();
  const y = useMemo(() => glbSurfaceY(tx, tz, terrainHeight(tx, tz)), [tx, tz, tv]);
  const active = useEditorStore(s => s.active); const selected = useEditorStore(s => s.selectedId === editorId); const select = useEditorStore(s => s.select); const tool = useEditorStore(s => s.tool); const update = useEditorStore(s => s.update);
  // The catalog transform represents the asset origin/base. Keep the model's
  // bounding-box pivot offset inside the wrapper so the gizmo stays on the
  // actual tree while preserving the authored world position.
  const group = <group position={[tx + pivot.center.x * rs, y + BASE_BELOW * rs + pivot.center.y * rs + ty, tz + pivot.center.z * rs]} rotation={[0, ry, 0]} scale={rs} onPointerDown={e => { if (!active || !editorId) return; e.stopPropagation(); select(editorId); }}>
      <group position={[-pivot.center.x, -pivot.center.y, -pivot.center.z]}><primitive object={tree} /></group>
    </group>;
  if (!active || !selected || !editorId) return group;
  return <TransformControls mode={tool} onMouseUp={e => { const o = (e?.target as unknown as { object?: THREE.Object3D } | undefined)?.object; if (!o) return; update(editorId, { position: [o.position.x - pivot.center.x * o.scale.x, o.position.y - BASE_BELOW * o.scale.x - pivot.center.y * o.scale.x - glbSurfaceY(o.position.x, o.position.z, terrainHeight(o.position.x, o.position.z)), o.position.z - pivot.center.z * o.scale.x], rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: [o.scale.x, o.scale.y, o.scale.z] }); }}>{group}</TransformControls>;
}

// Preload sob demanda: as árvores carregam via useGLTF na montagem (Suspense + AssetBoundary).
