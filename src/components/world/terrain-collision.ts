/**
 * Colisão por MALHA do terreno (planície + montanhas) — deixa o jogador ANDAR no
 * relevo real e SUBIR nas montanhas, não só no `terrainHeight` procedural plano.
 *
 * Como: cada terreno registrado tem um BVH (three-mesh-bvh) nas geometrias →
 * raycast de cima pra baixo em O(log n) (microssegundos, 1 por frame). A altura
 * da malha entra num `Math.max` com o terreno procedural, então o jogador fica
 * sempre na superfície MAIS ALTA (chão plano onde a malha ~0; montanha onde sobe).
 *
 * Caverna "por dentro" (passar sob um teto) é fase seguinte (cápsula horizontal):
 * o raycast de cima pega a superfície do TOPO, então hoje isto dá subir/andar,
 * não entrar embaixo.
 */
import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Patch único: geometrias COM boundsTree usam BVH; as sem caem no raycast padrão.
/* eslint-disable @typescript-eslint/no-explicit-any */
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
/* eslint-enable @typescript-eslint/no-explicit-any */

const terrains = new Set<THREE.Object3D>();

// Versão do terreno: muda sempre que um GLB de terreno (re)entra/sai. Os props
// (árvore/pedra/cristal/camp/fábrica) assinam via useTerrainVersion e recomputam
// a altura quando o GLB carrega (ele registra async, depois do mount dos props).
let terrainVersion = 0;
const terrainListeners = new Set<() => void>();
function bumpTerrain() { terrainVersion++; for (const l of terrainListeners) l(); }

/** Hook: re-renderiza o componente quando o conjunto de terrenos muda. */
export function useTerrainVersion(): number {
  return useSyncExternalStore(
    (cb) => { terrainListeners.add(cb); return () => { terrainListeners.delete(cb); }; },
    () => terrainVersion,
    () => terrainVersion,
  );
}

/** Registra um terreno (planície/montanha/GLB) p/ colisão de malha; constrói o BVH
 *  de cada geometria. Devolve o cleanup pra desregistrar ao desmontar. */
export function registerTerrain(root: THREE.Object3D): () => void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = m.geometry as any;
    if (m.isMesh && g && !g.boundsTree) g.computeBoundsTree();
  });
  terrains.add(root);
  bumpTerrain();
  return () => { terrains.delete(root); bumpTerrain(); };
}

const ray = new THREE.Raycaster();
// three-mesh-bvh: só o primeiro acerto = mais rápido.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(ray as any).firstHitOnly = true;
const ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** O quanto o jogador consegue SUBIR por quadro (degrau/ladeira). O raycast parte
 *  um pouco acima dos pés, então ladeira sobe mas parede vertical não (anda em volta). */
const STEP_UP = 0.7;

/**
 * Altura do CHÃO logo abaixo dos pés do jogador em (x,z), a partir de `fromY`
 * (Y atual dos pés). O raio sai de `fromY + STEP_UP` pra baixo e pega a PRIMEIRA
 * superfície — o piso onde ele pisa, NÃO o topo da montanha lá em cima. É isso
 * que deixa ENTRAR na caverna (anda no piso sob o teto) em vez de subir no topo.
 * `-Infinity` quando não há malha ali (cai no fallback procedural).
 */
export function terrainMeshY(x: number, z: number, fromY: number): number {
  if (terrains.size === 0) return -Infinity;
  ORIGIN.set(x, fromY + STEP_UP, z);
  ray.set(ORIGIN, DOWN);
  ray.far = fromY + STEP_UP + 80; // alcança o chão bem abaixo
  let best = -Infinity;
  for (const root of terrains) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}

/**
 * Altura do TOPO da malha em (x,z) — raycast de bem alto pra baixo. Usado por
 * INIMIGOS e PROPS (árvore/pedra) que ficam SOBRE a montanha (superfície de cima,
 * sem entrar em caverna). `-Infinity` quando não há malha ali.
 */
export function terrainMeshTopY(x: number, z: number): number {
  if (terrains.size === 0) return -Infinity;
  ORIGIN.set(x, 500, z);
  ray.set(ORIGIN, DOWN);
  ray.far = 700;
  let best = -Infinity;
  for (const root of terrains) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}

/** Altura da superfície do GLB de terreno em (x,z) p/ ASSENTAR props (árvore/pedra/
 *  cristal/camp/fábrica). Retorna o topo da malha se houver GLB ali, senão `fallback`
 *  (normalmente `terrainHeight`). Usar junto com `useTerrainVersion` p/ recomputar
 *  quando o GLB (que carrega async) entra. */
export function glbSurfaceY(x: number, z: number, fallback: number): number {
  const m = terrainMeshTopY(x, z);
  return m > -Infinity ? m : fallback;
}

/* ------------------------------------------------------------------ *
 * Amostra de COR da superfície (pra espalhar grama só na malha VERDE).
 * Raycast de cima → primeiro acerto; lê a cor do pixel da textura (map)
 * no UV do acerto, ou a cor do material / vertex-color como fallback.
 * Feito 1x no load (por ponto-candidato), cacheando o pixel-buffer por imagem.
 * ------------------------------------------------------------------ */
const _pixelCache = new WeakMap<object, { data: Uint8ClampedArray; w: number; h: number }>();
function imagePixels(img: TexImageSource): { data: Uint8ClampedArray; w: number; h: number } | null {
  const cached = _pixelCache.get(img as object);
  if (cached) return cached;
  // IMPORTANTE: NÃO cachear falha. A textura carrega async — uma leitura antes da
  // imagem decodificar (width=0) voltaria null; se isso fosse cacheado, nunca mais
  // leríamos a textura (grama some de vez). Só cacheamos quando deu certo.
  try {
    const w = (img as HTMLImageElement).width, h = (img as HTMLImageElement).height;
    if (w && h) {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img as CanvasImageSource, 0, 0);
        const out = { data: ctx.getImageData(0, 0, w, h).data, w, h };
        _pixelCache.set(img as object, out);
        return out;
      }
    }
  } catch { /* textura "tainted"/não pronta: cai no fallback de cor do material */ }
  return null;
}

const _sampleColor = new THREE.Color();
/** Cor da superfície do terreno em (x,z) (ou null se não há malha ali). */
export function surfaceColorAt(x: number, z: number): THREE.Color | null {
  if (terrains.size === 0) return null;
  ORIGIN.set(x, 500, z);
  ray.set(ORIGIN, DOWN);
  ray.far = 700;
  let best: THREE.Intersection | null = null;
  for (const root of terrains) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && (!best || hits[0]!.point.y > best.point.y)) best = hits[0]!;
  }
  if (!best) return null;
  const mesh = best.object as THREE.Mesh;
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
  const tex = mat?.map;
  if (tex?.image && best.uv) {
    const px = imagePixels(tex.image as TexImageSource);
    if (px) {
      let u = best.uv.x - Math.floor(best.uv.x); // wrap (RepeatWrapping)
      let v = best.uv.y - Math.floor(best.uv.y);
      if (tex.flipY) v = 1 - v;
      const ix = Math.min(px.w - 1, Math.max(0, Math.floor(u * px.w)));
      const iy = Math.min(px.h - 1, Math.max(0, Math.floor(v * px.h)));
      const i = (iy * px.w + ix) * 4;
      _sampleColor.setRGB(px.data[i]! / 255, px.data[i + 1]! / 255, px.data[i + 2]! / 255);
      _sampleColor.convertSRGBToLinear(); // textura é sRGB; trabalhamos em linear
      return _sampleColor;
    }
  }
  if (mat?.color) return _sampleColor.copy(mat.color);
  return null;
}

/** Lê a cor (sRGB 0-1) de uma textura já bufferizada num UV, com wrap + flipY. */
function texColorAt(
  px: { data: Uint8ClampedArray; w: number; h: number },
  tex: THREE.Texture, u: number, v: number, out: THREE.Color,
): THREE.Color {
  const uu = u - Math.floor(u);
  let vv = v - Math.floor(v);
  if (tex.flipY) vv = 1 - vv;
  const ix = Math.min(px.w - 1, Math.max(0, Math.floor(uu * px.w)));
  const iy = Math.min(px.h - 1, Math.max(0, Math.floor(vv * px.h)));
  const i = (iy * px.w + ix) * 4;
  return out.setRGB(px.data[i]! / 255, px.data[i + 1]! / 255, px.data[i + 2]! / 255);
}

const _ga = new THREE.Vector3(), _gb = new THREE.Vector3(), _gc = new THREE.Vector3();
const _gcol = new THREE.Color(), _gsum = new THREE.Color();
/**
 * Varre os TRIÂNGULOS das malhas de terreno e devolve a posição de mundo (x,z) dos
 * que caem em textura "verde" (via `isGreen`, em sRGB 0-1). O mapa é descampado: o
 * verde são manchas pequenas embutidas no barro, então amostrar por triângulo pega
 * exatamente onde elas estão (a grade espaçada errava). `tint` = média do verde
 * amostrado (já em LINEAR), pra a grama casar com o tom do chão. 1x no load.
 */
export function collectGreenSurfaceSpots(
  isGreen: (c: THREE.Color) => boolean,
  max: number,
): { spots: { x: number; z: number }[]; tint: THREE.Color | null } {
  const spots: { x: number; z: number }[] = [];
  _gsum.setRGB(0, 0, 0);
  let n = 0;
  for (const root of terrains) {
    if (spots.length >= max) break;
    // Só o chão do mapa é fonte de grama (MapFloor marca userData.grassSource). A ponte
    // e outros objetos do editor também são "terreno" (colisão), mas NÃO ganham mato.
    if (!root.userData?.['grassSource']) continue;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (spots.length >= max) return;
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial | undefined;
      const tex = mat?.map;
      if (!tex?.image) return;
      const px = imagePixels(tex.image as TexImageSource);
      if (!px) return;
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      const uv = m.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
      if (!pos || !uv) return;
      const idx = m.geometry.getIndex();
      const tris = idx ? idx.count / 3 : pos.count / 3;
      // Stride: a malha do mapa tem ~760k triângulos. Testar ~1 a cada N espalha os
      // tufos pelo mapa (em vez de amontoar nos primeiros) e limita o custo (1x no load).
      const stride = Math.max(1, Math.floor(tris / 200000));
      for (let t = 0; t < tris && spots.length < max; t += stride) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        const u0 = uv.getX(i0), v0 = uv.getY(i0);
        const u1 = uv.getX(i1), v1 = uv.getY(i1);
        const u2 = uv.getX(i2), v2 = uv.getY(i2);
        const cu = (u0 + u1 + u2) / 3, cv = (v0 + v1 + v2) / 3;
        // Amostra 3 vértices + centro: as manchas verde/oliva são MAIORES que um triângulo
        // e o centro sozinho perdia as bordas. Verde se QUALQUER ponto for verde → cobre bem.
        const green =
          isGreen(texColorAt(px, tex, cu, cv, _gcol)) ||
          isGreen(texColorAt(px, tex, u0, v0, _gcol)) ||
          isGreen(texColorAt(px, tex, u1, v1, _gcol)) ||
          isGreen(texColorAt(px, tex, u2, v2, _gcol));
        if (!green) continue;
        texColorAt(px, tex, cu, cv, _gcol); // cor do centro p/ o tint
        _gsum.add(_gcol); n++;
        _ga.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
        _gb.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
        _gc.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
        spots.push({ x: (_ga.x + _gb.x + _gc.x) / 3, z: (_ga.z + _gb.z + _gc.z) / 3 });
      }
    });
  }
  const tint = n > 0 ? _gsum.multiplyScalar(1 / n).convertSRGBToLinear() : null;
  return { spots, tint };
}

/* ---- LINHA DE TIRO: terreno/morro/labirinto bloqueiam (mira em 3ª pessoa) ---- */
const shotRay = new THREE.Raycaster();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(shotRay as any).firstHitOnly = true;
const _shotDir = new THREE.Vector3();

/**
 * Algo GRANDE (malha do mapa/morro, parede de labirinto) entre `from` e `to`? Ignora acertos
 * a menos de `skipNear` m da origem (câmera no ombro que encosta no barranco) e os últimos
 * 0,6 m (chão sob o alvo). Usa o BVH que já existe — microssegundos por tiro.
 */
export function worldBlocksShot(from: THREE.Vector3, to: THREE.Vector3, skipNear = 0): boolean {
  const len = _shotDir.subVectors(to, from).length();
  if (len < 1e-3) return false;
  shotRay.set(from, _shotDir.multiplyScalar(1 / len));
  shotRay.near = skipNear;
  shotRay.far = Math.max(skipNear, len - 0.6);
  for (const set of [terrains, walls]) {
    for (const root of set) if (shotRay.intersectObject(root, true).length > 0) return true;
  }
  return false;
}

/** Distância até a 1ª coisa GRANDE (mapa/morro/labirinto) no raio `from`+`dir` (dir unitário),
 *  ignorando os primeiros `skipNear` m; null = nada até `far`. Tiro no vazio para ali. */
export function worldShotHitDistance(from: THREE.Vector3, dir: THREE.Vector3, far: number, skipNear = 0): number | null {
  shotRay.set(from, dir);
  shotRay.near = skipNear;
  shotRay.far = far;
  let best: number | null = null;
  for (const set of [terrains, walls]) {
    for (const root of set) {
      const h = shotRay.intersectObject(root, true)[0];
      if (h && (best === null || h.distance < best)) best = h.distance;
    }
  }
  return best;
}

/* ---- PAREDES (labirinto): colisão horizontal simples ---- */
const walls = new Set<THREE.Object3D>();

/** Registra uma malha de PAREDE (ex.: labirinto) p/ bloqueio horizontal (BVH). */
export function registerWall(root: THREE.Object3D): () => void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = m.geometry as any;
    if (m.isMesh && g && !g.boundsTree) g.computeBoundsTree();
  });
  walls.add(root);
  return () => { walls.delete(root); };
}

/** Altura do topo da parede em (x,z) — raycast de cima. `-Infinity` se não há parede.
 *  No corredor o raio pega o chão (baixo) ou nada; na parede pega o topo (alto). */
export function wallHeightAt(x: number, z: number): number {
  if (walls.size === 0) return -Infinity;
  ORIGIN.set(x, 500, z);
  ray.set(ORIGIN, DOWN);
  ray.far = 700;
  let best = -Infinity;
  for (const root of walls) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}
