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
import { AnimationClip, AnimationMixer, Frustum, Matrix4, Object3D, PropertyBinding, Quaternion, Sphere, type AnimationAction, type Camera, type KeyframeTrack } from 'three';
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

/** FORA DA CÂMERA (30/10, lag — grupo denso de bichos na Lagoa: ~20 animando juntos = ~10% da CPU): o bicho que a câmera
 *  NÃO vê não calcula a animação; o tempo segue somando e, quando ele entra na tela, aplica de uma vez (a mesma pose de quem
 *  não parou — ninguém congela). É o 'culling' de animação das engines. Margem larga (corpo grande + sombra na borda). */
export const ANIM_CULL_MARGIN = 10;
const frustum = new Frustum(), projView = new Matrix4(), tmpSphere = new Sphere();
let frustumKey = Number.NaN;
/** (x, y, z) a até ANIM_CULL_MARGIN m da visão da câmera? `key` = um valor por quadro (o frustum é montado 1× por quadro). */
export function animInView(camera: Camera, key: number, x: number, y: number, z: number): boolean {
  if (key !== frustumKey) {
    frustumKey = key;
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
  }
  tmpSphere.center.set(x, y, z); tmpSphere.radius = ANIM_CULL_MARGIN;
  return frustum.intersectsSphere(tmpSphere);
}

/**
 * TRILHAS QUE NÃO MEXEM (30/10, lag): os bichos do jogo vêm com rigs enormes (ganso 186 ossos / 1.199 trilhas, jacaré
 * 187 / 862) e trilha de TODO osso — inclusive as que ficam o clipe inteiro no valor de DESCANSO do osso (escala 1,
 * posição parada). O mixer avalia todas a cada quadro. Trilha assim não muda nada na tela: sem ela o osso fica no
 * descanso (e na transição entre clipes o mixer completa com o valor de descanso — o mesmo). Sai. 1× por clipe (cache).
 */
const leanCache = new WeakMap<AnimationClip, AnimationClip>();
const tmpQ = new Quaternion();
const EPS = 1e-5;
function isRestTrack(track: KeyframeTrack, node: Object3D, prop: string): boolean {
  const v = track.values;
  if (prop === 'quaternion') {
    const r = node.quaternion;
    for (let i = 0; i + 3 < v.length; i += 4) { tmpQ.set(v[i]!, v[i + 1]!, v[i + 2]!, v[i + 3]!); if (Math.abs(tmpQ.dot(r)) < 1 - EPS) return false; }
    return true;
  }
  const r = prop === 'position' ? node.position : prop === 'scale' ? node.scale : null;
  if (!r) return false;
  for (let i = 0; i + 2 < v.length; i += 3) if (Math.abs(v[i]! - r.x) > EPS || Math.abs(v[i + 1]! - r.y) > EPS || Math.abs(v[i + 2]! - r.z) > EPS) return false;
  return true;
}
/** O clipe sem as trilhas que nunca saem do descanso (`root` = a cena do GLB em repouso). Puro; o original fica intacto. */
export function leanClip(clip: AnimationClip, root: Object3D): AnimationClip {
  const hit = leanCache.get(clip);
  if (hit) return hit;
  const keep = clip.tracks.filter((t) => {
    const pn = PropertyBinding.parseTrackName(t.name);
    const node = PropertyBinding.findNode(root, pn.nodeName) as Object3D | null;
    return !(node && !pn.propertyIndex && isRestTrack(t, node, pn.propertyName));
  });
  const out = keep.length === clip.tracks.length ? clip : new AnimationClip(clip.name, clip.duration, keep, clip.blendMode);
  leanCache.set(clip, out);
  return out;
}

type Api = { ref: React.MutableRefObject<Object3D | null>; clips: AnimationClip[]; actions: Record<string, AnimationAction | null>; names: string[]; mixer: AnimationMixer };

export function useLodAnimations(
  clips: AnimationClip[],
  root: React.RefObject<Object3D | null>,
  everyRef: React.MutableRefObject<number>,
  /** pula a animação fora da câmera (bichos e inimigos; o herói nunca) */
  cullOffscreen = false,
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
  useFrame((state, delta) => {
    const e = cullOffscreen ? actualRef.current?.matrixWorld.elements : undefined;
    if (e && !animInView(state.camera, state.clock.elapsedTime, e[12]!, e[13]!, e[14]!)) { step.current.acc += delta; return; }
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
