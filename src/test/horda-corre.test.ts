import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAMP_CHASE_RUN, campChaseScale, HORDE_RUN_FROM, HORDE_RUNNERS, hordeSpeedScale } from '@/game/systems/waveSystem';
import { isCampSpawn } from '@/game/systems/difficultySystem';
import { CAMP_PLACEMENTS } from '@/game/data/camps';

/* Pedro, 25/10: "os bichos que têm Mixamo nas hordas podem começar a correr mais quando aumenta a horda; com o
   tempo a velocidade deles aumenta também". +3%/onda (teto +60%); a partir de +20% (onda 8) anima CORRENDO. */
describe('horda Mixamo acelera com a onda', () => {
  it('+3% por onda, teto +60%; onda 1 igual a antes', () => {
    expect(hordeSpeedScale('wave1_raider_brute_0', 'raider_brute')).toBe(1);
    expect(hordeSpeedScale('wave5_raider_brute_0', 'raider_brute')).toBeCloseTo(1.12, 5);
    expect(hordeSpeedScale('wave10_raider_samurai_2', 'raider_samurai')).toBeCloseTo(1.27, 5);
    expect(hordeSpeedScale('wave40_raider_scout_1', 'raider_scout')).toBe(1.6);
    expect(hordeSpeedScale('wave9_ohost7_raider_brute_3', 'raider_brute')).toBeCloseTo(1.24, 5); // horda online
  });
  it('só horda e só Mixamo: acampamento, mapa e bicho sem Mixamo ficam como estão', () => {
    expect(hordeSpeedScale('camp_north_e2', 'raider_brute')).toBe(1);
    expect(hordeSpeedScale('wild_bear_2', 'bear')).toBe(1);
    expect(hordeSpeedScale('wave12_wolf_alpha_0', 'wolf_alpha')).toBe(1);
  });
  it('corrida começa na onda 8', () => {
    expect(hordeSpeedScale('wave7_raider_brute_0', 'raider_brute')).toBeLessThan(HORDE_RUN_FROM);
    expect(hordeSpeedScale('wave8_raider_brute_0', 'raider_brute')).toBeGreaterThanOrEqual(HORDE_RUN_FROM);
  });
  it('lista de corredores = raiders com rig Mixamo; IA e animação usam a regra', () => {
    const r = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    const block = /const MIXAMO_RAIDER[\s\S]*?\n\};/.exec(r)![0];
    const mixamo = [...block.matchAll(/^\s*(raider_\w+):/gm)].map((m) => m[1]).sort();
    expect([...HORDE_RUNNERS].sort()).toEqual(mixamo);
    expect(r).toMatch(/anim\.moving \? \(hordeRuns \|\| \(campRuns && anim\.chasing\) \? 'run' : 'walk'\) : 'idle'/);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/\* hordeSpeedScale\(creatureId, creature\.speciesId\)/);
  });
});

/* Pedro, 25/10: inimigos de acampamento perseguem CORRENDO ("mais realista"). */
describe('acampamento persegue correndo', () => {
  it('+25% só pra raider Mixamo de acampamento; horda/mapa sem esse bônus', () => {
    const camp = CAMP_PLACEMENTS[0]!.id + '_e1';
    expect(isCampSpawn(camp)).toBe(true);
    expect(isCampSpawn(camp)).toBe(true); // memorizado, mesma resposta
    expect(isCampSpawn('wave3_raider_brute_1')).toBe(false);
    expect(campChaseScale(true, 'raider_scout')).toBe(CAMP_CHASE_RUN);
    expect(campChaseScale(false, 'raider_scout')).toBe(1);
    expect(campChaseScale(true, 'wolf_alpha')).toBe(1);
  });
  it('só no ramo de PERSEGUIR (voltar pra casa segue andando)', () => {
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/const runSpeed = chaseSpeed \* campChaseScale\(isCampSpawn\(creatureId\), creature\.speciesId\);\s*targetX = wx \+ Math\.sin\(angle\) \* runSpeed \* dt;/);
    expect(ai.match(/runSpeed/g)!.length).toBe(3);
  });
});
