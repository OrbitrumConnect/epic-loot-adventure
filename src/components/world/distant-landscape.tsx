import { useMemo } from 'react';
import * as THREE from 'three';
import { type Palette } from './world-kit';
import { pbrMaps } from './pbr-materials';
import { MAP_EDGE_R, MAP_EDGE_SEG, MAP_EDGE_START, MAP_EDGE_Y, MAP_PLATEAU_MASK } from './map-edge-contour';

/** Largura do anel depois da borda e onde o relevo chega no máximo (fração da largura). */
export const RING_WIDTH = 115;
const PEAK_AT = 0.22;
/**
 * LEVE (Pedro 27/10: "fora da área de acesso não pode pesar"): detalhe só na EMENDA.
 *  - emenda (borda → FINE_T da largura, ~5 m): 720 direções, encaixe perfeito;
 *  - morros: 1 direção a cada COARSE (180 no total) e COARSE_ROWS voltas;
 *  - nada além de MAX_R do centro: herói vai até 90 m e a câmera vê 160 m → além de 260 m nunca aparece.
 */
const FINE_T = 0.04;
const COARSE = 4;
const COARSE_ROWS = 16;
export const MAX_R = 260;

/**
 * Altura do anel na volta `t` (0 = emenda com a ilha, 1 = fim): começa EXATAMENTE na altura da borda do platô e sobe
 * logo depois (pico ~25 m fora da borda — senão as montanhas saem do alcance da câmera, que vê até 160 m).
 */
export function ringHeight(angle: number, t: number, edgeY: number): number {
  const massif = 5 + 20 * Math.pow(Math.sin(angle * 3 + 0.8), 10) + 15 * Math.pow(Math.sin(angle * 5 - 1), 16);
  const ridge = 1 - Math.abs(Math.sin(angle * 23 + t * 9)) * 0.16 - Math.abs(Math.sin(angle * 47 - t * 13)) * 0.07;
  const rise = THREE.MathUtils.smoothstep(t, 0, PEAK_AT) * (1 - 0.35 * THREE.MathUtils.smoothstep(t, 0.6, 1));
  const base = THREE.MathUtils.lerp(edgeY, -1.2, THREE.MathUtils.smoothstep(t, 0, 0.5));
  return base + rise * massif * ridge;
}

/**
 * Geometria do anel encaixado na BORDA REAL da ilha (27/10 — antes era um quadrado fixo a 102 m: entrava por cima
 * da ilha, que vai até 115–190 m, e deixava fresta nas diagonais).
 *  Voltas FINAS (720 direções): 0 = 2 m DENTRO do platô (a máscara esconde), 1 = 0,3 m fora da borda na altura dela
 *  (a emenda), 2 = FINE_T da largura. Uma faixa de transição liga a volta 2 (fina) à 1ª volta GROSSA (180 direções)
 *  sem fresta (cada direção grossa recebe 4 finas em leque). Daí as voltas grossas sobem o relevo até o fim.
 */
export function buildRingGeometry(c: Palette): THREE.BufferGeometry {
  const seg = MAP_EDGE_SEG, cseg = seg / COARSE;
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  const stone = new THREE.Color(c['rock-light']).lerp(new THREE.Color('white'), 0.75);
  // Mescla com o CHÃO caminhável (grass, meio desértico) + mantém um pouco de
  // verde (leaf) → montanha coerente com o mapa, não verdão (pedido do Pedro).
  const moss = new THREE.Color(c.grass).lerp(new THREE.Color(c.leaf), 0.4).lerp(new THREE.Color('white'), 0.5);
  const color = new THREE.Color();
  let n = 0;
  const vert = (angle: number, radius: number, y: number): number => {
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    positions.push(x, y, z);
    uv.push(x / 12, z / 12);
    color.copy(moss).lerp(stone, THREE.MathUtils.smoothstep(y, 8, 30));
    colors.push(color.r, color.g, color.b);
    return n++;
  };
  /** Largura do relevo nessa direção: até RING_WIDTH, sem passar de MAX_R do centro. */
  const widthAt = (edgeR: number) => Math.max(10, Math.min(RING_WIDTH, MAX_R - edgeR - 0.3));
  const quad = (a: number, a1: number, b: number, b1: number) => indices.push(a, a1, b, a1, b1, b);

  // Voltas finas.
  const fine: number[][] = [[], [], []];
  for (let i = 0; i <= seg; i++) {
    const k = i % seg, angle = i / seg * Math.PI * 2;
    const edgeR = MAP_EDGE_R[k]!, edgeY = MAP_EDGE_Y[k]!;
    fine[0]!.push(vert(angle, MAP_EDGE_START[k]!, edgeY));
    fine[1]!.push(vert(angle, edgeR + 0.3, edgeY));
    fine[2]!.push(vert(angle, edgeR + 0.3 + FINE_T * widthAt(edgeR), ringHeight(angle, FINE_T, edgeY)));
  }
  for (let r = 0; r < 2; r++) for (let i = 0; i < seg; i++) quad(fine[r]![i]!, fine[r]![i + 1]!, fine[r + 1]![i]!, fine[r + 1]![i + 1]!);

  // Voltas grossas: a 1ª fica além da MAIOR borda entre as 4 finas que ela cobre (nunca dobra por cima da fina).
  const coarse: number[][] = [];
  for (let row = 0; row <= COARSE_ROWS; row++) {
    const t = 2 * FINE_T + (1 - 2 * FINE_T) * row / COARSE_ROWS;
    const line: number[] = [];
    for (let j = 0; j <= cseg; j++) {
      const k = (j * COARSE) % seg, angle = j / cseg * Math.PI * 2;
      let edgeR = MAP_EDGE_R[k]!;
      for (let d = -COARSE; d <= COARSE; d++) edgeR = Math.max(edgeR, MAP_EDGE_R[(k + d + seg) % seg]!);
      const w = widthAt(edgeR);
      line.push(vert(angle, edgeR + 0.3 + t * w, ringHeight(angle, t, MAP_EDGE_Y[k]!)));
    }
    coarse.push(line);
  }
  // Transição fina → grossa (leque): 4 finas por grossa, sem vértice solto (sem fresta).
  for (let j = 0; j < cseg; j++) {
    const c0 = coarse[0]![j]!, c1 = coarse[0]![j + 1]!;
    for (let m = 0; m < COARSE; m++) {
      const f0 = fine[2]![j * COARSE + m]!, f1 = fine[2]![j * COARSE + m + 1]!;
      indices.push(f0, f1, m < COARSE / 2 ? c0 : c1);
    }
    indices.push(fine[2]![j * COARSE + COARSE / 2]!, c1, c0);
  }
  for (let r = 0; r < COARSE_ROWS; r++) for (let j = 0; j < cseg; j++) quad(coarse[r]![j]!, coarse[r]![j + 1]!, coarse[r + 1]![j]!, coarse[r + 1]![j + 1]!);

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  return result;
}

/** Máscara do platô (tools/bake-map-edge.mjs): onde é branca há chão da ilha → o anel não desenha ali. */
const maskUniforms = {
  uPlatMask: { value: null as THREE.Texture | null },
  uMaskRect: { value: new THREE.Vector4(MAP_PLATEAU_MASK.x0, MAP_PLATEAU_MASK.z0, MAP_PLATEAU_MASK.w, MAP_PLATEAU_MASK.h) },
  uMaskOn: { value: 0 }, // 0 até a máscara carregar: anel escondido (nunca aparece por cima da ilha)
};
let maskRequested = false;
function requestMask(): void {
  if (maskRequested || typeof window === 'undefined') return;
  maskRequested = true;
  // 1 canal só na placa de vídeo (R8: ~0,35 MB em vez de ~1,4 MB RGBA). Linha 0 = z0 (a ferramenta grava assim).
  new THREE.ImageLoader().load(MAP_PLATEAU_MASK.url, (img) => {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
    const red = new Uint8Array(img.width * img.height);
    for (let p = 0; p < red.length; p++) red[p] = rgba[p * 4]!;
    const tex = new THREE.DataTexture(red, img.width, img.height, THREE.RedFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    maskUniforms.uPlatMask.value = tex;
    maskUniforms.uMaskOn.value = 1;
  });
}

function withPlateauMask(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, maskUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEdgeXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdgeXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEdgeXZ;\nuniform sampler2D uPlatMask;\nuniform vec4 uMaskRect;\nuniform float uMaskOn;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (uMaskOn < 0.5) discard;
  vec2 muv = (vEdgeXZ - uMaskRect.xy) / uMaskRect.zw;
  if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0 && texture2D(uPlatMask, muv).r > 0.5) discard;`);
  };
  mat.customProgramCacheKey = () => 'map-edge-mask-v1';
  return mat;
}

/** Paisagem de fundo em volta da ilha. Sem colisão e sem simulação — só cenário. */
export function DistantLandscape({ c }: { c: Palette }) {
  const geometry = useMemo(() => buildRingGeometry(c), [c]);
  const material = useMemo(() => {
    requestMask();
    return withPlateauMask(new THREE.MeshStandardMaterial({
      ...pbrMaps('worn_rock_natural_01'), vertexColors: true, roughness: 1, side: THREE.DoubleSide,
    }));
  }, []);
  return <mesh geometry={geometry} material={material} raycast={() => {}} />;
}
