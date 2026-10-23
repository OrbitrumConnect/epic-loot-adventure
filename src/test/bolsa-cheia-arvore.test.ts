import { describe, expect, it } from 'vitest';
import { harvestFits } from '@/game/systems/harvestSystem';
import { createInventory } from '@/game/systems/inventorySystem';
import { ITEMS } from '@/game/data/items';
import { decideIntent } from '@/game/systems/objectiveSystem';
import type { AutoSnapshot } from '@/game/types';
import type { HarvestNodeState } from '@/game/types';

/* Pedro, 22/10: no idle, com a bolsa cheia, o herói ia até a ÁRVORE e ficava parado batendo. O "tem
   espaço" genérico dizia sim (peso abaixo do máximo + alguma pilha com folga), mas as 4 madeiras do
   golpe não cabiam. Agora cada recurso diz se o PRÓXIMO golpe cabe; não cabendo, ele caça bicho. */
const tree = (q = 16): HarvestNodeState =>
  ({ id: 'arv', kind: 'tree', position: { x: 2, z: 0 }, quantity: q, depleted: false, respawnAt: null }) as unknown as HarvestNodeState;

describe('bolsa cheia × recurso', () => {
  it('cabe com espaço; NÃO cabe quando o peso livre é menor que o golpe', () => {
    const inv = createInventory([{ itemId: 'axe', quantity: 1 }]);
    expect(harvestFits(tree(), inv)).toBe(true);
    const wood = ITEMS['wood']!;
    // quase no limite: sobra peso pra 1 madeira, mas o golpe com machado rende ≥ 4
    const used = inv.slots.reduce((w, s) => w + (s.itemId ? ITEMS[s.itemId]!.weight * s.quantity : 0), 0);
    const full = { ...inv, maxWeight: used + wood.weight * 1.5 };
    expect(harvestFits(tree(), full)).toBe(false);
  });

  it('rocha sem picareta (não rende na mão) não é alvo de coleta', () => {
    const rock = { ...tree(), id: 'rocha', kind: 'rock' } as unknown as HarvestNodeState;
    expect(harvestFits(rock, createInventory([]))).toBe(false);
  });

  it('piloto: árvore que não cabe é ignorada → vai caçar o bicho do raio', () => {
    const base = {
      playerPosition: { x: 0, z: 0 }, playerHp: 100, playerMaxHp: 100, playerDead: false, healSlot: null,
      creatures: [{ id: 'lobo', position: { x: 6, z: 0 }, behavior: 'chase', hp: 10, hostile: true, level: 1 }],
      resources: [{ id: 'arv', position: { x: 2, z: 0 }, depleted: false, kind: 'tree', range: 3.2, canCollect: false }],
      objectives: { items: [], seq: 0 }, homePosition: { x: 50, z: 50 }, gatherCapacity: true, autoHuntRadius: 45,
    } as unknown as AutoSnapshot;
    const intent = decideIntent(base, 0);
    expect(['attack', 'move']).toContain(intent.kind);
    if (intent.kind === 'move') expect(intent.reason).not.toMatch(/Farmando/);
    // com espaço, a mesma árvore volta a ser farmada (subiu de nível / bolsa maior)
    const comEspaco = decideIntent({ ...base, creatures: [], resources: [{ ...base.resources[0]!, canCollect: true }] }, 0);
    expect(comEspaco.kind === 'gather' || (comEspaco.kind === 'move' && /Farmando/.test(comEspaco.reason))).toBe(true);
  });
});
