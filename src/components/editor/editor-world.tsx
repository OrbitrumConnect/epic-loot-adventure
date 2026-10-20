import { TransformControls, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useEditorStore, type EditorObject, type Transform } from './editor-store';

/** De-shine dos assets de mapa do Meshy (mesmo princípio do makeMatte do terreno):
 *  nulifica os mapas metal/rough e trava fosco, SEM tint (mantém a cor original).
 *  Aplicado só a `/models/map/` → trees/mountains/watchtower ficam intactos. */
function matte(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const pm = mat as THREE.MeshStandardMaterial;
      if (!pm || !('roughness' in pm)) continue;
      pm.metalnessMap = null; pm.metalness = 0;
      pm.roughnessMap = null; pm.roughness = 1;
      pm.envMapIntensity = 0;
      pm.needsUpdate = true;
    }
  });
}

function PlacedObject({ item }: { item: EditorObject }) {
  const { scene } = useGLTF(item.assetUrl);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    if (item.assetUrl.includes('/models/map/')) matte(clone);
    const box = new THREE.Box3().setFromObject(clone);
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
    const target = item.assetUrl.includes('/terrain/mountain') ? 12 : 4;
    clone.scale.setScalar(target / span);
    clone.updateMatrixWorld(true);
    return clone;
  }, [scene, item.assetUrl]);
  const pivot = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    return box.getCenter(new THREE.Vector3());
  }, [model]);
  const ref = useRef<THREE.Group>(null);
  const active = useEditorStore(s => s.active); const selected = useEditorStore(s => s.selectedId === item.id);
  const tool = useEditorStore(s => s.tool); const select = useEditorStore(s => s.select); const update = useEditorStore(s => s.update);
  const before = useRef<Transform | null>(null);
  const pick = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); select(item.id); };
  const [px, py, pz] = item.transform.position;
  const [sx, sy, sz] = item.transform.scale;
  const group = <group ref={ref} visible={item.visible} position={[px + pivot.x * sx, py + pivot.y * sy, pz + pivot.z * sz]} rotation={item.transform.rotation} scale={item.transform.scale} onPointerDown={pick}><group position={[-pivot.x, -pivot.y, -pivot.z]}><primitive object={model} /></group></group>;
  if (!active || !selected) return group;
  const sync = () => { const o = ref.current; if (!o) return; const next: Transform = { position: [o.position.x - pivot.x * o.scale.x, o.position.y - pivot.y * o.scale.y, o.position.z - pivot.z * o.scale.z], rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: [o.scale.x, o.scale.y, o.scale.z] }; const current = useEditorStore.getState().objects.find(x => x.id === item.id)?.transform; if (current && JSON.stringify(current) === JSON.stringify(next)) return; update(item.id, next); };
  return <TransformControls mode={tool} onMouseDown={() => { before.current = item.transform; }} onChange={sync} onObjectChange={sync} onMouseUp={() => { sync(); before.current = null; }}>{group}</TransformControls>;
}
export function EditorWorldLayer() { const objects = useEditorStore(s => s.objects); return <>{objects.filter(item => item.source !== 'map').map(item => <PlacedObject key={item.id} item={item} />)}</>; }
