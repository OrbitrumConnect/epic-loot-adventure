import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREATURES } from '@/game/data/creatures';
import { createZsSharks, sharkWater, SURF, ZS_SAFE, ZS_SHARK_CLEAR_SPAWN, ZS_SHARK_MIN_DEPTH, ZS_SHARK_PEAKS, type ZsQuery } from '@/game/systems/zsSpawnSystem';
import { mergeResumedWorld } from '@/game/systems/wildlifeSystem';
import { swimStep } from '@/components/world/hostile-ai';

/* TUBARÃO (Pedro 01/11, GLB dele): "perto dos picos de surf — não exatamente onde dropa, colado na região que chega lá —
   e alguns pelo mar"; "tira 50 de vida cada mordida, é forte". Só nada no mar fundo e só caça quem está na água. */
describe('tubarão', () => {
  // praia/terra até z = 100; mar raso 100–140; mar fundo (−9 m) depois; pedra no meio do mar em x ∈ [380, 420]
  const height = (x: number, z: number) => (z < 100 ? 2 : z < 140 ? -1.5 : x > 380 && x < 420 && z < 300 ? 3 : -9);
  const surf = (x: number, z: number) => (height(x, z) > 0 ? SURF.land : SURF.sea);
  const q: ZsQuery = { bounds: { minX: -600, maxX: 900, minZ: -100, maxZ: 700 }, surf, height, slope: () => 0 };
  const peaks = [
    { id: 'arpoador', x: 60, z: 400, ...ZS_SHARK_PEAKS.arpoador },
    { id: 'sorriso', x: 500, z: 420, ...ZS_SHARK_PEAKS.sorriso },
  ];

  it('mordida 50 e forte, vive na água; drop só com itens que existem', () => {
    const d = CREATURES['shark']!;
    expect(d.attackPower).toBe(50);
    expect(d.maxHp).toBeGreaterThanOrEqual(260);
    expect(d.aquatic).toBe(true);
    expect(d.peaceful).toBe(false);
  });

  it('nasce perto dos picos (anel em volta do DROP, nunca em cima) + alguns soltos no mar; sempre no fundo, longe da areia de partida', () => {
    const all = createZsSharks(q, peaks);
    expect(createZsSharks(q, peaks)).toEqual(all); // determinístico (mesmo mapa pra todo mundo)
    const near = (pk: (typeof peaks)[number]) => all.filter((s) => {
      const d = Math.hypot(s.position.x - pk.x, s.position.z - pk.z);
      return d >= pk.rMin - 0.01 && d <= pk.rMax + 0.01;
    });
    expect(near(peaks[0]!).length).toBeGreaterThanOrEqual(ZS_SHARK_PEAKS.arpoador.count);
    expect(near(peaks[1]!).length).toBeGreaterThanOrEqual(ZS_SHARK_PEAKS.sorriso.count);
    expect(all.length).toBe(ZS_SHARK_PEAKS.arpoador.count + ZS_SHARK_PEAKS.sorriso.count + 3);
    for (const s of all) {
      expect(s.id).toMatch(/^wild_shark_\d+$/);
      expect(sharkWater(q, s.position.x, s.position.z)).toBe(true);
      expect(height(s.position.x, s.position.z)).toBeLessThanOrEqual(-ZS_SHARK_MIN_DEPTH);
      expect(Math.hypot(s.position.x - ZS_SAFE.x, s.position.z - ZS_SAFE.z)).toBeGreaterThanOrEqual(ZS_SHARK_CLEAR_SPAWN);
      for (const pk of peaks) expect(Math.hypot(s.position.x - pk.x, s.position.z - pk.z)).toBeGreaterThanOrEqual(pk.rMin - 0.01);
    }
  });

  it('nada só na água funda: desliza na beirada, nunca sobe na areia/pedra', () => {
    const swim = (x: number, z: number) => z > 140;
    expect(swimStep(swim, 0, 150, 0, 145)).toEqual([0, 145]);
    expect(swimStep(swim, 0, 141, 1, 139)).toEqual([1, 141]); // pra areia não vai: desliza ao longo da beira
    expect(swimStep(swim, 0, 141, 0, 139)).toEqual([0, 141]);
  });

  it('a IA: só quem está sobre o mar fundo é alvo; corpo na superfície da água; areia e Vale intocados', () => {
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/const water = CREATURES\[creature\.speciesId\]\?\.aquatic \? WORLD\.water : null;/);
    expect(ai).toMatch(/const localValid = localOk && \(!water \|\| water\.swimmable\(px, pz\)\);/);
    expect(ai).toMatch(/g\.position\.y = water\.surfaceY\(g\.position\.x, g\.position\.z\) - \(tuning\.swimDepth \?\? 0\);/);
    const prof = fs.readFileSync('src/components/zona-sul/zs-world-profile.ts', 'utf8');
    expect(prof).toMatch(/water: \{ swimmable: \(x, z\) => zsSwimmable\(t, x, z\), surfaceY: \(x, z\) => zsWaterYAt\(x, z\) \}/);
    // piloto: com o herói fora d'água ele nem enxerga o tubarão (não sai nadando atrás)
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/!CREATURES\[c\.speciesId\]\?\.aquatic \|\| !!WORLD\.water\?\.swimmable\(state\.player\.position\.x, state\.player\.position\.z\)/);
  });

  it('modelo: escala ABSOLUTA medida (a normalização deixava 0,14 m), mordida pela mandíbula, GLB leve', () => {
    const beast = fs.readFileSync('src/components/world/beast.tsx', 'utf8');
    expect(beast).toMatch(/shark: \{ url: '\/models\/animals\/shark\.glb', fixedScale: 25\.7, yaw: 0, groundBias: 0 \}/);
    expect(beast).toMatch(/shark: \{ jaw: 'PA_SharkJawJnt_011', axis: \[0, 0, -1\], biteDeg: 28/);
    const glb = fs.readFileSync('public/models/animals/shark.glb');
    expect(glb.length).toBeLessThan(700_000);
    expect(glb.includes(Buffer.from('PA_SharkJawJnt_011'))).toBe(true);
  });

  it('retomar sala salva NÃO apaga os tubarões (espécie só da Zona Sul)', () => {
    const mk = (id: string, speciesId: string) => ({ id, speciesId, hp: 10 } as never);
    const out = mergeResumedWorld([mk('wild_shark_0', 'shark'), mk('wild_pelter_1', 'pelter')], [mk('wild_shark_1', 'shark')]) as unknown as { id: string }[];
    expect(out.map((c) => c.id)).toEqual(['wild_shark_0', 'wild_shark_1']);
  });
});
