import { useGLTF, useAnimations } from '@react-three/drei';
import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '@/game/state/game-store';
import type { HeroAction } from './glb-hero';
import { heldKindFor, selectedItemId } from './held-weapon';

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
  attackBow: '/models/red/attack_bow.glb',
  jump: '/models/red/jump.glb',
};
/** O mesh do Meshy traz o nó `target_character` com rotX −90° (Z-up), mas os clips
 *  Mixamo são Y-up → a anim DEITA o herói. Cancela com +90° X num wrapper (fora do
 *  esqueleto, não distorce o skinning). Y afina a planta dos pés no chão. */
const STAND_FIX_X = Math.PI / 2;
const STAND_FIX_Y = 0;
/** Velocidade do clip de ataque (combo Mixamo é longo → acelera p/ fechar a janela). */
const ATTACK_SPEED = 1.5;

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
  charUrl = RED_URL,
  scale = 1,
  yaw = 0,
  autoHeight = 1.8,
  walkSync = 0.6,
  runSync = 0.42,
  standFixX = STAND_FIX_X,
  rangedAttack = false,
  forceBow = false,
  gripScale = 1,
  gripPos = [0.04, 0.04, 0.08],
  gripRot = [0, Math.PI / 2, Math.PI / 2],
}: {
  actionRef: React.MutableRefObject<HeroAction>;
  speedRef?: React.MutableRefObject<number>;
  weapon?: ReactNode;
  /** Mesh a usar (default Survivor Red). Raiders passam pirate/spiked. */
  charUrl?: string;
  scale?: number;
  yaw?: number;
  /** Escala o modelo pra esta altura (m) e planta os pés em y=0. */
  autoHeight?: number;
  walkSync?: number;
  /** Cadência da CORRIDA (separada do walk): clip de run tem passada maior. */
  runSync?: number;
  /** Correção do -90° (FBX Meshy). GLB direto do Meshy já é Y-up → passar 0. */
  standFixX?: number;
  /** Só o player: troca o ataque pela anim de arco quando a arma é de longe. */
  rangedAttack?: boolean;
  /** Força o ataque de arco SEMPRE (raider arqueiro/xamã — só ataca de longe). */
  forceBow?: boolean;
  gripScale?: number;
  gripPos?: [number, number, number];
  gripRot?: [number, number, number];
}) {
  const inner = useRef<THREE.Group>(null);
  const { scene } = useGLTF(charUrl);
  const idleG = useGLTF(CLIP_URL['idle']!);
  const walkG = useGLTF(CLIP_URL['walk']!);
  const runG = useGLTF(CLIP_URL['run']!);
  const attackG = useGLTF(CLIP_URL['attack']!);
  const attackBowG = useGLTF(CLIP_URL['attackBow']!);
  const jumpG = useGLTF(CLIP_URL['jump']!);

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
    return [mk(idleG, 'idle'), mk(walkG, 'walk'), mk(runG, 'run'), mk(attackG, 'attack'), mk(attackBowG, 'attackBow'), mk(jumpG, 'jump')]
      .filter((c): c is THREE.AnimationClip => c != null);
  }, [idleG, walkG, runG, attackG, attackBowG, jumpG, boneNames]);

  const { actions } = useAnimations(clips, inner);
  const current = useRef<HeroAction | null>(null);
  /** Qual clip de ataque está tocando ('attack' combo ou 'attackBow'). */
  const playingAtk = useRef<string>('attack');

  const handBone = useMemo(() => {
    // O GLTFLoader do three REMOVE o ':' dos nomes → 'mixamorig:RightHand' vira
    // 'mixamorigRightHand'. Busca robusta (ignora pontuação/caixa).
    let b: THREE.Object3D | undefined;
    cloned.traverse((o) => {
      if (b) return;
      const n = o.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n === 'mixamorigrighthand' || n.endsWith('righthand')) b = o;
    });
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

    // Ataque POR ARMA (só o player): arma de longe → anim de arco; mão → combo.
    // Raiders (rangedAttack=false) sempre usam o combo. 'playingAtk' = clip em curso.
    let atkName = 'attack';
    if (forceBow && actions['attackBow']) {
      atkName = 'attackBow'; // arqueiro/xamã: só ataca de longe
    } else if (rangedAttack && actions['attackBow']) {
      const kind = heldKindFor(selectedItemId(useGameStore.getState()));
      if (kind === 'bow' || kind === 'pistol' || kind === 'rifle') atkName = 'attackBow';
    }

    // Clip que está REALMENTE tocando num estado (attack usa o playingAtk).
    const clipOf = (st: HeroAction | null): string | null =>
      st === 'attack' ? playingAtk.current : st;
    const curClipName = clipOf(current.current);
    const playing = curClipName ? actions[curClipName] : null;
    const playDur = playing?.getClip().duration ?? 0;
    const atkFinished = !playing || !playing.isRunning() || playing.time >= playDur - 0.02;

    // ATAQUE NÃO É CORTADO: enquanto o clip toca, não troca (termina 100% mesmo
    // que o bicho morra no meio e o estado volte pra idle/walk).
    if (current.current === 'attack' && !atkFinished) return;

    // (Re)dispara o ataque quando pedido e não há ataque rolando.
    if (want === 'attack') {
      const atk = actions[atkName];
      if (atk && (current.current !== 'attack' || atkFinished)) {
        if (curClipName && curClipName !== atkName && actions[curClipName]) actions[curClipName]!.fadeOut(0.1);
        atk.reset();
        atk.timeScale = ATTACK_SPEED;
        atk.setLoop(THREE.LoopOnce, 1);
        atk.clampWhenFinished = true;
        atk.fadeIn(0.08).play();
        current.current = 'attack';
        playingAtk.current = atkName;
      }
      return;
    }

    // PULO (oneshot): toca ao sair do chão; segura o último frame até pousar.
    const jmp = actions['jump'];
    if (want === 'jump' && jmp) {
      if (current.current !== 'jump') {
        if (curClipName && actions[curClipName]) actions[curClipName]!.fadeOut(0.1);
        jmp.reset();
        jmp.setLoop(THREE.LoopOnce, 1);
        jmp.clampWhenFinished = true;
        jmp.fadeIn(0.08).play();
        current.current = 'jump';
      }
      return;
    }

    // Idle / Walk / Run (loop). Re-dispara ao mudar de estado ou se o loop parou.
    const nextName = actions[want] ? want : 'idle';
    const curRunning = curClipName ? !!actions[curClipName]?.isRunning() : false;
    if (actions[nextName] && (want !== current.current || !curRunning)) {
      if (curClipName && curClipName !== nextName && actions[curClipName]) actions[curClipName]!.fadeOut(0.18);
      const a = actions[nextName]!;
      a.reset();
      a.timeScale = 1;
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.fadeIn(0.15).play();
      current.current = want;
    }
    // Cadência do walk/run acompanha a velocidade real (anti foot-sliding).
    // Run usa um sync MENOR (passada maior → não "patina" o pé).
    if ((current.current === 'walk' || current.current === 'run') && speedRef) {
      const a = actions[current.current];
      const sync = current.current === 'run' ? runSync : walkSync;
      if (a) a.timeScale = THREE.MathUtils.clamp(speedRef.current * sync, 0.4, 3.0);
    }
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} scale={scale}>
      {/* Wrapper que "levanta" o herói (cancela o -90° X do rig Meshy FBX). */}
      <group rotation={[standFixX, 0, 0]} position={[0, STAND_FIX_Y, 0]}>
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
useGLTF.preload(CLIP_URL['attackBow']!);
useGLTF.preload(CLIP_URL['jump']!);
