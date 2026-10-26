import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  activeGrab, breakGrab, GRAB_COOLDOWN_MS, GRAB_MS, grabSpin, grabTicksDue, isGrabbed, resetGrabs, tryStartGrab,
} from '@/game/systems/grabSystem';

/* Pedro, 26/10: "o jacaré pode executar"; "o giro é viável, bom". 30% na mordida: preso ~1,2 s girando, 3 pancadas
   (2,5× a mordida), bater nele solta, 8 s de recarga por jacaré. */
describe('giro da morte do jacaré', () => {
  beforeEach(() => resetGrabs());

  it('só jacaré; 30% de chance; recarga de 8 s por jacaré', () => {
    expect(tryStartGrab('wild_boar_1', 'bear', 30, 0, () => 0)).toBe(false);   // búfalo não agarra
    expect(tryStartGrab('wild_boar_1', 'boar', 30, 0, () => 0.5)).toBe(false); // 50% > 30%: não
    expect(tryStartGrab('wild_boar_1', 'boar', 30, 0, () => 0.1)).toBe(true);
    breakGrab();
    expect(tryStartGrab('wild_boar_1', 'boar', 30, GRAB_COOLDOWN_MS - 1, () => 0)).toBe(false); // recarregando
    expect(tryStartGrab('wild_boar_1', 'boar', 30, GRAB_COOLDOWN_MS + 1, () => 0)).toBe(true);
  });
  it('3 pancadas em 1/3, 2/3 e no fim, somando 2,5× a mordida; o jacaré gira 2 voltas', () => {
    tryStartGrab('wild_boar_2', 'boar', 30, 1000, () => 0);
    expect(activeGrab(1000)!.perTick).toBe(25); // 30 × 2,5 / 3
    let hits = 0;
    for (let t = 1000; t <= 1000 + GRAB_MS; t += 50) hits += grabTicksDue('wild_boar_2', t);
    expect(hits).toBe(3);
    expect(grabTicksDue('outro', 1100)).toBe(0);
    expect(grabSpin('wild_boar_2', 1000 + GRAB_MS / 2)).toBeCloseTo(Math.PI * 2, 5); // meia duração = 1 volta
    expect(grabSpin('wild_boar_2', 1000 + GRAB_MS + 1)).toBe(0);
  });
  it('preso só durante o giro; NUNCA fica preso pra sempre (jacaré morreu no meio = solta sozinho)', () => {
    tryStartGrab('wild_boar_3', 'boar', 30, 0, () => 0);
    expect(isGrabbed(500)).toBe(true);
    expect(isGrabbed(GRAB_MS + 1)).toBe(false);
    expect(activeGrab(GRAB_MS + 301)).toBeNull(); // sem as pancadas (jacaré sumiu): expira mesmo assim
  });
  it('bater no jacaré solta na hora (só o que agarrou)', () => {
    tryStartGrab('wild_boar_4', 'boar', 30, 0, () => 0);
    expect(breakGrab('wild_boar_9')).toBe(false);
    expect(breakGrab('wild_boar_4')).toBe(true);
    expect(isGrabbed(100)).toBe(false);
  });
  it('ligado: IA agarra na mordida e aplica as pancadas parada; herói não anda preso; ataque solta; jacaré rola no corpo', () => {
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/tryStartGrab\(creatureId, creature\.speciesId, Math\.max\(1, creature\.attackPower\)\)/);
    expect(ai).toMatch(/if \(activeGrab\(\)\?\.creatureId === creatureId\) \{ targetX = wx; targetZ = wz; moving = false; \}/);
    expect(fs.readFileSync('src/components/game-world.tsx', 'utf8')).toMatch(/if \(attackPhase\.current !== 'idle' \|\| isGrabbed\(\)\) \{ targetVx = 0; targetVz = 0; \}/);
    expect(fs.readFileSync('src/game/state/game-store.ts', 'utf8')).toMatch(/if \(breakGrab\(targetId\)\)/);
    expect(fs.readFileSync('src/components/world/beast.tsx', 'utf8')).toMatch(/flyRef\.current\.position\.y = GRAB_ROLL_H \* \(1 - Math\.cos\(a\)\);/);
  });
});
