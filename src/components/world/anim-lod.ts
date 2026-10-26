/**
 * ANIMAÇÃO POR DISTÂNCIA (26/10 — A17). Medido: ~200 bichos animando custam ~5,3 ms/quadro num PC (mixer + ossos); um
 * celular intermediário roda JS 4–5× mais devagar → ~20–25 ms só nisso (o quadro de 30 FPS tem 33 ms). Padrão de jogo:
 *  - perto (< 40 m): anima TODO quadro (igual a antes);
 *  - 40–80 m: a cada 3 quadros · > 80 m (na névoa): a cada 6 — continua ANIMANDO (nada congela; o "bugado de longe" de
 *    25/10 era animação parada), só com menos atualizações por segundo, com o tempo acumulado (mesma velocidade).
 * `useLodAnimations` = o `useAnimations` do drei (mesma API: actions/names/mixer) + o passo por distância; cada bicho
 * começa num quadro diferente pra os de longe não atualizarem todos juntos (pico).
 */
import * as React from 'react';
import { AnimationMixer, Object3D, type AnimationAction, type AnimationClip } from 'three';
import { useFrame } from '@react-three/fiber';

export const ANIM_NEAR_M = 40;
export const ANIM_FAR_M = 80;
/** De quantos em quantos quadros o bicho a `d2` (distância² do herói) atualiza a animação. */
export function animEvery(d2: number): number {
  if (d2 < ANIM_NEAR_M * ANIM_NEAR_M) return 1;
  return d2 < ANIM_FAR_M * ANIM_FAR_M ? 3 : 6;
}

/** Passo por quadro (pura, testável): soma o tempo; atualiza quando chega a vez e devolve quanto tempo aplicar (0 = pula). */
export function lodStep(state: { frame: number; acc: number }, delta: number, every: number): number {
  state.acc += delta;
  state.frame++;
  if (every <= 1 || state.frame % every === 0) { const d = state.acc; state.acc = 0; return d; }
  return 0;
}

type Api = { ref: React.MutableRefObject<Object3D | null>; clips: AnimationClip[]; actions: Record<string, AnimationAction | null>; names: string[]; mixer: AnimationMixer };

export function useLodAnimations(
  clips: AnimationClip[],
  root: React.RefObject<Object3D | null>,
  everyRef: React.MutableRefObject<number>,
): Api {
  const actualRef = root as React.MutableRefObject<Object3D | null>;
  const [mixer] = React.useState(() => new AnimationMixer(undefined as unknown as Object3D));
  React.useLayoutEffect(() => { (mixer as unknown as { _root: Object3D | null })._root = actualRef.current; });
  const lazy = React.useRef<Record<string, AnimationAction>>({});
  const api = React.useMemo(() => {
    const actions: Record<string, AnimationAction | null> = {};
    clips.forEach((clip) => Object.defineProperty(actions, clip.name, {
      enumerable: true,
      configurable: true,
      get() {
        if (!actualRef.current) return null;
        return lazy.current[clip.name] || (lazy.current[clip.name] = mixer.clipAction(clip, actualRef.current));
      },
    }));
    return { ref: actualRef, clips, actions, names: clips.map((c) => c.name), mixer };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);
  const step = React.useRef({ frame: Math.floor(Math.random() * 6), acc: 0 });
  useFrame((_, delta) => {
    const d = lodStep(step.current, delta, everyRef.current);
    if (d > 0) mixer.update(d);
  });
  React.useEffect(() => {
    const currentRoot = actualRef.current;
    return () => {
      lazy.current = {};
      mixer.stopAllAction();
      for (const a of Object.values(api.actions)) if (a && currentRoot) mixer.uncacheAction(a.getClip(), currentRoot);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);
  return api;
}
