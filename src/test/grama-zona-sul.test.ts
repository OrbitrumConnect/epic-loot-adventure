import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SURF, ZS_TERRAIN, ZS_SPAWN } from '@/components/zona-sul/zona-sul-meta';
import { ZS_GRASS, zsGrassAround, zsGrassTuftGeometry } from '@/components/zona-sul/zs-grass';

/* Pedro 02/11: "grama leve nas áreas verdes — só perto do herói, sem perder FPS" (go). */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});

describe('grama leve da Zona Sul', () => {
  it('tufo leve: 48 triângulos (o do Vale tem 160); teto de tufos', () => {
    expect(zsGrassTuftGeometry().getAttribute('position').count / 3).toBe(48);
    expect(ZS_GRASS.CAP * 48).toBeLessThan(130_000);
  });
  it('só no verde (campo e mata), nunca em pista, areia ou água; mata bem mais rala; só dentro do raio', () => {
    let land = 0, mata = 0;
    for (const [hx, hz] of [[-40, 260], [-300, -150], [ZS_SPAWN.x, ZS_SPAWN.z], [-1100, 500]] as const) {
      const g = zsGrassAround(t, hx, hz);
      for (const x of g) {
        const s = zsSurfAt(t, x.x, x.z);
        expect([ZS_SURF.land, ZS_SURF.forest]).toContain(s);
        expect(Math.hypot(x.x - hx, x.z - hz)).toBeLessThanOrEqual(ZS_GRASS.R);
        if (s === ZS_SURF.land) land++; else mata++;
      }
      expect(g.length).toBeLessThanOrEqual(ZS_GRASS.CAP);
    }
    expect(land).toBeGreaterThan(500);
    // por célula a mata pode ter no máx. 3 dos 9 candidatos
    expect(ZS_GRASS.PER_CELL_MATA / ZS_GRASS.PER_CELL).toBeLessThan(0.4);
    expect(mata).toBeGreaterThan(0);
  });
  it('fixa por lugar (mesma célula = mesmos tufos) e encolhe na borda do raio (sem anel)', () => {
    const a = zsGrassAround(t, -40, 260), b = zsGrassAround(t, -40 + 0.5, 260 + 0.5);
    const key = (x: { x: number; z: number }) => `${x.x.toFixed(2)},${x.z.toFixed(2)}`;
    const shared = a.filter((x) => b.some((y) => key(y) === key(x)));
    expect(shared.length).toBeGreaterThan(a.length * 0.9);
    const inner = a.filter((x) => Math.hypot(x.x + 40, x.z - 260) < ZS_GRASS.R * 0.5), outer = a.filter((x) => Math.hypot(x.x + 40, x.z - 260) > ZS_GRASS.R * 0.95);
    const avg = (l: { s: number }[]) => l.reduce((s, x) => s + x.s, 0) / l.length;
    expect(avg(outer)).toBeLessThan(avg(inner) * 0.5);
  });
  it('ligada: dentro da superfície (some no fundo da caverna), em volta do mesmo foco da mata; celular com raio menor', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    // (02/11: a rampa de voo livre entrou logo depois, também dentro da superfície)
    expect(zs).toMatch(/<ZsVegetation t=\{t\} heroRef=\{focusRef\} \/>\s+\{\/\*[^]*?\*\/\}\s+<ZsGrass t=\{t\} heroRef=\{focusRef\} \/>\s+(?:\{\/\*[^]*?\*\/\}\s+<ZsRampView t=\{t\} \/>\s+)?(?:\{\/\*[^]*?\*\/\}\s+<ZsCaveMouthRocks t=\{t\} \/>\s+)?<\/ZsSurface>/); // (02/11 noite: + as pedras da boca do Pico)
    expect(ZS_GRASS.R_MOBILE).toBeLessThan(ZS_GRASS.R);
    // material SIMPLES (o de fade fazia a grama sumir — 21/10)
    const src = fs.readFileSync('src/components/zona-sul/zs-grass.tsx', 'utf8');
    expect(src).not.toMatch(/fadeMat|makeInstanceFadeMaterial/);
  });
});
