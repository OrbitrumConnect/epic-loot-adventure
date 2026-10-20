import { describe, expect, it } from 'vitest';

import { decidePilotAttack, type PilotAttackInput } from '@/components/world/pilot-combat';
import type { AutoWeapon } from '@/game/systems/weaponChoiceSystem';

// Hotbar de teste: espada na mão (slot 0) + arco/pistola/rifle com munição.
// Números casam com data/weapons.ts (range/cooldown) e items.ts (attackPower) no nível 1.
function sword(): AutoWeapon {
  return { hotbarIndex: 0, itemId: 'iron_sword', type: 'melee', range: 4, cooldown: 0.8, attackPower: 25, hasAmmo: true };
}
function bow(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 8, itemId: 'bow', type: 'bow', range: 8, cooldown: 0.9, attackPower: 22, hasAmmo };
}
function pistol(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 9, itemId: 'pistol', type: 'pistol', range: 10, cooldown: 0.5, attackPower: 18, hasAmmo };
}
function rifle(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 10, itemId: 'rifle', type: 'rifle', range: 12, cooldown: 0.8, attackPower: 30, hasAmmo };
}

/** Base de input: espada na mão, nada em cooldown, debounce de 1 s já vencido. */
function base(over: Partial<PilotAttackInput>): PilotAttackInput {
  return {
    dist: 9,
    weapons: [sword(), bow(), pistol(), rifle()],
    heldHotbarIndex: 0,
    heldRange: 4,
    heldIsMelee: true,
    heldCooldownMs: 800,
    now: 100000,
    lastWeaponSwitch: 0,
    lastAttack: 0,
    switchDebounceMs: 1000,
    specialReady: false,
    ...over,
  };
}

describe('decidePilotAttack — piloto usa qualquer arma da hotbar', () => {
  it('alvo a 9 m, espada na mão: (a) troca para uma ranged', () => {
    const d = decidePilotAttack(base({}));
    expect(d.action).toBe('switch');
    if (d.action === 'switch') {
      // Não troca para a própria espada (slot 0).
      expect(d.hotbarIndex).not.toBe(0);
      // Índice de uma das ranged da hotbar.
      expect([8, 9, 10]).toContain(d.hotbarIndex);
    }
  });

  it('tick seguinte: com a ranged na mão, (b) ataca de 9 m sem precisar chegar a 4 m', () => {
    // Rifle (slot 10) já empunhado: reach 12 - 0.4 = 11.6 >= 9 → ataca.
    const d = decidePilotAttack(base({
      heldHotbarIndex: 10,
      heldRange: 12,
      heldIsMelee: false,
      heldCooldownMs: 800,
    }));
    expect(d.action).toBe('attack');
  });

  it('respeita o debounce: quer trocar mas trocou há pouco → não troca, usa a arma na mão', () => {
    // Espada na mão a 9 m, debounce ainda ativo → sem switch; 9 > reach(3.6) → aproxima.
    const d = decidePilotAttack(base({ lastWeaponSwitch: 99500 }));
    expect(d.action).toBe('approach');
  });

  it('reach é o da arma NA MÃO: espada na mão a 9 m não ataca de longe, aproxima', () => {
    // Sem armas ranged disponíveis (só espada): pick = espada, sem troca; reach 3.6 < 9.
    const d = decidePilotAttack(base({ weapons: [sword()] }));
    expect(d.action).toBe('approach');
  });

  it('melee colado com especial pronto: usa o especial', () => {
    const d = decidePilotAttack(base({ dist: 2, specialReady: true }));
    expect(d.action).toBe('special');
  });

  it('ranged na mão nunca usa especial, mesmo com especial pronto', () => {
    const d = decidePilotAttack(base({
      dist: 9, heldHotbarIndex: 10, heldRange: 12, heldIsMelee: false, specialReady: true,
    }));
    expect(d.action).toBe('attack');
  });

  it('cadência: dentro do alcance mas em cooldown → espera', () => {
    const d = decidePilotAttack(base({
      dist: 9, heldHotbarIndex: 10, heldRange: 12, heldIsMelee: false,
      heldCooldownMs: 800, now: 100000, lastAttack: 99500,
    }));
    expect(d.action).toBe('wait');
  });

  it('sem munição ranged: cai no melee e aproxima (pickWeaponFor exclui ranged sem bala)', () => {
    // pistola/rifle sem bala, arco sem flecha (hasAmmo=false forçado): só a espada sobra.
    const d = decidePilotAttack(base({
      dist: 9,
      weapons: [sword(), bow(false), pistol(false), rifle(false)],
    }));
    // Espada na mão (slot 0) já é o pick → sem troca; reach 3.6 < 9 → aproxima.
    expect(d.action).toBe('approach');
  });

  it('nenhuma arma usável (lista vazia): espera, não ataca em vão', () => {
    const d = decidePilotAttack(base({ dist: 2, weapons: [] }));
    expect(d.action).toBe('wait');
  });

  it('só ranged sem munição: espera, não ataca em vão', () => {
    const d = decidePilotAttack(base({
      dist: 9, weapons: [bow(false), pistol(false), rifle(false)],
      heldHotbarIndex: 10, heldRange: 12, heldIsMelee: false,
    }));
    expect(d.action).toBe('wait');
  });
});
