import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }), useAnimations: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));
import { createFootCache, footMinY, skinnedMinY, FOOT_KEEP, FOOT_RESCAN, nextGroundOffset } from '@/components/world/glb-creature';
import { accumulateFrame } from '@/components/world/perf-stats';

/* Pedro, 25/10: "go elite sem regressão" — otimizações + painel de desempenho + correções de chão. */
describe('pés baratos (assentamento pelo corpo)', () => {
  const body = () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial());
    m.position.y = 3; g.add(m); g.updateMatrixWorld(true);
    return { g, m };
  };
  it('mesmo resultado da medição completa, olhando só ~96 pontos entre as varreduras', () => {
    const { g, m } = body();
    const cache = createFootCache();
    expect(footMinY(g, cache)).toBeCloseTo(skinnedMinY(g), 5); // 1ª = varredura completa
    expect(cache.picks.reduce((n, p) => n + p.idx.length, 0)).toBe(FOOT_KEEP);
    m.position.y = 2.5; g.updateMatrixWorld(true);              // o corpo desceu (anda/pula)
    expect(footMinY(g, cache)).toBeCloseTo(skinnedMinY(g), 2);  // só os pés: mesmo valor
    expect(FOOT_RESCAN).toBeGreaterThan(1);
  });
  it('1ª medição encaixa NA HORA (não "brota do chão")', () => {
    expect(nextGroundOffset(0, -0.6, 0, 1)).toBeCloseTo(0.6); // enterrado 0,6 → sobe tudo de uma vez
    expect(nextGroundOffset(0, -0.6, 0)).toBeLessThan(0.3);     // depois: suave
  });
});

describe('painel de desempenho', () => {
  it('fecha a janela de 0,5 s com FPS, média e PIOR quadro (travada)', () => {
    const acc = { t: 0, n: 0, worst: 0 };
    let out = null;
    for (let i = 0; i < 29; i++) out = accumulateFrame(acc, 1 / 60) ?? out;
    out = accumulateFrame(acc, 0.1) ?? out; // 1 travada de 100 ms
    expect(out).not.toBeNull();
    expect(out!.worstMs).toBeCloseTo(100, 0);
    expect(out!.fps).toBeGreaterThan(40);
  });
});

describe('Couraça e Fúngico −15% + passo sem patinar', () => {
  it('alturas 3,32 / 3,83 m com strideSync', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(src).toMatch(/spiked\.glb', standFixX: Math\.PI \/ 2, height: 3\.32, bindFix: true, autoGround: true, strideSync: true/);
    expect(src).toMatch(/alien_brute\.glb', standFixX: Math\.PI \/ 2, height: 3\.83, bindFix: true, autoGround: true, strideSync: true/);
  });
  it('caminhada: ritmo = velocidade ÷ (1,182 corpos/s × corpo)', async () => {
    const { WALK_BODYLEN_PER_S } = await import('@/components/world/glb-hero-mixamo');
    expect(WALK_BODYLEN_PER_S).toBeCloseTo(1.182, 3);
    // Couraça: corpo ~2,8 m (cabeça→dedão de 3,32 m), anda 3,69 m/s → ~1,1× (antes 1× fixo, patinava)
    expect(3.69 / (WALK_BODYLEN_PER_S * 2.8)).toBeGreaterThan(1.05);
  });
});
