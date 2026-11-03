import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_STACK, CAVE_TUNNELS, caveField, caveFloorAt, caveMove, setCaveTerrain, ZS_CAVE_MOUTHS } from '@/components/zona-sul/zs-cave';

/* Pedro 02/11 noite: "pode fazer os túneis; o da Gávea–São Conrado, Zuzu, pode ter uma entrada no meio dele pra cave".
   O Zuzu passa POR CIMA do túnel do Leblon da caverna → a caverna ganhou ANDARES (CAVE_STACK). */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});
const mouth = (id: string) => ZS_CAVE_MOUTHS.find((m) => m.id === id)!;
/** Anda a pé (caveMove) por uma lista de alvos; devolve a trilha [x, z, pé]. Para se travar. */
function walk(start: { x: number; z: number; y: number }, targets: [number, number][]): { x: number; z: number; y: number; stuck: boolean } {
  let { x, z, y } = start;
  for (const [tx, tz] of targets) {
    for (let k = 0; k < 4000 && Math.hypot(tx - x, tz - z) > 0.6; k++) {
      const d = Math.hypot(tx - x, tz - z), dx = ((tx - x) / d) * 0.3, dz = ((tz - z) / d) * 0.3;
      const m = caveMove(t, x, z, y, dx, dz);
      const nx = m ? m.x : x + dx, nz = m ? m.z : z + dz, ny = m ? m.ground : zsHeightAt(t, x + dx, z + dz);
      if (Math.hypot(nx - x, nz - z) < 1e-4) return { x, z, y, stuck: true };
      x = nx; z = nz; y = ny;
    }
  }
  return { x, z, y, stuck: false };
}

describe('Túnel Zuzu Angel (Gávea ↔ São Conrado)', () => {
  it('duas bocas no chão da encosta, estrada de 11 m × 6,5 m; por cima do túnel do Leblon com rocha no meio (andares)', () => {
    for (const id of ['zuzu-sc', 'zuzu-gavea']) { const m = mouth(id); expect(Math.abs(m.ay - zsHeightAt(t, m.ax, m.az)), id).toBeLessThan(0.3); expect(m.ra * 2).toBeGreaterThanOrEqual(11); }
    // no cruzamento (−571, 349): ar no Zuzu (em cima), ROCHA na laje, ar no túnel do Leblon (embaixo)
    expect(caveField(-571, 15.5, 349)).toBeLessThan(0);
    expect(caveField(-571, 9.5, 349)).toBeGreaterThan(0);
    expect(caveField(-571, 2.5, 349)).toBeLessThan(0);
    expect(caveFloorAt(-571, 349, 14)!).toBeGreaterThan(12.5);   // quem está em cima pisa no Zuzu
    expect(caveFloorAt(-571, 349, 0.5)!).toBeLessThan(1);        // quem está embaixo pisa no túnel do Leblon
    expect(CAVE_STACK).toBe(4);
  });
  it('a pé: São Conrado → Gávea pelo túnel inteiro, no piso da estrada (não cai pro túnel de baixo)', () => {
    const a = mouth('zuzu-sc'), b = mouth('zuzu-gavea');
    const ux = a.bx - a.ax, uz = a.bz - a.az, L = Math.hypot(ux, uz);
    const start = { x: a.ax - (ux / L) * 8, z: a.az - (uz / L) * 8, y: 0 };
    start.y = zsHeightAt(t, start.x, start.z);
    let lowest = Infinity, x = start.x, z = start.z, y = start.y;
    for (const tg of [[-641, 407.7], [-600, 373.1], [-569.5, 347.5], [b.ax, b.az], [b.ax + (b.ax - b.bx) * 0.3, b.az + (b.az - b.bz) * 0.3]] as [number, number][]) {
      const r = walk({ x, z, y }, [tg]);
      expect(r.stuck, `travou indo pra ${tg}`).toBe(false);
      x = r.x; z = r.z; y = r.y; lowest = Math.min(lowest, y);
    }
    expect(lowest).toBeGreaterThan(11);                              // nunca afundou pro túnel do Leblon (~0 m)
    expect(Math.hypot(x - b.ax, z - b.az)).toBeLessThan(20);          // saiu pela boca da Gávea
  });
  it('no meio do Zuzu: a DESCIDA pra caverna leva até a passagem da Gávea (~−5 m)', () => {
    const r = walk({ x: -600, z: 373.1, y: caveFloorAt(-600, 373.1, 13)! }, [[-621, 348], [-624, 305], [-603, 265], [-604, 250]]);
    expect(r.stuck, JSON.stringify(r)).toBe(false);
    expect(r.y).toBeLessThan(-3);
    const desc = CAVE_TUNNELS.find((tn) => tn.id === 'zuzu-caverna')!;
    for (let i = 1; i < desc.pts.length; i++) { const p = desc.pts[i - 1]!, q = desc.pts[i]!; expect(Math.abs(q.y - p.y) / Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(0.18); }
  });
  it('quem está no túnel do Leblon passa por baixo do Zuzu sem subir nele', () => {
    const r = walk({ x: -545, z: 359, y: caveFloorAt(-545, 359, 1)! }, [[-584, 344], [-600, 300]]);
    expect(r.stuck).toBe(false);
    expect(r.y).toBeLessThan(0);
  });
});
