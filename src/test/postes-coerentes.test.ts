import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRIDGE_SIDE, bridgeLampSpots, safeZoneLampSpots } from '@/components/world/lamp-layout';
import { BAKED_EDITOR_OBJECTS } from '@/components/editor/baked-layout';

/* Pedro, 26/10: "os postes parecem seguir uma linha, mas ela saiu — tinha um caminho antes; podem ficar na ponte e em
   outros cantos, coerente". Seguiam a estrada do mapa ANTIGO (escondida). Agora: pontes + cantos da zona segura. */
describe('postes presos ao que existe no mapa', () => {
  it('4 por ponte, DENTRO do comprimento dela e no tabuleiro (lados alternados, perto do eixo)', () => {
    const bridges = BAKED_EDITOR_OBJECTS.filter((o) => o.assetUrl.includes('scrap-bridge'));
    const spots = bridgeLampSpots();
    expect(spots.length).toBe(bridges.length * 4);
    bridges.forEach((b, i) => {
      const [px, , pz] = b.transform.position;
      const ry = b.transform.rotation[1];
      const half = (4 * b.transform.scale[0]) / 2;
      const sides: number[] = [];
      for (const s of spots.slice(i * 4, i * 4 + 4)) {
        const dx = s.x - px, dz = s.z - pz;
        const along = dx * Math.cos(ry) - dz * Math.sin(ry);   // eixo longo (X local)
        const across = dx * Math.sin(ry) + dz * Math.cos(ry);  // de lado (Z local)
        expect(Math.abs(along)).toBeLessThan(half);            // não passa da ponta
        expect(Math.abs(Math.abs(across) - BRIDGE_SIDE)).toBeLessThan(1e-9);
        sides.push(Math.sign(across));
      }
      expect(sides).toEqual([1, -1, 1, -1]); // alterna os lados
    });
  });
  it('zona segura: 4 nos cantos, 1,5 m pra fora do anel', () => {
    const z = { x: 2, z: -28, radius: 11 };
    for (const s of safeZoneLampSpots(z)) expect(Math.hypot(s.x - z.x, s.z - z.z)).toBeCloseTo(12.5, 6);
  });
  it('ligado: a cena usa o layout novo (não mais a estrada antiga) e a altura do chão real', () => {
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/\[\.\.\.bridgeLampSpots\(\), \.\.\.safeZoneLampSpots\(SAFE_ZONE\)\]\.map\(\(\{ x, z \}\) => \(\{ x, y: glbSurfaceY\(x, z, terrainHeight\(x, z\)\), z \}\)\)/);
    expect(gw).not.toMatch(/const lamps = useMemo\(\(\) => \{\s*const curve = new THREE\.CatmullRomCurve3\(ROAD_POINTS/);
  });
});

/* 26/10 (Pedro: go): poste como peça do EDITOR — ele mesmo posiciona onde quiser. */
describe('poste no editor', () => {
  it('no catálogo com 5,2 m (4 m × 1,3), entra assentando no chão e acende à noite com o orçamento de luzes', async () => {
    const { EDITOR_ASSETS, useEditorStore } = await import('@/components/editor/editor-store');
    const post = EDITOR_ASSETS.find((a) => a.assetUrl === '/models/props/light-post.glb')!;
    expect(post.name).toBe('Poste de luz');
    expect(4 * post.scale).toBeCloseTo(5.2, 5);
    useEditorStore.getState().add(post);
    const o = useEditorStore.getState().objects.at(-1)!;
    expect(o.ground).toBe(true);
    const ew = fs.readFileSync('src/components/editor/editor-world.tsx', 'utf8');
    expect(ew).toMatch(/\{isPost && <EditorPostLight /);
    expect(ew).toMatch(/l\.visible = lightAllowed\(lightId, nf > 0\.04 && d2 < POST_LIGHT_D2, d2\);/);
  });
});
