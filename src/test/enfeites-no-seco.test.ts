import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }), useAnimations: vi.fn(), Html: () => null, Sky: () => null }));

/* Pedro, 26/10 (print): "tem coisas no lago voando, meio poly". Eram enfeites do protótipo — fogueiras, baú (cubo preto),
   torre de cristal (losango laranja no pilar) e recurso de cristal (pedra com cones) — postos no relevo ANTIGO
   (`terrainHeight`), que no mapa novo fica acima do lago. Agora: chão REAL e, se for água, o ponto seco mais perto. */
describe('enfeites do protótipo no chão seco', () => {
  it('ponto seco: fica onde está; na água: vai pro 1º ponto seco em volta (até 14 m), na altura do chão real', async () => {
    const { dryGroundNear } = await import('@/components/game-world');
    const WATER = -2.35;
    const lake = (x: number, z: number) => (Math.hypot(x - 2, z - 3) < 6 ? -2.6 : 0.4); // lago de 6 m em volta de (2,3)
    expect(dryGroundNear(20, 20, lake, WATER)).toEqual([20, 0.4, 20]);
    const [x, y, z] = dryGroundNear(2, 3, lake, WATER);
    expect(y).toBe(0.4);
    const d = Math.hypot(x - 2, z - 3);
    expect(d).toBeGreaterThanOrEqual(6);
    expect(d).toBeLessThanOrEqual(7.01); // o mais perto (anel de 1 m)
    const sea = () => -3; // tudo água: não some, fica no lugar (chão real)
    expect(dryGroundNear(1, 1, sea, WATER)).toEqual([1, -3, 1]);
  }); // importa o game-world inteiro (14,5 s só de compilação): o limite vem do testTimeout (vitest.config.ts)
  it('ligado: fogueiras, baú, torre e cristal usam o chão seco; a pedra do cristal não soma o relevo antigo', () => {
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/const pos = useDryGround\(rawPos\[0\], rawPos\[2\]\);/);
    expect(gw).toMatch(/const crystalPos = useDryGround\(-3, -2\);\s*const chestPos = useDryGround\(2, 3\);\s*const towerPos = useDryGround\(4, 5\);/);
    expect(gw).not.toMatch(/terrainHeight\(2, 3\)|terrainHeight\(4, 5\)|terrainHeight\(-3, -2\)/);
    expect(gw).toMatch(/<Rock x=\{0\} z=\{0\} y=\{0\} size=\{1\.25\}/);
  });
});
