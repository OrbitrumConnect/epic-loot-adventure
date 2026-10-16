import { TransformControls, useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { terrainHeight } from './world-kit';
import { registerTerrain } from './terrain-collision';
import { useEditorStore } from '../editor/editor-store';

/**
 * Terreno do deserto (modelos Meshy decimados) — planície (chão novo) + montanhas
 * rochosas climáveis. O jogador ANDA/SOBE na malha real (ver terrain-collision.ts:
 * cada terreno aqui se registra pra colisão por raycast/BVH). Acampamento, casa e
 * fábrica têm colisão PRÓPRIA e não são afetados (a malha só ergue o piso).
 */
const PLAIN_URL = '/models/terrain/desert-plain.glb';
const MOUNTAIN_URL = '/models/terrain/mountain.glb';
const MOUNTAIN_CAVE_URL = '/models/terrain/mountain-cave.glb';

/**
 * Deixa o material FOSCO e harmoniza a paleta terrosa.
 *
 * Problema corrigido: no glTF 2.0 o Three.js calcula
 *   effectiveMetalness = material.metalness × metalnessMap.pixel.B
 *   effectiveRoughness  = material.roughness  × roughnessMap.pixel.G
 * Portanto setar metalness=0 SEM nulificar metalnessMap não garante zero reflexo
 * — pixels B residuais do export do Meshy continuariam causando brilho metálico.
 * Solução: metalnessMap = null (e roughnessMap = null nas montanhas) antes dos escalares.
 * normalMap e map (albedo) são preservados para manter relevo e textura originais.
 *
 * Um lerp de cor único e leve é aplicado ao clone na carga (nunca por frame) para
 * aproximar o chão esverdeado e as montanhas avermelhadas à mesma paleta terrosa quente.
 */
function makeMatte(c: THREE.Object3D, shadow: 'receive' | 'cast') {
  // Terreno quente: marrom-areia para o chão, marrom-pedra para montanhas.
  const GROUND_TINT  = new THREE.Color('#9c7a4a'); // areia quente — puxa o verde p/ marrom
  const MOUNTAIN_TINT = new THREE.Color('#7a5c3e'); // pedra seca — reduz over-saturação avermelhada
  const isMountain = shadow === 'cast';

  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (isMountain) {
      m.castShadow = true;
    } else {
      m.receiveShadow = true;
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const pm = mat as THREE.MeshStandardMaterial;
      if (!pm || !('roughness' in pm)) continue;

      // ── 1. Nulifica os mapas PBR de metal/rough ANTES dos escalares ──────────
      // Three.js multiplica escalar × pixel do mapa; sem nullar, metalness=0
      // não elimina o reflexo se o canal B tiver valor residual (comum no Meshy).
      pm.metalnessMap = null;
      pm.metalness    = 0;

      if (isMountain) {
        // Montanhas: roughnessMap do Meshy pode ter pixels G baixos → áreas brilhantes.
        // Nullamos e travamos em 0.95 (pedra seca natural).
        pm.roughnessMap = null;
        pm.roughness    = 0.95;
      } else {
        // Chão: mantemos roughnessMap para variação superficial; escalar alto o suficiente
        // para que mesmo pixels G baixos resultem em roughness razoável.
        pm.roughness = 1.0;
      }

      pm.envMapIntensity = 0;

      // ── 2. Tint único na carga — harmoniza paleta sem achatar a textura ──────
      // Aplica AQUI, sobre o clone já separado da cena original, portanto não
      // acumula em re-renders. lerp 0.22–0.28 = sutil; preserva detalhes do albedo.
      if (isMountain) {
        pm.color.lerp(MOUNTAIN_TINT, 0.22); // reduz avermelhado excessivo
      } else {
        pm.color.lerp(GROUND_TINT, 0.28);   // retira cast verde-acinzentado
      }

      pm.needsUpdate = true;
    }
  });
}

/** Registra o grupo do terreno p/ colisão de malha ao montar (BVH). */
function useTerrainCollision(ref: React.RefObject<THREE.Group | null>) {
  useEffect(() => {
    if (!ref.current) return;
    return registerTerrain(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function DesertPlain({ size = 196, x = 0, z = 0, yOffset = 0, rotY = (3 * Math.PI) / 4 + (37 * Math.PI) / 180 }: { size?: number; x?: number; z?: number; yOffset?: number; rotY?: number }) {
  const { scene } = useGLTF(PLAIN_URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    makeMatte(c, 'receive');
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    c.updateMatrixWorld(true);
    // A planície tem relevo: raycast pra baixo no centro acha a superfície real e
    // desce o modelo até ela ficar no marco 0 (senão o chão caminhável fica no alto).
    const ray = new THREE.Raycaster(new THREE.Vector3(0, b2.max.y - b2.min.y + 50, 0), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(c, true);
    c.position.y -= hits.length > 0 ? hits[0]!.point.y : 0;
    return c;
  }, [scene, size]);
  // Planície = só VISUAL (chão plano). O player anda no `terrainHeight` procedural
  // (que casa com a planície); só as montanhas dão colisão de malha (subir). Assim
  // a planície pode mover/crescer sem erguer o player sobre acampamento/base.
  return (
    <group position={[x, terrainHeight(x, z) + yOffset, z]} rotation={[0, rotY, 0]}>
      <primitive object={model} />
    </group>
  );
}

/**
 * Montanha rochosa — assenta a BASE no chão e sobe; climável (registra colisão).
 * `url` troca o modelo (rocha simples ou a montanha-caverna com passarela).
 */
export function DesertMountain({ size = 12, x = 0, z = 0, rotY = 0, yOffset = 0, url = MOUNTAIN_URL, editorId, transform }: { size?: number; x?: number; z?: number; rotY?: number; yOffset?: number; url?: string; editorId?: string; transform?: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } }) {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null);
  useTerrainCollision(ref);
  const active = useEditorStore(s => s.active); const selected = useEditorStore(s => s.selectedId === editorId); const select = useEditorStore(s => s.select); const tool = useEditorStore(s => s.tool); const update = useEditorStore(s => s.update);
  const edited = useEditorStore(s => editorId ? s.objects.find(o => o.id === editorId) : undefined);
  const model = useMemo(() => {
    const c = scene.clone(true);
    makeMatte(c, 'cast');
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    const box = new THREE.Box3().setFromObject(c);
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    c.scale.setScalar(size / w);
    const b2 = new THREE.Box3().setFromObject(c);
    c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    return c;
  }, [scene, size]);
  // Sem colisão intencionalmente: este asset é visual/editável no Editor ADM.
  const editedPosition = transform?.position ?? edited?.transform.position;
  // Mantém a base da montanha no mesmo piso caminhável do mapa; X/Z continuam editáveis.
  const position = editedPosition ? [editedPosition[0], terrainHeight(editedPosition[0], editedPosition[2]) + yOffset, editedPosition[2]] as [number, number, number] : [x, terrainHeight(x, z) + yOffset, z] as [number, number, number];
  const rotation = transform?.rotation ?? edited?.transform.rotation ?? [0, rotY, 0];
  const scale = transform?.scale ?? edited?.transform.scale ?? [1, 1, 1];
  const group = (
    <group ref={ref} position={position} rotation={rotation} scale={scale} onPointerDown={e => { if (!active || !editorId) return; e.stopPropagation(); select(editorId); }}>
      <primitive object={model} />
    </group>
  );
  if (active && selected && editorId) return <TransformControls mode={tool} onMouseUp={() => { const o = ref.current; if (!o) return; update(editorId, { position: [o.position.x, o.position.y, o.position.z], rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: [o.scale.x, o.scale.y, o.scale.z] }); }}>{group}</TransformControls>;
  return group;
}

export const MOUNTAIN_CAVE = MOUNTAIN_CAVE_URL;

useGLTF.preload(PLAIN_URL);
useGLTF.preload(MOUNTAIN_URL);
useGLTF.preload(MOUNTAIN_CAVE_URL);
