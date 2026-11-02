import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt, ZS_SPAWN_TERRAIN_URL } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery } from '@/components/zona-sul/zs-world-profile';
import { createZsNewAreaCreatures, isZsBandit, ZS_NEW_AREA_BANDIT_GROUPS, ZS_NEW_AREA_FAUNA, ZS_BANDITS_PER_GROUP } from '@/game/systems/zsSpawnSystem';
import { makeZsRamp, rampDeckY, rampLocal, rampStep, ZS_RAMP, zsRampFloor } from '@/components/zona-sul/zs-ramp';

/* Pedro 02/11: "área nova (Gávea/São Conrado): bichos/inimigos? rampa de asa-delta na Pedra Bonita? ilhas mais altas?" →
   "sequência 1…6, todas". */
const load = async (f: string) => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeTerrain(data, info.width, info.height);
};
let now: ZsTerrain, old: ZsTerrain;
beforeAll(async () => { now = await load('public' + ZS_TERRAIN.url); old = await load('public' + ZS_SPAWN_TERRAIN_URL); });

describe('área nova — bichos e bandidos', () => {
  it('fauna da mata + 2 duplas de bandidos atiradores, SÓ fora do recorte antigo, ids próprios (gv), determinístico', () => {
    const qNow = zsQuery(now), ob = zsQuery(old).bounds;
    const c = createZsNewAreaCreatures(qNow, ob);
    expect(createZsNewAreaCreatures(qNow, ob)).toEqual(c);
    const fauna = c.filter((x) => !isZsBandit(x.id)), bandits = c.filter((x) => isZsBandit(x.id));
    expect(fauna.length).toBe(ZS_NEW_AREA_FAUNA.reduce((s, r) => s + r.count, 0));
    expect(bandits).toHaveLength(ZS_NEW_AREA_BANDIT_GROUPS * ZS_BANDITS_PER_GROUP);
    for (const x of c) {
      const { x: px, z: pz } = x.position;
      expect(px >= ob.minX && px <= ob.maxX && pz >= ob.minZ && pz <= ob.maxZ, x.id).toBe(false);
      expect(x.id).toMatch(/_gv\d+$/);
      expect(zsHeightAt(now, px, pz)).toBeGreaterThan(0.5); // nada na água
    }
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
    for (const b of bandits) expect(b.speciesId).toBe('raider_scout');
  }, 60_000);
});

describe('área nova — rampa de voo livre da Pedra Bonita', () => {
  it('no Alto do Voo Livre, apontando pra descida; a ponta fica no VAZIO (bem acima do chão) — dá pra decolar', () => {
    const r = makeZsRamp(now)!;
    expect(r).not.toBeNull();
    const s = Math.sin(r.yaw), c = Math.cos(r.yaw);
    const tip = { x: r.x + r.len * s, z: r.z + r.len * c };
    expect(rampDeckY(r, r.len) - zsHeightAt(now, tip.x, tip.z)).toBeGreaterThan(5);           // ponta no ar
    expect(Math.abs(rampDeckY(r, 0) - zsHeightAt(now, r.x, r.z))).toBeLessThan(0.6);           // começo rente ao morro
    expect(zsHeightAt(now, r.x + 25 * s, r.z + 25 * c)).toBeLessThan(zsHeightAt(now, r.x, r.z) - 10); // aponta pra descida
  });
  it('o deck é chão (em cima), não puxa quem está embaixo; o parapeito segura de lado; sair pela ponta = sem deck', () => {
    const r = makeZsRamp(now)!, s = Math.sin(r.yaw), c = Math.cos(r.yaw);
    const at = (u: number, v: number) => ({ x: r.x + u * s + v * c, z: r.z + u * c - v * s });
    const mid = at(7, 0);
    expect(zsRampFloor(mid.x, mid.z, rampDeckY(r, 7), r)).toBeCloseTo(rampDeckY(r, 7), 6);
    expect(zsRampFloor(mid.x, mid.z, rampDeckY(r, 7) - 5, r)).toBe(-Infinity);   // embaixo da rampa: o chão de lá
    const out = at(r.len + 0.5, 0);
    expect(zsRampFloor(out.x, out.z, rampDeckY(r, r.len), r)).toBe(-Infinity);   // passou da ponta: cai
    const side = rampStep(mid.x, mid.z, c * 5, -s * 5, r);                       // empurrando de lado 5 m
    expect(Math.abs(rampLocal(r, side.x, side.z).v)).toBeLessThanOrEqual(ZS_RAMP.WIDTH / 2);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('if (onRamp.current && rampY === -Infinity && grounded.current && st.ground < p.y - 0.8) { grounded.current = false; vy.current = 0; }');
    expect(zs).toContain('<ZsRampView t={t} />');
  });
});

describe('área nova — Cagarras mais altas', () => {
  it('a Ilha Cagarra passa de 20 m no jogo (era ~14); o mapa antigo segue igual (ver gavea-cagarras)', () => {
    const V1 = { s: -22.993, w: -43.252, n: -22.932 }, PXM = 29.6, M_LON = 111320 * Math.cos((V1.s + V1.n) / 2 * Math.PI / 180);
    const gx = (lon: number) => ((lon - V1.w) * M_LON / PXM - 182) * 4, gz = (lat: number) => ((V1.n - lat) * 110574 / PXM - 114) * 4;
    let top = -Infinity;
    for (let a = -80; a <= 80; a += 4) for (let b = -80; b <= 80; b += 4) top = Math.max(top, zsHeightAt(now, gx(-43.1925) + a, gz(-23.0268) + b));
    expect(top).toBeGreaterThan(20);
    const cfg = fs.readFileSync('tools/zona-sul/zona-sul-config.mjs', 'utf8');
    expect(cfg).toMatch(/export const ISLAND_BOOST = \{ k: 1\.7,/);
  });
});
