import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREATURES } from '@/game/data/creatures';
import { createWildCreatures, WILD_SPAWN_COUNTS } from '@/game/systems/wildlifeSystem';

/* Pedro, 26/10: "tirar o robô, tirar a raposa". Sem regressão: o drop da raposa (couro/presa/tendão das receitas
   comuns + 2 peças de armadura) foi pra outros bichos, e a horda manteve a conta da bala (robô → Fauce de Sílex). */
const armor = (id: string) => CREATURES[id]!.lootTable.filter((l) => /_(common|uncommon)$|^leather_armor$/.test(l.itemId as string)).map((l) => `${l.itemId}@${l.chance}`);

describe('robô e raposa fora, sem perder nada', () => {
  it('não nascem mais no mapa (nem as 3 raposas do início)', () => {
    expect(WILD_SPAWN_COUNTS['wolf']).toBe(0);
    expect(WILD_SPAWN_COUNTS['pelter']).toBe(0);
    const wild = createWildCreatures();
    expect(wild.some((c) => c.speciesId === 'wolf' || c.speciesId === 'pelter')).toBe(false);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/function createInitialCreatures\(\): CreatureState\[\] \{\s*return \[\];\s*\}/);
  });
  it('armaduras: TODO bicho igual a antes; a leoa herda as 2 peças da raposa', () => {
    // Medido antes da mudança (rodízio calculado): raposa head_common@0.08 + ring1_uncommon@0.04.
    expect(armor('wolf_alpha')).toEqual(['head_common@0.08', 'ring1_uncommon@0.04']);
    expect(armor('raider_scout')).toEqual(['leather_armor@0.08', 'ring2_uncommon@0.04']);
    expect(armor('raider_warrior')).toEqual(['gloves_common@0.08']);
    expect(armor('raider_brute')).toEqual(['leather_armor@0.15', 'boots_common@0.08']);
    expect(armor('raider_samurai')).toEqual(['chest_uncommon@0.04']);
    expect(armor('rabbit')).toEqual(['gloves_uncommon@0.04']);
    expect(armor('goose')).toEqual(['boots_uncommon@0.04']);
    expect(armor('pheasant')).toEqual(['amulet_uncommon@0.04']);
  });
  it('couro/presa/tendão por ciclo de renascimento ≥ antes (receitas comuns não ficam sem fonte)', () => {
    const per = (item: string) => Object.entries(WILD_SPAWN_COUNTS).reduce((sum, [sp, n]) =>
      sum + n * (CREATURES[sp]?.lootTable ?? []).filter((l) => l.itemId === item).reduce((a, l) => a + l.chance * l.quantity, 0), 0);
    // Antes (com 11 raposas): couro 4,4 + 8,4 = 12,8 · presa 7,7 + 12,6 = 20,3 · tendão 3,3 + 7 + jacaré 6,3 = 16,6.
    expect(per('wolf_pelt')).toBeGreaterThanOrEqual(12.8);
    expect(per('wolf_fang')).toBeGreaterThanOrEqual(20.3);
    expect(per('sinew')).toBeGreaterThanOrEqual(16.6);
  });
  it('horda: robô sai, Fauce de Sílex entra na vaga (mesmo papel: sem bala, vida média)', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/const WAVE_SPECIES = \['raider_scout', 'raider_warrior', 'raider_puglin', 'raider_brute', 'raider_shaman', 'flintmaw'\] as const;/);
    expect(CREATURES['flintmaw']!.lootTable.some((l) => l.itemId === 'ammo')).toBe(false);
  });
});
