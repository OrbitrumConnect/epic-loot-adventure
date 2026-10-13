import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Herói GLB (Quaternius Modular Character Outfits) com animações da Universal
 * Animation Library 2 — mesmo rig (pelvis/spine/upperarm/hand...), então os
 * clips encaixam direto. Dirigido por estado via `actionRef` (sem re-render).
 */
const CHAR_URL = '/models/ranger/Male_Ranger.gltf';
const ANIM_URL = '/models/ranger/UAL2_Standard.glb';

export type HeroAction = 'idle' | 'walk' | 'attack';

function pickClip(names: string[], kind: HeroAction): string | undefined {
  const find = (sub: string) => names.find((n) => n.toLowerCase().includes(sub));
  // walk normal (evita o Zombie_Walk); idle EM PÉ (evita NinjaJump_Idle que "flutua")
  if (kind === 'walk') return find('walk_carry') ?? find('walk_fwd') ?? find('walk');
  if (kind === 'attack') return find('sword_regular_a') ?? find('sword');
  return find('idle_foldarms') ?? find('idle_shield') ?? find('idle_rail_loop') ?? find('idle');
}

export function GlbHero({
  actionRef,
  scale = 1,
  yaw = Math.PI,
}: {
  actionRef: React.MutableRefObject<HeroAction>;
  scale?: number;
  yaw?: number;
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene } = useGLTF(CHAR_URL);
  const { animations } = useGLTF(ANIM_URL);
  const cloned = useMemo(() => skeletonClone(scene), [scene]);
  const { actions, names } = useAnimations(animations, inner);
  const current = useRef<HeroAction | null>(null);

  useEffect(() => {
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    if (import.meta.env.DEV) console.info('[GlbHero] clips:', names);
  }, [cloned, names]);

  useFrame(() => {
    const want = actionRef.current;
    if (want === current.current) return;
    const prevName = current.current ? pickClip(names, current.current) : undefined;
    const nextName = pickClip(names, want);
    if (prevName && actions[prevName]) actions[prevName]!.fadeOut(0.18);
    if (nextName && actions[nextName]) {
      const loop = want !== 'attack';
      const a = actions[nextName]!;
      a.reset();
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.fadeIn(0.15).play();
    }
    current.current = want;
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={cloned} />
    </group>
  );
}

useGLTF.preload(CHAR_URL);
useGLTF.preload(ANIM_URL);
