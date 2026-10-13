import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Monstro GLB genérico (Quaternius Bestiary etc.). Diferente do herói: o modelo
 * JÁ traz rig + animações próprias (não usa a UAL humanoide). Dirigido por
 * `actionRef` (idle/walk/attack) sem re-render. Reutilizável por qualquer GLB.
 */
export type MonsterAction = 'idle' | 'walk' | 'attack';

function pick(names: string[], kind: MonsterAction): string | undefined {
  const find = (s: string) => names.find((n) => n.toLowerCase().includes(s));
  if (kind === 'walk') return find('run') ?? find('walk') ?? find('move');
  if (kind === 'attack') return find('attack') ?? find('bite') ?? find('melee') ?? find('scratch') ?? find('punch');
  return find('idle') ?? find('loop');
}

export function GlbMonster({
  url,
  actionRef,
  scale = 1,
  yaw = 0,
}: {
  url: string;
  actionRef: React.MutableRefObject<MonsterAction>;
  scale?: number;
  yaw?: number;
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const cloned = useMemo(() => skeletonClone(scene), [scene]);
  const { actions, names } = useAnimations(animations, inner);
  const current = useRef<MonsterAction | null>(null);

  useEffect(() => {
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    if (import.meta.env.DEV) console.info('[GlbMonster]', url, 'clips:', names);
  }, [cloned, names, url]);

  useFrame(() => {
    const want = actionRef.current;
    if (want === current.current) return;
    const prev = current.current ? pick(names, current.current) : undefined;
    const next = pick(names, want);
    if (prev && actions[prev]) actions[prev]!.fadeOut(0.18);
    if (next && actions[next]) {
      const loop = want !== 'attack';
      const a = actions[next]!;
      a.reset();
      a.timeScale = 1;
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
