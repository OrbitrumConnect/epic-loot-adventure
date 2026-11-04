import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_ABYSS, CAVE_ROOMS, CAVE_TUNNELS, caveField, caveFloorAt, caveMouthClear, caveMouthRocks, caveMove, caveNearXZ, setCaveTerrain, spiralY, ZS_CAVE_MOUTHS } from '@/components/zona-sul/zs-cave';

/* Pedro 02/11 noite: "entrada de cave no Pico da Tijuca, agora que tem essa parede grande; a galeria pode ser grande lá
   dentro, de cima vê lá embaixo, vai descendo; a boca média, com pedras rodeando; a que vem descendo do Alto da Boa
   Vista/Pico da Tijuca vai cortando tudo, grande; mundo subterrâneo interligado com as caves que já temos". */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});
const abismo = CAVE_ROOMS.find((r) => r.id === 'abismo')!;
const at = (e: number, deg: number) => { const a = (deg * Math.PI) / 180; return { x: abismo.x + e * abismo.rx * Math.cos(a), z: abismo.z + e * abismo.rz * Math.sin(a) }; };
/** Silhueta de longe do chão (mesma triangulação do terreno): o teto não pode cortar nem ela. */
function chord(x: number, z: number, step: number, drop: number): number {
  const fi = (x - t.x0) / t.cell, fj = (z - t.z0) / t.cell, i0 = Math.floor(fi / step) * step, j0 = Math.floor(fj / step) * step;
  const H = (i: number, j: number) => t.heights[Math.max(0, Math.min(t.h - 1, j)) * t.w + Math.max(0, Math.min(t.w - 1, i))]!;
  const u = (fi - i0) / step, v = (fj - j0) / step, a = H(i0, j0), b = H(i0 + step, j0), c = H(i0, j0 + step), d = H(i0 + step, j0 + step);
  return (u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v)) - drop;
}
function walk(start: { x: number; z: number; y: number }, targets: { x: number; z: number }[]) {
  let { x, z, y } = start;
  for (const tg of targets) {
    for (let k = 0; k < 6000 && Math.hypot(tg.x - x, tg.z - z) > 0.6; k++) {
      const d = Math.hypot(tg.x - x, tg.z - z), dx = ((tg.x - x) / d) * 0.3, dz = ((tg.z - z) / d) * 0.3;
      const m = caveMove(t, x, z, y, dx, dz);
      const nx = m ? m.x : x + dx, nz = m ? m.z : z + dz, ny = m ? m.ground : zsHeightAt(t, x + dx, z + dz);
      if (Math.hypot(nx - x, nz - z) < 1e-4) return { x, z, y, stuck: true, at: tg };
      x = nx; z = nz; y = ny;
    }
  }
  return { x, z, y, stuck: false, at: null };
}

describe('abismo do Pico da Tijuca', () => {
  it('poço debaixo do Pico (fundo 42 m, cúpula ~130 m, o pico lá em cima ~190 m); boca MÉDIA no chão da encosta, com pedras em volta', () => {
    expect(Math.hypot(abismo.x - -1189, abismo.z - -281)).toBeLessThan(20);
    const m = ZS_CAVE_MOUTHS.find((q) => q.id === 'pico-tijuca')!, reb = ZS_CAVE_MOUTHS.find((q) => q.id === 'reboucas')!, leb = ZS_CAVE_MOUTHS.find((q) => q.id === 'leblon')!;
    expect(Math.abs(m.ay - zsHeightAt(t, m.ax, m.az))).toBeLessThan(0.4);
    expect(m.ra * m.ha).toBeGreaterThan(leb.ra * leb.ha); expect(m.ra * m.ha).toBeLessThan(reb.ra * reb.ha);
    const rocks = caveMouthRocks(t);
    expect(rocks.length).toBeGreaterThanOrEqual(8);
    for (const r of rocks) { expect(caveMouthClear(r.x, r.z, 0.5)).toBe(true); expect(Math.hypot(r.x - m.ax, r.z - m.az)).toBeLessThan(m.ra * 3); }
  });
  it('RAMPA EM ESPIRAL: começa no balcão (100 m), termina no fundo (42 m), ~31% de média, sem degrau; o miolo é o fundo', () => {
    const sp = abismo.spiral!;
    const y0 = spiralY(abismo, 0.82 * abismo.rx * Math.cos(sp.a0 + 0.01), 0.82 * abismo.rz * Math.sin(sp.a0 + 0.01))!;
    expect(y0).toBeGreaterThan(99);
    let prev = at(0.82, 45), py = caveFloorAt(prev.x, prev.z)!, worst = 0, sum = 0, n = 0;
    for (let deg = 50; deg <= 45 + 330; deg += 5) {
      const q = at(0.82, deg), y = caveFloorAt(q.x, q.z)!;
      const s = Math.abs(y - py) / Math.hypot(q.x - prev.x, q.z - prev.z); worst = Math.max(worst, s); sum += s; n++; prev = q; py = y;
    }
    expect(py).toBeLessThan(43);
    expect(sum / n).toBeLessThan(0.33);   // medido: ~0,31 a volta toda
    expect(worst).toBeLessThan(0.42);     // a emenda com o túnel do balcão (1,1 m em ~3 m)
    expect(caveFloorAt(abismo.x, abismo.z)).toBeCloseTo(abismo.y, 1); // miolo = fundo
  });
  it('de CIMA se vê lá EMBAIXO: da beirada do alto da rampa até o fundo do poço é tudo ar', () => {
    const top = at(0.74, 55), ty = caveFloorAt(top.x, top.z)! + 2.5, by = abismo.y + 1;
    for (let k = 0; k <= 1; k += 0.02) expect(caveField(top.x + (abismo.x - top.x) * k, ty + (by - ty) * k, top.z + (abismo.z - top.z) * k)).toBeLessThan(0);
    expect(ty - by).toBeGreaterThan(50);
    expect(CAVE_ABYSS.fogFar).toBeGreaterThan(150);
  });
  it('o teto do abismo, da boca e da galeria grande fica DEBAIXO do chão (e da silhueta de longe), menos a boca', () => {
    const m = ZS_CAVE_MOUTHS.find((q) => q.id === 'pico-tijuca')!;
    const inMouth = (x: number, z: number) => { const abx = m.bx - m.ax, abz = m.bz - m.az, k = ((x - m.ax) * abx + (z - m.az) * abz) / (abx * abx + abz * abz); return k >= -0.05 && k <= 1 && Math.hypot(x - m.ax - abx * k, z - m.az - abz * k) < 9; };
    let furos = 0, n = 0; const ex: unknown[] = [];
    for (let x = -1250; x <= -560; x += 4) for (let z = -340; z <= 30; z += 4) {
      if (!caveNearXZ(x, z) || inMouth(x, z)) continue;
      let top = -Infinity;
      for (let y = -20; y < 140; y += 0.5) if (caveField(x, y, z) < 0) top = y;
      if (top === -Infinity) continue;
      n++;
      const cover = Math.min(zsHeightAt(t, x, z), chord(x, z, 8, 2.5), chord(x, z, 4, 0), chord(x, z, 2, 0));
      if (cover - top < 0.4) { furos++; if (ex.length < 5) ex.push({ x, z, top, cover }); }
    }
    expect(n).toBeGreaterThan(800);
    expect(furos, JSON.stringify(ex)).toBe(0);
  }, 60_000);
  it('a pé: da boca do Pico → balcão → rampa → fundo → galeria grande → salão do Alto → passagem da Gávea (a caverna de sempre)', () => {
    const m = ZS_CAVE_MOUTHS.find((q) => q.id === 'pico-tijuca')!, ux = m.ax - m.bx, uz = m.az - m.bz, L = Math.hypot(ux, uz);
    const start = { x: m.ax + (ux / L) * 3, z: m.az + (uz / L) * 3, y: 0 }; start.y = zsHeightAt(t, start.x, start.z);
    const tn = (id: string) => CAVE_TUNNELS.find((q) => q.id === id)!.pts.map((p) => ({ x: p.x, z: p.z }));
    const rampa: { x: number; z: number }[] = [];
    for (let deg = 60; deg <= 45 + 325; deg += 8) rampa.push(at(0.82, deg));
    let r = walk(start, tn('pico-tijuca').slice(1));
    expect(r.stuck, `travou na boca ${JSON.stringify(r)}`).toBe(false);
    expect(r.y).toBeGreaterThan(97);                    // no balcão
    r = walk(r, rampa);
    expect(r.stuck, `travou na rampa ${JSON.stringify(r)}`).toBe(false);
    expect(r.y).toBeLessThan(46);                       // desceu até o fundo pela rampa
    r = walk(r, [...tn('galeria-alto'), { x: -878, z: -139 }, ...tn('galeria-gavea')]);
    expect(r.stuck, `travou na galeria ${JSON.stringify(r)}`).toBe(false);
    expect(r.y).toBeLessThan(-10);                      // chegou na passagem da Gávea
  }, 60_000);
  it('ligado: luz do fundo (o abismo tira 2 vagas de cristal), névoa longa no abismo, pedras na superfície', () => {
    const v = fs.readFileSync('src/components/zona-sul/zs-cave-view.tsx', 'utf8');
    expect(v).toContain('if (inAbyss) requestLight(ab.light.x, ab.light.y, ab.light.z, CRYSTAL_LIGHT, ab.light.i, ab.light.d, 1.2);');
    // 04/11: o covil do Canibal também tira as vagas de cristal
    expect(v).toContain('if (n++ >= (inAbyss || inLair ? 1 : 3)) break;');
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    // 04/11: no covil do Canibal a névoa vai ainda mais longe
    expect(zs).toContain('fog.far = 2200 + ((lair ? CAVE_LAIR.fogFar : ab ? CAVE_ABYSS.fogFar : 75) - 2200) * d2;');
    expect(zs).toContain('<ZsCaveMouthRocks t={t} />');
  });
});
