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

/* 26/10: as 18 vagas (raposa + robô) viraram inimigos de ACAMPAMENTO (+3/+4/+5/+6, com piratas atiradores). */
describe('acampamentos mais cheios', () => {
  it('7 / 9 / 12 / 15 inimigos; os novos no fim (ids antigos iguais), longe de barraca/torre/paliçada e uns dos outros', async () => {
    const { CAMPS } = await import('@/game/data/camps');
    const before: Record<string, number> = { raider_outpost: 4, blackclaw_camp: 5, crackedbone_warband: 7, stonefist_stronghold: 9 };
    const after: Record<string, number> = { raider_outpost: 7, blackclaw_camp: 9, crackedbone_warband: 12, stonefist_stronghold: 15 };
    for (const [id, n] of Object.entries(after)) {
      const def = CAMPS[id]!;
      expect(def.spawns.length).toBe(n);
      const fresh = def.spawns.slice(before[id]);
      for (const s of fresh) {
        expect(Math.hypot(s.offset.x, s.offset.z)).toBeLessThan(def.radius - 1);
        for (const st of def.structures) expect(Math.hypot(s.offset.x - st.offset.x, s.offset.z - st.offset.z), `${id} ${s.speciesId} × ${st.kind}`).toBeGreaterThan(1.5);
        for (const o of def.spawns) if (o !== s) expect(Math.hypot(s.offset.x - o.offset.x, s.offset.z - o.offset.z)).toBeGreaterThan(1.5);
      }
    }
  });
});

/* 26/10 (Pedro): "ganso e faisão atacam, mais rapidinho, correndo". */
describe('ganso e faisão agressivos rápidos', () => {
  it('hostis (não fogem), correm mais que a leoa, bicada fraca, desistem logo', async () => {
    const { QUICK_BIRD_TUNING } = await import('@/components/world/beast');
    for (const sp of ['goose', 'pheasant']) {
      expect(CREATURES[sp]!.peaceful).toBe(false);
      const t = QUICK_BIRD_TUNING[sp]!;
      expect(t.peaceful).toBeUndefined();
      expect(t.speed).toBeGreaterThan(4.4); // leoa
      expect(t.chaseTimeout).toBeLessThanOrEqual(5);
      expect(t.leashRange).toBeLessThanOrEqual(12);
      expect(CREATURES[sp]!.attackPower).toBeLessThanOrEqual(2);
    }
  });
});
