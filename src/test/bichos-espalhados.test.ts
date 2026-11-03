import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt, ZS_SPAWN_TERRAIN_URL } from '@/components/zona-sul/zs-terrain-data';
import { ZS_ROAD_MASK, ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery, zsWorldProfile } from '@/components/zona-sul/zs-world-profile';
import { caveMouthClear, setCaveTerrain } from '@/components/zona-sul/zs-cave';
import {
  createZsBandits, createZsNewAreaCreatures, createZsSpreadBandits, createZsSpreadFauna, createZsWildlife, isZsBandit, ZS_FAUNA,
  ZS_SAFE, ZS_SPREAD_GAP, ZS_SPREAD_ZONES, ZS_BANDITS_PER_GROUP, ZS_SPREAD_BANDIT_GROUPS, zsReachable,
} from '@/game/systems/zsSpawnSystem';
import { createZsHarvestNodes, createZsNewAreaTrees, createZsSpreadHarvest, ZS_FARM_SPREAD, ZS_FARM_SPREAD_EMPTY } from '@/game/systems/zsHarvestSystem';
import { deadCreature } from '@/game/state/game-store';
import type { CreatureState, HarvestNodeState } from '@/game/types';

/* Pedro 03/11: "o tempo de respawn de bichos pode ser mais rápido · preciso ver quanto mais inimigos e mutantes, bichos pra
   farmar pelo mapa + árvore e pedra dá pra pôr no mapa ainda — acho que tá pouco, o mapa é grande". Medido: cada espécie
   nascia num grupo SÓ (110 m); 1/3 do mapa sem bicho; dobrar bichos soltos + farm tirou ~8% do FPS. */
const load = async (f: string) => {
  const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeTerrain(data, info.width, info.height);
};
let now: ZsTerrain, old: ZsTerrain;
let base: CreatureState[], spread: ReturnType<typeof createZsSpreadFauna>, bandits: CreatureState[];
let farmBase: HarvestNodeState[], farmSpread: HarvestNodeState[];
let road: (x: number, z: number) => number;
const surfaceIds = /^(wild_cave_|zs_cave_|wild_shark_)/;
beforeAll(async () => {
  now = await load('public' + ZS_TERRAIN.url); old = await load('public' + ZS_SPAWN_TERRAIN_URL);
  setCaveTerrain(now);
  const qNow = zsQuery(now), query = zsQuery(old), prof = zsWorldProfile(now, qNow, query);
  // igual ao mundo (zona-sul-world): bichos de sempre + bandidos + área nova (o mar e a caverna não contam pra zona nova)
  base = [...createZsWildlife(query, undefined, ZS_FAUNA, prof.camps), ...createZsBandits(query, prof.camps), ...createZsNewAreaCreatures(qNow, query.bounds, prof.camps)];
  spread = createZsSpreadFauna(qNow, base.filter((c) => !surfaceIds.test(c.id)).map((c) => c.position), prof.camps);
  bandits = createZsSpreadBandits(qNow, base, prof.camps);
  const b0 = createZsHarvestNodes(query);
  farmBase = [...b0, ...createZsNewAreaTrees(qNow, query.bounds, b0)];
  farmSpread = createZsSpreadHarvest(qNow, farmBase, undefined, caveMouthClear);
  const r = await sharp(fs.readFileSync('public' + ZS_ROAD_MASK.url)).raw().toBuffer({ resolveWithObject: true });
  road = (x, z) => { const u = Math.floor(x - ZS_ROAD_MASK.x0), v = Math.floor(z - ZS_ROAD_MASK.z0); return u < 0 || v < 0 || u >= r.info.width || v >= r.info.height ? 0 : r.data[(v * r.info.width + u) * r.info.channels]!; };
}, 120_000);
/** quadrados de 300 m com terra que têm pelo menos 1 ponto */
const covered = (ps: { x: number; z: number }[]) => new Set(ps.map((p) => `${Math.floor(p.x / 300)},${Math.floor(p.z / 300)}`)).size;

describe('renascer mais rápido', () => {
  const mk = (id: string): CreatureState => ({ id, speciesId: 'deer', name: 'x', hp: 0, maxHp: 10, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0, position: { x: 0, z: 0 }, behavior: 'idle', lootTable: [], respawnAt: null });
  it('bicho solto (e bandido, e inimigo da caverna) volta em 45 s–1 min 15 s; acampamento igual a antes', () => {
    for (const id of ['wild_deer_3', 'wild_bandit_sp1', 'wild_cave_chefe_2', 'wild_monster_sp0']) {
      expect(deadCreature(mk(id), 0, () => 0).respawnAt).toBe(45_000);
      expect(deadCreature(mk(id), 0, () => 1).respawnAt).toBe(75_000);
    }
    expect(deadCreature(mk('zs_camp_1_e_raider_scout_0'), 0, () => 0).respawnAt).toBe(144_000); // 3 min × 0,8 (não mudou)
  });
});

describe('bichos espalhados pelo mapa', () => {
  it('zonas novas pelo mapa todo, longe de tudo que já tinha, com mutantes no alto', () => {
    expect(spread.zones.length).toBeGreaterThanOrEqual(ZS_SPREAD_ZONES - 2);
    const kinds = spread.zones.map((z) => z.kind);
    expect(kinds.filter((k) => k === 'high').length).toBeGreaterThanOrEqual(4);
    expect(kinds.filter((k) => k === 'low').length).toBeGreaterThanOrEqual(4);
    const surf = base.filter((c) => !surfaceIds.test(c.id));
    for (const z of spread.zones) {
      for (const c of surf) expect(Math.hypot(c.position.x - z.x, c.position.z - z.z)).toBeGreaterThanOrEqual(ZS_SPREAD_GAP);
      for (const o of spread.zones) if (o !== z) expect(Math.hypot(o.x - z.x, o.z - z.z)).toBeGreaterThanOrEqual(ZS_SPREAD_GAP);
    }
  });
  it('~+100 bichos (≥ 16 mutantes), em terra firme, fora da praia e da zona segura, ids próprios', () => {
    const c = spread.creatures;
    expect(c.length).toBeGreaterThanOrEqual(90);
    expect(c.filter((x) => x.speciesId === 'monster' || x.speciesId === 'flintmaw').length).toBeGreaterThanOrEqual(16);
    const ids = new Set(base.map((x) => x.id));
    for (const x of c) {
      expect(x.id).toMatch(/^wild_[a-z_]+_sp\d+$/);
      expect(ids.has(x.id)).toBe(false);
      expect(zsHeightAt(now, x.position.x, x.position.z)).toBeGreaterThan(0.5);
      expect(zsSurfAt(now, x.position.x, x.position.z)).not.toBe(ZS_SURF.beach);
      expect(Math.hypot(x.position.x - ZS_SAFE.x, x.position.z - ZS_SAFE.z)).toBeGreaterThan(ZS_SAFE.radius);
    }
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
  });
  it('só onde se chega A PÉ do nascedouro (nada nas Cagarras — só de barco)', () => {
    const reach = zsReachable(zsQuery(now));
    expect(reach(ZS_SAFE.x, ZS_SAFE.z)).toBe(true);
    // Cagarras: a ilha de terra mais ao sul do mapa (z > 850)
    let island: { x: number; z: number } | null = null;
    for (let z = 1300; z > 850 && !island; z -= 4) for (let x = -1400; x < 800 && !island; x += 4) if (zsHeightAt(now, x, z) > 3 && zsSurfAt(now, x, z) !== ZS_SURF.sea) island = { x, z };
    expect(island).not.toBeNull();
    expect(reach(island!.x, island!.z)).toBe(false);
    for (const c of spread.creatures) expect(reach(c.position.x, c.position.z), c.id).toBe(true);
    for (const z of spread.zones) expect(reach(z.x, z.z)).toBe(true);
  });
  it('o mapa fica coberto: mais quadrados de 300 m com bicho, e o oeste (maciço da Tijuca) ganha bicho', () => {
    const before = base.filter((c) => !surfaceIds.test(c.id)).map((c) => c.position), after = [...before, ...spread.creatures.map((c) => c.position)];
    expect(covered(after)).toBeGreaterThanOrEqual(covered(before) + 8);
    expect(after.filter((p) => p.x < -800).length).toBeGreaterThan(before.filter((p) => p.x < -800).length + 15);
  });
  it(`+${ZS_SPREAD_BANDIT_GROUPS} duplas de bandidos atiradores, longe das duplas de antes`, () => {
    expect(bandits).toHaveLength(ZS_SPREAD_BANDIT_GROUPS * ZS_BANDITS_PER_GROUP);
    const oldB = base.filter((c) => isZsBandit(c.id));
    for (const b of bandits) {
      expect(b.id).toMatch(/^wild_bandit_sp\d+$/);
      expect(b.speciesId).toBe('raider_scout');
      for (const o of oldB) expect(Math.hypot(o.position.x - b.position.x, o.position.z - b.position.z)).toBeGreaterThan(130);
    }
  });
  it('mesmo sorteio pra todo mundo (online): determinístico; e os bichos de antes não mudaram', () => {
    const qNow = zsQuery(now), query = zsQuery(old), prof = zsWorldProfile(now, qNow, query);
    expect(createZsSpreadFauna(qNow, base.filter((c) => !surfaceIds.test(c.id)).map((c) => c.position), prof.camps)).toEqual(spread);
    expect(createZsBandits(query, prof.camps)).toEqual(base.filter((c) => /^wild_bandit_\d+$/.test(c.id))); // o parâmetro novo (vazio) não mexe
  });
});

describe('farm espalhada nos vazios', () => {
  it(`+${ZS_FARM_SPREAD.reduce((s, t) => s + t.count, 0)} árvores/pedras só onde não tinha farm a < ${ZS_FARM_SPREAD_EMPTY} m`, () => {
    for (const t of ZS_FARM_SPREAD) expect(farmSpread.filter((n) => n.kind === t.kind).length, t.kind).toBe(t.count);
    for (const n of farmSpread) {
      expect(n.id).toMatch(/^zs_hn_(tree|rock|pebble)_sp\d+$/);
      for (const o of farmBase) expect(Math.hypot(o.position.x - n.position.x, o.position.z - n.position.z)).toBeGreaterThanOrEqual(ZS_FARM_SPREAD_EMPTY);
    }
    expect(new Set([...farmBase, ...farmSpread].map((n) => n.id)).size).toBe(farmBase.length + farmSpread.length);
  });
  it('fora da pista (a que o chão pinta), da água e da boca da caverna; o oeste ganha farm', () => {
    for (const n of farmSpread) {
      const { x, z } = n.position;
      for (let a = -3; a <= 3; a += 0.5) for (let b = -3; b <= 3; b += 0.5) {
        if (a * a + b * b > 9) continue;
        expect(road(x + a, z + b) > 40, `${n.id} na pista`).toBe(false);
        const s = zsSurfAt(now, x + a, z + b);
        expect(s === ZS_SURF.sea || s === ZS_SURF.lagoon, `${n.id} na água`).toBe(false);
      }
      expect(caveMouthClear(x, z)).toBe(true);
    }
    const west = (ns: HarvestNodeState[]) => ns.filter((n) => n.position.x < -800).length;
    expect(west(farmSpread)).toBeGreaterThan(30);
  });
});
