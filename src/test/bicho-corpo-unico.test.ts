import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }), useAnimations: vi.fn(), Html: () => null }));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: vi.fn(), createPortal: vi.fn() }));

/* 27/10 — bicho com GLB carregava também o corpo procedural (~20 peças) montado e escondido: o three.js recalcula
   a matriz de objeto escondido todo quadro. Escondido ainda é clicável, então virou UMA caixa com o mesmo contorno. */
describe('bicho com GLB: um corpo só + caixa de clique', () => {
  it('caixa cobre do chão ao topo da cabeça e da traseira ao focinho', async () => {
    const { BEASTS, beastHitbox } = await import('@/components/world/beast');
    for (const [id, spec] of Object.entries(BEASTS)) {
      const h = beastHitbox(spec);
      const [, bh, bd] = spec.body;
      const bodyY = spec.legLen + bh / 2;
      expect(h.h, id).toBeGreaterThanOrEqual(bodyY + bh / 2 - 1e-9);                      // corpo inteiro
      expect(h.h, id).toBeGreaterThanOrEqual(bodyY + spec.headPos[1] + spec.head[1] / 2 - 1e-9); // cabeça
      expect(h.cz + h.d / 2, id).toBeGreaterThanOrEqual(spec.headPos[2] + spec.head[2] / 2 - 1e-9); // focinho
      expect(h.cz - h.d / 2, id).toBeCloseTo(-bd / 2);                                    // traseira
      expect(h.cy - h.h / 2, id).toBeCloseTo(0);                                          // nasce no chão
    }
  });
  it('com GLB monta só a caixa invisível; corpo procedural só sem GLB', () => {
    const src = fs.readFileSync('src/components/world/beast.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(src).not.toMatch(/visible=\{!glb\}/);
    expect(src).toMatch(/\{glb \? \(\n\s*<mesh visible=\{false\} position=\{\[0, hit\.cy, hit\.cz\]\}/);
    expect(src).toMatch(/\) : \(\n\s*<group ref=\{inner\}>/);
  });
});
