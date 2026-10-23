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
