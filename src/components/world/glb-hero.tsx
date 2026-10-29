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

export type HeroAction = 'idle' | 'walk' | 'run' | 'attack' | 'jump' | 'death' | 'dodge'
  // Zona Sul (28/10, `customClips` do GlbHeroMixamo): o jogo de sempre nunca usa estes
  | 'drive' | 'open_door' | 'swim' | 'tread'
  // surf (Zona Sul): remar deitado na prancha, levantar (Zombie Stand Up de 30%), base de surf (pose final)
  | 'paddle' | 'popup' | 'surf';

function pickClip(names: string[], kind: HeroAction): string | undefined {
  const find = (sub: string) => names.find((n) => n.toLowerCase().includes(sub));
  // walk normal (evita o Zombie_Walk); idle EM PÉ (evita NinjaJump_Idle que "flutua")
  if (kind === 'walk') return find('walk_carry') ?? find('walk_fwd') ?? find('walk');
  if (kind === 'attack') return find('sword_regular_a') ?? find('sword');
  // idle em pé natural (evita braços cruzados do FoldArms e o NinjaJump que flutua)
  return find('idle_shield_loop') ?? find('idle_rail_loop') ?? find('idle_foldarms') ?? find('idle');
}

/**
 * Mapa ValveBiped (Source/HL2) → Unreal (UAL). Pra personagens com rig Valve
 * (ex.: gasmask) animarem com a MESMA UAL dos outros: a gente RENOMEIA os ossos
 * pro nome Unreal e os clips encaixam. (Pose base difere → pode sair um pouco
 * torto; é reversível por flag.)
 */
const VALVE_TO_UNREAL: Record<string, string> = {
  Pelvis: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Spine4: 'spine_03',
  Neck1: 'neck_01', Head1: 'head',
  R_Clavicle: 'clavicle_r', R_UpperArm: 'upperarm_r', R_Forearm: 'lowerarm_r', R_Hand: 'hand_r',
  L_Clavicle: 'clavicle_l', L_UpperArm: 'upperarm_l', L_Forearm: 'lowerarm_l', L_Hand: 'hand_l',
  R_Thigh: 'thigh_r', R_Calf: 'calf_r', R_Foot: 'foot_r', R_Toe0: 'ball_r',
  L_Thigh: 'thigh_l', L_Calf: 'calf_l', L_Foot: 'foot_l', L_Toe0: 'ball_l',
};
/** "ValveBiped.Bip01_R_UpperArm_20" → "R_UpperArm". */
function valveCore(name: string): string | null {
  const m = name.match(/Bip01_(.+?)(_\d+)?$/);
  return m ? m[1]! : null;
}
/** Bounding box pela GEOMETRIA (estável; não depende de pose/timing). */
function measureGeoBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3(); const tmp = new THREE.Box3();
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
  remapValve = false,
  autoHeight,
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
  /** Rig ValveBiped → renomeia ossos pro Unreal (pra UAL animar). */
  remapValve?: boolean;
  /** Se definido, escala o modelo pra esta altura (m) e planta os pés em y=0. */
  autoHeight?: number | undefined;
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene } = useGLTF(charUrl);
  const { animations } = useGLTF(ANIM_URL);
  const cloned = useMemo(() => {
    const c = skeletonClone(scene);
    if (remapValve) {
      c.traverse((o) => {
        const core = valveCore(o.name);
        if (core && VALVE_TO_UNREAL[core]) o.name = VALVE_TO_UNREAL[core];
      });
    }
    if (autoHeight) {
      c.updateMatrixWorld(true);
      const box = measureGeoBox(c);
      const h = box.max.y - box.min.y || 1;
      const s = autoHeight / h;
      c.scale.setScalar(s);
      c.updateMatrixWorld(true);
      const b2 = measureGeoBox(c);
      c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    }
    return c;
  }, [scene, remapValve, autoHeight]);
  // CLONA (só os clips usados: idle/walk/sword) por instância: a UAL vem cacheada
  // (mesmos objetos p/ todos os bonecos) e compartilhar o mesmo AnimationClip
  // entre vários mixers deixava alguns saqueadores presos no bind-pose (braços
  // abertos). Clips próprios = cada um anima independente; filtrar poupa memória.
  const clips = useMemo(
    () => animations.filter((a) => /walk|sword|idle/i.test(a.name)).map((a) => a.clone()),
    [animations],
  );
  const { actions, names } = useAnimations(clips, inner);
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
        // Culling LIGADO (fora da tela não renderiza = horda barata). Infla o
        // bounding (bind-pose) p/ cobrir a animação e não sumir na borda.
        if (m.geometry && !m.geometry.userData['_inflated']) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= 1.8;
          m.geometry.userData['_inflated'] = true;
        }
      }
    });
  }, [cloned, names]);

  // Belt-and-suspenders: assim que as animações carregam, GARANTE que algo esteja
  // tocando (senão o boneco fica em T-pose se nasceu parado antes do clip existir).
  useEffect(() => {
    if (current.current) return;
    const n = pickClip(names, actionRef.current);
    if (n && actions[n]) {
      actions[n]!.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
      current.current = actionRef.current;
    }
  }, [actions, names, actionRef]);

  useFrame(() => {
    const want = actionRef.current;
    const nextName = pickClip(names, want) ?? names[0];
    const curName = current.current ? (pickClip(names, current.current) ?? '') : '';
    const curRunning = curName ? !!actions[curName]?.isRunning() : false;
    // Re-dispara quando MUDA de estado OU quando um estado que deveria LOOPAR
    // (idle/walk) parou (anti T-pose ETERNO — garante que algo sempre toca). O
    // ataque (LoopOnce) NÃO se re-dispara sozinho; volta pro idle pela máquina.
    const stalledLoop = want !== 'attack' && !curRunning;
    if (nextName && actions[nextName] && (want !== current.current || stalledLoop)) {
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

// Preload sob demanda: GlbHero (rig ranger) só monta se USE_RED_HERO=false; sem preload
// de import p/ não baixar o ranger no boot quando o herói ativo é o Mixamo (red).
