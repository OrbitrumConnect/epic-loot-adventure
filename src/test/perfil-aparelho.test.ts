import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { capTextures, sceneSamples, textureCapFor } from '@/components/world/device-profile';

/* 26/10 ("precisamos deixar jogável" no A17): o perfil decide sozinho; PC 100% igual. */
describe('perfil do aparelho', () => {
  it('suavização da tela do cel-shade: PC 4 (igual) · celular 2 · modo leve 0', () => {
    expect(sceneSamples('pc')).toBe(4);
    expect(sceneSamples('mobile')).toBe(2);
    expect(sceneSamples('low')).toBe(0);
  });
  it('teto de textura: PC nenhum; celular 512; mapa nunca (nitidez + grama lê); herói 1024', () => {
    expect(textureCapFor('/models/raiders/pirate.glb', 'pc')).toBe(Infinity);
    expect(textureCapFor('/models/raiders/pirate.glb', 'mobile')).toBe(512);
    expect(textureCapFor('/models/animals/buffalo.glb', 'low')).toBe(512);
    expect(textureCapFor('/models/map/rio-wasteland-iconic.glb', 'mobile')).toBe(Infinity);
    expect(textureCapFor('/models/red/hero-preview.glb', 'mobile')).toBe(1024);
  });
  it('encolhe acima do teto mantendo a proporção, 1× por textura (mesmo compartilhada), e libera a imagem grande', () => {
    let closed = 0;
    const big = { width: 2048, height: 1024, close: () => { closed++; } };
    const small = { width: 256, height: 256 };
    const t1 = new THREE.Texture(); t1.image = big;
    const t2 = new THREE.Texture(); t2.image = small;
    const mat = new THREE.MeshStandardMaterial({ map: t1, normalMap: t2 });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mat), new THREE.Mesh(new THREE.BoxGeometry(), mat)); // compartilhada
    const made: [number, number][] = [];
    const n = capTextures(root, 512, (w, h) => { made.push([w, h]); return { width: w, height: h }; });
    expect(n).toBe(1);
    expect(made).toEqual([[512, 256]]);
    expect((t1.image as { width: number }).width).toBe(512);
    expect(t2.image).toBe(small); // pequena: intacta
    expect(closed).toBe(1);
    expect(capTextures(root, 512, () => { throw new Error('não devia refazer'); })).toBe(0);
  });
  it('ligado: cel-shade usa o perfil; o perfil é o 1º import do mundo (antes de pré-carregar GLB)', () => {
    expect(fs.readFileSync('src/components/world/cel-shade.tsx', 'utf8')).toMatch(/samples: sceneSamples\(\),/);
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw.indexOf("import './world/device-profile';")).toBeLessThan(gw.indexOf("from '@react-three/fiber'"));
  });
});
