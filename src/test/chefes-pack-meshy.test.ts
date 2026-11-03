import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clearLeap, isLeaping, isRoaring, LEAP, leapPos, takeLeapLanding, tryStartLeap, tryStartRoar } from '@/game/systems/leapSystem';
import { behindSpot, SORC, sorcClock, sorceressMaySpawn } from '@/game/systems/sorceressSystem';
import { CANNIBAL_FROM_WAVE, KRAKEN_FROM_WAVE, waveBossSpecies } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';

/* Pedro 03/11: "canibal na onda 8–9 (um pouco menor que o Fúngico), kraken na 18, os dois sozinhos, pulando, dano,
   jogado pra longe"; "a sorceress pode aparecer correndo do nada atrás da pessoa"; "Couraça e Fúngico −25%". */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const glbJson = (p: string) => { const b = fs.readFileSync(p); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()); };

describe('chefes do pack: salto em cima + rugido (leapSystem)', () => {
  it('ruge UMA vez ao avistar e não salta no meio do rugido', () => {
    const id = 't_roar', t = 1000;
    expect(tryStartRoar(id, 'raider_cannibal', t)).toBe(true);
    expect(tryStartRoar(id, 'raider_cannibal', t + 50)).toBe(false); // 1× por vida
    expect(isRoaring(id, t + LEAP['raider_cannibal']!.roarMs - 1)).toBe(true);
    expect(tryStartLeap(id, 'raider_cannibal', { x: 0, z: 0 }, { x: 10, z: 0 }, t + 500)).toBe(false); // rugindo
    expect(isRoaring(id, t + LEAP['raider_cannibal']!.roarMs + 1)).toBe(false);
    expect(tryStartRoar('t_sorc', 'raider_sorceress', t)).toBe(false); // ela chega calada (surpresa)
    clearLeap(id);
  });

  it('salta só a meia distância; agacha, VOA em linha e cai ~1 m antes de onde o alvo estava; queda 1× por salto', () => {
    const id = 't_leap', sp = 'raider_kraken', s = LEAP[sp]!, t = 10_000;
    expect(tryStartLeap(id, sp, { x: 0, z: 0 }, { x: s.minD - 1, z: 0 }, t)).toBe(false); // perto demais
    expect(tryStartLeap(id, sp, { x: 0, z: 0 }, { x: s.maxD + 1, z: 0 }, t)).toBe(false); // longe demais
    expect(tryStartLeap(id, sp, { x: 0, z: 0 }, { x: 12, z: 0 }, t)).toBe(true);
    expect(leapPos(id, sp, t + 1)!.x).toBe(0); // agachando
    expect(leapPos(id, sp, t + s.durMs * (s.flyFrom + s.landAt) / 2)!.x).toBeCloseTo(5.5, 1); // meio do voo
    expect(takeLeapLanding(id, sp, t + s.durMs * s.landAt - 5)).toBe(false);
    expect(takeLeapLanding(id, sp, t + s.durMs * s.landAt + 1)).toBe(true); // a QUEDA (dano em área)
    expect(takeLeapLanding(id, sp, t + s.durMs * s.landAt + 2)).toBe(false);
    expect(leapPos(id, sp, t + s.durMs * 0.95)!.x).toBeCloseTo(11, 5); // caiu e fica (11 = 12 − 1)
    expect(isLeaping(id, t + s.durMs + 1)).toBe(false);
    expect(tryStartLeap(id, sp, { x: 0, z: 0 }, { x: 12, z: 0 }, t + s.durMs + 10)).toBe(false); // recarga
    expect(tryStartLeap(id, sp, { x: 0, z: 0 }, { x: 12, z: 0 }, t + s.cooldownMs + 1)).toBe(true);
    clearLeap(id);
  });

  it('a queda pesa e empurra: Kraken > Canibal > Feiticeira; rolar escapa (a IA usa a mesma regra da mordida)', () => {
    const [k, c, f] = [LEAP['raider_kraken']!, LEAP['raider_cannibal']!, LEAP['raider_sorceress']!];
    expect(k.dmgK).toBeGreaterThan(c.dmgK); expect(c.dmgK).toBeGreaterThan(f.dmgK);
    expect(k.shove).toBeGreaterThan(c.shove); expect(c.shove).toBeGreaterThan(f.shove);
    const ai = read('src/components/world/hostile-ai.ts');
    expect(ai).toMatch(/if \(isInvulnerable\(\)\) \{ st\.setMessage\(`💨 Rolou e escapou do salto de \$\{name\}!`\); return 0; \}/);
    expect(ai).toMatch(/if \(vehicleShield\.absorb\?\.\(dmg, name\)\) return 0;/);
    expect(ai).toMatch(/queueKnockback\('player', \(dx \/ l\) \* spec\.shove, \(dz \/ l\) \* spec\.shove\);/);
    expect(ai).toMatch(/const lp = leaping \? leapPos\(creatureId, creature\.speciesId\) : null;/); // posição pelo relógio
    expect(ai).toMatch(/if \(held \|\| leaping\) \{/); // rugindo / no ar não golpeia
  });
});

describe('ondas da Zona Sul: Canibal na 8, Kraken na 18 — um de cada', () => {
  it('a vaga do 1º chefe; o total de chefes é o mesmo; Vale igual', () => {
    expect(CANNIBAL_FROM_WAVE).toBe(8); expect(KRAKEN_FROM_WAVE).toBe(18);
    expect(waveBossSpecies(7, 0, false)).not.toBe('raider_cannibal');
    expect(waveBossSpecies(8, 0, false)).toBe('raider_cannibal');
    expect([1, 2, 3].map((i) => waveBossSpecies(8, i, false))).not.toContain('raider_cannibal'); // sozinho
    expect(waveBossSpecies(18, 0, false)).toBe('raider_kraken');
    expect(waveBossSpecies(18, 1, false)).toBe('raider_cannibal');
    expect([2, 3, 4].map((i) => waveBossSpecies(25, i, false))).not.toContain('raider_kraken');
    for (const w of [1, 5, 8, 18, 30]) for (const i of [0, 1, 2]) expect(waveBossSpecies(w, i, true)).not.toMatch(/cannibal|kraken/); // Vale
    expect(waveBossSpecies(8, 1, false)).toBe(waveBossSpecies(8, 0, true)); // a fila de sempre continua depois dele
  });

  it('tamanhos: Couraça e Fúngico −25%; Canibal pouco menor que o Fúngico de antes; Kraken o maior', () => {
    const r = read('src/components/world/raider.tsx');
    const h = (sp: string) => Number(new RegExp(`${sp}: \\{ url: '[^']+', standFixX: [^,]+, height: ([\\d.]+)`).exec(r)![1]);
    expect(h('raider_samurai')).toBeCloseTo(3.32 * 0.75, 2);
    expect(h('raider_mushroom')).toBeCloseTo(3.83 * 0.75, 2);
    expect(h('raider_cannibal')).toBeLessThan(3.83); expect(h('raider_cannibal')).toBeGreaterThan(h('raider_mushroom'));
    expect(h('raider_kraken')).toBeGreaterThan(h('raider_cannibal'));
    expect(r).toMatch(/raider_cannibal: \{\s*scale: 3\.3[^}]*noSpin: true/); // salta em vez do redemoinho
    expect(CREATURES['raider_kraken']!.attackCooldown).toBeGreaterThan(CREATURES['raider_cannibal']!.attackCooldown); // lento
  });

  it('modelos: esqueleto do herói (as animações encaixam), sem animação embutida, KTX2, leves; clips de mutante só animação', () => {
    for (const n of ['cannibal', 'kraken', 'sorceress']) {
      const p = `public/models/raiders/${n}.glb`, j = glbJson(p);
      const joints = new Set(j.skins[0].joints.map((i: number) => j.nodes[i].name));
      for (const b of ['mixamorig:Hips', 'mixamorig:Spine2', 'mixamorig:Head', 'mixamorig:RightHand', 'mixamorig:LeftFoot']) expect(joints.has(b), `${n} ${b}`).toBe(true);
      expect(j.animations ?? []).toHaveLength(0);
      expect(j.images.every((im: { mimeType: string }) => im.mimeType === 'image/ktx2')).toBe(true);
      expect(fs.statSync(p).size).toBeLessThan(2_500_000);
    }
    for (const n of ['idle', 'walk', 'run', 'attack', 'leap', 'roar', 'slam', 'run_jump_attack']) {
      const j = glbJson(`public/models/mutant/${n}.glb`);
      expect(j.meshes ?? []).toHaveLength(0); expect(j.animations).toHaveLength(1);
    }
  });
});

describe('Feiticeira da Mata: surge atrás, uma por vez', () => {
  it('relógio, nível, longe da base e da zona segura, uma por vez, fora da caverna', () => {
    sorcClock.startedAt = 0; sorcClock.nextAt = 0;
    const base = { level: 20, dead: false, inCave: false, alive: false, baseDist: 200, safeDist: 300, safeR: 11 };
    expect(sorceressMaySpawn({ ...base, now: 1000 })).toBe(false); // a 1ª só depois de FIRST_MS
    const t = 1000 + SORC.FIRST_MS;
    expect(sorceressMaySpawn({ ...base, now: t })).toBe(true);
    expect(sorceressMaySpawn({ ...base, now: t, alive: true })).toBe(false);
    expect(sorceressMaySpawn({ ...base, now: t, inCave: true })).toBe(false);
    expect(sorceressMaySpawn({ ...base, now: t, level: SORC.MIN_LEVEL - 1 })).toBe(false);
    expect(sorceressMaySpawn({ ...base, now: t, baseDist: SORC.BASE_CLEAR - 1 })).toBe(false);
    expect(sorceressMaySpawn({ ...base, now: t, safeDist: 11 + SORC.SAFE_PAD - 1 })).toBe(false);
  });

  it('nasce ATRÁS de quem olha pra frente, entre 24 e 32 m', () => {
    let seed = 1; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 20; k++) {
      const s = behindSpot(0, 0, 0, () => true, rng)!; // olhando +Z → nasce em −Z
      expect(s.z).toBeLessThan(0);
      const d = Math.hypot(s.x, s.z);
      expect(d).toBeGreaterThanOrEqual(SORC.DIST_MIN); expect(d).toBeLessThanOrEqual(SORC.DIST_MAX);
    }
    expect(behindSpot(0, 0, 0, () => false, rng)).toBeNull(); // sem chão: tenta depois
    const gs = read('src/game/state/game-store.ts');
    expect(gs).toMatch(/if \(isClassicWorld\(\) \|\| !canSimulateSharedWorld\(\)\) return; \/\/ só na Zona Sul/);
    expect(gs).toMatch(/c\.id\.startsWith\('wave'\) \|\| isSorceress\(c\.id\) \/\/ 03\/11: Feiticeira não renasce/);
    expect(read('src/routes/index.tsx')).toMatch(/\{worldOn && ui\.mode === 'world' && zs && <SorceressStalker \/>\}/);
  });
});
