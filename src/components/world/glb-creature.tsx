import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

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
}: {
  url: string;
  movingRef: React.MutableRefObject<boolean>;
  height?: number;
  yaw?: number;
  /** Cor base (os GLB "demo" vêm sem baseColor → brancos; tinta dá cor natural). */
  tint?: string | undefined;
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const cloned = useMemo(() => skeletonClone(scene), [scene]);
  const { actions, names } = useAnimations(animations, inner);
  const current = useRef<string | null>(null);

  // Escala pra `height` e põe os pés em y=0 (o Beast posiciona no terreno).
  const model = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const h = box.max.y - box.min.y || 1;
    const s = height / h;
    cloned.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(cloned);
    cloned.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
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
    return cloned;
  }, [cloned, height, tint]);

  const pick = (moving: boolean): string | undefined => {
    const find = (sub: string) => names.find((n) => n.toLowerCase().includes(sub));
    if (moving) return find('walk') ?? find('run') ?? find('trot') ?? names[0];
    return find('idle') ?? find('stand') ?? find('eat') ?? names.find((n) => !/walk|run|trot|howl|attack/i.test(n)) ?? names[0];
  };

  useEffect(() => {
    // Começa no idle.
    const n = pick(false);
    if (n && actions[n]) actions[n]!.reset().fadeIn(0.2).play();
    current.current = n ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, names]);

  useFrame(() => {
    const want = pick(movingRef.current);
    if (want && want !== current.current) {
      const prev = current.current;
      if (prev && actions[prev]) actions[prev]!.fadeOut(0.18);
      if (actions[want]) actions[want]!.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.18).play();
      current.current = want;
    }
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]}>
      <primitive object={model} />
    </group>
  );
}
