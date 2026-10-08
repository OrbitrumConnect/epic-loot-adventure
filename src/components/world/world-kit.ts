/**
 * Peças compartilhadas do mundo 3D: paleta, ruído do terreno e limites do mapa.
 * Extraído de `game-world.tsx` para que acampamentos, inimigos e o piloto
 * automático usem exatamente os mesmos valores (sem duplicar constantes).
 */
import * as THREE from 'three';
import { LAKE_CENTERS, RIVER_POINTS, RIVER_HALF_WIDTH, riverDistance } from '@/game/data/camps';

const names = [
  'ground', 'ground-light', 'grass', 'pine', 'leaf', 'leaf-light', 'trunk',
  'path', 'rock', 'rock-light', 'water', 'water-light', 'armor', 'cloak',
  'metal', 'crystal', 'gold', 'dark', 'light',
] as const;

export type Palette = Record<(typeof names)[number], string>;

export function palette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  return Object.fromEntries(
    names.map(name => {
      if (!ctx) return [name, css.getPropertyValue(`--world-${name}`).trim()];
      ctx.fillStyle = css.getPropertyValue(`--world-${name}`).trim();
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [name, `rgb(${r},${g},${b})`];
    }),
  ) as Palette;
}

export function rand(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2d(x: number, z: number, sx: number, sz: number): number {
  return Math.sin(x * sx + 1.7) * Math.cos(z * sz + 2.3)
       + Math.sin((x + z) * sx * 0.7 + 0.5) * 0.5;
}

export { LAKE_CENTERS, RIVER_POINTS, riverDistance, RIVER_HALF_WIDTH };

/**
 * Superfície da água dos lagos: fixa, logo ABAIXO do nível do chão (0). Como a
 * bacia do lago é escavada para baixo (ver `terrainHeight`), a água fica dentro
 * do buraco e nunca "voa" sobre o relevo, esteja o lago em planície ou colina.
 */
export const LAKE_WATER_Y = -0.25;
/** Profundidade máxima da bacia no centro do lago (~2 m, como pediu o Pedro). */
const LAKE_DEPTH = 1.7;

const RIVER_BLEND = 6;
/** Canal raso: o leito do rio afunda isto abaixo do chão pra a água assentar. */
const RIVER_DEPTH = 0.18;

/** 1 no leito do córrego, caindo a 0 na margem (usa a linha de `camps.ts`). */
function riverFlatten(x: number, z: number): number {
  const d = riverDistance(x, z);
  if (d <= RIVER_HALF_WIDTH) return 1;
  if (d >= RIVER_HALF_WIDTH + RIVER_BLEND) return 0;
  return 1 - (d - RIVER_HALF_WIDTH) / RIVER_BLEND;
}

function terrainHeightRaw(x: number, z: number): number {
  const broad  = noise2d(x, z, 0.015, 0.017) * 3.6;
  const hills  = noise2d(x, z, 0.04,  0.035) * 1.7;
  const detail = noise2d(x, z, 0.09,  0.08)  * 0.4;

  const cx = x / MAP_HALF;
  const cz = z / MAP_HALF;
  const edgeDist = 1 - Math.max(Math.abs(cx), Math.abs(cz));
  const edgeFade = Math.min(1, edgeDist * 3);

  // Clareira do nascedouro plana; relevo entra a partir de ~12 m e fica cheio em ~30 m.
  const spawnR = Math.sqrt(x * x + z * z);
  const spawnFlatten = Math.min(1, Math.max(0, (spawnR - 12) / 18));

  const shaped = (broad + hills + detail) * edgeFade * spawnFlatten;
  let ground = Math.max(0, shaped);

  // Vale do rio: aplaina a faixa e escava um canal raso pra água correr.
  const rf = riverFlatten(x, z);
  ground = ground * (1 - rf) - rf * RIVER_DEPTH;

  return ground;
}

export function lakeWaterY(_lake: { x: number; z: number; r: number }): number {
  return LAKE_WATER_Y;
}

export function terrainHeight(x: number, z: number): number {
  let h = terrainHeightRaw(x, z);

  for (const lake of LAKE_CENTERS) {
    const d = Math.sqrt((x - lake.x) ** 2 + (z - lake.z) ** 2);
    if (d < lake.r) {
      const t = Math.max(0, 1 - d / lake.r);
      h = Math.min(h, LAKE_WATER_Y - 0.05 - t * t * LAKE_DEPTH);
    }
  }

  return h;
}

export const MAP_HALF = 90;

/** Hash estável de um id para alimentar `rand` sem guardar estado. */
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h;
}

/** Escurece uma cor na direção de outra — usado para acampamento limpo. */
export function mixColor(from: string, to: string, amount: number): string {
  const a = new THREE.Color(from);
  a.lerp(new THREE.Color(to), amount);
  return `#${a.getHexString()}`;
}

/* ------------------------------------------------------------------ *
 * Clique consumido por um objeto 3D
 *
 * O mundo escuta `mousedown` no `document` para atacar. Quando o clique
 * acerta um inimigo, uma estrutura de acampamento ou um recurso, o objeto
 * marca o clique como consumido e o atalho de ataque é ignorado — assim um
 * clique nunca vale duas ações.
 * ------------------------------------------------------------------ */
let consumedAt = 0;
/** `timeStamp` do evento nativo que consumiu o clique (relógio do navegador). */
let consumedStamp = -Infinity;

/**
 * `native` (opcional) é o evento nativo do clique. Com ele a checagem compara
 * os carimbos de tempo do navegador, que não sofrem atraso se a thread
 * principal estiver ocupada entre o `pointerdown` e o `mousedown`.
 */
export function markPointerConsumed(native?: { timeStamp: number }) {
  consumedAt = performance.now();
  consumedStamp = native ? native.timeStamp : -Infinity;
}

export function wasPointerConsumed(native?: { timeStamp: number }): boolean {
  if (native && Math.abs(native.timeStamp - consumedStamp) < 60) return true;
  return performance.now() - consumedAt < 80;
}

/* ------------------------------------------------------------------ *
 * Impacto de combate: um golpe que acerta registra um "soco" que a câmera
 * lê e tremula por ~150 ms — dá peso (sensação de hit stop) sem congelar o
 * jogo nem acoplar a câmera ao sistema de feedback.
 * ------------------------------------------------------------------ */
let impactAt = -Infinity;
let impactStrength = 0;
const IMPACT_MS = 150;

export function markImpact(strength = 1) {
  impactAt = performance.now();
  impactStrength = strength;
}

/** Intensidade do tremor agora (0 quando sem impacto recente). */
export function impactShake(now: number = performance.now()): number {
  const dt = now - impactAt;
  if (dt < 0 || dt > IMPACT_MS) return 0;
  return impactStrength * (1 - dt / IMPACT_MS);
}

/* ------------------------------------------------------------------ *
 * Rótulos (nome do inimigo) em textura de canvas, com cache por texto.
 * ------------------------------------------------------------------ */
const labelCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

export function labelTexture(text: string, color = '#ffe3b0') {
  const key = `${text}|${color}`;
  const hit = labelCache.get(key);
  if (hit) return hit;

  const pad = 12;
  const font = '600 44px Manrope, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  let width = 240;
  if (measure) {
    measure.font = font;
    width = Math.ceil(measure.measureText(text).width) + pad * 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, width);
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(8,16,12,0.85)';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const entry = { texture, aspect: canvas.width / canvas.height };
  labelCache.set(key, entry);
  return entry;
}

/* ------------------------------------------------------------------ *
 * Tamanho em tela
 * ------------------------------------------------------------------ */
/**
 * Pixels de tela por metro de mundo a `dist` da câmera. Ortográfica: o zoom
 * (em pixels por unidade). Perspectiva: altura da viewport / altura visível.
 * Usado para manter barras de vida e números legíveis nas duas câmeras.
 */
export function pixelsPerUnit(camera: THREE.Camera, viewportHeight: number, dist: number): number {
  const ortho = camera as THREE.OrthographicCamera;
  if (ortho.isOrthographicCamera) return ortho.zoom;
  const fov = (camera as THREE.PerspectiveCamera).fov || 60;
  return viewportHeight / (2 * Math.max(0.5, dist) * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
}
