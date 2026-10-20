import { TransformControls, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useEditorStore, type EditorObject, type EditorCollide } from './editor-store';
import { registerTerrain, registerWall } from '../world/terrain-collision';
import { AssetBoundary } from '../world/asset-boundary';

// Isola cada objeto: um GLB ausente (ex.: asset NÃO commitado → 404 no Vercel) faz
// `useGLTF` dar throw. Sem boundary o throw sobe e DERRUBA o Canvas inteiro (tela de
// erro). O `AssetBoundary` compartilhado (../world/asset-boundary) cuida disso, com
// label pra log — ele substitui a classe local que existia aqui.

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

function PlacedObjectInner({ item }: { item: EditorObject }) {
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
  // Colisão por objeto (BVH), conforme item.collide:
  //  'floor'  → anda EM CIMA (ponte/terreno); 'block' → barra horizontal (parede/pedra);
  //  'none'/undefined → sem colisão (decorativo, ex. palmeira — não vira escada).
  // Raycast usa a matrixWorld atual, então mover/escalar no editor vale sem re-registrar.
  // Ponte de sucata é feita pra ANDAR EM CIMA → força 'floor' mesmo que o objeto
  // salvo tenha vindo com 'none' (o usuário não precisa marcar nada). Respeita uma
  // escolha explícita diferente de 'none' (ex.: quis 'block').
  const isBridge = item.assetUrl.includes('scrap-bridge');
  const explicit: EditorCollide | undefined = item.collide && item.collide !== 'none' ? item.collide : undefined;
  const collide: EditorCollide = explicit ?? (isBridge ? 'floor' : 'none');
  useEffect(() => {
    if (!ref.current || collide === 'none') return;
    return collide === 'block' ? registerWall(ref.current) : registerTerrain(ref.current);
  }, [model, collide]);
  const active = useEditorStore(s => s.active); const selected = useEditorStore(s => s.selectedId === item.id);
  const tool = useEditorStore(s => s.tool); const select = useEditorStore(s => s.select); const update = useEditorStore(s => s.update);
  const pick = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); select(item.id); };
  const [px, py, pz] = item.transform.position;
  const [sx, sy, sz] = item.transform.scale;
  const group = <group ref={ref} visible={item.visible} position={[px + pivot.x * sx, py + pivot.y * sy, pz + pivot.z * sz]} rotation={item.transform.rotation} scale={item.transform.scale} onPointerDown={pick}><group position={[-pivot.x, -pivot.y, -pivot.z]}><primitive object={model} /></group></group>;
  if (!active || !selected) return group;
  // Commit SÓ no onMouseUp (mesmo padrão do DesertMountain que já funcionava): durante
  // o arraste o gizmo move o objeto sozinho; commitar a cada onChange causava re-render
  // que DERRUBAVA o arraste. Lê a pose final e grava uma vez.
  const sync = () => { const o = ref.current; if (!o) return; update(item.id, { position: [o.position.x - pivot.x * o.scale.x, o.position.y - pivot.y * o.scale.y, o.position.z - pivot.z * o.scale.z], rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: [o.scale.x, o.scale.y, o.scale.z] }); };
  return <TransformControls mode={tool} onMouseUp={sync}>{group}</TransformControls>;
}
/** Objeto do editor blindado: fetch falho do GLB vira fallback `null` sem derrubar
 *  os outros objetos nem a cena. */
function PlacedObject({ item }: { item: EditorObject }) {
  return (
    <AssetBoundary label={`EditorObject:${item.assetUrl}`} fallback={null}>
      <Suspense fallback={null}>
        <PlacedObjectInner item={item} />
      </Suspense>
    </AssetBoundary>
  );
}

export function EditorWorldLayer() {
  const objects = useEditorStore(s => s.objects);
  return <>{objects.filter(item => item.source !== 'map').map(item => <PlacedObject key={item.id} item={item} />)}</>;
}
