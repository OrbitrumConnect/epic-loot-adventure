import { useGLTF } from '@react-three/drei';
import { animEvery, useLodAnimations } from './anim-lod';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '@/game/state/game-store';
import { hitStopScale } from './hit-stop';

/** Distância² (m²) além da qual a criatura para de lançar sombra e de animar
 *  (com ~70 bichos, é o maior ganho de FPS — longe ninguém nota). */
const CREATURE_ACTIVE_D2 = 34 * 34;
const tmpCreatureV = new THREE.Vector3();
const tmpSkinV = new THREE.Vector3();

/** Ponto mais BAIXO (Y de mundo) do corpo ANIMADO — vértices já posicionados pelos ossos (amostra). */
export function skinnedMinY(root: THREE.Object3D, maxSamples = 1500): number {
  let min = Infinity;
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    const pos = sm.geometry?.attributes?.['position'] as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / maxSamples));
    for (let i = 0; i < pos.count; i += step) {
      tmpSkinV.fromBufferAttribute(pos, i);
      if (sm.isSkinnedMesh) sm.applyBoneTransform(i, tmpSkinV);
      tmpSkinV.applyMatrix4(sm.matrixWorld);
      if (tmpSkinV.y < min) min = tmpSkinV.y;
    }
  });
  return min;
}

/**
 * Igual ao `skinnedMinY`, mas BARATO (otimização 25/10): uma varredura completa escolhe os FOOT_KEEP pontos
 * mais baixos (os pés) e as medições seguintes olham só eles (~15× menos vértices pra posicionar pelos ossos);
 * a varredura completa se repete a cada FOOT_RESCAN chamadas (~4,5 s a 0,3 s por chamada).
 */
export type FootCache = { picks: { sm: THREE.Mesh; idx: number[] }[]; calls: number };
export const createFootCache = (): FootCache => ({ picks: [], calls: 0 });
export const FOOT_KEEP = 96;
export const FOOT_RESCAN = 15;
export function footMinY(root: THREE.Object3D, cache: FootCache, maxSamples = 1500): number {
  const full = cache.picks.length === 0 || cache.calls % FOOT_RESCAN === 0;
  cache.calls++;
  if (!full) {
    let min = Infinity;
    for (const p of cache.picks) {
      const pos = p.sm.geometry.attributes['position'] as THREE.BufferAttribute;
      const sk = p.sm as THREE.SkinnedMesh;
      for (const i of p.idx) {
        tmpSkinV.fromBufferAttribute(pos, i);
        if (sk.isSkinnedMesh) sk.applyBoneTransform(i, tmpSkinV);
        tmpSkinV.applyMatrix4(p.sm.matrixWorld);
        if (tmpSkinV.y < min) min = tmpSkinV.y;
      }
    }
    return min;
  }
  const all: { sm: THREE.Mesh; i: number; y: number }[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    const pos = sm.geometry?.attributes?.['position'] as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / maxSamples));
    for (let i = 0; i < pos.count; i += step) {
      tmpSkinV.fromBufferAttribute(pos, i);
      if (sm.isSkinnedMesh) sm.applyBoneTransform(i, tmpSkinV);
      tmpSkinV.applyMatrix4(sm.matrixWorld);
      all.push({ sm, i, y: tmpSkinV.y });
    }
  });
  if (all.length === 0) return Infinity;
  all.sort((a, b) => a.y - b.y);
  const by = new Map<THREE.Mesh, number[]>();
  for (const e of all.slice(0, FOOT_KEEP)) { const l = by.get(e.sm) ?? []; l.push(e.i); by.set(e.sm, l); }
  cache.picks = [...by].map(([sm, idx]) => ({ sm, idx }));
  return all[0]!.y;
}

/**
 * Hora de medir o chão pelo corpo animado? 1ª vez: 3 quadros depois de nascer (a animação já posou), em QUALQUER
 * distância — antes só media perto (40 m) e de longe o bicho/raider ficava enterrado até chegar perto ("nasce abaixo e
 * sobe ao andar", Pedro 25/10). Depois: a cada ~0,3 s e só perto (custo).
 */
/** Brilho próprio dos bichos PINTADOS (sem textura): a própria cor a 18% — equilibra com os texturizados à noite. */
export const TINT_GLOW = 0.18;

export function groundDue(init: boolean, frame: number, near: boolean): boolean {
  return init ? near && frame % 18 === 0 : frame >= 3;
}

/**
 * QUANDO medir o chão e com que FORÇA (0 = não mede). Pedro 26/10: "em alguns locais os bichos nascem mais embaixo
 * do mapa". Causa: a 1ª medição (3 quadros após nascer) pegava a animação ainda ENTRANDO (fade de 0,2 s a partir da
 * pose T, pé noutra altura) → assentava errado; e LONGE (> 40 m) nunca mais media → ficava enterrado até você chegar.
 *  1ª (ao nascer): encaixa · 2ª (quadro 30, animação já de verdade): encaixa de novo, em qualquer distância ·
 *  perto: a cada 18 quadros (35%) · longe: a cada 120 quadros (~2 s, 50%) — barato (só os ~96 pontos do pé).
 */
export const GROUND_SETTLE_FRAME = 30;
export const GROUND_FAR_EVERY = 120;
export function groundStep(init: boolean, frame: number, near: boolean): number {
  if (!init) return frame >= 3 ? 1 : 0;
  if (frame === GROUND_SETTLE_FRAME) return 1;
  if (near) return frame % 18 === 0 ? 0.35 : 0;
  return frame % GROUND_FAR_EVERY === 0 ? 0.5 : 0;
}

/** Próximo deslocamento vertical pra o pé (minY) encostar no chão (groundY), suavizado. */
export function nextGroundOffset(current: number, minY: number, groundY: number, k = 0.35): number {
  if (!Number.isFinite(minY)) return current;
  const target = current - (minY - groundY);
  return current + (target - current) * k;
}

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
  autoGround = false,
}: {
  /** Assenta pelo corpo ANIMADO (mede o pé mais baixo a cada ~0,3 s, perto do jogador) — pra modelos
   *  cujo bind-pose ≠ animação (o ajuste fixo "oscila"). groundBias vira só o ponto de partida. */
  autoGround?: boolean;
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
  // 26/10: animação por distância (anim-lod.ts) — perto todo quadro (igual), longe com menos atualizações.
  const animEveryRef = useRef(1);
  const { actions, names, mixer } = useLodAnimations(animations, inner, animEveryRef);
  const current = useRef<string | null>(null);
  /** Malhas do modelo (coletadas uma vez) p/ alternar castShadow sem traverse por quadro. */
  const meshes = useRef<THREE.Mesh[]>([]);
  /** Estado de proximidade atual (evita reescrever castShadow/timeScale todo quadro). */
  const active = useRef(true);
  const groundAcc = useRef(-Math.floor(Math.random() * 30)); // espalha a 1ª medição (horda nascendo junta não trava)
  const groundInit = useRef(false);
  const footCache = useRef(createFootCache());

  // Modelos "demo" trazem textura EMBUTIDA mas não a ligam no material (ficam
  // brancos/amarelos). Liga a baseColor via parser do glTF (material i → textura i).
  useEffect(() => {
    const texCount = gltf.parser.json.textures?.length ?? 0;
    if (texCount === 0) return;
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
          const ti = Math.max(0, Math.min(texCount - 1, mi < 0 ? 0 : mi));
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
            if (sm && sm.color) {
              sm.color.set(tint); sm.metalness = 0; sm.roughness = 0.9;
              // 26/10 (Pedro: "uns ficam bem mais escuros que o herói/Couraça"): cor ÚNICA fosca some no escuro (os do
              // Meshy têm a luz pintada na textura). Brilho próprio leve, da própria cor → não vira mancha preta à noite.
              if (sm.emissive) { sm.emissive.set(tint); sm.emissiveIntensity = TINT_GLOW; }
            }
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
    // Longe do jogador: sai do passe de SOMBRA (economia real de GPU). A animação NÃO pausa mais (Pedro
    // 25/10: de longe deslizavam congelados/"bugados"): no three o mixer com timeScale 0 é avaliado do
    // mesmo jeito todo quadro — pausar só congelava a pose, sem economizar.
    g.getWorldPosition(tmpCreatureV);
    const p = useGameStore.getState().player.position;
    const d2 = (p.x - tmpCreatureV.x) * (p.x - tmpCreatureV.x) + (p.z - tmpCreatureV.z) * (p.z - tmpCreatureV.z);
    animEveryRef.current = animEvery(d2);
    const near = d2 < CREATURE_ACTIVE_D2;
    if (near !== active.current) {
      active.current = near;
      for (const m of meshes.current) m.castShadow = near;
    }
    if (mixer) mixer.timeScale = hitStopScale(); // hit stop (crítico/abate)

    if (autoGround && g.parent) {
      groundAcc.current += 1;
      const step = groundStep(groundInit.current, groundAcc.current, near); // 26/10: 2ª medição + longe também
      if (step > 0) {
        g.parent.getWorldPosition(tmpCreatureV); // a raiz do bicho fica no chão (Beast/AI)
        g.updateWorldMatrix(true, true);
        g.position.y = nextGroundOffset(g.position.y, footMinY(g, footCache.current), tmpCreatureV.y, step); // 1ª/2ª: encaixa
        groundInit.current = true;
      }
    }

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
