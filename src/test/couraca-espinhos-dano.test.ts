import { beforeEach, describe, expect, it } from 'vitest';

import type { CreatureState } from '@/game/types';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES, scaleEnemyHp } from '@/game/data/creatures';
import { ITEMS } from '@/game/data/items';

/**
 * BUG "Couraça de Espinhos não toma dano de arma nenhuma".
 *
 * Causa raiz (reproduzida, não deduzida): o dano melee de `attack`/`specialAttack`
 * lia o poder de `equipment.primary`, que começa `null` e só é preenchido quando o
 * jogador/piloto SELECIONA o slot via `useHotbarSlot`. O jogo começa com a espada
 * (iron_sword, attackPower 25) na mão (hotbar slot 0 selecionado) mas `primary`
 * ainda `null`. Enquanto o slot não é selecionado, o golpe sai só com
 * `playerBaseAttack` (10 no nível 1).
 *
 * A fórmula de dano é `round(poder × (0.85..1.15) − armor × 0.5)`, piso 1
 * (combatSystem.calculateDamage). Contra a Couraça (armor 18 → redução 9, HP
 * 1800 × 1.15 = 2070) o poder base 10 cai ao piso de 1-2 por golpe: ~1500+ golpes
 * pra matar, a barra praticamente não anda → "não ataca". Em criaturas de armor/HP
 * baixos o mesmo poder base ainda mata rápido, por isso o bug só aparece nela.
 */

function creatureAt(speciesId: string, id: string, x: number, z: number): CreatureState {
  const def = CREATURES[speciesId]!;
  return {
    id,
    speciesId,
    name: def.name,
    hp: scaleEnemyHp(def.maxHp),
    maxHp: scaleEnemyHp(def.maxHp),
    attackPower: def.attackPower,
    armor: def.armor,
    attackCooldown: def.attackCooldown,
    lastAttackAt: 0,
    position: { x, z },
    behavior: 'chase',
    lootTable: [],
    respawnAt: null,
  };
}

/** Coloca a criatura a 2 m (dentro do alcance melee de 4 m no nível 1) e desfere UM golpe. */
function oneMeleeHit(creature: CreatureState): number {
  useGameStore.setState(s => ({
    player: { ...s.player, position: { x: 0, z: 0 }, lastAttackAt: -1e6 },
    creatures: [creature],
    ui: { ...s.ui, selectedHotbar: 0 },
  }));
  const before = useGameStore.getState().creatures[0]!.hp;
  useGameStore.getState().attack(creature.id);
  const after = useGameStore.getState().creatures[0]!.hp;
  return before - after;
}

describe('Couraça de Espinhos: a arma na mão tem que causar dano', () => {
  beforeEach(() => {
    // Estado inicial de verdade: espada na mão, `primary` null, nível 1.
    useGameStore.getState().restartSurvival();
  });

  it('o estado inicial tem a espada na mão porém NÃO em equipment.primary', () => {
    const inv = useGameStore.getState().player.inventory;
    const heldSlot = inv.hotbar.slots[useGameStore.getState().ui.selectedHotbar]!;
    expect(inv.slots[heldSlot]?.itemId).toBe('iron_sword');
    expect(ITEMS['iron_sword']!.attackPower).toBe(25);
    // A condição que disparava o bug: a arma empunhada não está no slot `primary`.
    expect(inv.equipment.primary).toBeNull();
  });

  it('a Couraça toma dano de espada (não o piso de 1) com a espada na mão', () => {
    const dmg = oneMeleeHit(creatureAt('raider_samurai', 'couraca', 0, 2));
    // base 10 + espada 25 = 35; − armor*0.5 (9) ⇒ 21..31. No código antigo (poder
    // vindo de `primary` null) o dano era 1-2. Qualquer valor ≥ 15 só é possível
    // se a arma da mão entrou no cálculo.
    expect(dmg).toBeGreaterThanOrEqual(15);
  });

  it('a arma na mão soma em qualquer criatura — o conserto é geral, não um if para a Couraça', () => {
    // Cobre a generalidade do conserto: a arma da mão passa a somar tanto contra a
    // Couraça (armor 18) quanto contra o batedor (armor 1), ou seja, não é um `if`
    // amarrado à espécie. A exclusividade do SINTOMA (só a Couraça parecia imune) vem
    // da combinação armor+HP altos com o piso de dano 1, explicada no comentário do
    // topo do arquivo — não é o que este teste, isoladamente, está provando.
    const couraca = oneMeleeHit(creatureAt('raider_samurai', 'couraca', 0, 2));
    const scout = oneMeleeHit(creatureAt('raider_scout', 'scout', 0, 2));
    expect(couraca).toBeGreaterThanOrEqual(15);
    expect(scout).toBeGreaterThanOrEqual(15);
  });

  it('selecionar o slot (fluxo do jogo) mantém o dano cheio — consistente', () => {
    useGameStore.getState().useHotbarSlot(0);
    expect(useGameStore.getState().player.inventory.equipment.primary).toBe('iron_sword');
    const dmg = oneMeleeHit(creatureAt('raider_samurai', 'couraca', 0, 2));
    expect(dmg).toBeGreaterThanOrEqual(15);
  });

  it('especial melee também usa a arma da mão (não o piso) contra a Couraça', () => {
    useGameStore.setState(s => ({
      player: { ...s.player, position: { x: 0, z: 0 }, lastSpecialAt: -1e6 },
      creatures: [creatureAt('raider_samurai', 'couraca', 0, 2)],
      ui: { ...s.ui, selectedHotbar: 0 },
    }));
    const before = useGameStore.getState().creatures[0]!.hp;
    useGameStore.getState().specialAttack('jump');
    const after = useGameStore.getState().creatures[0]!.hp;
    // Especial 'jump' = poder × 1.8. Com base-only (10) daria ~6-12; com a espada
    // na mão (35) passa de 40. ≥ 30 só é alcançável com a arma no cálculo.
    expect(before - after).toBeGreaterThanOrEqual(30);
  });
});
