import { useGLTF, useAnimations } from '@react-three/drei';
import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '@/game/state/game-store';
import type { HeroAction } from './glb-hero';
import { heldKindFor, selectedItemId } from './held-weapon';
import { retargetTwist } from './mixamo-retarget';

/**
 * Herói com rig **Mixamo** (ex.: Survivor Red do Meshy — que rigga via Mixamo).
 * Diferente do `GlbHero` (rig Unreal/UAL): aqui o mesh e os clips são do MESMO
 * esqueleto Mixamo (`mixamorig:*`), então as animações encaixam direto, sem
 * retarget. Cada clip vem de um GLB próprio (Mixamo exporta 1 por arquivo).
 * Mesma interface do `GlbHero` (`actionRef`/`speedRef`/`weapon`) p/ trocar fácil.
 */
// Preview local do novo herói Meshy; os clips Mixamo existentes continuam iguais.
const RED_URL = '/models/red/hero-preview.glb';
const CLIP_URL: Record<string, string> = {
  idle: '/models/red/idle.glb',
  walk: '/models/red/walk.glb',
  run: '/models/red/run.glb',
  attack: '/models/red/attack.glb',
  attackBow: '/models/red/attack_bow.glb',
  // Pistola/rifle: disparo de rifle (Mixamo Shooter Pack) — antes usavam a anim do ARCO.
  attackGun: '/models/red/attack_gun.glb',
  jump: '/models/red/jump.glb',
};
/** O mesh do Meshy traz o nó `target_character` com rotX −90° (Z-up), mas os clips
 *  Mixamo são Y-up → a anim DEITA o herói. Cancela com +90° X num wrapper (fora do
 *  esqueleto, não distorce o skinning). Y afina a planta dos pés no chão. */
const STAND_FIX_X = 0;
const STAND_FIX_Y = 0;
/** Velocidade do clip de ataque (combo Mixamo é longo → acelera p/ fechar a janela). */
const ATTACK_SPEED = 1.5;
/** Distância² (m²) além da qual o raider PARA de animar e de lançar sombra
 *  (perf: numa horda, o maior ganho — longe ninguém nota). */
const ACTIVE_D2 = 40 * 40;
const tmpHeroV = new THREE.Vector3();

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

/** Bounding box REAL pós-esqueleto (o que de fato renderiza). Ao contrário da caixa
 *  por geometria, é imune à escala "assada" no bind: exports Blender deixam o
 *  esqueleto sob um nó em escala 0.01 que o SKINNING ignora na tela mas a caixa de
 *  geometria NÃO — então a bind reporta ~0.016 m para um herói de 1.63 m. Amostra os
 *  vértices já posicionados pelos ossos. */
function measureSkinnedBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    const pos = sm.geometry?.attributes?.['position'] as THREE.BufferAttribute | undefined;
    if (sm.isSkinnedMesh && pos) {
      const step = Math.max(1, Math.floor(pos.count / 2000)); // amostra p/ custo baixo
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        sm.applyBoneTransform(i, v);
        v.applyMatrix4(sm.matrixWorld);
        box.expandByPoint(v);
      }
    }
  });
  return box;
}

/** Zera o deslocamento horizontal (root motion) do Hips → não desliza pelo mapa
 *  (o movimento quem dirige é a lógica do jogo). Mantém o Y (pulinho natural).
 *  `fixHipsY` (só herói Blender): fixa o Y do quadril no valor do bind — os clips
 *  vêm de OUTRO esqueleto e trazem um Y que afunda o corpo neste; fixar no bind
 *  mantém a altura certa com a animação rodando (perde só o leve pulinho). */
function stripRootMotion(clip: THREE.AnimationClip, fixHipsY: number | null = null): THREE.AnimationClip {
  for (const track of clip.tracks) {
    if (/Hips\.position$/i.test(track.name)) {
      const v = track.values;
      for (let i = 0; i + 2 < v.length; i += 3) {
        v[i] = 0; v[i + 2] = 0;
        if (fixHipsY !== null) v[i + 1] = fixHipsY;
      }
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
  runSync = 0.26,
  standFixX = STAND_FIX_X,
  rangedAttack = false,
  forceBow = false,
  gripScale = 1,
  gripPos = [0.04, 0.04, 0.08],
  gripRot = [0, Math.PI / 2, Math.PI / 2],
  heldItemOf,
  twistFix,
}: {
  actionRef: React.MutableRefObject<HeroAction>;
  speedRef?: React.MutableRefObject<number>;
  weapon?: ReactNode;
  /** Item na mão de OUTRO jogador (online) p/ escolher a anim de ataque; sem ele, o local. */
  heldItemOf?: () => string | null;
  /** Corrige o giro dos ossos (ver `mixamo-retarget.ts`). Padrão: só o herói. */
  twistFix?: boolean;
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
  const attackGunG = useGLTF(CLIP_URL['attackGun']!);
  const jumpG = useGLTF(CLIP_URL['jump']!);

  const cloned = useMemo(() => {
    const c = skeletonClone(scene);
    if (autoHeight) {
      c.updateMatrixWorld(true);
      // A caixa por geometria (bind) é enganada quando o export "assa" uma escala no
      // esqueleto (Blender 0.01): ela reporta ~0.016 m, mas o SKINNING renderiza
      // 1.63 m. A caixa skinned mede o que de fato aparece. Usamos a skinned SÓ
      // quando a bind está claramente mentindo (razão de altura muito fora de 1);
      // para modelos normais (escala ~1: raiders FBX, red.glb) as duas batem e
      // mantemos a bind → comportamento idêntico ao original (zero regressão).
      const bindBox = measureGeoBox(c);
      const bindH = bindBox.max.y - bindBox.min.y || 1;
      const skBox = measureSkinnedBox(c);
      const skH = skBox.max.y - skBox.min.y;
      const fooled = skH > 1e-4 && Math.abs(Math.log(skH / bindH)) > 0.5;
      const h = fooled ? skH : bindH;
      c.scale.setScalar(autoHeight / h);
      c.updateMatrixWorld(true);
      const b2 = fooled ? measureSkinnedBox(c) : measureGeoBox(c);
      c.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
      // Modelos "fooled" (export Blender) usam clips feitos p/ OUTRO esqueleto; a
      // pose idle real pode deslocar o corpo verticalmente vs. o bind medido aqui.
      // Marca p/ o useFrame reassentar os pés uma vez, já com a animação rodando.
      c.userData['fooled'] = fooled;
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
    // Só modelos "fooled" (herói Blender) fixam o Y do quadril no bind; raiders/red
    // (fooled=false) mantêm o comportamento original (Y do clip + pulinho).
    const fooled = cloned.userData['fooled'] === true;
    let fixHipsY: number | null = null;
    if (fooled) {
      cloned.traverse((o) => {
        if (fixHipsY === null && /hips$/i.test(o.name.replace(/[^a-z]/gi, ''))) {
          fixHipsY = (o as THREE.Bone).position.y;
        }
      });
    }
    // Os ossos têm outro "rolo" que o esqueleto dos clips e a cópia direta girava coxas/tronco
    // ~180° → cintura "embrulhada". Ligado no herói e nos raiders onde a medição nos GLB reais
    // (`mixamo-retarget.test.ts`) prova que nunca piora (`twistFix`).
    const fixTwist = twistFix ?? charUrl === RED_URL;
    const mk = (g: { animations: THREE.AnimationClip[]; scene: THREE.Object3D }, name: string): THREE.AnimationClip | null => {
      const src = g.animations[0];
      if (!src) return null;
      let a = src.clone();
      a.name = name;
      a.tracks = a.tracks.filter((t) => boneNames.has(t.name.split('.')[0] ?? ''));
      if (fixTwist) a = retargetTwist(a, g.scene, cloned, standFixX);
      return stripRootMotion(a, fixHipsY);
    };
    return [mk(idleG, 'idle'), mk(walkG, 'walk'), mk(runG, 'run'), mk(attackG, 'attack'), mk(attackBowG, 'attackBow'), mk(attackGunG, 'attackGun'), mk(jumpG, 'jump')]
      .filter((c): c is THREE.AnimationClip => c != null);
  }, [idleG, walkG, runG, attackG, attackBowG, attackGunG, jumpG, boneNames, cloned, charUrl, standFixX, twistFix]);

  const { actions, mixer } = useAnimations(clips, inner);
  const current = useRef<HeroAction | null>(null);
  /** Qual clip de ataque está tocando ('attack' combo ou 'attackBow'). */
  const playingAtk = useRef<string>('attack');
  /** Malhas (p/ alternar sombra) + estado de proximidade (perf: gate por distância). */
  const meshes = useRef<THREE.Mesh[]>([]);
  const active = useRef(true);

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
    const list: THREE.Mesh[] = [];
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        list.push(m);
        if (m.geometry && !m.geometry.userData['_inflated']) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= 1.8;
          m.geometry.userData['_inflated'] = true;
        }
      }
    });
    meshes.current = list;
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
    // PERF: longe do player → pausa o mixer + tira sombra e nem processa o estado.
    const g = inner.current;
    if (g) {
      g.getWorldPosition(tmpHeroV);
      const p = useGameStore.getState().player.position;
      const near = (p.x - tmpHeroV.x) * (p.x - tmpHeroV.x) + (p.z - tmpHeroV.z) * (p.z - tmpHeroV.z) < ACTIVE_D2;
      if (near !== active.current) {
        active.current = near;
        for (const m of meshes.current) m.castShadow = near;
        if (mixer) mixer.timeScale = near ? 1 : 0;
      }
      if (!near) return;
    }

    const want = actionRef.current;

    // Ataque POR ARMA (só o player): arma de longe → anim de arco; mão → combo.
    // Raiders (rangedAttack=false) sempre usam o combo. 'playingAtk' = clip em curso.
    let atkName = 'attack';
    if (forceBow && actions['attackBow']) {
      atkName = 'attackBow'; // arqueiro/xamã: só ataca de longe
    } else if (rangedAttack && actions['attackBow']) {
      const kind = heldKindFor(heldItemOf ? heldItemOf() : selectedItemId(useGameStore.getState()));
      if (kind === 'bow') atkName = 'attackBow';
      else if (kind === 'pistol' || kind === 'rifle') atkName = actions['attackGun'] ? 'attackGun' : 'attackBow';
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

  // O grip é filho do osso da mão, cuja escala de MUNDO ainda inclui o 0.01 do
  // esqueleto (~0.012 no modelo Blender, ~1 no FBX). Dividir por essa escala real
  // do osso mantém gripPos/gripScale em METROS consistentes — sem isso a arma do
  // modelo Blender renderiza ~100x menor (some da mão).
  const gripNorm = useMemo(() => {
    if (!handBone) return 1;
    cloned.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    handBone.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    return 1 / (Math.abs(s.x) || 1);
  }, [cloned, handBone]);

  return (
    <group ref={inner} rotation={[0, yaw, 0]} scale={scale}>
      {/* Wrapper que "levanta" o herói (cancela o -90° X do rig Meshy FBX). */}
      <group rotation={[standFixX, 0, 0]} position={[0, STAND_FIX_Y, 0]}>
        <primitive object={cloned} />
      </group>
      {weapon && handBone
        ? createPortal(
            <group
              position={[gripPos[0] * gripNorm, gripPos[1] * gripNorm, gripPos[2] * gripNorm]}
              rotation={gripRot}
              scale={gripScale * gripNorm}
            >
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
useGLTF.preload(CLIP_URL['attackGun']!);
useGLTF.preload(CLIP_URL['jump']!);
