/**
 * Animações extras do HERÓI (Pedro, 22/10 — PvP): andar de lado/de costas mirando, tomar golpe,
 * gesto ao lançar poder e combo de espada. Lógica pura (testável); quem toca é o
 * `GlbHeroMixamo`. Só jogadores (local e remotos) — raiders seguem com os clips de sempre.
 * Clips: Mixamo X Bot (Shooter / Longbow Aiming / Pro Sword and Shield), mesmo esqueleto do herói.
 */
import type * as THREE from 'three';

export const HERO_EXTRA_CLIPS = {
  gunLeft: '/models/red/move_gun_left.glb',       // Shooter "strafe (2)"
  gunRight: '/models/red/move_gun_right.glb',     // Shooter "strafe"
  gunBack: '/models/red/move_gun_back.glb',       // Shooter "walking backwards"
  gunBackRun: '/models/red/move_gun_back_run.glb', // Shooter "run backwards"
  bowLeft: '/models/red/move_bow_left.glb',       // Longbow "standing aim walk left"
  bowRight: '/models/red/move_bow_right.glb',
  bowBack: '/models/red/move_bow_back.glb',
  hit1: '/models/red/hit_1.glb',                  // Sword&Shield "impact"
  hit2: '/models/red/hit_2.glb',                  // "impact (3)"
  cast: '/models/red/cast.glb',                   // "casting (2)"
  slash1: '/models/red/slash_1.glb',              // "slash", "slash (3)", "slash (5)"
  slash2: '/models/red/slash_2.glb',
  slash3: '/models/red/slash_3.glb',
  // PvP (02/11, Pedro: "pular atirando, agachar… aproveitar o máximo do pack, sem quebrar; o idle não muda"):
  crouchIdle: '/models/red/crouch_idle.glb',      // Sword&Shield "crouch idle"
  // 02/11 (Pedro: "ao andar fica bugando"): o "crouching" do Sword&Shield era a transição agachado → EM PÉ (em loop o
  // boneco levantava e agachava). Agora: o NOSSO walk com quadril baixo, tronco inclinado, passo curto e pernas por IK
  // (pé plantado) — tools/crouch-walk-bake.mjs. Ciclo de 1 s, 2 passos, emenda.
  crouchWalk: '/models/red/crouch_walk.glb',
  aimGunIdle: '/models/red/aim_gun_idle.glb',     // Shooter "rifle aiming idle" (só a metade de cima → agachado de fuzil)
  jumpGunFwd: '/models/red/jump_gun_fwd.glb',     // Shooter "jump forward"
  jumpGunBack: '/models/red/jump_gun_back.glb',   // Shooter "jump backward"
  // FUZIL NAS DUAS MÃOS (03/11, Pedro: "o fuzil não está apoiado na mão da frente"): andar e correr com o fuzil pronto
  rifleWalk: '/models/red/rifle_walk.glb',       // Shooter "walking"  (1,0 m/s no clip)
  rifleRun: '/models/red/rifle_run.glb',         // Shooter "rifle run" (3,2 m/s no clip)
} as const;
export type HeroExtraClip = keyof typeof HERO_EXTRA_CLIPS;
/** Clips de AGACHAR: o quadril DESCE (não trava na altura de pé, como os outros clips do herói "fooled"). */
export const CROUCH_CLIPS: readonly HeroExtraClip[] = ['crouchIdle', 'crouchWalk'];
/** Velocidade (m/s) que o clip de andar agachado anda (medida pelo tools/crouch-walk-bake.mjs: 1,215 m em 1 s) — a
 *  cadência acompanha a velocidade real (agachado ~0,9–1,1 m/s → ~0,75–0,9×, pé sem patinar). */
export const CROUCH_WALK_CLIP_SPEED = 1.215;

/** Agachado (parado / andando / atirando)? */
export function isCrouchAction(a: string | null | undefined): boolean {
  return a === 'crouch' || a === 'crouch_walk' || a === 'crouch_attack';
}
/** Clip do agachado: de FUZIL/pistola = pernas agachadas + tronco segurando a arma apontada (`…Gun`, montado na carga);
 *  espada/arco/mão = o agachar de espada e escudo inteiro. */
export function crouchClipFor(gun: boolean, moving: boolean): string {
  return (moving ? 'crouchWalk' : 'crouchIdle') + (gun ? 'Gun' : '');
}
/** Pulo: com fuzil/pistola o pulo de fuzil (pra frente ou, andando de costas, pra trás); o resto, o de sempre. */
export function jumpClipFor(gun: boolean, dir: MoveDir): string {
  return gun ? (dir === 'back' ? 'jumpGunBack' : 'jumpGunFwd') : 'jump';
}
/** A metade de cima do ATAQUE por cima das pernas (agachado atirando / atirando no ar). */
export function attackUpperFor(kind: 'bow' | 'gun' | 'melee'): string {
  return kind === 'gun' ? 'attackGunUp' : kind === 'bow' ? 'attackBowUp' : 'slashUp';
}
/** Peso da camada de cima do ataque (por cima das pernas agachadas / do pulo): o tronco é o do tiro. */
export const ATTACK_UPPER_WEIGHT = 3;

/** Junta as PERNAS (e o quadril) de um clip com a METADE DE CIMA de outro — ex.: agachado de espada + tronco do fuzil. */
export function lowerPlusUpper(lower: THREE.AnimationClip, upper: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const out = lower.clone();
  out.name = name;
  out.tracks = [...lower.tracks.filter((t) => !isUpperBodyTrack(t.name)).map((t) => t.clone()),
    ...upper.tracks.filter((t) => isUpperBodyTrack(t.name)).map((t) => t.clone())];
  out.duration = lower.duration;
  return out;
}
/**
 * Quadril do clip AGACHADO na escala do modelo: a altura de pé do clip (`clipStandY`, do idle do mesmo esqueleto Mixamo)
 * vira a altura de pé do modelo (`standY`); o agachado desce na mesma proporção. Sem standY (modelo comum) fica igual.
 * Trabalha numa CÓPIA.
 */
export function scaleHipsTo(clip: THREE.AnimationClip, standY: number | null, clipStandY: number | null): THREE.AnimationClip {
  if (standY === null || clipStandY === null || !Number.isFinite(clipStandY) || Math.abs(clipStandY) < 1e-6) return clip;
  const out = clip.clone();
  const tr = out.tracks.find((t) => /Hips\.position$/i.test(t.name));
  if (!tr) return out;
  const s = standY / clipStandY, v = tr.values;
  for (let i = 1; i < v.length; i += 3) v[i] = v[i]! * s;
  return out;
}

export const SLASH_COMBO: HeroExtraClip[] = ['slash1', 'slash2', 'slash3'];
export const HIT_CLIPS: HeroExtraClip[] = ['hit1', 'hit2'];

export type MoveDir = 'fwd' | 'back' | 'left' | 'right';

/**
 * Direção do movimento RELATIVA a pra onde o herói olha. `yaw` = rotation.y do corpo (olhar pra
 * frente = (sin yaw, cos yaw)); a esquerda do personagem Mixamo é +X local.
 * Até 60° = frente; além de 120° = costas; no meio = lado.
 */
export function localMoveDir(vx: number, vz: number, yaw: number): MoveDir {
  const fwd = vx * Math.sin(yaw) + vz * Math.cos(yaw);
  const left = vx * Math.cos(yaw) - vz * Math.sin(yaw);
  const ang = Math.abs(Math.atan2(left, fwd));
  if (ang <= Math.PI / 3) return 'fwd';
  if (ang >= (2 * Math.PI) / 3) return 'back';
  return left > 0 ? 'left' : 'right';
}

/** Clip de locomoção pra direção + arma na mão. null = usa o walk/run de sempre. */
export function moveClipFor(dir: MoveDir, weapon: 'bow' | 'other', running: boolean): HeroExtraClip | null {
  if (dir === 'fwd') return null;
  if (weapon === 'bow') return dir === 'left' ? 'bowLeft' : dir === 'right' ? 'bowRight' : 'bowBack';
  if (dir === 'back') return running ? 'gunBackRun' : 'gunBack';
  return dir === 'left' ? 'gunLeft' : 'gunRight';
}

/** Ossos da METADE DE CIMA (coluna, pescoço, cabeça, ombros, braços, mãos). */
const UPPER = /(spine|neck|head|shoulder|arm|hand)/i;
const LOWER = /(hips|upleg|leg|foot|toe)/i;
export function isUpperBodyTrack(trackName: string): boolean {
  const bone = trackName.split('.')[0] ?? '';
  return UPPER.test(bone) && !LOWER.test(bone.replace(/forearm/i, ''));
}
/** Deixa o clip só com a metade de cima (pernas seguem andando/correndo por baixo). */
export function upperBodyOnly(clip: THREE.AnimationClip): THREE.AnimationClip {
  clip.tracks = clip.tracks.filter((t) => isUpperBodyTrack(t.name));
  return clip;
}

/** Tempo (s) que a direção lateral/costas precisa durar pra trocar o clip — filtra a virada
 *  normal do corpo (o giro alcança a direção em ~0,07 s) e não pisca strafe ao fazer curva. */
export const SIDE_SUSTAIN_S = 0.2;
/** Intervalo mínimo entre duas reações de golpe (horda batendo não vira tremedeira). */
export const HIT_REACT_GAP_S = 2;
