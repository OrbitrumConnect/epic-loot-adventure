import { describe, expect, it } from 'vitest';
import { decideWatchdog, type WatchdogInput } from '@/components/world/auto-pilot';

/**
 * Watchdog anti-travamento do piloto automático (decisão pura, sem rAF).
 *
 * O bug corrigido: a métrica antiga era só "a distância ao destino não encurtou".
 * Isso dava FALSO-POSITIVO ao perseguir um bicho que foge na mesma velocidade do
 * herói (ex.: Pombo Bravo 4,68 m/s > sprint 4,32): o herói CORRE normal mas a
 * distância não cai → watchdog achava que travou → desvio à toa + blacklist 8 s.
 * O fix adiciona a 2ª condição: só BLOCKED se o deslocamento LÍQUIDO do herói na
 * janela também for ~0 (preso no collider vibra no lugar; perseguindo, corre metros).
 */

/** Base de uma janela FECHADA e TRAVADA (distância não encurta, herói parado). */
function stuck(overrides: Partial<WatchdogInput> = {}): WatchdogInput {
  return {
    distToDest: 20,
    distWindowStart: 20.4, // reduziu 0.4 < MOVE_WINDOW_PROGRESS (1.0)
    heroNetDisplacement: 0.1, // ~0 < MOVE_MIN_NET_DISPLACEMENT (1.5): vibrou no lugar
    windowFull: true,
    escalation: 0,
    distAtEscalation: null,
    ...overrides,
  };
}

describe('decideWatchdog', () => {
  it('1. Travado (dist não encurta, líquido ~0, janela cheia) → blocked e escada progride', () => {
    const d0 = decideWatchdog(stuck({ escalation: 0 }));
    expect(d0.blocked).toBe(true);
    expect(d0.action).toBe('sidestep');
    expect(d0.nextEscalation).toBe(1);

    const d1 = decideWatchdog(stuck({ escalation: 1, distAtEscalation: 20.4 }));
    expect(d1.blocked).toBe(true);
    expect(d1.action).toBe('opposite');
    expect(d1.nextEscalation).toBe(2);

    const d2 = decideWatchdog(stuck({ escalation: 2, distAtEscalation: 20.4 }));
    expect(d2.blocked).toBe(true);
    expect(d2.action).toBe('blacklist');
    expect(d2.nextEscalation).toBe(0);
  });

  it('2. Chase de alvo móvel (dist não encurta, MAS líquido grande) → NÃO bloqueia', () => {
    // Herói correu 4 m na janela mesmo com a distância ao bicho estagnada.
    const d = decideWatchdog(stuck({ heroNetDisplacement: 4.0 }));
    expect(d.blocked).toBe(false);
    expect(d.action).toBe('none');
    expect(d.nextEscalation).toBe(0); // escada intacta
  });

  it('3. Trek livre (distância ao destino encurta de verdade) → NÃO bloqueia', () => {
    const d = decideWatchdog({
      distToDest: 15,
      distWindowStart: 20, // encurtou 5 m >> 1.0
      heroNetDisplacement: 5,
      windowFull: true,
      escalation: 0,
      distAtEscalation: null,
    });
    expect(d.blocked).toBe(false);
    expect(d.action).toBe('none');
  });

  it('4. Chegou (distToDest <= raio de chegada) → NÃO bloqueia mesmo parado', () => {
    const d = decideWatchdog({
      distToDest: 2.0, // <= MOVE_ARRIVAL_RADIUS (2.5)
      distWindowStart: 2.2, // não encurtou
      heroNetDisplacement: 0, // parado (chegou)
      windowFull: true,
      escalation: 0,
      distAtEscalation: null,
    });
    expect(d.blocked).toBe(false);
    expect(d.action).toBe('none');
  });

  it('5. Aproximou > RECOVERY_PROGRESS desde o último desvio → reinicia a escada', () => {
    // Estava no degrau 1 (um desvio feito) com distAtEscalation 25; agora está a 20
    // (20 < 25 - 1.5). A escada volta pro degrau 0 → sidestep de novo, não blacklist.
    const d = decideWatchdog(stuck({
      distToDest: 20,
      distWindowStart: 20.4,
      escalation: 1,
      distAtEscalation: 25,
    }));
    expect(d.blocked).toBe(true);
    expect(d.action).toBe('sidestep');
    expect(d.nextEscalation).toBe(1);
  });

  it('janela ainda não fechou (windowFull=false) → none, escada intacta', () => {
    const d = decideWatchdog(stuck({ windowFull: false, escalation: 1 }));
    expect(d.blocked).toBe(false);
    expect(d.action).toBe('none');
    expect(d.nextEscalation).toBe(1);
  });
});
