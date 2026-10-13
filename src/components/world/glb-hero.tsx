import { useGLTF, useAnimations } from '@react-three/drei';
import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
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
  // idle em pé natural (evita braços cruzados do FoldArms e o NinjaJump que flutua)
  return find('idle_shield_loop') ?? find('idle_rail_loop') ?? find('idle_foldarms') ?? find('idle');
}

export function GlbHero({
  actionRef,
  charUrl = CHAR_URL,
  speedRef,
  weapon,
  scale = 1,
  yaw = 0,
  walkSync = 0.85,
  gripScale = 1,
  gripPos = [0, 0, 0],
  gripRot = [0, 0, 0],
}: {
  actionRef: React.MutableRefObject<HeroAction>;
  charUrl?: string;
  speedRef?: React.MutableRefObject<number>;
  weapon?: ReactNode;
  scale?: number;
  yaw?: number;
  walkSync?: number;
  gripScale?: number;
  gripPos?: [number, number, number];
  gripRot?: [number, number, number];
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene } = useGLTF(charUrl);
  const { animations } = useGLTF(ANIM_URL);
  const cloned = useMemo(() => skeletonClone(scene), [scene]);
  const { actions, names } = useAnimations(animations, inner);
  const current = useRef<HeroAction | null>(null);
  // osso da mão direita (rig Unreal) pra anexar a arma; segue a animação
  const handBone = useMemo(() => {
    let b: THREE.Object3D | undefined;
    cloned.traverse((o) => { if (!b && o.name === 'hand_r') b = o; });
    return b;
  }, [cloned]);

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
    if (want !== current.current) {
      const prevName = current.current ? pickClip(names, current.current) : undefined;
      const nextName = pickClip(names, want);
      if (prevName && actions[prevName]) actions[prevName]!.fadeOut(0.18);
      if (nextName && actions[nextName]) {
        const loop = want !== 'attack';
        const a = actions[nextName]!;
        a.reset();
        a.timeScale = 1;
        a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = !loop;
        a.fadeIn(0.15).play();
      }
      current.current = want;
    }
    // Sincroniza a cadência do walk com a velocidade real → anti foot-sliding.
    if (current.current === 'walk' && speedRef) {
      const wn = pickClip(names, 'walk');
      if (wn && actions[wn]) actions[wn]!.timeScale = THREE.MathUtils.clamp(speedRef.current * walkSync, 0.4, 5.5);
    }
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} scale={scale}>
      <primitive object={cloned} />
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

useGLTF.preload(CHAR_URL);
useGLTF.preload(ANIM_URL);
