import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '@/game/state/game-store';

/** Distância² (m²) além da qual a criatura para de lançar sombra e de animar
 *  (com ~70 bichos, é o maior ganho de FPS — longe ninguém nota). */
const CREATURE_ACTIVE_D2 = 34 * 34;
const tmpCreatureV = new THREE.Vector3();

/** Bounding box a partir das GEOMETRIAS (independe de pose/skin/timing). */
function measureGeo(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) { tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); box.union(tmp); }
    }
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return box;
}

/**
 * Criatura GLB com rig/animação PRÓPRIOS (quadrúpede: deer, fox...), em vez do
 * bloco procedural. Mesmo espírito do `glb-hero`, mas usa os clips EMBUTIDOS do
 * modelo (não a UAL). Dirigido por `movingRef` (anda/para), sem re-render. A IA,
 * colisão, HP e rótulo continuam no `Beast`/`useHostileAI` — aqui é só o visual.
 */
export function GlbCreature({
  url,
  movingRef,
  height = 1.4,
  yaw = Math.PI,
  tint,
  groundBias = 0,
  fixedScale,
}: {
  url: string;
  movingRef: React.MutableRefObject<boolean>;
  height?: number | undefined;
  yaw?: number;
  /** Cor base (os GLB "demo" vêm sem baseColor → brancos; tinta dá cor natural). */
  tint?: string | undefined;
  /** Ajuste fino de altura (o bind-pose de alguns skinned difere da anim → flutua). */
  groundBias?: number;
  /** Escala ABSOLUTA (ignora `height`): p/ modelos cujo bbox não normaliza. */
  fixedScale?: number | undefined;
}) {
  const inner = useRef<THREE.Group>(null);
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[]; parser: { json: { textures?: unknown[]; materials?: { name?: string }[] }; getDependency: (t: string, i: number) => Promise<unknown> } };
  const { scene, animations } = gltf;
  const cloned = useMemo(() => skeletonClone(scene), [scene]);
  const { actions, names, mixer } = useAnimations(animations, inner);
  const current = useRef<string | null>(null);
  /** Malhas do modelo (coletadas uma vez) p/ alternar castShadow sem traverse por quadro. */
  const meshes = useRef<THREE.Mesh[]>([]);
  /** Estado de proximidade atual (evita reescrever castShadow/timeScale todo quadro). */
  const active = useRef(true);

  // Modelos "demo" trazem textura EMBUTIDA mas não a ligam no material (ficam
  // brancos/amarelos). Liga a baseColor via parser do glTF (material i → textura i).
  useEffect(() => {
    const texCount = gltf.parser.json.textures?.length ?? 0;
    if (texCount === 0) return;
    // Modelo com TINT usa a cor chapada — não re-liga textura (ex.: civilian/zombie,
    // cujas 18/12 texturas confundiam e davam AZUL/branco).
    if (tint) return;
    const jsonMats = gltf.parser.json.materials ?? [];
    let alive = true;
    const meshes: THREE.Mesh[] = [];
    cloned.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    (async () => {
      for (const mesh of meshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mm of mats) {
          const sm = mm as THREE.MeshStandardMaterial;
          if (!sm || sm.map) continue;
          const mi = jsonMats.findIndex((m) => m.name === sm.name);
          // Índice CORRETO da baseColor (não o índice do material!); fallback: índice
          // do material (modelos demo simples: deer/goose → material 0 = textura 0).
          const baseIdx = mi >= 0 ? (jsonMats[mi] as { pbrMetallicRoughness?: { baseColorTexture?: { index?: number } } })?.pbrMetallicRoughness?.baseColorTexture?.index : undefined;
          const ti = Math.max(0, Math.min(texCount - 1, baseIdx != null ? baseIdx : (mi < 0 ? 0 : mi)));
          try {
            const tex = (await gltf.parser.getDependency('texture', ti)) as THREE.Texture;
            if (!alive) return;
            tex.colorSpace = THREE.SRGBColorSpace;
            sm.map = tex;
            sm.color.set('#ffffff'); // deixa a textura aparecer (sem multiplicar cor)
            sm.metalness = 0;
            sm.roughness = 0.85;
            sm.needsUpdate = true;
          } catch { /* sem textura utilizável: fica o tint */ }
        }
      }
    })();
    return () => { alive = false; };
  }, [gltf, cloned]);

  // Escala pra `height` e põe os pés em y=0 (o Beast posiciona no terreno).
  const model = useMemo(() => {
    // Mede pela GEOMETRIA (estável; não depende de pose/timing do skinned mesh —
    // em produção/mobile o Box3.setFromObject dava box minúsculo → escala gigante).
    cloned.updateMatrixWorld(true);
    if (fixedScale != null) {
      // Modelo que não normaliza (ex.: pigeon): escala absoluta, determinística.
      cloned.scale.setScalar(fixedScale);
    } else {
      const box = measureGeo(cloned);
      const h = box.max.y - box.min.y || 1;
      cloned.scale.setScalar(height / h);
    }
    cloned.updateMatrixWorld(true);
    const b2 = measureGeo(cloned);
    cloned.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const collected: THREE.Mesh[] = [];
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        collected.push(m);
        // Culling LIGADO + bounding inflado (não renderiza fora da tela).
        if (m.geometry && !m.geometry.userData['_inflated']) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= 1.8;
          m.geometry.userData['_inflated'] = true;
        }
        if (tint) {
          // GLB "demo" sem baseColor → tinta a cor natural (combina com o cel-shade).
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) {
            const sm = mm as THREE.MeshStandardMaterial;
            if (sm && sm.color) { sm.color.set(tint); sm.metalness = 0; sm.roughness = 0.9; }
          }
        }
      }
    });
    meshes.current = collected;
    return cloned;
  }, [cloned, height, tint, fixedScale]);

  // Clipes idle/walk resolvidos UMA vez (só dependem de `names`) — sem regex por quadro.
  const clips = useMemo(() => {
    const find = (sub: string) => names.find((n) => n.toLowerCase().includes(sub));
    const walk = find('walk') ?? find('run') ?? find('trot') ?? names[0];
    const idle = find('idle') ?? find('stand') ?? find('eat') ?? names.find((n) => !/walk|run|trot|howl|attack/i.test(n)) ?? names[0];
    return { walk, idle };
  }, [names]);

  useEffect(() => {
    // Começa no idle.
    const n = clips.idle;
    if (n && actions[n]) actions[n]!.reset().fadeIn(0.2).play();
    current.current = n ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, clips]);

  useFrame(() => {
    const g = inner.current;
    if (!g) return;
    // Longe do jogador: sai do passe de sombra e pausa o mixer (anim). Perto: liga.
    g.getWorldPosition(tmpCreatureV);
    const p = useGameStore.getState().player.position;
    const near = (p.x - tmpCreatureV.x) * (p.x - tmpCreatureV.x) + (p.z - tmpCreatureV.z) * (p.z - tmpCreatureV.z) < CREATURE_ACTIVE_D2;
    if (near !== active.current) {
      active.current = near;
      for (const m of meshes.current) m.castShadow = near;
      if (mixer) mixer.timeScale = near ? 1 : 0;
    }
    if (!near) return; // longe: nem recalcula o clipe

    const want = movingRef.current ? clips.walk : clips.idle;
    if (want && want !== current.current) {
      const prev = current.current;
      if (prev && actions[prev]) actions[prev]!.fadeOut(0.18);
      if (actions[want]) actions[want]!.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.18).play();
      current.current = want;
    }
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} position={[0, groundBias, 0]}>
      <primitive object={model} />
    </group>
  );
}
