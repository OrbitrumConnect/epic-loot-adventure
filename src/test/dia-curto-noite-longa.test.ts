import { describe, expect, it } from 'vitest';
import { CYCLE_MS, gameDay, gameHour, nightFactor, WORLD_EPOCH } from '@/game/systems/dayNightSystem';

/* Pedro, 25/10: "o dia não precisa durar muito, a noite pode durar mais — não tanto pra não ficar estranho". */
const minutesWhere = (pred: (h: number) => boolean) => {
  let n = 0;
  const step = 1000; // 1 s real
  for (let t = 0; t < CYCLE_MS; t += step) if (pred(gameHour(WORLD_EPOCH + t))) n++;
  return (n * step) / 60_000;
};

describe('dia mais curto, noite mais longa', () => {
  it('dia pleno ~11,7 min (era 15,75), noite fechada ~18 min (era 14); ciclo segue 42 min', () => {
    const day = minutesWhere((h) => h >= 8 && h < 17);
    const night = minutesWhere((h) => h >= 21 || h < 5);
    expect(day).toBeGreaterThan(11);
    expect(day).toBeLessThan(12.5);
    expect(night).toBeGreaterThan(17.5);
    expect(night).toBeLessThan(18.6);
    expect(CYCLE_MS).toBe(42 * 60 * 1000);
  });
  it('relógio contínuo e sempre pra frente (sem pulo de hora), abre às 8h e fecha o ciclo', () => {
    expect(gameHour(WORLD_EPOCH)).toBeCloseTo(8, 6);
    let prev = gameHour(WORLD_EPOCH);
    for (let t = 1000; t <= CYCLE_MS; t += 1000) {
      const h = gameHour(WORLD_EPOCH + t);
      const d = (h - prev + 24) % 24;
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(0.02); // 1 s real nunca passa de ~1 min de jogo
      prev = h;
    }
    expect(gameHour(WORLD_EPOCH + CYCLE_MS)).toBeCloseTo(8, 6);
    expect(gameDay(WORLD_EPOCH + CYCLE_MS)).toBe(2);
  });
  it('luzes/noite seguem as mesmas horas (só o tempo real de cada hora mudou)', () => {
    const at = (hour: number) => {
      for (let t = 0; t < CYCLE_MS; t += 500) if (Math.abs(gameHour(WORLD_EPOCH + t) - hour) < 0.01) return WORLD_EPOCH + t;
      throw new Error('hora não achada');
    };
    expect(nightFactor(at(12))).toBe(0);
    expect(nightFactor(at(23))).toBe(1);
  });
});
