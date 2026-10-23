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
} as const;
export type HeroExtraClip = keyof typeof HERO_EXTRA_CLIPS;

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
