import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ useGLTF: vi.fn(), useAnimations: vi.fn(), Html: () => null }));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));
import { FLYERS, flyLift } from '@/components/world/beast';

/* Pedro, 25/10: "o pombo voa meio de lado; pode voar mais alto; o ataque vem de cima pra baixo, não reto". */
const P = FLYERS['pigeon']!;

describe('pombo: voo e mergulho', () => {
  it('passeando voa alto (~2 m acima do pairar)', () => {
    expect(flyLift(P, { chasing: false, distToPlayer: 30, swing: 0 }, 0)).toBeCloseTo(2.0, 1);
  });
  it('perseguindo desce conforme chega (vem por cima)', () => {
    const far = flyLift(P, { chasing: true, distToPlayer: 9, swing: 0 }, 0);
    const mid = flyLift(P, { chasing: true, distToPlayer: 5, swing: 0 }, 0);
    const close = flyLift(P, { chasing: true, distToPlayer: 2, swing: 0 }, 0);
    expect(far).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(close);
    expect(close).toBeGreaterThan(P.dive);
  });
  it('golpe = mergulho em arco: desce até o fundo no meio e sobe', () => {
    const start = flyLift(P, { chasing: true, distToPlayer: 1.8, swing: 0.35 }, 0);
    const bottom = flyLift(P, { chasing: true, distToPlayer: 1.8, swing: 0.175 }, 0);
    const end = flyLift(P, { chasing: true, distToPlayer: 1.8, swing: 0.001 }, 0);
    expect(bottom).toBeCloseTo(P.dive, 2);
    expect(start).toBeGreaterThan(bottom + 0.8);
    expect(end).toBeGreaterThan(bottom + 0.8);
  });
  it('de frente: yaw −90° (cabeça do arquivo em +X)', () => {
    const src = fs.readFileSync('src/components/world/beast.tsx', 'utf8');
    expect(src).toMatch(/pigeon: \{ url: '\/models\/animals\/pigeon\.glb', fixedScale: 0\.002, height: 0\.3, yaw: -Math\.PI \/ 2/);
  });
});
