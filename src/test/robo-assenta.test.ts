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
    // 25/10: mesmo cálculo, versão barata (só os pés) e 1ª medição encaixa na hora.
    // 25/10: 1ª medição ao NASCER em qualquer distância (antes só perto → nascia enterrado e subia ao chegar).
    expect(hero).toMatch(/if \(autoGround && g\.parent && groundDue\(groundInit\.current, \+\+groundAcc\.current, near\)\)[\s\S]{0,400}nextGroundOffset\(g\.position\.y, footMinY\(g, footCache\.current\), tmpHeroV\.y, groundInit\.current \? 0\.35 : 1\)/);
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

/* Pedro, 25/10: "inimigos do acampamento nascem abaixo do solo, só o peito visível; Couraça nasce abaixo e sobe
   quando anda". O ajuste pelo corpo só rodava PERTO (40 m) e não estava ligado nos inimigos de acampamento. */
describe('assenta ao NASCER, em qualquer distância', () => {
  it('1ª medição 3 quadros depois de nascer (longe ou perto); depois a cada ~0,3 s só perto', async () => {
    const { groundDue } = await import('@/components/world/glb-creature');
    expect(groundDue(false, 2, false)).toBe(false);
    expect(groundDue(false, 3, false)).toBe(true);  // longe: mede mesmo assim (antes: nunca)
    expect(groundDue(true, 18, false)).toBe(false); // depois: longe não gasta
    expect(groundDue(true, 18, true)).toBe(true);
    expect(groundDue(true, 19, true)).toBe(false);
  });
  it('inimigos de acampamento: autoGround ligado e −30% SÓ no acampamento (horda no tamanho original)', async () => {
    const fs = await import('node:fs');
    const r = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(r).toMatch(/pirate\.glb', standFixX: Math\.PI \/ 2, height: 1\.8, bindFix: true, autoGround: true/);
    expect(r).toMatch(/scrap_brute\.glb', standFixX: Math\.PI \/ 2, height: 2\.3, bindFix: true, autoGround: true/);
    expect(r).toMatch(/rope_archer\.glb', standFixX: Math\.PI \/ 2, height: 1\.85, forceBow: true, twistFix: true, autoGround: true/);
    expect(r).toMatch(/swamp\.glb', standFixX: Math\.PI \/ 2, height: 1\.9, bindFix: true, autoGround: true/);
    expect(r).toMatch(/export const CAMP_SCALE = 0\.49;/); // −30% e mais −30% (Pedro 25/10)
    expect(r).toMatch(/const sizeK = isCampSpawn\(creatureId\) \? \(CAMP_SCALE_BY\[speciesId\] \?\? CAMP_SCALE\) : 1;/);
    expect(r).toMatch(/export const CAMP_SCALE_BY: Record<string, number> = \{ raider_samurai: 0\.87 \};/); // Couraça ~2,9 m no acampamento
    expect(r).toMatch(/autoHeight=\{mx\.height \* sizeK\}/);
  });
});
