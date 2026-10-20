import { describe, expect, it, vi } from 'vitest';

import * as pc from '@/components/world/pilot-combat';
import {
  decidePilotAttack, firingReach, KITE_DEST_FRACTION, REENGAGE_MARGIN, STANDOFF_FACTOR,
  type PilotAttackDecision, type PilotAttackInput,
} from '@/components/world/pilot-combat';
import type { AutoWeapon } from '@/game/systems/weaponChoiceSystem';
import { MELEE_PREF_RANGE } from '@/game/systems/weaponChoiceSystem';
import type { AutoIntent } from '@/game/types/objective';

const sword: AutoWeapon = { hotbarIndex: 0, itemId: 'iron_sword', type: 'melee', range: 4, cooldown: 0.8, attackPower: 25, hasAmmo: true };
const rifle: AutoWeapon = { hotbarIndex: 10, itemId: 'rifle', type: 'rifle', range: 12, cooldown: 0.8, attackPower: 30, hasAmmo: true };

function base(over: Partial<PilotAttackInput>): PilotAttackInput {
  return {
    dist: 9, weapons: [sword, rifle], heldHotbarIndex: 0, heldRange: sword.range,
    heldIsMelee: true, heldCooldownMs: 800, now: 100000, lastWeaponSwitch: 0,
    lastAttack: 0, switchDebounceMs: 1000, specialReady: false, ...over,
  };
}

describe('item 1 — estilo chega ao combate', () => {
  it("estilo 'ranged', alvo colado: troca para o rifle, não segura a espada", () => {
    expect(2).toBeLessThan(MELEE_PREF_RANGE);
    const d = decidePilotAttack(base({ dist: 2, style: 'ranged' }));
    expect(d).toEqual({ action: 'switch', hotbarIndex: rifle.hotbarIndex });
  });

  it("estilo 'ranged' com rifle já na mão e alvo colado: não troca para a espada", () => {
    const d = decidePilotAttack(base({
      dist: 5, style: 'ranged', heldHotbarIndex: 10, heldRange: rifle.range, heldIsMelee: false, heldCooldownMs: 800,
    }));
    expect(d.action).not.toBe('switch');
  });

  it("estilo 'auto' (ou ausente) colado continua na espada", () => {
    expect(decidePilotAttack(base({ dist: 2 })).action).toBe('attack');
    expect(decidePilotAttack(base({ dist: 2, style: 'auto' })).action).toBe('attack');
  });
});

describe('item 2 — recordPilotIntent só quando o intent muda de conteúdo', () => {
  const atk = (id: string): AutoIntent => ({ kind: 'attack', creatureId: id, to: { x: Math.random(), z: 0 } });

  it('ticks com intent equivalente (objeto novo) não chamam a action', () => {
    const record = vi.fn();
    const rec = pc.createIntentRecorder(record);
    rec(atk('wolf-1'));
    rec(atk('wolf-1'));
    rec(atk('wolf-1'));
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('muda o alvo, o kind ou sai do idle (null) → chama', () => {
    const record = vi.fn();
    const rec = pc.createIntentRecorder(record);
    rec(atk('wolf-1'));
    rec(atk('wolf-2'));
    rec({ kind: 'heal', hotbarIndex: 3 });
    rec(null);
    rec(null);
    expect(record).toHaveBeenCalledTimes(4);
    expect(record).toHaveBeenLastCalledWith(null);
  });

  it('gather: id do nó diferente conta como mudança', () => {
    const record = vi.fn();
    const rec = pc.createIntentRecorder(record);
    rec({ kind: 'gather', nodeId: 'a', to: { x: 0, z: 0 } });
    rec({ kind: 'gather', nodeId: 'a', to: { x: 0, z: 0 } });
    rec({ kind: 'gather', nodeId: 'b', to: { x: 0, z: 0 } });
    expect(record).toHaveBeenCalledTimes(2);
  });
});

describe("item 3 — kiting no estilo 'ranged'", () => {
  const reach = firingReach(rifle.range);
  const SPEED = 3; // m por tick (0,25 s) — só para a simulação
  const ranged = (over: Partial<PilotAttackInput>) => base({
    style: 'ranged', heldHotbarIndex: 10, heldRange: rifle.range, heldIsMelee: false, ...over,
  });

  it('bicho colado: recua em vez de ficar em cima', () => {
    expect(decidePilotAttack(ranged({ dist: 1.5 })).action).toBe('retreat');
  });

  it("'auto' e 'melee' colados não recuam (comportamento de hoje)", () => {
    expect(decidePilotAttack(ranged({ dist: 1.5, style: 'auto' })).action).not.toBe('retreat');
    expect(decidePilotAttack(base({ dist: 1.5, style: 'melee' })).action).not.toBe('retreat');
  });

  it('melee na mão, estilo ranged sem munição ranged: não recua', () => {
    const d = decidePilotAttack(base({ dist: 1.5, style: 'ranged', weapons: [sword] }));
    expect(d.action).not.toBe('retreat');
  });

  it('sequência de ticks: recua, estabiliza na faixa e continua atirando, sem alternar', () => {
    let dist = 1.5;
    let kiting = false;
    let engaged = false;
    let lastAttack = 0;
    const log: PilotAttackDecision['action'][] = [];
    const dists: number[] = [];
    for (let i = 0; i < 40; i++) {
      const now = 100000 + i * 250;
      const d = decidePilotAttack(ranged({ dist, now, lastAttack, kiting, engaged }));
      log.push(d.action);
      dists.push(dist);
      kiting = d.action === 'retreat';
      engaged = d.action !== 'approach' && d.action !== 'switch';
      if (d.action === 'retreat') dist = Math.min(dist + SPEED, reach * KITE_DEST_FRACTION);
      if (d.action === 'approach') dist = Math.max(dist - SPEED, reach * STANDOFF_FACTOR);
      if (d.action === 'attack') lastAttack = now;
    }
    expect(log[0]).toBe('retreat');
    const firstShot = log.indexOf('attack');
    expect(firstShot).toBeGreaterThan(0);
    // Depois que estabilizou: nunca mais approach/retreat, e atira repetidamente.
    const tail = log.slice(firstShot);
    expect(tail.includes('retreat')).toBe(false);
    expect(tail.includes('approach')).toBe(false);
    expect(tail.filter(a => a === 'attack').length).toBeGreaterThan(5);
    // Estabilizou dentro da faixa de tiro, longe do corpo-a-corpo.
    const finalDist = dists[dists.length - 1];
    expect(finalDist).toBeGreaterThan(MELEE_PREF_RANGE);
    expect(finalDist).toBeLessThanOrEqual(reach + REENGAGE_MARGIN);
  });

  it('retreatPoint fica na reta oposta ao alvo, dentro da faixa de tiro', () => {
    const p = pc.kiteRetreatPoint({ x: 1, z: 0 }, { x: 0, z: 0 }, reach);
    expect(p.z).toBeCloseTo(0);
    expect(p.x).toBeGreaterThan(1);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(reach);
  });
});
