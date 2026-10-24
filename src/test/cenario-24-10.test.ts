import { describe, expect, it } from 'vitest';
import { CAMPS, CAMP_PLACEMENTS } from '@/game/data/camps';
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

  it('fábrica do canto norte (42,−76) não aparece; a outra fica; o relevo segue com as duas', () => {
    expect(FACTORY_SHOWN.map((f) => [f.x, f.z])).toEqual([[78, 24]]);
    expect(FACTORY_SITES.map((f) => [f.x, f.z])).toEqual([[42, -76], [78, 24]]);
  });
});
