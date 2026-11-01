import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fadeLoop, makeInstanceFadeMaterial, registerInstancedFade, updateOcclusion } from '@/components/world/occlusion';

/* 1/11 (Pedro: "elite sem regressão, FPS top"): ~2 mi de triângulos/quadro → ~1,1 mi na superfície e ~0,1 mi na
   caverna, com o MESMO desenho (A/B no mesmo quadro: 0 pixel diferente; só 4 pixels de borda de galho na Gávea, empate
   de profundidade da passada única). */
describe('árvores de coleta: uma passada quando ninguém está apagado', () => {
  it('lote dupla-face começa em 1 passada; volta pras 2 só enquanto alguma instância apaga (ordem do alfa)', () => {
    const mat = makeInstanceFadeMaterial(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 2);
    const m = new THREE.Matrix4();
    mesh.setMatrixAt(0, m.makeTranslation(0, 1, 5)); // entre o herói (0,0,0) e a câmera (0,1,10): esconde o herói
    mesh.setMatrixAt(1, m.makeTranslation(30, 0, 0));
    mesh.count = 2;
    const off = registerInstancedFade(mesh, [[0, 0, 0, 1]]);
    try {
      expect(mat.forceSinglePass).toBe(true);
      const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1, 10); cam.updateMatrixWorld();
      const hero = new THREE.Object3D();
      // primeiros quadros: 2 passadas (o shader delas fica pronto na carga)
      updateOcclusion(cam, hero, 1 / 60);
      expect(mat.forceSinglePass).toBe(false);
      for (let i = 0; i < 80; i++) updateOcclusion(cam, hero, 1 / 60);
      expect(mat.forceSinglePass).toBe(false); // a caixa 0 está apagada (esconde o herói) → 2 passadas
      // sai da frente: o fade volta a 100% e aí uma passada
      mesh.setMatrixAt(0, m.makeTranslation(-30, 0, 0)); mesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 120; i++) updateOcclusion(cam, hero, 1 / 60);
      expect(mat.forceSinglePass).toBe(true);
    } finally { off(); }
  });

  it('material de uma face (pedra, veio) não muda', () => {
    const mat = makeInstanceFadeMaterial(new THREE.MeshStandardMaterial());
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 1);
    const off = registerInstancedFade(mesh, [[0, 0, 0, 1]]);
    try { expect(mat.forceSinglePass).toBe(false); } finally { off(); }
  });

  it('o fade avisa que está vivo (aí ninguém reordena instâncias)', () => {
    expect(fadeLoop.mounted).toBe(0);
    const src = fs.readFileSync('src/components/world/occlusion-fader.tsx', 'utf8');
    expect(src).toMatch(/fadeLoop\.mounted\+\+; return \(\) => \{ fadeLoop\.mounted--; \}/);
  });
});

describe('nós de coleta: sombra só na caixa do sol + recorte pela câmera', () => {
  const src = fs.readFileSync('src/components/world/harvest-nodes.tsx', 'utf8');
  it('o lote da tela não projeta sombra; a cópia só-sombra desenha 0 na tela e as escolhidas no passe de sombra', () => {
    expect(src).toMatch(/castShadow=\{false\}/);
    expect(src).toMatch(/sh\.onBeforeShadow = \(\) => \{ sh\.count = inShadow\.current\.n; \}/);
    expect(src).toMatch(/sh\.onAfterShadow = \(\) => \{ sh\.count = 0; \}/);
    expect(src).toMatch(/shadowSun\(scene, performance\.now\(\)\)/);
  });
  it('recorte pela câmera só sem fade rodando; ids seguem a ordem do lote (clique certo)', () => {
    expect(src).toMatch(/if \(fadeLoop\.mounted === 0\) \{/);
    expect(src).toMatch(/list\[j\] = B\.ids\[o\]!;/);
    expect(src).toMatch(/ids\.current = list;/);
  });
});

describe('Zona Sul: caverna lá no fundo', () => {
  const src = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
  it('sol zerado e a sombra dele PARA (a luz fica na cena — sem recompilar)', () => {
    expect(src).toMatch(/const SUN_OFF_DARK = 0\.999;/);
    expect(src).toMatch(/sun\.intensity = off \? 0 : zsSun\.intensity \* \(1 - zsCave\.dark\);/);
    expect(src).toMatch(/sun\.shadow\.autoUpdate = !off;/);
    expect(src.match(/followSun\(sun\.current, p\)/g)?.length).toBe(3);
  });
  it('acampamentos e recursos somem junto com a superfície', () => {
    expect(src).toMatch(/<ZsSurface><Camps c=\{c\} \/><\/ZsSurface>/);
    expect(src).toMatch(/<ZsSurface><HarvestNodes c=\{cFarm\} \/><\/ZsSurface>/); // 01/11: folha da farm no tom da mata
  });
});
