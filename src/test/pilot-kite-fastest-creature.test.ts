/**
 * RISCO MEDIDO: kiting perpétuo contra a criatura MAIS RÁPIDA do jogo.
 *
 * O recuo (kiting) do estilo 'ranged' pressupõe que o piloto consegue abrir
 * distância. Contra um bicho tão veloz quanto ele (ou mais), o recuo NÃO abre
 * distância: a cada tick a criatura reganha o terreno e o piloto recuaria para
 * sempre sem nunca atirar — só trocaria o vai-e-vem antigo por um novo.
 *
 * Velocidades REAIS (fonte arquivo:linha):
 *   - Piloto automático corre no sprint: MAX_SPEED = 4.32 m/s
 *     [src/components/game-world.tsx:544 + :536 autoFollowing]
 *   - Toda criatura anda a `tuning.speed * CREATURE_SPEED_SCALE`, com
 *     CREATURE_SPEED_SCALE = 0.9 [src/components/world/hostile-ai.ts:170,372].
 *   - MAIS RÁPIDA do jogo: Pombo Bravo (pigeon), speed 5.2
 *     [src/components/world/beast.tsx:135] → efetivo 5.2 * 0.9 = 4.68 m/s,
 *     MAIOR que o sprint do piloto (4.32). Ela perseguindo encosta sempre.
 *
 * Este teste simula o Pombo perseguindo na velocidade real enquanto o piloto
 * tenta kitar com um arco (flecha livre, não gasta bala). PROVA que o piloto
 * continua disparando (não recua pra sempre). O mesmo laço SEM a medição de
 * travamento (comportamento antigo) dá ZERO tiros — a prova de que o conserto
 * é necessário.
 */
import { describe, expect, it } from 'vitest';

import {
  decidePilotAttack, firingReach, kiteRetreatPoint,
  type PilotAttackDecision,
} from '@/components/world/pilot-combat';
import type { AutoWeapon } from '@/game/systems/weaponChoiceSystem';

// Arco: arma à distância que NÃO gasta munição (hasAmmo sempre true).
const bow: AutoWeapon = {
  hotbarIndex: 9, itemId: 'bow', type: 'bow', range: 8,
  cooldown: 0.8, attackPower: 18, hasAmmo: true,
};

const TICK = 0.25;
// Velocidades reais convertidas em metros por tick (0,25 s).
const PILOT_SPEED = 4.32;                 // sprint do piloto (game-world.tsx:544)
const PIGEON_SPEED = 5.2 * 0.9;           // 4.68 m/s (beast.tsx:135 × scale 0.9)
const PILOT_STEP = PILOT_SPEED * TICK;    // 1.08 m
const PIGEON_STEP = PIGEON_SPEED * TICK;  // 1.17 m
const PIGEON_ATTACK_RANGE = 1.8;          // beast.tsx:135
// Espelha auto-pilot.tsx.
const KITE_STALL_TICKS = 3;
const KITE_PROGRESS_EPS = 0.01;

const reach = firingReach(bow.range);

/**
 * Simula N ticks em 1D (movimento é colinear): criatura em +x perseguindo o
 * piloto. `measureStall=false` reproduz o comportamento ANTIGO (nunca desiste).
 * Devolve o log de ações e as distâncias por tick.
 */
function simulate(ticks: number, measureStall: boolean) {
  let px = 0;        // posição do piloto
  let cx = 1.4;      // criatura começa colada (dentro de kiteLimit → recua)
  let kiting = false;
  let engaged = false;
  let lastAttack = 0;
  let prevDist: number | null = null;
  let stall = 0;
  let gaveUp = false;
  const log: PilotAttackDecision['action'][] = [];
  const dists: number[] = [];

  for (let i = 0; i < ticks; i++) {
    const now = 100000 + i * 250;
    const dist = Math.abs(cx - px);
    dists.push(dist);

    // Medição do travamento (mesma ordem de auto-pilot.tsx: antes de decidir).
    if (measureStall) {
      if (kiting && prevDist != null) {
        if (dist > prevDist + KITE_PROGRESS_EPS) stall = 0;
        else stall += 1;
      } else if (!kiting) {
        stall = 0;
      }
      if (stall >= KITE_STALL_TICKS) gaveUp = true;
    }
    prevDist = dist;

    const d = decidePilotAttack({
      dist,
      weapons: [bow],
      heldHotbarIndex: bow.hotbarIndex,
      heldRange: bow.range,
      heldIsMelee: false,
      heldCooldownMs: bow.cooldown * 1000,
      now,
      lastWeaponSwitch: 0,
      lastAttack,
      switchDebounceMs: 1000,
      specialReady: false,
      engaged,
      style: 'ranged',
      kiting,
      kiteStalled: gaveUp,
    });
    log.push(d.action);
    kiting = d.action === 'retreat';
    engaged = d.action !== 'approach' && d.action !== 'switch';
    if (d.action === 'attack') lastAttack = now;

    // Movimento do piloto.
    if (d.action === 'retreat') {
      // Recua na direção oposta à criatura (criatura em +x → piloto para -x).
      const destX = kiteRetreatPoint({ x: px, z: 0 }, { x: cx, z: 0 }, reach).x;
      const step = Math.sign(destX - px) * Math.min(Math.abs(destX - px), PILOT_STEP);
      px += step;
    } else if (d.action === 'approach') {
      px += Math.sign(cx - px) * Math.min(Math.abs(cx - px), PILOT_STEP);
    }
    // A criatura persegue: só anda enquanto está fora de attackRange*0.6.
    const gap = Math.abs(cx - px);
    if (gap > PIGEON_ATTACK_RANGE * 0.6) {
      cx += Math.sign(px - cx) * Math.min(gap - PIGEON_ATTACK_RANGE * 0.6, PIGEON_STEP);
    }
  }
  return { log, dists };
}

describe('kiting não degenera contra a criatura mais rápida do jogo', () => {
  it('o Pombo (4.68 m/s) é mais rápido que o sprint do piloto (4.32 m/s)', () => {
    expect(PIGEON_SPEED).toBeGreaterThan(PILOT_SPEED);
  });

  it('comportamento ANTIGO (sem medir travamento): recua pra sempre, ZERO tiros', () => {
    const { log } = simulate(120, /* measureStall */ false);
    expect(log.filter(a => a === 'attack').length).toBe(0);
    // Prova que degenerava: só recua, nunca estabiliza nem atira.
    expect(log.every(a => a === 'retreat')).toBe(true);
  });

  it('com o conserto: desiste do recuo e CONTINUA ATIRANDO', () => {
    const N = 120;
    const { log } = simulate(N, /* measureStall */ true);
    const shots = log.filter(a => a === 'attack').length;
    // Dá uns poucos ticks de recuo e então passa a atirar no ritmo do arco
    // (cooldown 0,8 s = a cada ~4 ticks). Em 120 ticks → dezenas de tiros.
    expect(shots).toBeGreaterThan(15);
    // Nunca recua infinitamente: depois que desiste, some o 'retreat'.
    const lastRetreat = log.lastIndexOf('retreat');
    const firstShot = log.indexOf('attack');
    expect(firstShot).toBeGreaterThanOrEqual(0);
    // O último recuo acontece cedo (na fase de teste do kiting), não no fim.
    expect(lastRetreat).toBeLessThan(N / 2);
  });
});
