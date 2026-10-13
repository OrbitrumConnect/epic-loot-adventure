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

/** Fallback Ashland para SSR/testes. No navegador, palette() resolve os tokens --world-* do CSS. */
export const WORLD_PALETTE: Palette = {
  ground: '#5b4a39',
  'ground-light': '#7a6a52',
  grass: '#9a8763',
  pine: '#3d3a29',
  leaf: '#6b6442',
  'leaf-light': '#8a7f55',
  trunk: '#433a33',
  path: '#b3a081',
  rock: '#7d756a',
  'rock-light': '#9d9488',
  water: '#4d7570',
  'water-light': '#86a99a',
  armor: '#d4bf98',
  cloak: '#9e3b22',
  metal: '#6b6760',
  crystal: '#f2a24f',
  gold: '#e2bd6e',
  dark: '#17120f',
  light: '#f3e3ba',
};

export function palette(): Palette {
  if (typeof document === 'undefined') return { ...WORLD_PALETTE };
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map(name => [
    name, styles.getPropertyValue(`--world-${name}`).trim() || WORLD_PALETTE[name],
  ])) as Palette;
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

export const MAP_HALF = 90;

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

/**
 * CADEIA MONTANHOSA no canto noroeste (vazio: longe de spawn/lago/camps).
 * Vários picos de altura/raio diferentes, conectados por MAX → sopé → subida →
 * picos nevados, com vales entre eles (dá pra iniciar a subida e ir ganhando
 * altura). Relevo CLIMÁVEL (player/criatura sobem porque amostram terrainHeight).
 * A cor (neve/rocha) é pintada no terreno (game-world), então mescla de verdade.
 */
const SNOW_PEAKS = [
  { x: -74, z: 64, r: 38, h: 34 }, // pico principal (alto, nevado, GORDO)
  { x: -58, z: 76, r: 28, h: 22 }, // ombro nordeste
  { x: -88, z: 48, r: 34, h: 28 }, // segundo pico sudoeste (maciço)
  { x: -64, z: 52, r: 22, h: 15 }, // morro de entrada (início da subida)
] as const;
/** Referência pra cor da neve/rocha (pico mais alto da cadeia). */
export const SNOW_MOUNTAIN = { x: -74, z: 64, r: 38, peak: 34 };

/** Complexo industrial desativado (prédios GLB) — ÁREA DE ENERGIA da base, leste vazio.
 *  Vários prédios ESPALHADOS; é onde se consegue energia/fiação pra iluminar a base.
 *  O prédio GLB tem CHÃO RETO → o terreno é achatado numa ZONA PLANA (mesma altura
 *  pra todos, sem conflito de pads) que cobre TODA a faixa do prédio. */
export const FACTORY_PAD_R = 13;        // cobre a faixa do prédio (footprint ~11 m)
const FACTORY_PAD_CORE = 0.66;          // miolo 100% plano; só a borda externa mescla
/** ESPALHADAS por regiões distintas (centro+cantos planos, longe de água). Uma no
 *  lugar da ruína tosca do meio (onde nasce). Cada uma achata no SEU nível. */
const FACTORY_POS: { x: number; z: number; rot: number }[] = [
  { x: 7, z: -8, rot: 0.4 },     // CENTRO (substitui a ruína do spawn)
  { x: 72, z: 18, rot: 1.9 },    // leste
  { x: -28, z: -55, rot: -0.8 }, // sudoeste
  { x: 78, z: -68, rot: 2.6 },   // sudeste
];
/** padY = altura natural no centro; o footprint inteiro é achatado nela. */
export const FACTORY_SITES = FACTORY_POS.map((p) => ({ ...p, padY: terrainHeightRaw(p.x, p.z) }));

export function snowMountainBump(x: number, z: number): number {
  // MAX dos domos (cadeia conectada; vales entre picos ficam mais baixos).
  let h = 0;
  for (const p of SNOW_PEAKS) {
    const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
    if (d >= p.r) continue;
    const t = 1 - d / p.r;
    const dome = p.h * (t * t * (3 - 2 * t)); // smoothstep (assenta liso na borda)
    if (dome > h) h = dome;
  }
  if (h <= 0) return 0;
  // Erosão ROCHOSA em camadas, proporcional à altura (sopé liso, cume quebra a
  // forma redonda sem virar espinho). Mais oitavas no alto = cume menos "bola".
  const rug = (noise2d(x, z, 0.05, 0.055) * 2.8 + noise2d(x, z, 0.12, 0.13) * 1.8 + noise2d(x, z, 0.22, 0.24) * 0.9) * Math.min(1, h / 5);
  return h + rug;
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

  h += snowMountainBump(x, z); // relevo climável no canto NO

  // Zona industrial PLANA (prédio tem chão reto; relevo faria flutuar). Miolo
  // 100% plano cobrindo a faixa do prédio; só a borda externa mescla no terreno.
  // padY é o mesmo pra todos → pads vizinhos se fundem sem degrau.
  let padT = 0;
  let padY = 0;
  for (const f of FACTORY_SITES) {
    const d = Math.sqrt((x - f.x) ** 2 + (z - f.z) ** 2);
    if (d >= FACTORY_PAD_R) continue;
    const inner = FACTORY_PAD_R * FACTORY_PAD_CORE;
    let t: number;
    if (d <= inner) t = 1;
    else { const u = 1 - (d - inner) / (FACTORY_PAD_R - inner); t = u * u * (3 - 2 * u); }
    if (t > padT) { padT = t; padY = f.padY; } // sites espalhados: cada um no SEU nível
  }
  if (padT > 0) h = h * (1 - padT) + padY * padT;

  return h;
}

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
