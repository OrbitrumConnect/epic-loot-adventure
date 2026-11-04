import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_ENEMIES, CAVE_TUNE, caveEnemySpots, caveLayer, caveStandAt, setCaveTerrain } from '@/components/zona-sul/zs-cave';
import { createCaveCreatures } from '@/components/zona-sul/zs-world-profile';
import { CREATURES } from '@/game/data/creatures';
import { applyWorldLevel, difficultyStats } from '@/game/systems/difficultySystem';

/* Pedro 03/11: "cave pode por mais uns 15–20% de inimigos variados" (e antes: "canibal dentro da cave, espalhado").
   Medido antes: 62 (27 nos salões + 35 nos túneis), só Fauce de Sílex e Aberração. */
beforeAll(async () => {
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  setCaveTerrain(decodeTerrain(data, info.width, info.height));
}, 120_000);

describe('caverna: +15–20% de inimigos, variados', () => {
  it('62 → 73 (+17,7%), com Canibal, brutamontes e Puglin — todos em pé no chão da caverna', () => {
    const all = caveEnemySpots();
    expect(all.length).toBe(73);
    expect(all.length / 62).toBeGreaterThanOrEqual(1.15); expect(all.length / 62).toBeLessThanOrEqual(1.2);
    const kinds = new Set(all.map((s) => s.speciesId));
    for (const k of ['flintmaw', 'monster', 'raider_cannibal', 'raider_brute', 'raider_puglin']) expect(kinds.has(k), k).toBe(true);
    for (const s of all.slice(27, 38)) {
      const fl = caveStandAt(s.x, s.z);
      expect(fl, s.id).not.toBeNull();
      expect(caveLayer(s.x, fl!, s.z), s.id).toBe(1);
    }
    // os de antes: mesmos ids (a lista só cresceu no fim)
    expect(CAVE_ENEMIES.slice(0, 27).every(([, sp]) => sp === 'flintmaw' || sp === 'monster')).toBe(true);
  });

  it('Canibal na caverna é o COMUM (o chefe de onda tem 2400 de vida): ~430 de vida, metade do golpe; os outros como são', () => {
    expect(CAVE_TUNE['raider_cannibal']).toEqual({ hp: 0.18, atk: 0.5 });
    const cr = createCaveCreatures();
    const can = cr.filter((c) => c.speciesId === 'raider_cannibal');
    expect(can).toHaveLength(3);
    for (const c of can) {
      expect(c.maxHp).toBeLessThan(CREATURES['raider_cannibal']!.maxHp * 0.25);
      expect(c.attackPower).toBe(Math.round(CREATURES['raider_cannibal']!.attackPower * 0.5));
    }
    const brute = cr.find((c) => c.speciesId === 'raider_brute')!;
    expect(brute.attackPower).toBe(CREATURES['raider_brute']!.attackPower);
  });

  it('o redutor VALE DEPOIS da força pela região (medido no navegador: sem isto o Canibal da caverna nascia com 15 mil)', () => {
    const def = CREATURES['raider_cannibal']!;
    const cave = createCaveCreatures().find((c) => c.speciesId === 'raider_cannibal')!;
    for (const lvl of [1, 25, 60]) {
      const base = difficultyStats(def, lvl, false);
      const scaled = applyWorldLevel(cave, def, lvl, () => 0.99, false);
      expect(scaled.maxHp).toBe(Math.round(base.maxHp * 0.18));
      expect(scaled.attackPower).toBe(Math.round(base.attackPower * 0.5));
    }
    // fora da caverna (chefe de onda, acampamento…): a ficha cheia, como sempre
    const wave = applyWorldLevel({ ...cave, id: 'wave_3_0' }, def, 25, () => 0.99, false);
    expect(wave.maxHp).toBe(difficultyStats(def, 25, false).maxHp);
  });
});
