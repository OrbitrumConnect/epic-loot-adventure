import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt, ZS_SPAWN_TERRAIN_URL } from '@/components/zona-sul/zs-terrain-data';
import { ZS_ROAD_MASK, ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery } from '@/components/zona-sul/zs-world-profile';
import { caveMouthClear, setCaveTerrain } from '@/components/zona-sul/zs-cave';
import { setZsVegRoadMask, zsVegetationAround } from '@/components/zona-sul/zs-vegetation';
import { createZsForestFarm, createZsHarvestNodes, createZsNewAreaTrees, createZsSpreadHarvest, ZS_FARM_FOREST_GAP, ZS_FARM_FOREST_TREES } from '@/game/systems/zsHarvestSystem';
import type { HarvestNodeState } from '@/game/types';

/* Pedro 03/11: "eu vejo assim: umas 30, 40 árvores de cenário e 1 de farm só no meio, outra lá longe". */
const load = async (f: string) => {
  const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeTerrain(data, info.width, info.height);
};
let now: ZsTerrain, before: HarvestNodeState[], mata: HarvestNodeState[];
let road: (x: number, z: number) => number;
beforeAll(async () => {
  now = await load('public' + ZS_TERRAIN.url);
  const old = await load('public' + ZS_SPAWN_TERRAIN_URL);
  setCaveTerrain(now);
  const qNow = zsQuery(now), query = zsQuery(old);
  // igual ao mundo (zona-sul-world)
  const base = createZsHarvestNodes(query), withNew = [...base, ...createZsNewAreaTrees(qNow, query.bounds, base)];
  before = [...withNew, ...createZsSpreadHarvest(qNow, withNew, undefined, caveMouthClear)];
  mata = createZsForestFarm(qNow, before, undefined, caveMouthClear);
  const r = await sharp(fs.readFileSync('public' + ZS_ROAD_MASK.url)).raw().toBuffer({ resolveWithObject: true });
  const W = r.info.width, H = r.info.height, R8 = new Uint8Array(W * H);
  for (let i = 0; i < R8.length; i++) R8[i] = r.data[i * r.info.channels]!;
  road = (x, z) => { const u = Math.floor(x - ZS_ROAD_MASK.x0), v = Math.floor(z - ZS_ROAD_MASK.z0); return u < 0 || v < 0 || u >= W || v >= H ? 0 : R8[v * W + u]!; };
  setZsVegRoadMask({ data: R8, w: W, h: H });
}, 120_000);

describe('farm na mata', () => {
  it(`+${ZS_FARM_FOREST_TREES} árvores de farm, espaçadas (≥ ${ZS_FARM_FOREST_GAP} m de qualquer nó), ids próprios, determinístico`, () => {
    expect(mata).toHaveLength(ZS_FARM_FOREST_TREES);
    const all = [...before.filter((n) => !n.layer), ...mata], G = ZS_FARM_FOREST_GAP, grid = new Map<string, HarvestNodeState[]>();
    for (const o of all) { const k = `${Math.floor(o.position.x / G)},${Math.floor(o.position.z / G)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(o); }
    let close = 0;
    for (const n of mata) {
      expect(n.kind).toBe('tree');
      expect(n.id).toMatch(/^zs_hn_tree_mt\d+$/);
      const cx = Math.floor(n.position.x / G), cz = Math.floor(n.position.z / G);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const o of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
        if (o !== n && Math.hypot(o.position.x - n.position.x, o.position.z - n.position.z) < G - 0.01) close++;
      }
    }
    expect(close).toBe(0);
    expect(new Set([...before, ...mata].map((n) => n.id)).size).toBe(before.length + mata.length);
    expect(createZsForestFarm(zsQuery(now), before, undefined, caveMouthClear)).toEqual(mata);
  }, 120_000);
  it('fora da pista (a que o chão pinta), da água, da praia e da boca da caverna; em terra firme', () => {
    for (const n of mata) {
      const { x, z } = n.position;
      expect(zsHeightAt(now, x, z)).toBeGreaterThan(0.5);
      expect(zsSurfAt(now, x, z)).not.toBe(ZS_SURF.beach);
      expect(caveMouthClear(x, z)).toBe(true);
      for (let a = -3; a <= 3; a += 0.5) for (let b = -3; b <= 3; b += 0.5) {
        if (a * a + b * b > 9) continue;
        expect(road(x + a, z + b) > 40, `${n.id} na pista`).toBe(false);
        const s = zsSurfAt(now, x + a, z + b);
        expect(s === ZS_SURF.sea || s === ZS_SURF.lagoon, `${n.id} na água`).toBe(false);
      }
    }
  }, 120_000);
  // medido 03/11 (35 pontos de mata, 60 m em volta): 25,6 de cenário por 1 de farm → 6,1
  it('na mata, perto de você: antes ~1 de farm pra 25–40 de cenário; agora menos de 10 pra 1', () => {
    // pontos na mata (verde fechado) e a proporção cenário:farm a até 60 m
    let veg = 0, farmBefore = 0, farmNow = 0, pts = 0;
    for (let x = -1300; x <= 600; x += 190) for (let z = -600; z <= 900; z += 190) {
      if (zsSurfAt(now, x, z) !== ZS_SURF.forest || zsHeightAt(now, x, z) < 5) continue;
      pts++;
      veg += zsVegetationAround(now, x, z, 60, 60).filter((it) => it.kind !== 'bush' && it.kind !== 'fern' && Math.hypot(it.x - x, it.z - z) <= 60).length;
      const near = (ns: HarvestNodeState[]) => ns.filter((n) => n.kind === 'tree' && !n.layer && Math.hypot(n.position.x - x, n.position.z - z) <= 60).length;
      farmBefore += near(before); farmNow += near(before) + near(mata);
    }
    expect(pts).toBeGreaterThan(15);
    const rBefore = veg / Math.max(1, farmBefore), rNow = veg / Math.max(1, farmNow);
    expect(rBefore).toBeGreaterThan(25);   // o que o Pedro via
    expect(rNow).toBeLessThan(10);
    expect(rNow).toBeLessThan(rBefore / 3);
  }, 120_000);
});
