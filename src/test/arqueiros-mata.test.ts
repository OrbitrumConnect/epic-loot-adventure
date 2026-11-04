import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, ZS_SPAWN_TERRAIN_URL } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { setCaveTerrain } from '@/components/zona-sul/zs-cave';
import { zsQuery, zsWorldProfile } from '@/components/zona-sul/zs-world-profile';
import {
  createZsBandits, createZsForestArchers, createZsSpreadBandits, isZsArcher, isZsBandit, ZS_ARCHER_GROUPS, ZS_ARCHERS_PER_GROUP,
} from '@/game/systems/zsSpawnSystem';
import { mergeResumedWorld } from '@/game/systems/wildlifeSystem';
import { CAMPS } from '@/game/data/camps';
import { ZS_SAFE } from '@/game/systems/zsSpawnSystem';
import { archerTuning, CAMP_SCALE, CAMP_SCALE_BY, FOREST_ARCHER } from '@/components/world/raider';
import type { CreatureState } from '@/game/types';

/* Pedro 03/11: "o saqueador xamã está pequeno, inimigo dos acampamentos… seria bom ter ele no mato rondando, pois é
   arqueiro, atira de longe — fica maneiro". */
const load = async (f: string): Promise<ZsTerrain> => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeTerrain(data, info.width, info.height);
};
let archers: CreatureState[], bandits: CreatureState[], camps: { position: { x: number; z: number }; defId: string }[];
let q: ReturnType<typeof zsQuery>;
beforeAll(async () => {
  const now = await load('public' + ZS_TERRAIN.url), old = await load('public' + ZS_SPAWN_TERRAIN_URL);
  setCaveTerrain(now);
  q = zsQuery(now);
  const prof = zsWorldProfile(now, q, zsQuery(old));
  camps = prof.camps;
  const base = createZsBandits(zsQuery(old), prof.camps);
  bandits = [...base, ...createZsSpreadBandits(q, base, prof.camps)].filter((c) => isZsBandit(c.id));
  archers = createZsForestArchers(q, prof.camps, bandits.map((c) => c.position));
}, 120_000);

describe('arqueiros (xamã) rondando a mata', () => {
  it('6 duplas na MATA (chão de floresta), longe dos acampamentos, da zona segura e dos bandidos', () => {
    expect(archers.length).toBeGreaterThanOrEqual((ZS_ARCHER_GROUPS - 1) * ZS_ARCHERS_PER_GROUP);
    for (const a of archers) {
      expect(isZsArcher(a.id)).toBe(true);
      expect(a.speciesId).toBe('raider_shaman');
      expect(q.surf(a.position.x, a.position.z)).toBe(ZS_SURF.forest);
      for (const c of camps) expect(Math.hypot(a.position.x - c.position.x, a.position.z - c.position.z)).toBeGreaterThan((CAMPS[c.defId]?.radius ?? 10) + 15);
      expect(Math.hypot(a.position.x - ZS_SAFE.x, a.position.z - ZS_SAFE.z)).toBeGreaterThan(ZS_SAFE.radius);
      for (const b of bandits) expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThan(80);
    }
    // a mesma semente = os mesmos lugares (online: todo mundo vê o mesmo)
    expect(createZsForestArchers(q, camps as never, bandits.map((c) => c.position))).toEqual(archers);
  });

  it('veem de 24 m e atiram FLECHA de 16 m; no acampamento o xamã é maior (0,49 → 0,75); sala retomada não os perde', () => {
    expect(FOREST_ARCHER).toMatchObject({ attackRange: 16, aggroRange: 24 });
    const base = { speed: 3, wanderSpeed: 1, aggroRange: 15, attackRange: 10, leashRange: 16, chaseTimeout: 12, provokeRange: 24, walkSpeedChase: 14, walkSpeedIdle: 7, hitVerb: 'flechou' } as never;
    const forest = archerTuning(base, 1, true), camp = archerTuning(base, 0.75, false);
    expect(forest.attackRange).toBe(16); expect(forest.shot).toMatchObject({ arrow: true });
    expect(camp.attackRange).toBe(10); expect(camp.shot).toMatchObject({ arrow: true });
    expect(CAMP_SCALE_BY['raider_shaman']).toBe(0.75); expect(CAMP_SCALE).toBe(0.49);
    expect(mergeResumedWorld([archers[0]!], [])).toHaveLength(1);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/shotEvent\(from, to, shot\.arrow \? 'arrow' : 'bullet', shot\.height\)/);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/return \[\.\.\.base, \.\.\.createZsSpreadFauna\(zsQuery\(tt\), surface, prof\.camps\)\.creatures, \.\.\.spreadBandits, \.\.\.archers\];/);
  });
});
