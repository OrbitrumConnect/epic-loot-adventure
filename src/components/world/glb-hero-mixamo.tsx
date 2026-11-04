import { useGLTF } from '@react-three/drei';
import { animEvery, useLodAnimations } from './anim-lod';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGameStore } from '@/game/state/game-store';
import type { HeroAction } from './glb-hero';
import { heldKindFor, selectedItemId } from './held-weapon';
import { poseToBind, retargetBind, retargetTwist, withoutHipsMotion } from './mixamo-retarget';
import { DODGE_CLIP_FROM, DODGE_CLIP_TO, DODGE_MS } from '@/game/systems/dodgeSystem';
import { createFootCache, footMinY, groundStep, nextGroundOffset } from './glb-creature';
import { hitStopScale } from './hit-stop';
import { extendKTX2, preloadKTX2GLTF, primeKTX2 } from './ktx2-gltf';
import { HERO_SKINS } from '@/game/data/hero-skins';

/** Clips já convertidos por (modelo, clip): a horda inteira usa o MESMO resultado (calcula 1×). */
const bindClipCache = new Map<string, THREE.AnimationClip>();
/** CACHE POR MODELO (30/10, Pedro: "o lag está aumentando" — perfil perto de acampamento: cada inimigo Mixamo que entrava
 *  na tela refazia o retarget "twist" das animações e media a malha ANIMADA vértice por vértice = 200 ms–1 s por inimigo).
 *  O resultado é IGUAL pra todos do mesmo modelo (mesmo GLB, mesma correção) → calcula 1×, reaproveita. Só inimigos
 *  (o herói monta 1× e tem clips extras que mudam por ação). */
const twistClipCache = new Map<string, THREE.AnimationClip>();
type FitCache = { s: number; p: [number, number, number]; fooled: boolean; bodyLen: number };
const fitCache = new Map<string, FitCache>();
import {
  HERO_EXTRA_CLIPS, HIT_CLIPS, HIT_REACT_GAP_S, SIDE_SUSTAIN_S, SLASH_COMBO, localMoveDir, moveClipFor,
  upperBodyOnly, type HeroExtraClip, type MoveDir,
  ATTACK_UPPER_WEIGHT, CROUCH_CLIPS, CROUCH_WALK_CLIP_SPEED, attackUpperFor, crouchClipFor, isCrouchAction, jumpClipFor, lowerPlusUpper, scaleHipsTo,
} from './hero-moves';
import { inflateBounds } from './skinned-bounds';
import { nightFactor } from '@/game/systems/dayNightSystem';

/**
 * BRILHO DA NOITE (03/11, Pedro: "personagem e a índia meio escuros à noite; a heroína também — clareia levemente o que
 * precisa, sem ficar tosco"; "a Couraça bem mais clara que o herói à noite"). Medido: TODOS os modelos antigos (Couraça,
 * Pântano, pirata, arqueiro, brutamontes, Fúngico, o herói de antes) têm mapa de BRILHO PRÓPRIO a 100% — à noite ficam
 * claros como de dia; TODOS os do Meshy (as 3 skins, Feiticeira, Indígena, Canibal, Kraken) não têm nenhum — à noite só
 * a luz fraca. Nos que NÃO têm, a própria textura vira um brilho que SÓ aparece à noite (dia = 0: o visual de dia, já
 * aprovado, não muda) e sobe com o escurecer. Ligado 1× ao carregar; depois só a intensidade muda (uniforme — sem
 * recompilar shader, regra anti-lag de 30/10). Os antigos não mudam (já têm o deles).
 */
export const NIGHT_GLOW = { max: 0.3 }; // medido 03/11 (herói à noite, brilho médio): 23 → 38 (dia 59); 0,5 já esbranquiça o cabelo
const nightGlowMats = new Map<THREE.MeshStandardMaterial, number>(); // material → quantas cópias usam
let glowStamp = -1;
/** 1× por quadro (o 1º boneco que desenhar): intensidade = máx × noite. */
export function tickNightGlow(t: number): void {
  if (t === glowStamp || nightGlowMats.size === 0) return;
  glowStamp = t;
  const k = NIGHT_GLOW.max * nightFactor();
  for (const m of nightGlowMats.keys()) m.emissiveIntensity = k;
}
/** Liga o brilho da noite nos materiais com cor e SEM brilho próprio; devolve os que entraram (pra soltar ao sair). */
export function addNightGlow(mats: THREE.Material[]): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  for (const mat of mats) {
    const sm = mat as THREE.MeshStandardMaterial;
    if (!sm.isMeshStandardMaterial || !sm.map) continue;
    if (!nightGlowMats.has(sm)) {
      // modelo antigo: já tem o brilho dele (o nosso fica marcado — remontar o boneco não confunde)
      if (sm.emissiveMap && !sm.userData['nightGlow']) continue;
      if (!sm.userData['nightGlow']) { sm.emissiveMap = sm.map; sm.emissive.setRGB(1, 1, 1); sm.userData['nightGlow'] = true; sm.needsUpdate = true; }
      sm.emissiveIntensity = NIGHT_GLOW.max * nightFactor();
    }
    nightGlowMats.set(sm, (nightGlowMats.get(sm) ?? 0) + 1);
    out.push(sm);
  }
  return out;
}
export function dropNightGlow(mats: THREE.MeshStandardMaterial[]): void {
  for (const m of mats) { const n = (nightGlowMats.get(m) ?? 1) - 1; if (n <= 0) nightGlowMats.delete(m); else nightGlowMats.set(m, n); }
}
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __nightGlow?: unknown }).__nightGlow = NIGHT_GLOW; // testes de tela

const EXTRA_KEYS = Object.keys(HERO_EXTRA_CLIPS) as HeroExtraClip[];
const EXTRA_URLS = EXTRA_KEYS.map((k) => HERO_EXTRA_CLIPS[k]);
/** Peso das camadas "só metade de cima" sobre a locomoção (soma normalizada no mixer):
 *  golpe 1,5 → ~60% (um tranco, não trava); gesto de poder 3 → ~75%. */
const HIT_WEIGHT = 1.5;
const CAST_WEIGHT = 3;

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
  // MORTE (Pedro 26/10, baixados do Mixamo): cai de costas (herói/acampamento) e "Mutant Dying" (Couraça e grandões).
  deathBack: '/models/red/death_back.glb',
  deathMutant: '/models/red/death_mutant.glb',
  // ESQUIVA (Pedro 26/10, Mixamo "Falling To Roll"): toca só o rolamento (dodgeSystem: 0,1 → 1,4 s) em ~1 s.
  dodge: '/models/red/dodge_roll.glb',
};
export type DeathClip = 'back' | 'mutant';
/** Quando o corpo ENCOSTA no chão em cada clip (s, medido no esqueleto do Mixamo: costas 0,9 · Mutant 2,3 — este
 *  cambaleia antes). Pedro 26/10: "cair e ficar 0,3 s no máx, rapidinho, e some" → o clip toca mais rápido
 *  (`DEATH_SPEED`) e o corpo some 0,3 s depois de encostar (`DEATH_LIE_S` em raider.tsx). */
export const DEATH_GROUND_S: Record<DeathClip, number> = { back: 0.9, mutant: 2.3 };
export const DEATH_SPEED: Record<DeathClip, number> = { back: 1.5, mutant: 2 };
/** Segundos (no jogo) até o corpo encostar no chão: costas 0,6 · Mutant 1,15. */
export function deathGroundTime(c: DeathClip): number { return DEATH_GROUND_S[c] / DEATH_SPEED[c]; }
/** O mesh do Meshy traz o nó `target_character` com rotX −90° (Z-up), mas os clips
 *  Mixamo são Y-up → a anim DEITA o herói. Cancela com +90° X num wrapper (fora do
 *  esqueleto, não distorce o skinning). Y afina a planta dos pés no chão. */
const STAND_FIX_X = 0;
const STAND_FIX_Y = 0;
/** Caminhada Mixamo (`red/walk.glb`, medido 25/10): 1,787 m em 1 s com corpo cabeça→dedão de 1,512 m →
 *  cobre 1,182 "corpos" por segundo no ritmo normal. timeScale = velocidade real ÷ (isso × corpo). */
export const WALK_BODYLEN_PER_S = 1.182;
/** Velocidade do clip de ataque (combo Mixamo é longo → acelera p/ fechar a janela). */
const ATTACK_SPEED = 1.5;
/** Distância² (m²) além da qual o raider PARA de animar e de lançar sombra
 *  (perf: numa horda, o maior ganho — longe ninguém nota). */
const ACTIVE_D2 = 40 * 40;
/** Quadros de re-medição rápida do chão após trocar de clip (~0,6 s a 60 fps). */
export const GROUND_FAST_FRAMES = 36;
const tmpHeroV = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
// rascunho da mira do fuzil (03/11) — criados 1×, nunca por quadro
const tmpAimRootQ = new THREE.Quaternion(), tmpAimHandQ = new THREE.Quaternion(), tmpAimTgtQ = new THREE.Quaternion();
const tmpAimL = new THREE.Vector3(), tmpAimR = new THREE.Vector3(), tmpAimUp = new THREE.Vector3(), tmpAimX = new THREE.Vector3(), tmpAimM = new THREE.Matrix4();
const tmpAimD = new THREE.Vector3(), tmpAimF = new THREE.Vector3(), tmpAimFwd = new THREE.Vector3(), tmpAimPos = new THREE.Vector3(), tmpAimInv = new THREE.Matrix4();
/** Palma da mão a partir do pulso: + (pulso − cotovelo) × isto (o esqueleto não tem dedos) — ~6 cm num herói de 1,8 m. */
export const PALM_K = 0.28;

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

/**
 * ESQUIVA (26/10): o quadril PRECISA descer no rolamento, então não dá pra travar o Y (como nos clips normais do herói
 * "fooled"). Escala a descida na proporção do modelo: altura em pé do clip (no fim do rolamento) → standY do modelo.
 * Sem standY (modelos comuns) fica como veio — igual aos outros clips deles. Trabalha numa CÓPIA (nunca no cache).
 */
export function scaleHipsDrop(clip: THREE.AnimationClip, standY: number | null): THREE.AnimationClip {
  if (standY === null) return clip;
  const out = clip.clone();
  const tr = out.tracks.find((t) => /Hips\.position$/i.test(t.name));
  if (!tr) return out;
  const times = tr.times, v = tr.values;
  let k = times.length - 1;
  for (let i = 0; i < times.length; i++) if (times[i]! >= DODGE_CLIP_TO) { k = i; break; }
  const clipStand = v[k * 3 + 1]!;
  if (!Number.isFinite(clipStand) || Math.abs(clipStand) < 1e-6) return out;
  const s = standY / clipStand;
  for (let i = 1; i < v.length; i += 3) v[i] = v[i]! * s;
  return out;
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
  forceGun = false,
  deathClip = 'back',
  gripScale = 1,
  gripPos = [0.04, 0.04, 0.08],
  gripRot = [0, Math.PI / 2, Math.PI / 2],
  heldItemOf,
  hpOf,
  twistFix,
  bindFix = false,
  autoGround = false,
  strideSync = false,
  customClips,
  customClipCut,
  preview = false,
  baseClips,
  attackSpeed = ATTACK_SPEED,
  handFix,
  tone,
}: {
  /** Rotação do SUPORTE da arma na mão (skin do herói com outros eixos de mão — hero-skins.ts). Sem isto: como sempre. */
  handFix?: [number, number, number, number];
  /** Clareia a cor do corpo (× na cor do material; absoluto, não acumula). Sem isto: a cor do arquivo. */
  tone?: number;
  /** VITRINE (ficha do personagem, 29/10): sempre "perto" — animação cheia, sem LOD pela distância do jogador. */
  preview?: boolean;
  /** Troca o ARQUIVO das animações básicas (03/11, chefes de onda: parado/andar/correr/golpe de MUTANTE). Sem isto: as de
   *  sempre (herói e raiders iguais). */
  baseClips?: Partial<Record<'idle' | 'walk' | 'run' | 'attack', string>>;
  /** Velocidade do golpe (padrão 1,5 — o combo do Mixamo acelerado). Kraken: lento e pesado (03/11). */
  attackSpeed?: number;
  /** Vida de OUTRO jogador (online) p/ a reação de golpe; sem ela, a vida do jogador local. */
  hpOf?: () => number;
  actionRef: React.MutableRefObject<HeroAction>;
  speedRef?: React.MutableRefObject<number>;
  weapon?: ReactNode;
  /** Item na mão de OUTRO jogador (online) p/ escolher a anim de ataque; sem ele, o local. */
  heldItemOf?: () => string | null;
  /** Corrige o giro dos ossos (ver `mixamo-retarget.ts`). Padrão: só o herói. */
  twistFix?: boolean;
  /** Raiders cujo esqueleto veio salvo FORA da pose da pele (Couraça, Fúngico): anima a partir da
   *  pose de ligação + retarget pelo mundo (`retargetBind`). Substitui o `twistFix`. */
  bindFix?: boolean;
  /** Assenta pela malha ANIMADA (ponto mais baixo no chão), igual aos bichos (`GlbCreature`). Couraça
   *  (Pedro, 25/10): andava com metade do corpo dentro do mapa. */
  autoGround?: boolean;
  /** A caminhada acompanha a velocidade REAL e o tamanho do corpo (sem patinar). Couraça/Fúngico (Pedro 25/10). */
  strideSync?: boolean;
  /** CLIPS EXTRAS por nome de ação → URL do GLB do Mixamo (Zona Sul, 28/10: dirigir, abrir a porta, nadar, boiar).
   *  Tocam em loop quando `actionRef` = o nome, com o quadril LIVRE (sentado/deitado na água). Sem isto (o jogo de
   *  sempre): nada muda. */
  customClips?: Record<string, string>;
  /** CORTE de um clip extra (fração 0..1 do clip) e velocidade — Zona Sul, 28/10: "o Zombie Stand Up só levanta direito
   *  depois de 30%; a pose final é boa (meio surfista)". Ex.: { popup: { from: 0.3, speed: 2 }, surf: { from: 0.96 } }.
   *  Sem isto: o clip inteiro, como antes. */
  customClipCut?: Record<string, { from?: number; to?: number; speed?: number;
    /** RITMO pela velocidade real (Zona Sul 29/10: "remar parece câmera lenta"): timeScale = velocidade × sync,
     *  entre syncMin e syncMax. Sem isto: velocidade fixa (`speed`). */
    sync?: number; syncMin?: number; syncMax?: number;
    /** quadril na altura NORMAL (como andar) em vez de livre — anim EM PÉ que desce o quadril (Zona Sul 29/10: "ao
     *  abrir a porta do veículo a animação fica metade abaixo do chão"). */
    fixHips?: boolean }>;
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
  /** Atirador (pirata de acampamento): todo ataque usa o clip de TIRO (sem os extras do jogador). */
  forceGun?: boolean;
  /** Clip de MORTE (acionado por actionRef = 'death'): cai de costas ou "Mutant Dying" (grandões). */
  deathClip?: DeathClip;
  gripScale?: number;
  gripPos?: [number, number, number];
  gripRot?: [number, number, number];
}) {
  const inner = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);
  primeKTX2(gl);
  const { scene } = useGLTF(charUrl, true, true, extendKTX2);
  const idleUrl = baseClips?.idle ?? CLIP_URL['idle']!, walkUrl = baseClips?.walk ?? CLIP_URL['walk']!;
  const runUrl = baseClips?.run ?? CLIP_URL['run']!, attackUrl = baseClips?.attack ?? CLIP_URL['attack']!;
  const idleG = useGLTF(idleUrl);
  const walkG = useGLTF(walkUrl);
  const runG = useGLTF(runUrl);
  const attackG = useGLTF(attackUrl);
  const attackBowG = useGLTF(CLIP_URL['attackBow']!);
  const attackGunG = useGLTF(CLIP_URL['attackGun']!);
  const jumpG = useGLTF(CLIP_URL['jump']!);
  const deathG = useGLTF(CLIP_URL[deathClip === 'mutant' ? 'deathMutant' : 'deathBack']!);
  const dodgeG = useGLTF(CLIP_URL['dodge']!);
  // Extras do jogador (strafe/costas, golpe, gesto de poder, combo de espada) — ~700 KB, 1 vez.
  const extraG = useGLTF(EXTRA_URLS) as unknown as { animations: THREE.AnimationClip[]; scene: THREE.Object3D }[];
  // clips extras (opcional): sempre 1 chamada (a 1ª URL é o idle já carregado — sem extras não baixa nada a mais)
  const customKeys = useMemo(() => Object.keys(customClips ?? {}), [customClips]);
  const customUrls = useMemo(() => [CLIP_URL['idle']!, ...customKeys.map((k) => customClips![k]!)], [customKeys, customClips]);
  const customG = useGLTF(customUrls) as unknown as { animations: THREE.AnimationClip[]; scene: THREE.Object3D }[];

  const cloned = useMemo(() => {
    const c = skeletonClone(scene);
    if (bindFix) poseToBind(c); // antes de medir/escalar: raiz ainda na origem
    const fitKey = `${charUrl}|${autoHeight}|${bindFix}`;
    const fit = rangedAttack ? undefined : fitCache.get(fitKey);
    if (fit) { // mesmo modelo já medido: mesma escala/posição (sem medir a malha animada de novo)
      c.scale.setScalar(fit.s); c.position.set(fit.p[0], fit.p[1], fit.p[2]);
      c.userData['fooled'] = fit.fooled; c.userData['bodyLen'] = fit.bodyLen;
      c.updateMatrixWorld(true);
      return c;
    }
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
    // Comprimento cabeça→dedão (m, já na escala) — régua do passo (`strideSync`).
    c.updateMatrixWorld(true);
    let head: THREE.Object3D | undefined, toe: THREE.Object3D | undefined;
    c.traverse((o) => { if (/head$/i.test(o.name) && !head) head = o; if (/lefttoebase$/i.test(o.name) && !toe) toe = o; });
    c.userData['bodyLen'] = head && toe ? head.getWorldPosition(new THREE.Vector3()).distanceTo(toe.getWorldPosition(new THREE.Vector3())) : 0;
    if (!rangedAttack) fitCache.set(fitKey, { s: c.scale.x, p: [c.position.x, c.position.y, c.position.z], fooled: c.userData['fooled'] === true, bodyLen: c.userData['bodyLen'] as number });
    return c;
  }, [scene, autoHeight, bindFix, charUrl, rangedAttack]);

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
    // keepY: a MORTE precisa do quadril DESCENDO até o chão (fixHipsY travaria o corpo deitado no ar).
    // `srcTag` (03/11): só quando a animação básica foi TROCADA (baseClips) — entra na chave do cache (o resto: chave de antes)
    const mk = (g: { animations: THREE.AnimationClip[]; scene: THREE.Object3D }, name: string, keepY = false, srcTag = ''): THREE.AnimationClip | null => {
      const src = g.animations[0];
      if (!src) return null;
      let a = src.clone();
      a.name = name;
      a.tracks = a.tracks.filter((t) => boneNames.has(t.name.split('.')[0] ?? ''));
      if (bindFix) {
        const key = `${charUrl}|${name}|${standFixX}${keepY ? `|${deathClip}` : ''}${srcTag}`; // mesmo modelo, morte diferente (tropa × Brutamontes)
        let baked = bindClipCache.get(key);
        if (!baked) { baked = stripRootMotion(retargetBind(a, g.scene, cloned, standFixX, scene), keepY ? null : fixHipsY); bindClipCache.set(key, baked); }
        return baked;
      }
      if (fixTwist && !rangedAttack) {
        const key = `${charUrl}|${name}|${standFixX}|${keepY ? `y|${deathClip}` : String(fixHipsY)}${srcTag}`;
        let baked = twistClipCache.get(key);
        if (!baked) { baked = stripRootMotion(retargetTwist(a, g.scene, cloned, standFixX), keepY ? null : fixHipsY); twistClipCache.set(key, baked); }
        return baked;
      }
      if (fixTwist) a = retargetTwist(a, g.scene, cloned, standFixX);
      return stripRootMotion(a, keepY ? null : fixHipsY);
    };
    const tag = (k: 'idle' | 'walk' | 'run' | 'attack', u: string) => (baseClips?.[k] ? `|${u}` : '');
    const base = [mk(idleG, 'idle', false, tag('idle', idleUrl)), mk(walkG, 'walk', false, tag('walk', walkUrl)), mk(runG, 'run', false, tag('run', runUrl)), mk(attackG, 'attack', false, tag('attack', attackUrl)), mk(attackBowG, 'attackBow'), mk(attackGunG, 'attackGun'), mk(jumpG, 'jump'), (() => { const d = mk(deathG, 'death', true); return d && withoutHipsMotion(d); })(), (() => { const d = mk(dodgeG, 'dodge', true); return d && scaleHipsDrop(d, fixHipsY); })()];
    // Só JOGADORES (rangedAttack) ganham os extras; raiders ficam exatamente como antes.
    // AGACHAR (02/11): o quadril DESCE — clip com o Y livre, na escala do modelo (altura de pé do idle do Mixamo → a do
    // modelo); os outros extras seguem travados na altura de pé (como sempre).
    const idleStandY = rangedAttack ? (() => {
      const ik = mk(idleG, '_idleY', true);
      const tr = ik?.tracks.find((t) => /Hips\.position$/i.test(t.name));
      return tr ? tr.values[1]! : null;
    })() : null;
    const extra = rangedAttack
      ? EXTRA_KEYS.map((k, i) => {
          const crouchClip = (CROUCH_CLIPS as string[]).includes(k);
          let c = mk(extraG[i]!, k, crouchClip);
          if (c && crouchClip) c = scaleHipsTo(c, fixHipsY, idleStandY);
          return c && (k === 'cast' || (HIT_CLIPS as string[]).includes(k)) ? upperBodyOnly(c) : c;
        })
      : [];
    // PvP (02/11): agachado de FUZIL = pernas agachadas + tronco do "rifle aiming idle"; e a METADE DE CIMA de cada
    // ataque (tiro/flecha/corte) pra tocar por cima das pernas agachadas ou do pulo.
    const pvp: THREE.AnimationClip[] = [];
    if (rangedAttack) {
      const by = (n: string) => [...base, ...extra].find((c) => c?.name === n) ?? null;
      const aim = by('aimGunIdle'), ci = by('crouchIdle'), cw = by('crouchWalk');
      if (ci && aim) pvp.push(lowerPlusUpper(ci, aim, 'crouchIdleGun'));
      if (cw && aim) pvp.push(lowerPlusUpper(cw, aim, 'crouchWalkGun'));
      for (const [src, name] of [['attackGun', 'attackGunUp'], ['attackBow', 'attackBowUp'], ['slash1', 'slashUp']] as const) {
        const s = by(src);
        if (s) { const u = upperBodyOnly(s.clone()); u.name = name; pvp.push(u); }
      }
    }
    const custom = customKeys.map((k, i) => {
      const c = mk(customG[i + 1]!, k, !customClipCut?.[k]?.fixHips); // quadril livre (sentado / nadando), salvo fixHips
      const cut = customClipCut?.[k];
      if (!c || !cut || (cut.from == null && cut.to == null)) return c;
      const fps = 30, n = Math.round(c.duration * fps);
      const from = Math.round((cut.from ?? 0) * n), to = Math.max(from + 1, Math.round((cut.to ?? 1) * n));
      const sub = THREE.AnimationUtils.subclip(c, k, from, to, fps);
      return sub;
    });
    return [...base, ...extra, ...pvp, ...custom].filter((c): c is THREE.AnimationClip => c != null);
  }, [idleG, walkG, runG, attackG, attackBowG, attackGunG, jumpG, deathG, dodgeG, extraG, customKeys, customG, customClipCut, rangedAttack, boneNames, cloned, charUrl, standFixX, twistFix, bindFix]);

  // 26/10: animação por distância (anim-lod.ts) — herói/perto todo quadro (igual), inimigo longe com menos atualizações.
  const animEveryRef = useRef(1);
  // inimigo fora da câmera não anima (30/10); o herói (e a vitrine) sempre
  const { actions, mixer } = useLodAnimations(clips, inner, animEveryRef, !rangedAttack && !preview);
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
  // antebraços (palma = pulso + direção do antebraço — fuzil nas duas mãos, 03/11)
  const findBone = (suffix: string) => { let b: THREE.Object3D | undefined; cloned.traverse((o) => { if (!b && o.name.toLowerCase().replace(/[^a-z0-9]/g, '').endsWith(suffix)) b = o; }); return b; };
  const rightForeBone = useMemo(() => findBone('rightforearm'), [cloned]); // eslint-disable-line react-hooks/exhaustive-deps
  const leftForeBone = useMemo(() => findBone('leftforearm'), [cloned]); // eslint-disable-line react-hooks/exhaustive-deps
  // mão ESQUERDA (fuzil: o cano aponta pra ela no tiro — 03/11)
  const leftHandBone = useMemo(() => {
    let b: THREE.Object3D | undefined;
    cloned.traverse((o) => { if (!b && o.name.toLowerCase().replace(/[^a-z0-9]/g, '').endsWith('lefthand')) b = o; });
    return b;
  }, [cloned]);

  // LAYOUT (antes do 1º quadro): a esfera de corte do boneco precisa estar pronta quando ele aparece (30/10, lag)
  useLayoutEffect(() => {
    const list: THREE.Mesh[] = [];
    const mats: THREE.Material[] = [];
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        list.push(m);
        inflateBounds(m); // bolha inflada 1,8× — também a do corpo com esqueleto (03/11)
        // clarear (skin do herói, 03/11): valor ABSOLUTO na cor do material (o material é dividido entre as cópias — não acumula)
        if (tone) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) (mat as THREE.MeshStandardMaterial).color?.setScalar(tone);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.push(mat);
      }
    });
    meshes.current = list;
    const glow = addNightGlow(mats); // só os sem brilho próprio (Meshy); os antigos ficam como estão
    return () => dropNightGlow(glow);
  }, [cloned, tone]);

  // Garante que algo toca assim que os clips carregam (anti T-pose eterno).
  useEffect(() => {
    if (current.current) return;
    const a = actions['idle'] ?? actions['walk'];
    if (a) {
      a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
      current.current = 'idle';
    }
  }, [actions]);

  // Extras (jogadores): clip de locomoção em uso, combo de espada, direção do movimento
  // (velocidade medida pela própria posição — vale igual pro local e pro remoto) e camadas
  // "metade de cima" (golpe / gesto de poder).
  const playingLoco = useRef<string | null>(null);
  /** PvP (02/11): o clip de pulo em curso (o de sempre ou o de fuzil), o de agachado, e a camada de cima do ataque. */
  const playingJump = useRef<string>('jump');
  const playingCrouch = useRef<string | null>(null);
  const atkOv = useRef<string | null>(null);
  const combo = useRef(0);
  const lastPos = useRef<THREE.Vector3 | null>(null);
  const vel = useRef({ x: 0, z: 0 });
  // Velocidade real medida pela posição no mundo (raiders não passam speedRef) — p/ o `strideSync`.
  const stridePos = useRef<THREE.Vector3 | null>(null);
  const strideSpeed = useRef(0);
  const groundInit = useRef(false);
  const groundWant = useRef<HeroAction | null>(null);
  const groundFast = useRef(0);
  const groundBorn = useRef(0);
  const deathBaseY = useRef<number | null>(null); // altura do corpo antes de cair (volta ao reviver)
  const deathFrames = useRef(0); // quadros desde que nasceu (a 1ª medição PERTO não espera o espalhamento)
  const footCache = useRef(createFootCache());
  const sideDir = useRef<{ dir: MoveDir; t: number }>({ dir: 'fwd', t: 0 });
  const overlay = useRef<string | null>(null);
  const lastHp = useRef<number | null>(null);
  const lastHitAt = useRef(-Infinity);
  const lastCastSeen = useRef<number | null>(null);
  const clock = useRef(0);
  const groundAcc = useRef(-Math.floor(Math.random() * 30)); // espalha a 1ª medição (horda nascendo junta não trava)

  useFrame((st, rawDt) => {
    tickNightGlow(st.clock.elapsedTime); // brilho da noite dos modelos sem brilho próprio (1× por quadro no total)
    // PERF: longe do player → tira a SOMBRA. A animação segue (pausar congelava a pose e o raider deslizava
    // "bugado" de longe — Pedro 25/10; no three o mixer pausado é avaliado igual, não economizava).
    const g = inner.current;
    if (g) {
      g.getWorldPosition(tmpHeroV);
      const p = useGameStore.getState().player.position;
      const d2 = preview ? 0 : (p.x - tmpHeroV.x) * (p.x - tmpHeroV.x) + (p.z - tmpHeroV.z) * (p.z - tmpHeroV.z);
      animEveryRef.current = animEvery(d2);
      const near = d2 < ACTIVE_D2;
      if (near !== active.current) {
        active.current = near;
        for (const m of meshes.current) m.castShadow = near;
      }
      if (mixer) mixer.timeScale = hitStopScale(); // hit stop (crítico/abate)
      // TROCA DE CLIP (parado ↔ andando ↔ correndo): o pé do clip novo fica em outra altura e o ajuste lento (35% a
      // cada 0,3 s, pontos do pé da pose antiga) levava ~2 s → "Couraça sai do chão no início do move" (Pedro 26/10).
      // Agora: refaz os pontos do pé e re-mede RÁPIDO por ~0,6 s (a cada 3 quadros, 50%). Ataque não dispara (é curto).
      const wantNow = actionRef.current;
      if (autoGround && wantNow !== groundWant.current) {
        const loco = (a: HeroAction | null) => a === 'idle' || a === 'walk' || a === 'run';
        if (loco(wantNow) && loco(groundWant.current)) { groundFast.current = GROUND_FAST_FRAMES; footCache.current.picks.length = 0; }
        groundWant.current = wantNow;
      }
      const fast = groundFast.current > 0 && near && groundInit.current;
      if (groundFast.current > 0) groundFast.current--;
      // Força da medição (0 = não mede): troca de clip → rápida; nasceu PERTO → encaixa já; senão `groundStep`
      // (1ª ao nascer, 2ª depois do fade da animação, perto a cada 0,3 s, LONGE a cada ~2 s — 26/10).
      const born = autoGround && !groundInit.current && near && ++groundBorn.current >= 3;
      // MORTE (26/10): o clip vem sem a descida do quadril (`withoutHipsMotion`) → quem põe o corpo caído NO CHÃO é
      // o ponto mais baixo da malha (costas/ombro), pra QUALQUER modelo (herói também). Pontos refeitos a cada 4
      // medições (a pose muda muito na queda). Ao reviver volta pra altura de antes.
      const dying = wantNow === 'death';
      if (dying && deathBaseY.current === null) { deathBaseY.current = g.position.y; deathFrames.current = 0; }
      if (!dying && deathBaseY.current !== null) { g.position.y = deathBaseY.current; deathBaseY.current = null; footCache.current.picks.length = 0; }
      let step: number;
      if (dying) {
        const f = deathFrames.current++;
        if (f % 12 === 0) footCache.current.picks.length = 0;
        step = f % 3 === 0 ? 0.5 : 0;
      } else step = !autoGround ? 0 : fast ? (groundFast.current % 3 === 0 ? 0.5 : 0) : born ? 1 : groundStep(groundInit.current, ++groundAcc.current, near);
      if (g.parent && step > 0) {
        g.parent.getWorldPosition(tmpHeroV); // a raiz do raider fica no chão (IA)
        g.updateWorldMatrix(true, true);
        // 1ª medição ENCAIXA na hora (antes subia suave ~1,5 s e parecia "brotar do chão" — Pedro 25/10).
        g.position.y = nextGroundOffset(g.position.y, footMinY(g, footCache.current), tmpHeroV.y, step);
        groundInit.current = true;
      }
    }

    const want = actionRef.current;
    const dt = Math.min(rawDt, 0.1);
    clock.current += dt;
    const extras = rangedAttack && !!actions['slash1'];

    // Direção do movimento em relação a pra onde ele OLHA (mirando ele anda de lado/de costas).
    // Só troca depois de SIDE_SUSTAIN_S — a virada normal do corpo não pisca strafe.
    if (extras && g && dt > 0) {
      g.getWorldPosition(tmpHeroV);
      if (!lastPos.current) lastPos.current = tmpHeroV.clone();
      const k = Math.min(1, dt * 10);
      vel.current.x += ((tmpHeroV.x - lastPos.current.x) / dt - vel.current.x) * k;
      vel.current.z += ((tmpHeroV.z - lastPos.current.z) / dt - vel.current.z) * k;
      lastPos.current.copy(tmpHeroV);
      const yaw = tmpEuler.setFromQuaternion(g.getWorldQuaternion(tmpQuat), 'YXZ').y;
      const raw = Math.hypot(vel.current.x, vel.current.z) > 0.3 ? localMoveDir(vel.current.x, vel.current.z, yaw) : 'fwd';
      if (raw === 'fwd') sideDir.current = { dir: 'fwd', t: 0 };
      else if (raw === sideDir.current.dir) sideDir.current.t += dt;
      else sideDir.current = { dir: raw, t: 0 };
    }
    const moveDir: MoveDir = sideDir.current.t >= SIDE_SUSTAIN_S ? sideDir.current.dir : 'fwd';

    // MORTE (Pedro 26/10): cai UMA vez e FICA caído (preso no último quadro). Ao renascer o estado sai de 'death' e
    // o fluxo normal abaixo apaga o clip de morte (fadeOut pelo nome) e volta pro parado/andar.
    if (want === 'death') {
      if (current.current !== 'death') {
        const d = actions['death'];
        for (const k in actions) { const a = actions[k]; if (a && a !== d && a.isRunning()) a.fadeOut(0.15); }
        overlay.current = null;
        if (d) { d.reset(); d.timeScale = DEATH_SPEED[deathClip]; d.setLoop(THREE.LoopOnce, 1); d.clampWhenFinished = true; d.fadeIn(0.12).play(); }
        current.current = 'death';
        playingLoco.current = null;
      }
      return;
    }

    // Camadas "metade de cima": GESTO ao lançar poder (local) e TRANCO ao tomar golpe.
    if (extras) {
      const st = useGameStore.getState();
      const ov = overlay.current ? actions[overlay.current] : null;
      if (ov && (!ov.isRunning() || ov.time >= ov.getClip().duration - 0.2 || current.current === 'attack')) {
        ov.fadeOut(0.2);
        overlay.current = null;
      }
      const playOverlay = (name: string, w: number) => {
        const a = actions[name];
        if (!a) return;
        if (overlay.current && overlay.current !== name) actions[overlay.current]?.fadeOut(0.1);
        a.reset();
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
        a.setEffectiveWeight(w);
        a.fadeIn(0.08).play();
        overlay.current = name;
      };
      if (!heldItemOf) {
        const castAt = Math.max(st.lastArrowRainAt, ...Object.values(st.heroPowers.lastAt));
        if (lastCastSeen.current !== null && castAt > lastCastSeen.current && current.current !== 'attack') playOverlay('cast', CAST_WEIGHT);
        lastCastSeen.current = castAt;
      }
      const hp = hpOf ? hpOf() : st.player.hp;
      if (lastHp.current !== null && hp < lastHp.current && hp > 0
        && clock.current - lastHitAt.current >= HIT_REACT_GAP_S
        && current.current !== 'attack' && overlay.current !== 'cast') {
        lastHitAt.current = clock.current;
        playOverlay(HIT_CLIPS[Math.floor(Math.random() * HIT_CLIPS.length)]!, HIT_WEIGHT);
      }
      lastHp.current = hp;
    }

    // Ataque POR ARMA (só o player): arma de longe → anim de arco; mão → combo.
    // Raiders (rangedAttack=false) sempre usam o combo. 'playingAtk' = clip em curso.
    // Jogador com espada/mão: COMBO de 3 cortes curtos (Sword&Shield) em vez do combo longo.
    let atkName = extras ? SLASH_COMBO[combo.current % SLASH_COMBO.length]! : 'attack';
    if (forceBow && actions['attackBow']) {
      atkName = 'attackBow'; // arqueiro/xamã: só ataca de longe
    } else if (forceGun && actions['attackGun']) {
      atkName = 'attackGun'; // pirata atirador de acampamento
    } else if (rangedAttack && actions['attackBow']) {
      const kind = heldKindFor(heldItemOf ? heldItemOf() : selectedItemId(useGameStore.getState()));
      if (kind === 'bow') atkName = 'attackBow';
      else if (kind === 'pistol' || kind === 'rifle') atkName = actions['attackGun'] ? 'attackGun' : 'attackBow';
    }

    // Clip que está REALMENTE tocando num estado (attack usa o playingAtk; pulo/agachado, o clip escolhido — 02/11).
    const clipOf = (st: HeroAction | null): string | null =>
      st === 'attack' ? playingAtk.current : (st === 'walk' || st === 'run' || st === 'idle') && playingLoco.current ? playingLoco.current
        : st === 'jump' || st === 'jump_shoot' ? playingJump.current
        : isCrouchAction(st) && playingCrouch.current ? playingCrouch.current : st;
    // PvP (02/11): arma na mão (pulo/agachado de fuzil e a metade de cima do ataque)
    const heldKind = extras ? heldKindFor(heldItemOf ? heldItemOf() : selectedItemId(useGameStore.getState())) : null;
    const gunHeld = heldKind === 'pistol' || heldKind === 'rifle';
    const curClipName = clipOf(current.current);
    const playing = curClipName ? actions[curClipName] : null;
    const playDur = playing?.getClip().duration ?? 0;
    const atkFinished = !playing || !playing.isRunning() || playing.time >= playDur - 0.02;

    // ESQUIVA (oneshot, dodgeSystem): CORTA o ataque (vem antes da regra abaixo); só o trecho do rolamento, em ~1 s.
    const ddg = actions['dodge'];
    if (want === 'dodge' && ddg) {
      if (current.current !== 'dodge') {
        if (curClipName && actions[curClipName]) actions[curClipName]!.fadeOut(0.08);
        ddg.reset();
        ddg.setLoop(THREE.LoopOnce, 1);
        ddg.clampWhenFinished = true;
        ddg.time = DODGE_CLIP_FROM;
        ddg.timeScale = (DODGE_CLIP_TO - DODGE_CLIP_FROM) / (DODGE_MS / 1000);
        ddg.fadeIn(0.06).play();
        current.current = 'dodge';
        playingLoco.current = null;
      }
      return;
    }

    // ATAQUE POR CIMA (02/11 — agachado atirando / atirando no ar): só a metade de cima do ataque, de novo a cada tiro
    // enquanto a ação pedir; as pernas seguem agachadas / no pulo. Saiu da ação: o tiro em curso termina e some.
    if (extras) {
      const wantUp = want === 'crouch_attack' || want === 'jump_shoot';
      const upName = attackUpperFor(gunHeld ? 'gun' : heldKind === 'bow' ? 'bow' : 'melee');
      const cur = atkOv.current ? actions[atkOv.current] : null;
      const done = !cur || !cur.isRunning() || cur.time >= cur.getClip().duration - 0.02;
      if (wantUp && actions[upName] && (done || atkOv.current !== upName)) {
        const a = actions[upName]!;
        if (cur && cur !== a) cur.fadeOut(0.08);
        a.reset();
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
        a.timeScale = ATTACK_SPEED;
        a.setEffectiveWeight(ATTACK_UPPER_WEIGHT);
        a.fadeIn(0.06).play();
        atkOv.current = upName;
      } else if (!wantUp && cur && (done || want === 'attack')) { cur.fadeOut(0.12); atkOv.current = null; }
    }

    // ATAQUE NÃO É CORTADO: enquanto o clip toca, não troca (termina 100% mesmo
    // que o bicho morra no meio e o estado volte pra idle/walk).
    if (current.current === 'attack' && !atkFinished) return;

    // (Re)dispara o ataque quando pedido e não há ataque rolando.
    if (want === 'attack') {
      const atk = actions[atkName];
      if (atk && (current.current !== 'attack' || atkFinished)) {
        if (curClipName && curClipName !== atkName && actions[curClipName]) actions[curClipName]!.fadeOut(0.1);
        atk.reset();
        atk.timeScale = attackSpeed; // padrão ATTACK_SPEED (1,5); Kraken mais lento (03/11)
        atk.setLoop(THREE.LoopOnce, 1);
        atk.clampWhenFinished = true;
        atk.fadeIn(0.08).play();
        current.current = 'attack';
        playingAtk.current = atkName;
        playingLoco.current = null;
        if ((SLASH_COMBO as string[]).includes(atkName)) combo.current++;
      }
      return;
    }

    // PULO (oneshot): toca ao sair do chão; segura o último frame até pousar. 02/11: com fuzil/pistola o PULO DE FUZIL
    // (pra trás se vinha de costas); atirando no ar ('jump_shoot') o pulo segue e o tiro vai por cima (acima).
    const jumpName = extras && actions[jumpClipFor(gunHeld, moveDir)] ? jumpClipFor(gunHeld, moveDir) : 'jump';
    const jmp = actions[jumpName];
    if ((want === 'jump' || want === 'jump_shoot') && jmp) {
      if (current.current !== 'jump' && current.current !== 'jump_shoot') {
        if (curClipName && actions[curClipName]) actions[curClipName]!.fadeOut(0.1);
        jmp.reset();
        jmp.setLoop(THREE.LoopOnce, 1);
        jmp.clampWhenFinished = true;
        jmp.fadeIn(0.08).play();
        playingJump.current = jumpName;
        playingLoco.current = null;
      }
      current.current = want;
      return;
    }

    // AGACHADO (02/11): parado / andando (cadência pela velocidade real) / atirando (pernas paradas agachadas; o tiro vai
    // por cima, acima). De fuzil/pistola o tronco segura a arma apontada.
    if (extras && isCrouchAction(want)) {
      const moving = want === 'crouch_walk';
      const nm = actions[crouchClipFor(gunHeld, moving)] ? crouchClipFor(gunHeld, moving) : crouchClipFor(false, moving);
      const a = actions[nm];
      if (a) {
        if (!isCrouchAction(current.current) || playingCrouch.current !== nm || !a.isRunning()) {
          if (curClipName && curClipName !== nm && actions[curClipName]) actions[curClipName]!.fadeOut(0.18);
          a.reset();
          a.timeScale = 1;
          a.setLoop(THREE.LoopRepeat, Infinity);
          a.clampWhenFinished = false;
          a.fadeIn(0.18).play();
          playingCrouch.current = nm;
        }
        current.current = want;
        playingLoco.current = null;
        if (moving) {
          const spd = speedRef ? speedRef.current : Math.hypot(vel.current.x, vel.current.z);
          a.timeScale = THREE.MathUtils.clamp(spd / CROUCH_WALK_CLIP_SPEED, 0.6, 1.8);
        }
        return;
      }
    }

    // Idle / Walk / Run (loop). Re-dispara ao mudar de estado ou se o loop parou.
    // Andando de LADO/de COSTAS (jogador mirando): clip de strafe/costas da arma na mão.
    let nextName: string = actions[want] ? want : 'idle';
    let directional = false;
    if (extras && (want === 'walk' || want === 'run') && moveDir !== 'fwd') {
      const kind = heldKindFor(heldItemOf ? heldItemOf() : selectedItemId(useGameStore.getState()));
      const mc = moveClipFor(moveDir, kind === 'bow' ? 'bow' : 'other', want === 'run');
      if (mc && actions[mc]) { nextName = mc; directional = true; }
    }
    // FUZIL NA MÃO (03/11, Pedro: "o fuzil não está apoiado na mão da frente, não encosta na de trás"): parado / andando /
    // correndo com o fuzil PRONTO nas duas mãos (Shooter Pack), como jogo de tiro. Outras armas e o resto: como antes.
    if (extras && !directional && heldKind === 'rifle' && (want === 'idle' || want === 'walk' || want === 'run')) {
      const rn = want === 'idle' ? 'aimGunIdle' : want === 'walk' ? 'rifleWalk' : 'rifleRun';
      if (actions[rn]) nextName = rn;
    }
    const curRunning = curClipName ? !!actions[curClipName]?.isRunning() : false;
    if (actions[nextName] && (want !== current.current || !curRunning || curClipName !== nextName)) {
      if (curClipName && curClipName !== nextName && actions[curClipName]) actions[curClipName]!.fadeOut(0.18);
      const a = actions[nextName]!;
      a.reset();
      a.timeScale = customClipCut?.[nextName]?.speed ?? 1; // clip extra cortado pode ter velocidade própria (sem ela: 1, igual antes)
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.fadeIn(0.15).play();
      current.current = want;
      // (parado de fuzil também guarda o clip em uso — senão o "idle" não bate com o tocando e reiniciava todo quadro)
      playingLoco.current = want === 'walk' || want === 'run' || nextName !== want ? nextName : null;
    }
    // Cadência do walk/run acompanha a velocidade real (anti foot-sliding).
    // Run usa um sync MENOR (passada maior → não "patina" o pé).
    // clip extra (Zona Sul) com ritmo pela velocidade real (remar/nadar): só quem passa `sync` — o jogo de sempre não
    const cutNow = current.current ? customClipCut?.[current.current] : undefined;
    if (cutNow?.sync && speedRef) {
      const a = actions[current.current!];
      if (a) a.timeScale = THREE.MathUtils.clamp(speedRef.current * cutNow.sync, cutNow.syncMin ?? 0.5, cutNow.syncMax ?? 2);
    }
    if ((current.current === 'walk' || current.current === 'run')) {
      const a = actions[clipOf(current.current) ?? current.current];
      const spd = speedRef ? speedRef.current : Math.hypot(vel.current.x, vel.current.z);
      const rifleLoco = playingLoco.current === 'rifleWalk' || playingLoco.current === 'rifleRun';
      if (a && directional) a.timeScale = THREE.MathUtils.clamp(spd / (current.current === 'run' ? 4.3 : 1.8), 0.6, 1.5);
      // fuzil: o passo pela velocidade real ÷ a do clip (andar 1,0 m/s, correr 3,2 m/s — medido no Mixamo)
      else if (a && rifleLoco) a.timeScale = THREE.MathUtils.clamp(spd / (playingLoco.current === 'rifleRun' ? 3.2 : 1.0), 0.6, 2.4);
      else if (a && speedRef) a.timeScale = THREE.MathUtils.clamp(spd * (current.current === 'run' ? runSync : walkSync), 0.4, 3.0);
      else if (a && strideSync && current.current === 'walk') {
        const len = (cloned.userData['bodyLen'] as number) || 0;
        if (len > 0) a.timeScale = THREE.MathUtils.clamp(strideSpeed.current / (WALK_BODYLEN_PER_S * len), 0.5, 2.0);
      }
    }
    if (strideSync && g && dt > 0) {
      g.getWorldPosition(tmpHeroV);
      if (stridePos.current) {
        const v = Math.hypot(tmpHeroV.x - stridePos.current.x, tmpHeroV.z - stridePos.current.z) / dt;
        strideSpeed.current += (Math.min(v, 20) - strideSpeed.current) * Math.min(1, dt * 8);
        stridePos.current.copy(tmpHeroV);
      } else stridePos.current = tmpHeroV.clone();
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

  // MIRA (Pedro): durante o disparo de pistola/rifle a arma deixa de seguir o pulso e aponta
  // RETO pra frente do herói (cano na horizontal), presa na mão; entra/sai suave. Fora do
  // tiro, fica exatamente na pega de sempre (gripRot).
  const weaponRef = useRef<THREE.Group>(null);
  const holderRef = useRef<THREE.Group>(null); // o suporte girado (handFix) — a conta do punho na palma usa o mundo dele
  const aimW = useRef(0);
  const gripQuat = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(gripRot[0], gripRot[1], gripRot[2])), [gripRot]);
  // suporte da arma (skin com outros eixos de mão): gira `handFix`; a mira compensa (o cano segue reto pra frente)
  const handFixQ = useMemo(() => (handFix ? new THREE.Quaternion(handFix[0], handFix[1], handFix[2], handFix[3]).normalize() : new THREE.Quaternion()), [handFix]);
  const handFixInv = useMemo(() => handFixQ.clone().invert(), [handFixQ]);
  const gripPosLocal = useMemo(() => new THREE.Vector3(gripPos[0] * gripNorm, gripPos[1] * gripNorm, gripPos[2] * gripNorm), [gripPos, gripNorm]);
  useFrame((_, dt) => {
    const w = weaponRef.current;
    const root = inner.current;
    if (!w || !root || !handBone) return;
    // (02/11: também atirando agachado/no ar e agachado de fuzil — o tronco está apontando a arma)
    const aiming = (current.current === 'attack' && playingAtk.current === 'attackGun') || atkOv.current === 'attackGunUp'
      || (isCrouchAction(current.current) && !!playingCrouch.current?.endsWith('Gun'));
    // FUZIL do JOGADOR (03/11, Pedro: "o fuzil não está apoiado na mão da frente e não encosta na mão de trás"): em toda pose
    // de fuzil (parado/andando/correndo de fuzil, pulo, agachado, strafe, tiro) a arma vai nas DUAS mãos — PUNHO na palma da
    // mão direita e o cano passando pela palma da ESQUERDA (o guarda-mão apoiado nela). Fora delas (nadando, carro…): na
    // mão como sempre. Pistola e inimigos: como antes (no tiro, reta pra frente).
    const st = current.current;
    const playingNow = st === 'attack' ? playingAtk.current
      : (st === 'idle' || st === 'walk' || st === 'run') && playingLoco.current ? playingLoco.current
      : st === 'jump' || st === 'jump_shoot' ? playingJump.current
      : isCrouchAction(st) ? playingCrouch.current : st;
    const rifle = rangedAttack && !!leftHandBone && heldKindFor(heldItemOf ? heldItemOf() : selectedItemId(useGameStore.getState())) === 'rifle';
    const twoHands = rifle && (aiming || /gun|rifle/i.test(playingNow ?? ''));
    aimW.current += ((aiming || twoHands ? 1 : 0) - aimW.current) * Math.min(1, dt * 14);
    if (aimW.current < 0.001) { w.quaternion.copy(gripQuat); w.position.copy(gripPosLocal); return; }
    handBone.updateWorldMatrix(true, false);
    root.updateWorldMatrix(true, false);
    const rootQ = root.getWorldQuaternion(tmpAimRootQ);
    let target: THREE.Quaternion = rootQ;
    let posLocal: THREE.Vector3 = gripPosLocal;
    const holder = holderRef.current;
    if (twoHands && leftHandBone && holder) {
      leftHandBone.updateWorldMatrix(true, false);
      holder.updateWorldMatrix(false, false);
      // palma = pulso + (pulso − cotovelo) × 0,28 (sem dedos no esqueleto: a direção do antebraço dá onde a mão "abre")
      const palm = (hand: THREE.Object3D, fore: THREE.Object3D | undefined, out: THREE.Vector3) => {
        hand.getWorldPosition(out);
        if (!fore) return out;
        fore.updateWorldMatrix(true, false);
        const d = tmpAimD.copy(out).sub(fore.getWorldPosition(tmpAimF));
        return out.addScaledVector(d, PALM_K);
      };
      const R = palm(handBone, rightForeBone, tmpAimR), L = palm(leftHandBone, leftForeBone, tmpAimL);
      const fwd = tmpAimFwd.copy(L).sub(R);
      if (fwd.lengthSq() > 1e-8) {
        fwd.normalize();
        const up = tmpAimUp.set(0, 1, 0).applyQuaternion(rootQ);
        const side = tmpAimX.crossVectors(up, fwd);
        if (side.lengthSq() > 1e-6) {
          side.normalize();
          up.crossVectors(fwd, side);
          target = tmpAimTgtQ.setFromRotationMatrix(tmpAimM.makeBasis(side, up, fwd)); // cano (+Z da arma) → palma esquerda
          posLocal = tmpAimPos.copy(R).applyMatrix4(tmpAimInv.copy(holder.matrixWorld).invert()); // punho (origem da arma) → palma direita
        }
      }
    }
    const aimLocal = handBone.getWorldQuaternion(tmpAimHandQ).invert().multiply(target);
    aimLocal.premultiply(handFixInv); // dentro do suporte girado (identidade sem handFix)
    w.quaternion.copy(gripQuat).slerp(aimLocal, aimW.current);
    w.position.copy(gripPosLocal).lerp(posLocal, aimW.current);
  });

  return (
    <group ref={inner} rotation={[0, yaw, 0]} scale={scale}>
      {/* Wrapper que "levanta" o herói (cancela o -90° X do rig Meshy FBX). */}
      <group rotation={[standFixX, 0, 0]} position={[0, STAND_FIX_Y, 0]}>
        <primitive object={cloned} />
      </group>
      {weapon && handBone
        ? createPortal(
            <group ref={holderRef} quaternion={handFixQ}>
              <group
                ref={weaponRef}
                position={[gripPos[0] * gripNorm, gripPos[1] * gripNorm, gripPos[2] * gripNorm]}
                rotation={gripRot}
                scale={gripScale * gripNorm}
              >
                {weapon}
              </group>
            </group>,
            handBone,
          )
        : null}
    </group>
  );
}

// 03/11: o herói agora é a SKIN escolhida (hero-skins.ts) — baixa a de homem já (padrão); a de mulher, quando alguém usar
preloadKTX2GLTF(HERO_SKINS.homem.url);
useGLTF.preload(CLIP_URL['idle']!);
useGLTF.preload(CLIP_URL['walk']!);
useGLTF.preload(CLIP_URL['run']!);
useGLTF.preload(CLIP_URL['attack']!);
useGLTF.preload(CLIP_URL['attackBow']!);
useGLTF.preload(CLIP_URL['attackGun']!);
useGLTF.preload(CLIP_URL['jump']!);
useGLTF.preload(CLIP_URL['deathBack']!);
useGLTF.preload(CLIP_URL['deathMutant']!);
useGLTF.preload(CLIP_URL['dodge']!);
useGLTF.preload(EXTRA_URLS);
