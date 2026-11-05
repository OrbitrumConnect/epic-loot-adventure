import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CANIBAL, CANIBAL_AT, CANIBAL_BODY_ID, canibalPhaseStep, canibalRootId, nearestInArena, newCanibal, pushAway, rootBase,
  rootLean, rootStep, rootTarget, ROOT_SLAM_TOTAL, slamHits,
} from '@/components/zona-sul/zs-canibal-boss';
import { CAVE_LAIR } from '@/components/zona-sul/zs-cave';
import { activeGrab, grabTicksDue, isGrabbed, resetGrabs, startHold, tryStartGrab } from '@/game/systems/grabSystem';
import { calculateDamage } from '@/game/systems/combatSystem';

/* Pedro, 04/11: "o boss dentro da cave profunda … o corpo dele vem do meio e ele tem raízes similares ao tentáculo, pode dar
   empurrão, ver se pega o herói, bate no chão … o canibal gigante meio que do tamanho do Kraken dentro da terra" · "o boss
   também é da cintura pra cima, sai do buraco fundo" · "só mata com bazuca — dá praticamente todo o dano, o resto é fraco". */
describe('Canibal gigante do covil', () => {
  it('no meio da arena do covil, da cintura pra cima (~55 m fora do buraco), 6 raízes em volta', () => {
    expect(CANIBAL_AT).toEqual({ x: CAVE_LAIR.x, z: CAVE_LAIR.z, floor: CAVE_LAIR.floor });
    expect(CANIBAL.BODY_H * (1 - CANIBAL.SUBMERGED_K)).toBeGreaterThanOrEqual(50);
    expect(CANIBAL.ROOTS).toBe(6);
    for (let i = 0; i < 6; i++) { const b = rootBase(i); expect(Math.hypot(b.x - CANIBAL_AT.x, b.z - CANIBAL_AT.z)).toBeCloseTo(CANIBAL.ROOT_RING, 5); }
    expect(CANIBAL_BODY_ID).toBe('zs_canibal_boss'); expect(canibalRootId(2)).toBe('zs_canibal_r2');
  });
  it('acorda com alguém LÁ EMBAIXO na arena (quem está no balcão/rampa alta não acorda); sem ninguém volta inteiro', () => {
    const c = newCanibal();
    canibalPhaseStep(c, 0, 0.1, nearestInArena([{ x: CANIBAL_AT.x + 30, y: 38, z: CANIBAL_AT.z }])); // no balcão
    expect(c.phase).toBe('sleep');
    canibalPhaseStep(c, 0, 0.1, nearestInArena([{ x: CANIBAL_AT.x + 30, y: -54, z: CANIBAL_AT.z }])); // na arena
    expect(c.phase).toBe('rise');
    for (let k = 0; k < 60; k++) canibalPhaseStep(c, 100 * k, 0.1, 30);
    expect(c.phase).toBe('fight');
    canibalPhaseStep(c, 6000 + CANIBAL.SLEEP_MS + 1, 0.1, Infinity);
    expect(c.phase).toBe('sleep');
  });
  it('raiz: chicoteia o mais perto até 40 m; bate 1× no chão (dano+empurrão no raio de 7 m); levanta antes, deita, volta', () => {
    const b = rootBase(0), near = { id: 'a', x: b.x + 10, z: b.z }, far = { id: 'b', x: b.x + 80, z: b.z };
    expect(rootTarget(0, [far, near])).toBe(near);
    expect(rootTarget(0, [far])).toBeNull();
    const r = { i: 0, alive: true, diedAt: 0, slam: { tx: near.x, tz: near.z, age: 0, hit: false }, nextAt: 0 };
    let hits = 0; for (let k = 0; k < 60; k++) if (rootStep(r, 0.1)) hits++;
    expect(hits).toBe(1);
    expect(r.slam).toBeNull(); // terminou (ROOT_SLAM_TOTAL)
    expect(ROOT_SLAM_TOTAL).toBeLessThan(CANIBAL.SLAM_EVERY_S);
    expect(rootLean(0.5)).toBeLessThan(0); expect(rootLean(CANIBAL.WIND_S + CANIBAL.STRIKE_S + 0.1)).toBe(1);
    expect(slamHits({ tx: 0, tz: 0 }, 6, 0)).toBe(true); expect(slamHits({ tx: 0, tz: 0 }, 8, 0)).toBe(false);
    const pv = pushAway(0, 0, 3, 4, 10); expect(Math.hypot(pv.x, pv.z)).toBeCloseTo(10, 5);
  });
  it('AGARRÃO genérico (as raízes): prende, 3 pancadas, solta sozinho — o do jacaré segue igual', () => {
    resetGrabs();
    expect(startHold('zs_canibal_r1', CANIBAL.GRAB_MS, CANIBAL.GRAB_TICKS, 100, 1000)).toBe(true);
    expect(isGrabbed(1500)).toBe(true);
    expect(startHold('zs_canibal_r2', 1000, 3, 1, 1600)).toBe(false); // um por vez
    expect(grabTicksDue('zs_canibal_r1', 1000 + CANIBAL.GRAB_MS)).toBe(CANIBAL.GRAB_TICKS);
    expect(activeGrab(1000 + CANIBAL.GRAB_MS + 1)).toBeNull();
    resetGrabs();
    expect(tryStartGrab('wild_boar_1', 'boar', 20, 0, () => 0)).toBe(true); // jacaré: o de sempre (1,2 s, 3 pancadas)
    expect(grabTicksDue('wild_boar_1', 1200)).toBe(3);
    resetGrabs();
  });
  it('"só a bazuca": armadura 800 corta 400 de cada golpe; o míssil atravessa (dano cheio)', () => {
    expect(CANIBAL.ARMOR).toBe(800);
    expect(calculateDamage(300, CANIBAL.ARMOR, () => 0.5)).toBe(1);            // tiro de fuzil forte = 1
    expect(calculateDamage(3000, 0, () => 0.5)).toBe(3000);                    // míssil (atravessa)
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain("const result = resolveAttack(power, c.hp, c.maxHp, pierce ? 0 : c.armor, c.name, critStats);");
    expect(g).toContain("get().explosiveHit(at, BAZOOKA.SPLASH_R, power, 'Bazuca', true);");
    expect(g).toContain('if (getDistance(at, c.position) - bigCreatureRadius(c.id) > radius) return c;');
    const we = fs.readFileSync('src/components/world/world-entities.tsx', 'utf8');
    expect(we).toContain('const damage = Math.max(1, Math.round(hit.damage) - (hit.pierce ? 0 : creature.armor));');
  });
  it('ligado: montado ao lado da caverna, camada da caverna, barra/tema com dono, online (canibal), não renasce sozinho', () => {
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain('<ZsCanibalBoss heroRef={heroRef} />');
    const v = fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');
    expect(v).toContain('setCreatureLayer(CANIBAL_BODY_ID, 1);');
    expect(v).toContain("audioManager.setBossMusic(awake && near, 'canibal');");
    expect(v).toContain('setBossBarFor(CANIBAL.NAME, null);');
    expect(v).toContain('broadcastCanibal({');
    const a = fs.readFileSync('src/game/audio/audio-manager.ts', 'utf8');
    expect(a).toContain("setBossMusic(on: boolean, key = 'kraken') {");
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain("|| c.id.startsWith('zs_canibal_')");
    const o = fs.readFileSync('src/game/systems/objectiveSystem.ts', 'utf8');
    expect(o).toContain("if (creature.id?.startsWith('zs_canibal_')) return false;");
  });
});
