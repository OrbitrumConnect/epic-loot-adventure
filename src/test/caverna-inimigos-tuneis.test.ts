import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import {
  CAVE_ENEMIES, CAVE_ROOMS, CAVE_TUNNEL_MOUTH_CLEAR, CAVE_TUNNEL_STEP, CAVE_TUNNELS, caveEnemySpots, caveFloorAt, caveLayer, caveStandAt,
  caveTunnelEnemySpots, setCaveTerrain, ZS_CAVE_MOUTHS,
} from '@/components/zona-sul/zs-cave';

/* Pedro 03/11: "boa parte da cave nos caminhos retos não vejo nenhum inimigo, bicho, nada pra matar — fica tudo reto, sem
   perigo nenhum, fácil demais". Os 27 de antes ficavam todos nos salões. */
beforeAll(async () => {
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  setCaveTerrain(decodeTerrain(data, info.width, info.height));
}, 60_000);
const tunnelLen = (id: string) => { const p = CAVE_TUNNELS.find((t) => t.id === id)!.pts; let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.z - p[i - 1]!.z); return L; };

describe('inimigos nos túneis da caverna', () => {
  it('os túneis compridos de caverna têm inimigo (os de rua não); ≥ 20 no total, Aberração e Fauce de Sílex', () => {
    const s = caveTunnelEnemySpots();
    expect(s.length).toBeGreaterThanOrEqual(20);
    expect(new Set(s.map((q) => q.speciesId))).toEqual(new Set(['monster', 'flintmaw']));
    for (const tn of CAVE_TUNNELS) {
      const mine = s.filter((q) => q.id.startsWith(`wild_cave_tn_${tn.id}_`));
      if (tn.road) expect(mine, tn.id).toHaveLength(0);
      else if (tunnelLen(tn.id) > 200) expect(mine.length, tn.id).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);
  it('em pé no chão do túnel, na camada da caverna, longe das bocas e fora dos salões', () => {
    for (const q of caveTunnelEnemySpots()) {
      const fl = caveStandAt(q.x, q.z);
      expect(fl, q.id).not.toBeNull();
      expect(Math.abs(caveFloorAt(q.x, q.z)! - fl!), q.id).toBeLessThan(0.01); // o renascer (chão sem andar) acha o mesmo chão
      expect(caveLayer(q.x, fl!, q.z), q.id).toBe(1);
      for (const m of ZS_CAVE_MOUTHS) expect(Math.hypot(q.x - m.ax, fl! - m.ay, q.z - m.az), q.id).toBeGreaterThan(CAVE_TUNNEL_MOUTH_CLEAR - 4);
      for (const r of CAVE_ROOMS) if (Math.abs(fl! - r.y) < r.h) expect(Math.hypot(q.x - r.x, q.z - r.z), `${q.id} no salão ${r.id}`).toBeGreaterThan(Math.max(r.rx, r.rz));
    }
  }, 60_000);
  it('ao longo da passagem da Gávea e do Leblon: um a cada ~60 m (nada de trecho comprido vazio), sem bolo', () => {
    const s = caveTunnelEnemySpots();
    for (const id of ['gavea', 'leblon', 'galeria-gavea', 'laranjeiras']) {
      const pts = CAVE_TUNNELS.find((t) => t.id === id)!.pts, mine = s.filter((q) => q.id.startsWith(`wild_cave_tn_${id}_`));
      // projeta cada um na polilinha (distância percorrida) e mede o maior buraco entre dois seguidos
      const along = mine.map((q) => { let best = Infinity, acc = 0, at = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1]!, b = pts[i]!, l = Math.hypot(b.x - a.x, b.z - a.z); const f = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / (l * l))); const d = Math.hypot(q.x - a.x - (b.x - a.x) * f, q.z - a.z - (b.z - a.z) * f); if (d < best) { best = d; at = acc + f * l; } acc += l; } return at; }).sort((a, b) => a - b);
      for (let i = 1; i < along.length; i++) expect(along[i]! - along[i - 1]!, id).toBeLessThan(CAVE_TUNNEL_STEP * 2 + 5);
    }
    const all = caveEnemySpots();
    for (const q of all) expect(all.filter((o) => Math.hypot(o.x - q.x, o.z - q.z) < 12).length, q.id).toBeLessThanOrEqual(4);
  }, 60_000);
  it('os dos salões não mudaram (mesmos ids e lugares, primeiro na lista); ids únicos', () => {
    const all = caveEnemySpots();
    expect(all.slice(0, CAVE_ENEMIES.length).map((q) => q.id)).toEqual(CAVE_ENEMIES.map(([room], i) => `wild_cave_${room}_${i}`));
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    expect(caveTunnelEnemySpots()).toEqual(caveTunnelEnemySpots());
  }, 60_000);
});
