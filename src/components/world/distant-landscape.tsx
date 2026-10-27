import { useMemo } from 'react';
import * as THREE from 'three';
import { type Palette } from './world-kit';
import { pbrMaps } from './pbr-materials';
import { MAP_EDGE_R, MAP_EDGE_SEG, MAP_EDGE_START, MAP_EDGE_Y, MAP_PLATEAU_MASK } from './map-edge-contour';

/** Largura do anel depois da borda e onde o relevo chega no máximo (fração da largura). */
export const RING_WIDTH = 115;
const PEAK_AT = 0.22;
const ROWS = 32;

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
 * da ilha, que vai até 115–190 m, e deixava fresta nas diagonais). Volta 0 = 2 m DENTRO do platô (a máscara esconde),
 * volta 1 = 0,3 m fora da borda na altura dela (a emenda), daí o relevo pra fora.
 */
export function buildRingGeometry(c: Palette): THREE.BufferGeometry {
  const seg = MAP_EDGE_SEG;
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  const stone = new THREE.Color(c['rock-light']).lerp(new THREE.Color('white'), 0.75);
  // Mescla com o CHÃO caminhável (grass, meio desértico) + mantém um pouco de
  // verde (leaf) → montanha coerente com o mapa, não verdão (pedido do Pedro).
  const moss = new THREE.Color(c.grass).lerp(new THREE.Color(c.leaf), 0.4).lerp(new THREE.Color('white'), 0.5);
  const color = new THREE.Color();
  const rows = ROWS + 2;
  for (let row = 0; row <= rows; row++) {
    for (let i = 0; i <= seg; i++) {
      const k = i % seg;
      const angle = i / seg * Math.PI * 2;
      const edgeR = MAP_EDGE_R[k]!, edgeY = MAP_EDGE_Y[k]!;
      let radius: number, y: number;
      if (row === 0) { radius = MAP_EDGE_START[k]!; y = edgeY; }
      else {
        const t = (row - 1) / ROWS;
        radius = edgeR + 0.3 + t * RING_WIDTH;
        y = ringHeight(angle, t, edgeY);
      }
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      positions.push(x, y, z);
      uv.push(x / 12, z / 12);
      color.copy(moss).lerp(stone, THREE.MathUtils.smoothstep(y, 8, 30));
      colors.push(color.r, color.g, color.b);
      if (row < rows && i < seg) {
        const a = row * (seg + 1) + i, b = a + seg + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
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
  new THREE.TextureLoader().load(MAP_PLATEAU_MASK.url, (tex) => {
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = false; // linha 0 = z0 (a ferramenta grava assim)
    tex.generateMipmaps = false;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
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
