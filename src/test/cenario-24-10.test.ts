import { describe, expect, it } from 'vitest';
import { CAMPS, CAMP_PLACEMENTS, findPlacementIssues } from '@/game/data/camps';
import { FACTORY_SHOWN, FACTORY_SITES } from '@/components/world/world-kit';
import { CAMP_NO_SCENERY } from '@/components/world/camp';

/* Pedro, 24/10: "o 1º acampamento colado no nascedouro sai, deixa só os inimigos; a fábrica atrás do
   acampamento maior (canto do mapa, lado oposto da praia) pode sair — sem mexer em mais nada". */
describe('cenário 24/10', () => {
  it('1º acampamento: sem cenário, mas segue no mapa com os MESMOS inimigos', () => {
    expect([...CAMP_NO_SCENERY]).toEqual(['raider_outpost']);
    const p = CAMP_PLACEMENTS.find((c) => c.id === 'raider_outpost');
    expect(p?.position).toEqual({ x: 28, z: -21 });
    expect(CAMPS['raider_outpost']!.spawns.length).toBeGreaterThan(0);
  });

  it('fábricas: a do norte saiu (24/10) e a do leste também (25/10, "go all"); o relevo segue com as duas', () => {
    expect(FACTORY_SHOWN).toEqual([]);
    expect(FACTORY_SITES.map((f) => [f.x, f.z])).toEqual([[42, -76], [78, 24]]);
  });

  it('acampamento maior (crackedbone) 12,5 m mais perto de onde era a fábrica, sem conflito no mapa', () => {
    const p = CAMP_PLACEMENTS.find((c) => c.id === 'crackedbone_warband')!;
    expect(p.position).toEqual({ x: 49, z: -61 });
    const moved = Math.hypot(p.position.x - 55, p.position.z + 50);
    expect(moved).toBeGreaterThan(10); expect(moved).toBeLessThan(15);
    expect(Math.hypot(p.position.x - 42, p.position.z + 76)).toBeLessThan(Math.hypot(55 - 42, -50 + 76));
    expect(findPlacementIssues()).toEqual([]);
  });
});

describe('fábricas fora (25/10)', () => {
  it('sem nenhuma fábrica, o componente nem monta → o GLB de 17 MB não é baixado', async () => {
    const fs = await import('node:fs');
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/\{FACTORY_SHOWN\.length > 0 && <Factory \/>\}/);
    expect(gw).toMatch(/\{FACTORY_SHOWN\.length > 0 && <FactoryRubble c=\{c\} \/>\}/);
  });
});
