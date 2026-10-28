/**
 * ZONA SUL — desenho do chão, LEVE: pedaços de CHUNK×CHUNK células (256 m) com nível de detalhe pela distância do
 * herói (perto: 4 m; meio: 8 m; longe: 16 m) + a SILHUETA do mapa inteiro (32 m, 2,5 m abaixo) pra ver o Corcovado e
 * a Pedra da Gávea de longe. Normais pelo mapa de altura GLOBAL (sem emenda de luz entre pedaços) e "saia" na borda
 * de cada pedaço (sem fresta entre detalhes diferentes). Cor por superfície + inclinação (paredão de granito) + ruído.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ZS_SURF } from './zona-sul-meta';
import { type ZsTerrain, zsHash, ZS_WATER_Y } from './zs-terrain-data';

export const ZS_CHUNK = 64;
/** Detalhe por distância (m) → passo em células. */
export const ZS_LOD: { maxDist: number; step: number }[] = [{ maxDist: 200, step: 1 }, { maxDist: 400, step: 2 }, { maxDist: 760, step: 4 }];
const FAR_STEP = 8, FAR_DROP = 2.5, SKIRT = 6;

const C = {
  sand: new THREE.Color('#d9c79a'), wetSand: new THREE.Color('#b9a477'), deep: new THREE.Color('#2d5a66'),
  granite: new THREE.Color('#8e8a82'), graniteDark: new THREE.Color('#6d6a64'),
  low: new THREE.Color('#5d7836'), lowDry: new THREE.Color('#77743f'),
  mata: new THREE.Color('#2f5a2b'), mataDark: new THREE.Color('#244a24'), mataLight: new THREE.Color('#3e6c33'),
};
const tmp = new THREE.Color();

function cellH(t: ZsTerrain, i: number, j: number): number {
  return t.heights[Math.max(0, Math.min(t.h - 1, j)) * t.w + Math.max(0, Math.min(t.w - 1, i))]!;
}
/** Cor do chão na célula (i, j). */
export function zsGroundColor(t: ZsTerrain, i: number, j: number, out: THREE.Color): THREE.Color {
  const s = t.surf[Math.max(0, Math.min(t.h - 1, j)) * t.w + Math.max(0, Math.min(t.w - 1, i))]!;
  const h = cellH(t, i, j);
  const gx = (cellH(t, i + 1, j) - cellH(t, i - 1, j)) / (2 * t.cell), gz = (cellH(t, i, j + 1) - cellH(t, i, j - 1)) / (2 * t.cell);
  const slope = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  const n = zsHash(i, j, 7), n2 = zsHash(i >> 3, j >> 3, 11);
  if (s === ZS_SURF.sea || s === ZS_SURF.lagoon) return out.copy(C.wetSand).lerp(C.deep, Math.min(1, (ZS_WATER_Y - h) / 5));
  if (s === ZS_SURF.beach) return out.copy(C.sand).lerp(C.wetSand, h < 0.5 ? 0.5 : n * 0.25);
  if (slope > 36) return out.copy(C.granite).lerp(C.graniteDark, n).lerp(C.mata, Math.max(0, (44 - slope) / 8) * 0.6);
  if (h < 6 && s !== ZS_SURF.forest) return out.copy(C.low).lerp(C.lowDry, n2 * 0.6).multiplyScalar(0.9 + n * 0.15);
  return out.copy(C.mata).lerp(n2 > 0.5 ? C.mataLight : C.mataDark, Math.abs(n2 - 0.5) * 1.4).multiplyScalar(0.9 + n * 0.15);
}

/** Malha de um retângulo de células [i0..i1]×[j0..j1] com passo `step`; `drop` baixa tudo; `skirt` põe saia. */
export function buildTerrainPatch(t: ZsTerrain, i0: number, j0: number, i1: number, j1: number, step: number, drop = 0, skirt = true): THREE.BufferGeometry {
  const xs: number[] = [], zs: number[] = [];
  for (let i = i0; i < i1; i += step) xs.push(i); xs.push(i1);
  for (let j = j0; j < j1; j += step) zs.push(j); zs.push(j1);
  const nx = xs.length, nz = zs.length;
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const v = new THREE.Vector3();
  const vert = (i: number, j: number, dy: number) => {
    pos.push(t.x0 + i * t.cell, cellH(t, i, j) - drop - dy, t.z0 + j * t.cell);
    const d = Math.max(1, step);
    v.set(-(cellH(t, i + d, j) - cellH(t, i - d, j)) / (2 * d * t.cell), 1, -(cellH(t, i, j + d) - cellH(t, i, j - d)) / (2 * d * t.cell)).normalize();
    nor.push(v.x, v.y, v.z);
    zsGroundColor(t, i, j, tmp); col.push(tmp.r, tmp.g, tmp.b);
    return pos.length / 3 - 1;
  };
  for (const j of zs) for (const i of xs) vert(i, j, 0);
  for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) {
    const p = b * nx + a;
    idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1);
  }
  if (skirt) { // borda: cada vértice ganha um par SKIRT m abaixo → parede fina que tapa fresta
    const edge = (list: number[]) => {
      for (let k = 0; k + 1 < list.length; k++) {
        const a = list[k]!, b = list[k + 1]!;
        const ia = a % nx, ja = Math.floor(a / nx), ib = b % nx, jb = Math.floor(b / nx);
        const a2 = vert(xs[ia]!, zs[ja]!, SKIRT), b2 = vert(xs[ib]!, zs[jb]!, SKIRT);
        idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); // os 2 lados (a saia aparece de qualquer ângulo)
      }
    };
    edge(Array.from({ length: nx }, (_, a) => a));
    edge(Array.from({ length: nx }, (_, a) => (nz - 1) * nx + a));
    edge(Array.from({ length: nz }, (_, b) => b * nx));
    edge(Array.from({ length: nz }, (_, b) => b * nx + nx - 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Passo de detalhe de um pedaço pela distância do herói até ele (null = longe demais: só a silhueta). */
export function zsChunkStep(dist: number): number | null {
  for (const l of ZS_LOD) if (dist <= l.maxDist) return l.step;
  return null;
}

type ChunkView = { key: string; geo: THREE.BufferGeometry };

/**
 * TEXTURA sem imagem (leve): ruído calculado no shader pela posição no mundo — grão fino (terra/folha), manchas médias
 * e variação grande de tom. Na pedra (íngreme) faixas horizontais leves (estrato do granito). Zero download.
 */
function withGroundDetail(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vZsW;\nvarying float vZsUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZsW = (modelMatrix * vec4(position, 1.0)).xyz;\nvZsUp = normal.y;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vZsW;
varying float vZsUp;
float zsH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float zsN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(zsH(i), zsH(i + vec2(1.0, 0.0)), f.x), mix(zsH(i + vec2(0.0, 1.0)), zsH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float zg = zsN(vZsW.xz * 1.6) * 0.55 + zsN(vZsW.xz * 0.31) * 0.45;
  float zp = zsN(vZsW.xz * 0.045);
  diffuseColor.rgb *= 0.84 + zg * 0.28;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 1.04, 0.86), zp * 0.4);
  float zrock = 1.0 - smoothstep(0.62, 0.8, vZsUp);
  diffuseColor.rgb *= 1.0 - zrock * 0.12 * step(0.5, fract(vZsW.y * 0.45 + zsN(vZsW.xz * 0.2) * 0.6));`);
  };
  m.customProgramCacheKey = () => 'zs-ground-v1';
  return m;
}

export function ZsTerrainMesh({ t, heroRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const material = useMemo(() => withGroundDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })), []);
  const far = useMemo(() => buildTerrainPatch(t, 0, 0, t.w - 1, t.h - 1, FAR_STEP, FAR_DROP, false), [t]);
  const cache = useRef(new Map<string, THREE.BufferGeometry>());
  const [chunks, setChunks] = useState<ChunkView[]>([]);
  const acc = useRef(1);
  const last = useRef('');
  const ncx = Math.ceil((t.w - 1) / ZS_CHUNK), ncz = Math.ceil((t.h - 1) / ZS_CHUNK);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.4) return;
    acc.current = 0;
    const hx = heroRef.current.x, hz = heroRef.current.z;
    const want: { key: string; cx: number; cz: number; step: number }[] = [];
    for (let cz = 0; cz < ncz; cz++) for (let cx = 0; cx < ncx; cx++) {
      const x0 = t.x0 + cx * ZS_CHUNK * t.cell, z0 = t.z0 + cz * ZS_CHUNK * t.cell, size = ZS_CHUNK * t.cell;
      const dx = Math.max(x0 - hx, 0, hx - (x0 + size)), dz = Math.max(z0 - hz, 0, hz - (z0 + size));
      const step = zsChunkStep(Math.hypot(dx, dz));
      if (step !== null) want.push({ key: `${cx}_${cz}_${step}`, cx, cz, step });
    }
    const sig = want.map((w) => w.key).join('|');
    if (sig === last.current) return;
    last.current = sig;
    const keep = new Set(want.map((w) => w.key));
    for (const [k, g] of cache.current) if (!keep.has(k)) { g.dispose(); cache.current.delete(k); }
    setChunks(want.map((w) => {
      let g = cache.current.get(w.key);
      if (!g) {
        const i0 = w.cx * ZS_CHUNK, j0 = w.cz * ZS_CHUNK;
        g = buildTerrainPatch(t, i0, j0, Math.min(i0 + ZS_CHUNK, t.w - 1), Math.min(j0 + ZS_CHUNK, t.h - 1), w.step);
        cache.current.set(w.key, g);
      }
      return { key: w.key, geo: g };
    }));
  });
  useEffect(() => () => { for (const g of cache.current.values()) g.dispose(); far.dispose(); material.dispose(); }, [far, material]);

  return (
    <group>
      <mesh geometry={far} material={material} receiveShadow />
      {chunks.map((c) => <mesh key={c.key} geometry={c.geo} material={material} receiveShadow />)}
    </group>
  );
}
