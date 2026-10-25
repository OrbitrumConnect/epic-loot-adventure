import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deadCreature } from '@/game/state/game-store';
import type { CreatureState } from '@/game/types';

/* Pedro, 25/10 (onda 9, PAZ de 10 min): "do nada minha base morreu". Banco: basesLost 5→6, nv 128→123, armazém
   10 053→7 539 (−25%) = regra de base caída. Causa: os mortos da HORDA ganhavam timer de renascer (2,4–4 min;
   convidado online: 20 s), renasciam na paz no anel em volta da base e, sendo da horda, marchavam até o núcleo. */
const mk = (id: string): CreatureState => ({
  id, speciesId: 'raider_brute', name: 'x', hp: 10, maxHp: 10, attackPower: 5, armor: 0, attackCooldown: 1, lastAttackAt: 0,
  position: { x: 0, z: 0 }, behavior: 'chase', lootTable: [], respawnAt: null,
});

describe('horda morta NÃO renasce', () => {
  it('morte de bicho da horda: sem renascer; do mapa: renasce como antes', () => {
    expect(deadCreature(mk('wave9_raider_brute_3'), 1000, () => 0.5).respawnAt).toBeNull();
    expect(deadCreature(mk('wave9_ohost7_raider_brute_3'), 1000, () => 0.5).respawnAt).toBeNull(); // horda online
    expect(deadCreature(mk('wild_bear_2'), 1000, () => 0.5).respawnAt).toBeGreaterThan(1000);
  });
  it('golpe do convidado usa a mesma regra (antes: renascia em 20 s); IA nunca revive horda; onda repelida limpa os mortos', () => {
    const we = fs.readFileSync('src/components/world/world-entities.tsx', 'utf8');
    expect(we).toMatch(/\? deadCreature\(c, Date\.now\(\), Math\.random\)/);
    expect(we).not.toMatch(/respawnAt: Date\.now\(\) \+ 20_000/);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/Date\.now\(\) >= creature\.respawnAt && !creatureId\.startsWith\('wave'\)/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/if \(wt\.repelledWave\) waveCreatures = waveCreatures\.filter\(\(c\) => !\(c\.id\.startsWith\('wave'\) && isMyWave\(c\.id\) && c\.behavior === 'dead'\)\);/);
  });
});

describe('ajustes 25/10 (Pedro)', () => {
  it('Couraça 4,7 e Fúngico 3,9 de velocidade (+15%); poste de luz 5,2 m (+1 m)', () => {
    const r = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(r).toMatch(/speed: 3\.9, aggroRange: 34, attackRange: 6/);
    expect(r).toMatch(/speed: 4\.7, aggroRange: 32, attackRange: 5/);
    expect(fs.readFileSync('src/components/game-world.tsx', 'utf8')).toMatch(/const LIGHT_POST_H = 5\.2;/);
  });
});
