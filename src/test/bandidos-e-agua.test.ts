import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, ZS_SPAWN_TERRAIN_URL, type ZsTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery, zsWorldProfile } from '@/components/zona-sul/zs-world-profile';
import { createZsBandits, isZsBandit, ZS_BANDITS_PER_GROUP, ZS_BANDIT_GROUPS, ZS_CLEAR_R, ZS_FAUNA, ZS_SAFE } from '@/game/systems/zsSpawnSystem';
import { mergeResumedWorld } from '@/game/systems/wildlifeSystem';
import { landStep, landWaterOk, WADE_DEPTH } from '@/components/world/hostile-ai';
import { CAMPS } from '@/game/data/camps';

let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_SPAWN_TERRAIN_URL) /* o jogo SORTEIA no terreno de 28/10 (02/11) */).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});

/* Pedro 01/11: "no morro tem comunidade armada — mais inimigos armados espalhados pelo mato no alto (não acampamento)";
   "uns 10% mais de inimigos e animais"; "inimigos vêm atrás de mim na água mas bugam porque não nadam". */
describe('bandidos armados nos morros + fauna +10%', () => {
  it('8 duplas de piratas de fuzil no mato alto (≥ 45 m), espalhadas, longe dos acampamentos e do nascedouro; determinístico', () => {
    const q = zsQuery(t), prof = zsWorldProfile(t, q);
    const b = createZsBandits(q, prof.camps);
    expect(createZsBandits(q, prof.camps)).toEqual(b);
    expect(b).toHaveLength(ZS_BANDIT_GROUPS * ZS_BANDITS_PER_GROUP);
    for (const c of b) {
      expect(isZsBandit(c.id)).toBe(true);
      expect(c.speciesId).toBe('raider_scout'); // o pirata atirador (CAMP_GUNNERS)
      expect(q.height(c.position.x, c.position.z)).toBeGreaterThanOrEqual(45);
      expect(Math.hypot(c.position.x - ZS_SAFE.x, c.position.z - ZS_SAFE.z)).toBeGreaterThanOrEqual(ZS_CLEAR_R);
      for (const cp of prof.camps) expect(Math.hypot(c.position.x - cp.position.x, c.position.z - cp.position.z)).toBeGreaterThan(CAMPS[cp.defId]!.radius + 20);
    }
    // espalhados: as duplas a ≥ 150 m umas das outras (8 morros diferentes)
    const anchors = Array.from({ length: ZS_BANDIT_GROUPS }, (_, i) => b[i * ZS_BANDITS_PER_GROUP]!.position);
    for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) expect(Math.hypot(anchors[i]!.x - anchors[j]!.x, anchors[i]!.z - anchors[j]!.z)).toBeGreaterThan(130);
    // atiram de fuzil (como o pirata de acampamento) e não somem ao retomar uma sala salva
    expect(fs.readFileSync('src/components/world/raider.tsx', 'utf8')).toMatch(/const gunner = \(isCampSpawn\(creatureId\) \|\| isZsBandit\(creatureId\)\) && CAMP_GUNNERS\.has\(speciesId\);/);
    expect(mergeResumedWorld(b, []).length).toBe(b.length);
    // fauna +10% (149 → 164)
    expect(ZS_FAUNA.reduce((s, r) => s + r.count, 0)).toBe(164);
  });
});

describe('bicho de terra na água', () => {
  // terra até x = 0; depois a água afunda 0,1 m por m (raso até x = 9, fundo depois)
  const walkable = (x: number) => x < 0;
  const depth = (x: number) => x * 0.1;
  const inB = () => true;
  it('no raso todo mundo entra; no fundo só quem nada', () => {
    expect(landWaterOk((x) => walkable(x), (x) => depth(x), inB, false, 5, 0)).toBe(true);   // 0,5 m
    expect(landWaterOk((x) => walkable(x), (x) => depth(x), inB, false, 20, 0)).toBe(false); // 2 m, não nada
    expect(landWaterOk((x) => walkable(x), (x) => depth(x), inB, true, 20, 0)).toBe(true);   // 2 m, nada
    expect(WADE_DEPTH).toBe(0.9);
  });
  it('quem não nada para na beira do fundo (não atravessa) e quem nada segue', () => {
    const okNo = (x: number, z: number) => landWaterOk((xx) => walkable(xx), (xx) => depth(xx), inB, false, x, z);
    const okYes = (x: number, z: number) => landWaterOk((xx) => walkable(xx), (xx) => depth(xx), inB, true, x, z);
    expect(landStep(okNo, 8.9, 0, 9.5, 0)).toEqual([8.9, 0]);
    expect(landStep(okYes, 8.9, 0, 9.5, 0)).toEqual([9.5, 0]);
    const src = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(src).toMatch(/if \(stuckT\.current > LAND_STUCK_GIVEUP\) chaseTimer\.current = tuning\.chaseTimeout;/); // desiste na beira
    expect(fs.readFileSync('src/components/world/beast.tsx', 'utf8')).toMatch(/hitVerb: 'investiu', landSwim: 0\.55/); // jacaré nada
  });
});
