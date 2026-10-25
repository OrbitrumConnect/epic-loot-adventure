import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('@react-three/drei', () => ({ useGLTF: vi.fn(), useAnimations: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));

import { nextGroundOffset, skinnedMinY } from '@/components/world/glb-creature';

/* Pedro, 23/10: o robô (Mecha Pelter) não andava no piso — o ajuste fixo (−1,1) é da pose parada e a
   animação muda a altura do corpo. Agora mede o ponto mais baixo do corpo ANIMADO e encosta no chão. */
describe('assentamento pelo corpo animado', () => {
  it('mede o ponto mais baixo em coordenadas de mundo', () => {
    const geo = new THREE.BoxGeometry(1, 2, 1); // y −1..1
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    const root = new THREE.Group();
    root.position.y = 5;
    root.add(mesh);
    root.updateMatrixWorld(true);
    expect(skinnedMinY(root)).toBeCloseTo(4, 5);
  });

  it('converge pro pé no chão (flutuando 1,2 m ou enterrado 0,8 m), sem passar do ponto', () => {
    for (const erro of [1.2, -0.8]) {
      let offset = -1.1;
      let pe = 0 + erro; // pé (minY) com o offset atual, chão em 0
      for (let i = 0; i < 20; i++) {
        const novo = nextGroundOffset(offset, pe, 0);
        pe += novo - offset; // mover o offset move o pé igual
        offset = novo;
      }
      expect(pe).toBeCloseTo(0, 2);
    }
  });

  it('sem medida (modelo sem vértice) mantém o offset', () => {
    expect(nextGroundOffset(-1.1, Infinity, 0)).toBe(-1.1);
  });
});

/* Pedro, 25/10: a Couraça andava com metade do corpo dentro do mapa (o pé do clip fica ~15% da altura abaixo
   da sola da pose parada). Mesmo assentamento dos bichos, agora no componente dos raiders Mixamo. */
describe('Couraça assenta pelo corpo animado', () => {
  it('raider.tsx liga autoGround na Couraça e o componente usa o mesmo cálculo dos bichos', async () => {
    const fs = await import('node:fs');
    const raider = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(raider).toMatch(/raider_samurai: \{[^}]*autoGround: true/);
    expect(raider).toMatch(/raider_mushroom: \{[^}]*autoGround: true/); // Fúngico (Pedro: "perfeito", 25/10)
    expect(raider).toMatch(/autoGround=\{mx\.autoGround \?\? false\}/);
    const hero = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(hero).toMatch(/if \(near && autoGround && g\.parent[\s\S]{0,300}nextGroundOffset\(g\.position\.y, skinnedMinY\(g\), tmpHeroV\.y\)/);
  });

  it('corpo 0,6 m enterrado (Couraça de 3,9 m) sobe até pisar no chão em ~2 s', () => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 3.9, 1), new THREE.MeshBasicMaterial());
    body.position.y = 3.9 / 2 - 0.6; // pé 0,6 m abaixo do chão (y=0)
    const g = new THREE.Group(); g.add(body);
    for (let i = 0; i < 7; i++) { g.updateMatrixWorld(true); g.position.y = nextGroundOffset(g.position.y, skinnedMinY(g), 0); }
    g.updateMatrixWorld(true);
    expect(Math.abs(skinnedMinY(g))).toBeLessThan(0.03);
  });
});
