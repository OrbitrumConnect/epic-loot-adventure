import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import {
  CAVE_BOSS, CAVE_MOUTH_ZONE, CAVE_TUNNELS, caveDeep, caveField, caveFloorAt, caveInside, caveLayer, caveMouthDist, caveMove, caveNearXZ, setCaveTerrain,
  ZS_CAVE_MOUTHS,
} from '@/components/zona-sul/zs-cave';

/* Pedro 02/11 noite: "o túnel da Princesa Isabel que pega Copa pra Botafogo ali perto da Urca" = Túnel Novo. O Túnel Velho NÃO
   entrou: no jogo o morro em cima dele é baixo e estreito demais (o arco saía pela encosta) — espera o OK pra subir a crista. */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});
const mouth = (id: string) => ZS_CAVE_MOUTHS.find((m) => m.id === id)!;
function chord(x: number, z: number, step: number, drop: number): number {
  const fi = (x - t.x0) / t.cell, fj = (z - t.z0) / t.cell, i0 = Math.floor(fi / step) * step, j0 = Math.floor(fj / step) * step;
  const H = (i: number, j: number) => t.heights[Math.max(0, Math.min(t.h - 1, j)) * t.w + Math.max(0, Math.min(t.w - 1, i))]!;
  const u = (fi - i0) / step, v = (fj - j0) / step, a = H(i0, j0), b = H(i0 + step, j0), c = H(i0, j0 + step), d = H(i0 + step, j0 + step);
  return (u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v)) - drop;
}
/** Atravessa a pé de uma boca até a outra (por fora de cada boca 4 m). */
function across(aId: string, bId: string) {
  const a = mouth(aId), b = mouth(bId), ux = a.ax - a.bx, uz = a.az - a.bz, L = Math.hypot(ux, uz);
  let x = a.ax + (ux / L) * 4, z = a.az + (uz / L) * 4, y = zsHeightAt(t, x, z), lowest = Infinity;
  const vx = b.ax - b.bx, vz = b.az - b.bz, M = Math.hypot(vx, vz);
  for (const tg of [{ x: a.bx, z: a.bz }, { x: b.bx, z: b.bz }, { x: b.ax + (vx / M) * 4, z: b.az + (vz / M) * 4 }]) {
    for (let k = 0; k < 3000 && Math.hypot(tg.x - x, tg.z - z) > 0.6; k++) {
      const d = Math.hypot(tg.x - x, tg.z - z), dx = ((tg.x - x) / d) * 0.3, dz = ((tg.z - z) / d) * 0.3;
      const m = caveMove(t, x, z, y, dx, dz);
      const nx = m ? m.x : x + dx, nz = m ? m.z : z + dz, ny = m ? m.ground : zsHeightAt(t, x + dx, z + dz);
      if (Math.hypot(nx - x, nz - z) < 1e-4) return { stuck: true, x, z, y, lowest };
      x = nx; z = nz; y = ny; lowest = Math.min(lowest, y);
    }
  }
  return { stuck: false, x, z, y, lowest };
}

describe('Túnel Novo (Botafogo ↔ Leme/Copacabana)', () => {
  it('bocas no chão da rua dos dois lados', () => {
    expect(ZS_CAVE_MOUTHS.some((m) => m.id.startsWith('velho'))).toBe(false);
    for (const id of ['novo-botafogo', 'novo-copa']) { const m = mouth(id); expect(Math.abs(m.ay - zsHeightAt(t, m.ax, m.az)), id).toBeLessThan(0.3); }
  });
  it('no meio tem ROCHA por cima (chão e silhueta de longe); fora das bocas nada fura o morro', () => {
    let furos = 0, n = 0; const ex: unknown[] = [];
    const inMouth = (x: number, z: number) => ZS_CAVE_MOUTHS.some((m) => { const abx = m.bx - m.ax, abz = m.bz - m.az, k = ((x - m.ax) * abx + (z - m.az) * abz) / (abx * abx + abz * abz); return k >= -0.05 && k <= 1 && Math.hypot(x - m.ax - abx * k, z - m.az - abz * k) < m.ra + 2; });
    for (let x = 290; x <= 345; x += 1.5) for (let z = -75; z <= 25; z += 1.5) {
      if (!caveNearXZ(x, z) || inMouth(x, z)) continue;
      let top = -Infinity;
      for (let y = -2; y < 30; y += 0.25) if (caveField(x, y, z) < 0) top = y;
      if (top === -Infinity) continue;
      n++;
      const cover = Math.min(zsHeightAt(t, x, z), chord(x, z, 8, 2.5), chord(x, z, 4, 0), chord(x, z, 2, 0));
      if (cover - top < 0.4) { furos++; if (ex.length < 4) ex.push({ x, z, top: +top.toFixed(2), cover: +cover.toFixed(2) }); }
    }
    expect(n).toBeGreaterThan(30);
    expect(furos, JSON.stringify(ex)).toBe(0);
  });
  it('túnel curto de rua: no MEIO dele continua superfície (quem está lá fora não some); Zuzu e caverna seguem embaixo', () => {
    const mid = { x: 320.2, z: -40.4, y: 4.4 };
    expect(caveInside(mid.x, mid.y, mid.z)).toBe(true);
    expect(caveMouthDist(mid.x, mid.y, mid.z)).toBeGreaterThan(CAVE_MOUTH_ZONE); // sem a regra seria camada da caverna
    expect(caveLayer(mid.x, mid.y, mid.z)).toBe(0);
    expect(caveDeep(mid.x, mid.y, mid.z)).toBe(false);
    // o resto da rede: o meio do Zuzu e o salão do chefe continuam na camada de baixo
    expect(caveLayer(-600, 13, 373.1)).toBe(1);
    expect(caveLayer(CAVE_BOSS.x, caveFloorAt(CAVE_BOSS.x, CAVE_BOSS.z)!, CAVE_BOSS.z)).toBe(1);
    // nenhum ponto de outro túnel cai perto da caixa do Novo
    for (const tn of CAVE_TUNNELS.filter((q) => !q.open)) for (const p of tn.pts) expect(Math.hypot(p.x - mid.x, p.z - mid.z), tn.id).toBeGreaterThan(150);
  });
  it('a pé: Botafogo → Copacabana pelo túnel (e de volta)', () => {
    for (const [a, b] of [['novo-botafogo', 'novo-copa'], ['novo-copa', 'novo-botafogo']] as const) {
      const r = across(a, b);
      expect(r.stuck, `${a} → ${b}: ${JSON.stringify(r)}`).toBe(false);
    }
  });
});
