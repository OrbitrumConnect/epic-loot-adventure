/**
 * PERFIL DO APARELHO (26/10 — "precisamos deixar jogável" no A17). Decide sozinho, sem o jogador escolher nada:
 *  - PC (mouse): TUDO igual a antes (suavização 4×, texturas como estão).
 *  - Celular (toque): suavização da tela do cel-shade 2× (metade da memória dela) e texturas até 512 px — o MAPA fica
 *    fora (é o que mais aparece; e a grama lê a cor dele) e o HERÓI até 1024 (sempre perto da câmera).
 *  - Modo leve (aparelho que já derrubou o 3D 2× — gpu-guard.ts): sem suavização + texturas do celular.
 * As texturas encolhem NO CARREGAMENTO (GLTFLoader.load), sem mexer em arquivo nenhum.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { lowGpuMode } from './gpu-guard';

export type DeviceKind = 'pc' | 'mobile' | 'low';

export function detectDevice(): DeviceKind {
  if (lowGpuMode()) return 'low';
  if (typeof window === 'undefined') return 'pc';
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return coarse ? 'mobile' : 'pc';
  } catch { return 'pc'; }
}
export const DEVICE: DeviceKind = detectDevice();

/** Amostras da suavização (MSAA) da tela intermediária do cel-shade. */
export function sceneSamples(kind: DeviceKind = DEVICE): number {
  return kind === 'pc' ? 4 : kind === 'mobile' ? 2 : 0;
}

export const MOBILE_TEX = 512;
export const MOBILE_HERO_TEX = 1024;
/** Teto de textura (px) pro GLB `url` neste aparelho (Infinity = não mexe). */
export function textureCapFor(url: string, kind: DeviceKind = DEVICE): number {
  if (kind === 'pc') return Infinity;
  if (url.includes('/models/map/rio-wasteland')) return Infinity; // chão: nitidez + a grama lê os pixels
  if (url.includes('/models/red/')) return MOBILE_HERO_TEX;       // herói (perto da câmera)
  return MOBILE_TEX;
}

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'] as const;
type Drawable = { width: number; height: number; close?: () => void };
type MakeCanvas = (w: number, h: number, src: Drawable) => unknown;

const defaultCanvas: MakeCanvas = (w, h, src) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')?.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return c;
};

/** Encolhe (1×, mesmo textura compartilhada) as texturas da cena acima de `cap` px. Devolve quantas mudou. */
export function capTextures(root: THREE.Object3D, cap: number, makeCanvas: MakeCanvas = defaultCanvas): number {
  if (!Number.isFinite(cap)) return 0;
  let changed = 0;
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const k of MAP_KEYS) {
        const tex = (m as unknown as Record<string, THREE.Texture | null | undefined>)[k];
        if (!tex || tex.userData['capped'] || (tex as THREE.CompressedTexture).isCompressedTexture) continue;
        tex.userData['capped'] = true;
        const img = tex.image as Drawable | undefined;
        if (!img || !(img.width > cap || img.height > cap)) continue;
        const s = cap / Math.max(img.width, img.height);
        tex.image = makeCanvas(Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)), img);
        try { img.close?.(); } catch { /* bitmap já liberado */ }
        tex.needsUpdate = true;
        changed++;
      }
    }
  });
  return changed;
}

/** Liga o teto no carregador de GLB (1× por app). PC: não faz nada. */
let installed = false;
export function installTextureCap(kind: DeviceKind = DEVICE): void {
  if (installed || kind === 'pc') return;
  installed = true;
  type LoadFn = (url: string, onLoad: (g: { scene: THREE.Object3D }) => void, onProgress?: unknown, onError?: unknown) => unknown;
  const proto = GLTFLoader.prototype as unknown as { load: LoadFn };
  const orig = proto.load;
  proto.load = function (this: unknown, url, onLoad, onProgress, onError) {
    const cap = textureCapFor(url, kind);
    const wrapped = Number.isFinite(cap) ? (g: { scene: THREE.Object3D }) => { capTextures(g.scene, cap); onLoad(g); } : onLoad;
    return orig.call(this, url, wrapped, onProgress, onError);
  };
}

// Liga ao importar (game-world importa este arquivo PRIMEIRO). PC: não faz nada.
installTextureCap();
