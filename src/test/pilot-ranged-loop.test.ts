/**
 * Laço do piloto automático (modo idle), simulado tick a tick SEM WebGL.
 *
 * Reproduz as queixas do dono sobre o modo idle:
 *   - "fica andando pra lá e pra cá" na borda do alcance (vai-e-vem);
 *   - a aproximação cola no bicho em vez de parar no ponto de tiro.
 *
 * A decisão de combate por tick é `decidePilotAttack` (puro). Aqui o harness
 * realimenta o estado `engaged` (banda morta) exatamente como `auto-pilot.tsx`
 * faz com o ref `engaged`, e usa `approachStandoff` pro destino de aproximação —
 * então o teste exercita o MESMO contrato que o componente executa.
 */
import { describe, expect, it } from 'vitest';

import {
  approachStandoff, decidePilotAttack, firingReach, REENGAGE_MARGIN, STANDOFF_FACTOR,
  type PilotAttackDecision, type PilotAttackInput,
} from '@/components/world/pilot-combat';
import type { AutoWeapon } from '@/game/systems/weaponChoiceSystem';

// Hotbar: espada (mão, slot 0) + arco/pistola/rifle com munição. Números casam
// com data/weapons.ts e items.ts no nível 1 (iguais aos outros testes do piloto).
function sword(): AutoWeapon {
  return { hotbarIndex: 0, itemId: 'iron_sword', type: 'melee', range: 4, cooldown: 0.8, attackPower: 25, hasAmmo: true };
}
function bow(): AutoWeapon {
  return { hotbarIndex: 8, itemId: 'bow', type: 'bow', range: 8, cooldown: 0.9, attackPower: 22, hasAmmo: true };
}
function pistol(): AutoWeapon {
  return { hotbarIndex: 9, itemId: 'pistol', type: 'pistol', range: 10, cooldown: 0.5, attackPower: 18, hasAmmo: true };
}
function rifle(): AutoWeapon {
  return { hotbarIndex: 10, itemId: 'rifle', type: 'rifle', range: 12, cooldown: 0.8, attackPower: 30, hasAmmo: true };
}

const HOTBAR = [sword(), bow(), pistol(), rifle()];

/**
 * Roda a decisão de combate numa sequência de distâncias ao alvo, realimentando
 * `engaged` igual ao componente. `useDeadband=false` simula o comportamento
 * ANTIGO (engaged sempre falso, sem banda morta).
 */
function runDistances(
  dists: number[],
  opts: { held: AutoWeapon; useDeadband: boolean },
): PilotAttackDecision['action'][] {
  const held = opts.held;
  let engaged = false;
  let lastAttack = 0;
  const actions: PilotAttackDecision['action'][] = [];
  for (let i = 0; i < dists.length; i++) {
    const now = 100000 + i * 250;
    const input: PilotAttackInput = {
      dist: dists[i]!,
      weapons: HOTBAR,
      heldHotbarIndex: held.hotbarIndex,
      heldRange: held.range,
      heldIsMelee: held.type === 'melee',
      heldCooldownMs: held.cooldown * 1000,
      now,
      lastWeaponSwitch: 0,
      lastAttack,
      switchDebounceMs: 1000,
      specialReady: false,
      engaged: opts.useDeadband ? engaged : false,
    };
    const d = decidePilotAttack(input);
    actions.push(d.action);
    if (d.action === 'attack') lastAttack = now;
    // Mesma regra do componente: engajado = parado atirando/esperando.
    engaged = d.action !== 'approach' && d.action !== 'switch';
  }
  return actions;
}

describe('piloto idle — vai-e-vem na borda do alcance (banda morta)', () => {
  // Rifle na mão: reach de tiro = 12 - 0.4 = 11.6; alcance real = 12.
  const r = rifle();
  const reach = firingReach(r.range); // 11.6

  // Alvo oscilando ~0,4 m em torno da borda do tiro, SEMPRE dentro do alcance
  // real (<= 12): o piloto consegue atirar das duas posições.
  const oscillating = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? reach - 0.2 : reach + 0.2));

  it('REPRODUZ a falha: sem banda morta o piloto alterna approach/wait (anda e para)', () => {
    const actions = runDistances(oscillating, { held: r, useDeadband: false });
    const approaches = actions.filter(a => a === 'approach').length;
    const fires = actions.filter(a => a === 'attack').length;
    // Comportamento antigo: pisa no 'approach' toda vez que o alvo passa de 11.6.
    expect(approaches).toBeGreaterThan(0);
    // E troca de ação repetidamente = o "andando pra lá e pra cá".
    const toggles = actions.filter((a, i) => i > 0 && a !== actions[i - 1]).length;
    expect(toggles).toBeGreaterThanOrEqual(4);
    // (fica claro que dispara ALGUMAS vezes, mas sempre intercalado com andar)
    expect(fires).toBeGreaterThan(0);
  });

  it('CONSERTO: com a banda morta o piloto não volta a andar por 0,4 m de oscilação', () => {
    const actions = runDistances(oscillating, { held: r, useDeadband: true });
    // Depois de entrar no alcance uma vez, NUNCA mais aproxima (alvo nunca passa
    // de 12 = reach + REENGAGE_MARGIN). Zero vai-e-vem.
    const firstInRange = actions.findIndex(a => a === 'attack' || a === 'wait');
    expect(firstInRange).toBeGreaterThanOrEqual(0);
    const afterSettle = actions.slice(firstInRange);
    expect(afterSettle).not.toContain('approach');
    // Segue atirando dentro da banda (cadência do rifle).
    expect(actions.filter(a => a === 'attack').length).toBeGreaterThan(0);
  });

  it('REENGAGE_MARGIN mantém o tiro válido: a banda de parada cabe no alcance real', () => {
    // reach + margem = alcance real da arma (store.attack aceita até heldRange).
    expect(reach + REENGAGE_MARGIN).toBeCloseTo(r.range, 5);
  });

  it('banda morta atira dentro do alcance real, mas não além dele', () => {
    // Engajado, alvo a 11.9 m (<= 12): ainda atira (dentro do alcance real).
    const inBand = decidePilotAttack({
      dist: 11.9, weapons: HOTBAR, heldHotbarIndex: r.hotbarIndex, heldRange: r.range,
      heldIsMelee: false, heldCooldownMs: r.cooldown * 1000, now: 100000,
      lastWeaponSwitch: 0, lastAttack: 0, switchDebounceMs: 1000, specialReady: false,
      engaged: true,
    });
    expect(inBand.action).not.toBe('approach'); // não anda por 0,3 m de borda
    // Alvo a 13 m (> alcance do rifle): nenhuma ranged cobre → elege o melee e
    // TROCA de arma pra se aproximar. A banda morta não prende atirando de longe.
    const beyond = decidePilotAttack({
      dist: 13, weapons: HOTBAR, heldHotbarIndex: r.hotbarIndex, heldRange: r.range,
      heldIsMelee: false, heldCooldownMs: r.cooldown * 1000, now: 100000,
      lastWeaponSwitch: 0, lastAttack: 0, switchDebounceMs: 1000, specialReady: false,
      engaged: true,
    });
    expect(beyond.action).toBe('switch');
  });
});

describe('piloto idle — aproximação para no ponto de tiro (standoff/overshoot)', () => {
  const r = rifle();
  const reach = firingReach(r.range); // 11.6

  it('REPRODUZ o problema antigo: a função real de standoff NÃO devolve o alvo em si', () => {
    // Antes: goTo(target) mirava a posição do alvo direto (parava em cima dele).
    // Prova que `approachStandoff` (produto real) se afasta desse comportamento:
    // com o alvo a 15 m, o destino fica a reach*STANDOFF_FACTOR dele, não nele.
    const from = { x: 0, z: 0 };
    const target = { x: 15, z: 0 };
    const stop = approachStandoff(from, target, reach);
    const stopDistToTarget = Math.hypot(stop.x - target.x, stop.z - target.z);
    expect(stopDistToTarget).not.toBe(0); // não para EM CIMA do alvo (bug antigo)
    expect(stopDistToTarget).toBeCloseTo(reach * STANDOFF_FACTOR, 5);
  });

  it('CONSERTO: standoff para a ~85% do alcance de tiro, dentro do alcance real', () => {
    const from = { x: 0, z: 0 };
    const target = { x: 15, z: 0 };
    const stop = approachStandoff(from, target, reach);
    const stopDistToTarget = Math.hypot(stop.x - target.x, stop.z - target.z);
    // Para a reach*STANDOFF_FACTOR do alvo (11.6*0.85 = 9.86), não em cima dele.
    expect(stopDistToTarget).toBeCloseTo(reach * STANDOFF_FACTOR, 5);
    // E esse ponto está DENTRO do alcance real da arma (pode atirar de lá).
    expect(stopDistToTarget).toBeLessThan(r.range);
    // Mesmo com ~1 m de overshoot de sprint, ainda sobra margem até o alcance real:
    const SPRINT_OVERSHOOT = 1.08; // 4.32 m/s * 0.25 s
    expect(stopDistToTarget + SPRINT_OVERSHOOT).toBeLessThan(r.range);
  });

  it('standoff não recua se já está dentro do alcance de tiro', () => {
    const from = { x: 0, z: 0 };
    const target = { x: 5, z: 0 }; // 5 < reach*0.85 (9.86)
    const stop = approachStandoff(from, target, reach);
    expect(stop).toEqual(from);
  });
});

describe('piloto idle — arma de longe DISPARA no alvo parado dentro do alcance', () => {
  it('rifle na mão, alvo parado a 9 m: sequência de ticks dispara de fato', () => {
    const actions = runDistances([9, 9, 9, 9, 9, 9, 9, 9], { held: rifle(), useDeadband: true });
    expect(actions).toContain('attack');
    // Nunca aproxima (9 < reach 11.6): atira parado.
    expect(actions).not.toContain('approach');
  });

  it('espada na mão, alvo a 9 m: troca pra ranged e dispara no tick seguinte', () => {
    // Tick 0 com espada: deve trocar. Tick 1 com rifle: deve atacar.
    const sw = decidePilotAttack({
      dist: 9, weapons: HOTBAR, heldHotbarIndex: 0, heldRange: 4,
      heldIsMelee: true, heldCooldownMs: 800, now: 100000,
      lastWeaponSwitch: 0, lastAttack: 0, switchDebounceMs: 1000, specialReady: false,
      engaged: false,
    });
    expect(sw.action).toBe('switch');
    const at = decidePilotAttack({
      dist: 9, weapons: HOTBAR, heldHotbarIndex: 10, heldRange: 12,
      heldIsMelee: false, heldCooldownMs: 800, now: 100250,
      lastWeaponSwitch: 100000, lastAttack: 0, switchDebounceMs: 1000, specialReady: false,
      engaged: false,
    });
    expect(at.action).toBe('attack');
  });
});
