import { useGLTF, useAnimations } from '@react-three/drei';
import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroAction } from './glb-hero';

/**
 * Herói com rig **Mixamo** (ex.: Survivor Red do Meshy — que rigga via Mixamo).
 * Diferente do `GlbHero` (rig Unreal/UAL): aqui o mesh e os clips são do MESMO
 * esqueleto Mixamo (`mixamorig:*`), então as animações encaixam direto, sem
 * retarget. Cada clip vem de um GLB próprio (Mixamo exporta 1 por arquivo).
 * Mesma interface do `GlbHero` (`actionRef`/`speedRef`/`weapon`) p/ trocar fácil.
 */
const RED_URL = '/models/red/red.glb';
const CLIP_URL: Record<string, string> = {
  idle: '/models/red/idle.glb',
  walk: '/models/red/walk.glb',
  run: '/models/red/run.glb',
  attack: '/models/red/attack.glb',
};
/** Osso da mão direita no rig Mixamo (no Unreal seria `hand_r`). */
const HAND_BONE = 'mixamorig:RightHand';
/** O mesh do Meshy traz o nó `target_character` com rotX −90° (Z-up), mas os clips
 *  Mixamo são Y-up → a anim DEITA o herói. Cancela com +90° X num wrapper (fora do
 *  esqueleto, não distorce o skinning). Y afina a planta dos pés no chão. */
const STAND_FIX_X = Math.PI / 2;
const STAND_FIX_Y = 0;

/** Bounding box pela GEOMETRIA (estável; não depende de pose/timing). */
function measureGeoBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.updateMatrixWorld(true);
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

/** Zera o deslocamento horizontal (root motion) do Hips → não desliza pelo mapa
 *  (o movimento quem dirige é a lógica do jogo). Mantém o Y (pulinho natural). */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const track of clip.tracks) {
    if (/Hips\.position$/i.test(track.name)) {
      const v = track.values;
      for (let i = 0; i + 2 < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; }
    }
  }
  return clip;
}

export function GlbHeroMixamo({
  actionRef,
  speedRef,
  weapon,
  scale = 1,
  yaw = 0,
  autoHeight = 1.8,
  walkSync = 1.1,
  gripScale = 1,
  gripPos = [0, 0, 0],
  gripRot = [0, 0, 0],
}: {
  actionRef: React.MutableRefObject<HeroAction>;
  speedRef?: React.MutableRefObject<number>;
  weapon?: ReactNode;
  scale?: number;
  yaw?: number;
  /** Escala o modelo pra esta altura (m) e planta os pés em y=0. */
  autoHeight?: number;
  walkSync?: number;
  gripScale?: number;
  gripPos?: [number, number, number];
  gripRot?: [number, number, number];
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene } = useGLTF(RED_URL);
  const idleG = useGLTF(CLIP_URL['idle']!);
  const walkG = useGLTF(CLIP_URL['walk']!);
  const runG = useGLTF(CLIP_URL['run']!);
  const attackG = useGLTF(CLIP_URL['attack']!);

  const cloned = useMemo(() => {
    const c = skeletonClone(scene);
    if (autoHeight) {
      c.updateMatrixWorld(true);
      const box = measureGeoBox(c);
      const h = box.max.y - box.min.y || 1;
      c.scale.setScalar(autoHeight / h);
      c.updateMatrixWorld(true);
      const b2 = measureGeoBox(c);
      c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    }
    return c;
  }, [scene, autoHeight]);

  // Nomes de osso que EXISTEM no Red (p/ filtrar tracks de dedos que as anims
  // Mixamo trazem mas o mesh não tem → evita warnings e trabalho à toa).
  const boneNames = useMemo(() => {
    const s = new Set<string>();
    cloned.traverse((o) => { if ((o as THREE.Bone).isBone || o.type === 'Bone') s.add(o.name); });
    return s;
  }, [cloned]);

  const clips = useMemo(() => {
    const mk = (g: { animations: THREE.AnimationClip[] }, name: string): THREE.AnimationClip | null => {
      const src = g.animations[0];
      if (!src) return null;
      const a = src.clone();
      a.name = name;
      a.tracks = a.tracks.filter((t) => boneNames.has(t.name.split('.')[0] ?? ''));
      return stripRootMotion(a);
    };
    return [mk(idleG, 'idle'), mk(walkG, 'walk'), mk(runG, 'run'), mk(attackG, 'attack')]
      .filter((c): c is THREE.AnimationClip => c != null);
  }, [idleG, walkG, runG, attackG, boneNames]);

  const { actions } = useAnimations(clips, inner);
  const current = useRef<HeroAction | null>(null);

  const handBone = useMemo(() => {
    let b: THREE.Object3D | undefined;
    cloned.traverse((o) => { if (!b && o.name === HAND_BONE) b = o; });
    return b;
  }, [cloned]);

  useEffect(() => {
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        if (m.geometry && !m.geometry.userData['_inflated']) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= 1.8;
          m.geometry.userData['_inflated'] = true;
        }
      }
    });
  }, [cloned]);

  // Garante que algo toca assim que os clips carregam (anti T-pose eterno).
  useEffect(() => {
    if (current.current) return;
    const a = actions['idle'] ?? actions['walk'];
    if (a) {
      a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
      current.current = 'idle';
    }
  }, [actions]);

  useFrame(() => {
    const want = actionRef.current;
    const nextName = actions[want] ? want : (actions['idle'] ? 'idle' : null);
    const curName = current.current;
    const curRunning = curName ? !!actions[curName]?.isRunning() : false;
    // Re-dispara ao MUDAR de estado, ou quando um loop (idle/walk) parou.
    const stalledLoop = want !== 'attack' && !curRunning;
    if (nextName && actions[nextName] && (want !== curName || stalledLoop)) {
      if (curName && curName !== nextName && actions[curName]) actions[curName]!.fadeOut(0.18);
      const loop = want !== 'attack';
      const a = actions[nextName]!;
      a.reset();
      a.timeScale = 1;
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.fadeIn(0.15).play();
      current.current = want;
    }
    // Cadência do walk acompanha a velocidade real (anti foot-sliding).
    if (current.current === 'walk' && speedRef && actions['walk']) {
      actions['walk']!.timeScale = THREE.MathUtils.clamp(speedRef.current * walkSync, 0.4, 5.5);
    }
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} scale={scale}>
      {/* Wrapper que "levanta" o herói (cancela o -90° X do rig Meshy). */}
      <group rotation={[STAND_FIX_X, 0, 0]} position={[0, STAND_FIX_Y, 0]}>
        <primitive object={cloned} />
      </group>
      {weapon && handBone
        ? createPortal(
            <group position={gripPos} rotation={gripRot} scale={gripScale}>
              {weapon}
            </group>,
            handBone,
          )
        : null}
    </group>
  );
}

useGLTF.preload(RED_URL);
useGLTF.preload(CLIP_URL['idle']!);
useGLTF.preload(CLIP_URL['walk']!);
useGLTF.preload(CLIP_URL['run']!);
useGLTF.preload(CLIP_URL['attack']!);
