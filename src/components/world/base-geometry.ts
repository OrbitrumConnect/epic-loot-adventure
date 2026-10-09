/**
 * Geometria "assada" das peças da base (muro, porta, torre, telhado, cama) e
 * das rachaduras de dano. Uma BufferGeometry por (tipo, nível) com cor por
 * vértice; o material do nível (madeira -> pedra -> ferro) sai da cor e da
 * forma. Tudo em espaço local da quadrícula (2 m): origem no centro, no chão,
 * muro ao longo de X. As bases descem ~0,35 m abaixo do chão para esconder a
 * emenda quando o terreno inclina dentro da quadrícula.
 */
import * as THREE from 'three';
import type { BasePieceKind } from '@/game/types/playerbase';
import { bake, type Part } from './harvest-nodes';
import type { FadeSphere } from './occlusion';
import { mixColor, type Palette } from './world-kit';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg: number) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg: number) => new THREE.ConeGeometry(r, h, seg);
const ball = (r: number) => new THREE.DodecahedronGeometry(r, 0);

type Tone = { main: string; alt: string; dark: string; metal: string; accent: string; mat: string };

function tones(c: Palette): [Tone, Tone, Tone] {
  const rockDark = mixColor(c.rock, c.dark, 0.35);
  const steel = mixColor(c.metal, c.dark, 0.5);
  return [
    {
      main: c.trunk, alt: mixColor(c.trunk, c.light, 0.28), dark: mixColor(c.trunk, c.dark, 0.45),
      metal: c.rock, accent: c.gold, mat: c.path,
    },
    {
      main: c.rock, alt: c['rock-light'], dark: rockDark,
      metal: c.metal, accent: c.gold, mat: c.path,
    },
    {
      main: steel, alt: c.metal, dark: '#2c3138',
      metal: '#7a8591', accent: c.gold, mat: c.path,
    },
  ];
}

export type PieceAssets = {
  geo: THREE.BufferGeometry;
  /** Esferas de oclusão (espaço local) — vazio = não apaga (cama). */
  fade: FadeSphere[];
  castShadow: boolean;
};

/* ------------------------------------------------------------------ *
 * Peças
 * ------------------------------------------------------------------ */
function wallParts(t: number, k: Tone): Part[] {
  const p: Part[] = [];
  if (t === 0) {
    // Paliçada de estacas: tábuas de alturas variadas, pontas e travessas.
    for (let i = 0; i < 5; i++) {
      const h = 1.5 + (i % 2) * 0.2;
      p.push({ g: box(0.36, h + 0.35, 0.46), color: i % 2 ? k.alt : k.main, pos: [-0.8 + i * 0.4, (h - 0.35) / 2, 0] });
      p.push({ g: cone(0.22, 0.32, 4), color: k.alt, pos: [-0.8 + i * 0.4, h + 0.16, 0], rot: [0, Math.PI / 4, 0] });
    }
    for (const y of [0.45, 1.05]) {
      for (const z of [-0.26, 0.26]) p.push({ g: box(2.0, 0.14, 0.1), color: k.dark, pos: [0, y, z] });
    }
    for (const x of [-1, 1]) p.push({ g: cyl(0.15, 0.17, 2.3, 6), color: k.dark, pos: [x, 0.8, 0] });
  } else if (t === 1) {
    // Pedra: fiadas, friso mais claro e ameias.
    p.push({ g: box(2.0, 1.45, 0.5), color: k.main, pos: [0, 0.375, 0] });
    p.push({ g: box(2.0, 0.45, 0.54), color: k.alt, pos: [0, 1.325, 0] });
    for (const x of [-0.72, 0, 0.72]) p.push({ g: box(0.5, 0.35, 0.5), color: k.main, pos: [x, 1.725, 0] });
    for (const y of [0.35, 0.8]) p.push({ g: box(2.0, 0.04, 0.52), color: k.dark, pos: [0, y, 0] });
  } else {
    // Ferro: base de aço, cinta de metal, rebites dourados e espigões.
    p.push({ g: box(2.0, 1.5, 0.52), color: k.main, pos: [0, 0.4, 0] });
    p.push({ g: box(2.0, 0.22, 0.58), color: k.alt, pos: [0, 1.0, 0] });
    p.push({ g: box(2.0, 0.2, 0.56), color: k.dark, pos: [0, 1.25, 0] });
    for (const x of [-0.5, 0.5]) p.push({ g: box(0.08, 1.0, 0.56), color: k.dark, pos: [x, 0.35, 0] });
    for (let i = 0; i < 5; i++) p.push({ g: cone(0.1, 0.45, 5), color: k.alt, pos: [-0.8 + i * 0.4, 1.575, 0] });
    for (const x of [-0.7, 0, 0.7]) {
      for (const z of [-0.31, 0.31]) p.push({ g: box(0.09, 0.09, 0.05), color: k.accent, pos: [x, 1.0, z] });
    }
  }
  return p;
}

function doorParts(t: number, k: Tone, leaf: string): Part[] {
  const p: Part[] = [];
  const postH = 2.35;
  for (const x of [-0.85, 0.85]) {
    p.push({ g: box(0.3, postH, t === 0 ? 0.46 : 0.5), color: k.main, pos: [x, 0.825, 0] });
    if (t === 0) p.push({ g: cone(0.2, 0.3, 4), color: k.alt, pos: [x, 2.15, 0], rot: [0, Math.PI / 4, 0] });
  }
  p.push({ g: box(2.0, 0.42, t === 0 ? 0.46 : 0.5), color: k.main, pos: [0, 1.79, 0] });
  if (t > 0) p.push({ g: box(2.0, 0.12, 0.56), color: k.alt, pos: [0, 2.06, 0] });
  if (t === 2) {
    for (const x of [-0.85, 0.85]) p.push({ g: box(0.34, 0.2, 0.56), color: k.alt, pos: [x, 1.2, 0] });
  }
  // Soleira clara no chão: o caminho de entrada se lê de longe.
  p.push({ g: box(1.4, 0.06, 1.3), color: k.mat, pos: [0, 0.0, 0] });
  // Folha entreaberta (dobradiça em x = -0,7), com travessa e maçaneta.
  const th = 1.1;
  const hx = -0.7;
  const hz = 0.05;
  const cx = hx + 0.36 * Math.cos(th);
  const cz = hz - 0.36 * Math.sin(th);
  p.push({ g: box(0.72, 1.5, 0.08), color: leaf, pos: [cx, 0.75, cz], rot: [0, th, 0] });
  p.push({ g: box(0.72, 0.1, 0.11), color: k.dark, pos: [cx, 0.4, cz], rot: [0, th, 0] });
  p.push({ g: box(0.72, 0.1, 0.11), color: k.dark, pos: [cx, 1.1, cz], rot: [0, th, 0] });
  p.push({
    g: box(0.07, 0.07, 0.12), color: k.accent,
    pos: [hx + 0.64 * Math.cos(th), 0.75, hz - 0.64 * Math.sin(th)], rot: [0, th, 0],
  });
  return p;
}

function towerParts(t: number, k: Tone, flag: string): Part[] {
  const p: Part[] = [];
  if (t === 0) {
    // Atalaia de madeira: pernas, travas em X, plataforma, guarda-corpo e telhado.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) p.push({ g: cyl(0.1, 0.13, 3.0, 6), color: k.main, pos: [sx * 0.7, 1.15, sz * 0.7] });
    }
    for (const y of [0.7, 1.6]) {
      for (const z of [-0.7, 0.7]) p.push({ g: box(1.5, 0.09, 0.09), color: k.dark, pos: [0, y, z] });
      for (const x of [-0.7, 0.7]) p.push({ g: box(0.09, 0.09, 1.5), color: k.dark, pos: [x, y, 0] });
    }
    for (const z of [-0.7, 0.7]) {
      p.push({ g: box(1.55, 0.09, 0.09), color: k.dark, pos: [0, 1.15, z], rot: [0, 0, 0.74] });
      p.push({ g: box(1.55, 0.09, 0.09), color: k.dark, pos: [0, 1.15, z], rot: [0, 0, -0.74] });
    }
    p.push({ g: box(1.95, 0.14, 1.95), color: k.alt, pos: [0, 2.7, 0] });
    for (const z of [-0.9, 0.9]) p.push({ g: box(1.95, 0.5, 0.08), color: k.main, pos: [0, 3.0, z] });
    for (const x of [-0.9, 0.9]) p.push({ g: box(0.08, 0.5, 1.95), color: k.main, pos: [x, 3.0, 0] });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) p.push({ g: cyl(0.06, 0.06, 1.0, 5), color: k.dark, pos: [sx * 0.85, 3.25, sz * 0.85] });
    }
    p.push({ g: cone(1.55, 0.95, 4), color: k.dark, pos: [0, 4.2, 0], rot: [0, Math.PI / 4, 0] });
  } else {
    p.push({ g: cyl(t === 1 ? 0.85 : 0.88, t === 1 ? 0.98 : 1.02, 3.5, 6), color: k.main, pos: [0, 1.4, 0] });
    p.push({ g: cyl(1.05, 1.0, 0.3, 6), color: k.alt, pos: [0, 3.3, 0] });
    if (t === 1) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p.push({ g: box(0.42, 0.36, 0.42), color: k.main, pos: [Math.sin(a) * 0.92, 3.65, Math.cos(a) * 0.92], rot: [0, a, 0] });
      }
      p.push({ g: cyl(0.03, 0.03, 1.0, 5), color: k.dark, pos: [0, 4.0, 0] });
      p.push({ g: box(0.5, 0.3, 0.03), color: flag, pos: [0.27, 4.3, 0] });
    } else {
      for (const y of [0.9, 2.3]) p.push({ g: cyl(1.06, 1.06, 0.16, 6), color: k.alt, pos: [0, y, 0] });
      p.push({ g: cone(1.05, 0.9, 6), color: k.dark, pos: [0, 3.9, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        p.push({ g: cone(0.1, 0.5, 5), color: k.metal, pos: [Math.sin(a) * 1.0, 3.7, Math.cos(a) * 1.0] });
      }
      p.push({ g: ball(0.14), color: k.accent, pos: [0, 4.4, 0] });
    }
    // Seteiras escuras nas faces.
    for (const a of [Math.PI / 6, Math.PI / 6 + Math.PI]) {
      p.push({ g: box(0.13, 0.5, 0.07), color: '#14110f', pos: [Math.sin(a) * 0.82, 2.2, Math.cos(a) * 0.82], rot: [0, a, 0] });
    }
  }
  return p;
}

function roofParts(t: number, k: Tone): Part[] {
  const p: Part[] = [];
  const top = t === 0 ? mixColor(k.accent, k.main, 0.55) : t === 1 ? mixColor(k.main, k.dark, 0.5) : k.alt;
  const top2 = t === 0 ? mixColor(k.accent, k.main, 0.72) : t === 1 ? mixColor(k.main, k.dark, 0.7) : k.metal;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.push({ g: box(0.16, 2.35, 0.16), color: k.main, pos: [sx * 0.9, 0.825, sz * 0.9] });
  }
  for (const z of [-0.9, 0.9]) p.push({ g: box(2.0, 0.1, 0.1), color: k.dark, pos: [0, 2.0, z] });
  p.push({ g: box(2.3, 0.1, 1.35), color: top, pos: [0, 2.35, 0.52], rot: [0.5, 0, 0] });
  p.push({ g: box(2.3, 0.1, 1.35), color: top2, pos: [0, 2.35, -0.52], rot: [-0.5, 0, 0] });
  p.push({ g: box(2.3, 0.13, 0.15), color: k.dark, pos: [0, 2.67, 0] });
  return p;
}

function coreParts(t: number, k: Tone, c: Palette): Part[] {
  const linen = mixColor(c.light, c['ground-light'], 0.35);
  const p: Part[] = [
    { g: cyl(1.0, 1.0, 0.05, 10), color: mixColor(c['ground-light'], c.dark, 0.18), pos: [0, 0.02, 0] },
    { g: box(1.0, 0.2, 1.8), color: k.main, pos: [0, 0.32, 0] },
    { g: box(0.9, 0.16, 1.6), color: linen, pos: [0, 0.5, 0] },
    { g: box(0.92, 0.19, 0.95), color: c.cloak, pos: [0, 0.52, 0.32] },
    { g: box(0.6, 0.12, 0.3), color: c.light, pos: [0, 0.64, -0.62] },
    { g: box(1.06, 0.7, 0.1), color: t === 0 ? k.main : k.alt, pos: [0, 0.6, -0.92] },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.push({ g: box(0.12, 0.38, 0.12), color: k.dark, pos: [sx * 0.46, 0.15, sz * 0.82] });
  }
  if (t >= 1) for (const sx of [-1, 1]) p.push({ g: ball(0.09), color: k.accent, pos: [sx * 0.5, 0.98, -0.92] });
  return p;
}

/* ------------------------------------------------------------------ *
 * Rachaduras (instâncias à parte, só em peça machucada)
 * ------------------------------------------------------------------ */
const CRACK = '#16100c';

function zigzag(cx: number, cy: number, z: number, s: number, rotY = 0, ox = 0, oz = 0): Part[] {
  // Três tracinhos em zigue-zague, colados na face (z local) e girados em Y.
  const segs: [number, number, number, number][] = [
    [0, 0.5, 0.35, 0.5], [0.07, 0.12, -0.5, 0.45], [-0.02, -0.28, 0.4, 0.5],
  ];
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return segs.map(([dx, dy, rz, len]) => {
    const lx = cx + dx * s;
    return {
      g: box(0.05, len * s, 0.07), color: CRACK,
      pos: [ox + lx * cos + z * sin, cy + dy * s, oz - lx * sin + z * cos] as [number, number, number],
      rot: [0, rotY, rz] as [number, number, number],
    };
  });
}

export function buildCrackGeometries(): { wall: THREE.BufferGeometry; door: THREE.BufferGeometry; tower: THREE.BufferGeometry } {
  const wallParts: Part[] = [];
  for (const z of [-0.28, 0.28]) {
    wallParts.push(...zigzag(-0.55, 0.85, z, 1), ...zigzag(0.45, 0.6, z, 0.9));
  }
  const doorParts: Part[] = [];
  for (const z of [-0.27, 0.27]) {
    doorParts.push(...zigzag(-0.85, 1.0, z, 1), ...zigzag(0.85, 0.7, z, 0.9));
  }
  const towerParts: Part[] = [
    ...zigzag(0, 1.8, 0.8, 1.1, Math.PI / 6, 0, 0),
    ...zigzag(0.1, 2.7, 0.8, 0.8, Math.PI / 6 + Math.PI, 0, 0),
  ];
  return { wall: bake(wallParts), door: bake(doorParts), tower: bake(towerParts) };
}

/* ------------------------------------------------------------------ *
 * Tabela final
 * ------------------------------------------------------------------ */
const WALL_FADE: FadeSphere[] = [[-0.6, 0.9, 0, 0.8], [0.6, 0.9, 0, 0.8]];
const TOWER_FADE: FadeSphere[] = [[0, 1.6, 0, 1.4], [0, 3.2, 0, 1.2]];
const ROOF_FADE: FadeSphere[] = [[0, 2.2, 0, 1.4]];

export const CRACK_FADE: Record<'wall' | 'door' | 'tower', FadeSphere[]> = {
  wall: WALL_FADE, door: WALL_FADE, tower: TOWER_FADE,
};

export function buildPieceAssets(c: Palette): Record<`${BasePieceKind}${1 | 2 | 3}`, PieceAssets> {
  const ks = tones(c);
  const doorLeaf = [mixColor(c.trunk, c.light, 0.18), c.trunk, ks[2].metal];
  const out = {} as Record<`${BasePieceKind}${1 | 2 | 3}`, PieceAssets>;
  for (let t = 0; t < 3; t++) {
    const k = ks[t]!;
    const tier = (t + 1) as 1 | 2 | 3;
    out[`wall${tier}`] = { geo: bake(wallParts(t, k)), fade: WALL_FADE, castShadow: true };
    out[`door${tier}`] = { geo: bake(doorParts(t, k, doorLeaf[t]!)), fade: WALL_FADE, castShadow: true };
    out[`tower${tier}`] = { geo: bake(towerParts(t, k, c.cloak)), fade: TOWER_FADE, castShadow: true };
    out[`roof${tier}`] = { geo: bake(roofParts(t, k)), fade: ROOF_FADE, castShadow: true };
    out[`core${tier}`] = { geo: bake(coreParts(t, k, c)), fade: [], castShadow: true };
  }
  return out;
}
