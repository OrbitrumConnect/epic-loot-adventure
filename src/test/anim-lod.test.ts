import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ANIM_FAR_M, ANIM_NEAR_M, animEvery, lodStep } from '@/components/world/anim-lod';

/* 26/10 (A17): ~200 bichos animando = ~5,3 ms/quadro no PC (≈ 20–25 ms num celular intermediário). Longe atualiza menos. */
describe('animação por distância', () => {
  it('perto todo quadro (igual antes); 40–80 m a cada 3; > 80 m a cada 6', () => {
    expect(animEvery(0)).toBe(1);
    expect(animEvery((ANIM_NEAR_M - 1) ** 2)).toBe(1);
    expect(animEvery((ANIM_NEAR_M + 1) ** 2)).toBe(3);
    expect(animEvery((ANIM_FAR_M + 1) ** 2)).toBe(6);
  });
  it('longe NÃO fica mais lento: o tempo acumulado é o mesmo — mesma pose que o de perto nos quadros de atualização', () => {
    const mk = () => {
      const bone = new THREE.Object3D(); bone.name = 'b';
      const root = new THREE.Object3D(); root.add(bone);
      const clip = new THREE.AnimationClip('walk', 1, [new THREE.NumberKeyframeTrack('b.position[x]', [0, 1], [0, 10])]);
      const m = new THREE.AnimationMixer(root); m.clipAction(clip).play();
      return { bone, m };
    };
    const near = mk(), far = mk();
    const st = { frame: 0, acc: 0 };
    let updates = 0;
    for (let f = 1; f <= 60; f++) {
      near.m.update(1 / 120);
      const d = lodStep(st, 1 / 120, 6);
      if (d > 0) { far.m.update(d); updates++; }
    }
    expect(updates).toBe(10);                                   // 6× menos trabalho
    expect(far.bone.position.x).toBeCloseTo(near.bone.position.x, 6); // mesma pose no fim
  });
  it('ligado nos bichos e nos inimigos Mixamo (a biblioteca antiga animava todos todo quadro)', () => {
    for (const f of ['src/components/world/glb-creature.tsx', 'src/components/world/glb-hero-mixamo.tsx']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).toMatch(/useLodAnimations\(/);
      expect(src).toMatch(/animEveryRef\.current = animEvery\(d2\);/);
      expect(src).not.toMatch(/useAnimations\(/);
    }
  });
});
