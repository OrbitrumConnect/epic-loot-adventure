import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createNightPigeons, isFreeForWildlife, NIGHT_FLOCK_PREFIX, NIGHT_PIGEONS, nightFlockAction, nightSpeedScale,
} from '@/game/systems/wildlifeSystem';
import { nextGroundOffset } from '@/components/world/glb-creature';

/* Pedro, 26/10: "búfalo à noite pode ficar mais rápido, pombo também, e mais pombos à noite (uns 20–30); pombo +30%
   de tamanho; a Couraça ainda sai do chão no início do move — deve nascer no chão". */
describe('noite: búfalo e pombo mais rápidos', () => {
  it('até +30% na noite fechada, sobe junto com o escuro; outros bichos iguais', () => {
    expect(nightSpeedScale('bear', 0)).toBe(1);
    expect(nightSpeedScale('bear', 1)).toBeCloseTo(1.3, 5);
    expect(nightSpeedScale('pigeon', 0.5)).toBeCloseTo(1.15, 5);
    expect(nightSpeedScale('wolf_alpha', 1)).toBe(1);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/\(NIGHT_SPEED\[creature\.speciesId\] \? nightSpeedScale\(creature\.speciesId, nightFactor\(\)\) : 1\)/);
  });
});

describe('noite: bando de +25 pombos', () => {
  it('chega ao escurecer, vai embora ao clarear, sem piscar no entardecer', () => {
    expect(nightFlockAction(0.7, false)).toBe('spawn');
    expect(nightFlockAction(0.4, false)).toBeNull();
    expect(nightFlockAction(0.4, true)).toBeNull(); // histerese
    expect(nightFlockAction(0.1, true)).toBe('leave');
    expect(nightFlockAction(1, true)).toBeNull();
  });
  it('25 pombos a 20–60 m do jogador, em lugar livre, ids próprios', () => {
    let seed = 42;
    const rng = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const center = { x: 7, z: -26 };
    const flock = createNightPigeons(center, rng);
    expect(flock.length).toBe(NIGHT_PIGEONS);
    for (const p of flock) {
      expect(p.id.startsWith(NIGHT_FLOCK_PREFIX)).toBe(true);
      expect(p.speciesId).toBe('pigeon');
      const d = Math.hypot(p.position.x - center.x, p.position.z - center.z);
      expect(d).toBeGreaterThanOrEqual(19.9);
      expect(d).toBeLessThanOrEqual(60.1);
      expect(isFreeForWildlife(p.position)).toBe(true);
    }
    expect(new Set(flock.map((p) => p.id)).size).toBe(NIGHT_PIGEONS);
  });
  it('ligado: store (só host/solo) + relógio de 5 s no modo mundo', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/tickNightFlock: \(night\) => \{\s*if \(!canSimulateSharedWorld\(\)\) return;/);
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    // 29/10: só no Vale (`!zs`) — a revoada é do mapa velho; na Zona Sul vem com a fauna dela
    expect(idx).toMatch(/\{worldOn && ui\.mode === 'world' && !zs && <NightFlock \/>\}/);
  });
  it('pombo +30% de tamanho', () => {
    const b = fs.readFileSync('src/components/world/beast.tsx', 'utf8');
    expect(b).toMatch(/pigeon: \{ url: '\/models\/animals\/pigeon\.glb', fixedScale: 0\.0026,/);
  });
});

describe('Couraça não sai do chão ao começar a andar', () => {
  it('troca de clip: re-mede rápido (50% a cada 3 quadros) → erro de 0,8 m some em ~0,2 s (antes ~2 s)', () => {
    let off = 0, err = 0.8; // pé 0,8 m abaixo do chão no clip novo
    for (let f = 0; f < 12; f++) { // 12 quadros = 4 medições rápidas
      if (f % 3 === 0) { const n = nextGroundOffset(off, -err, 0, 0.5); err -= n - off; off = n; }
    }
    expect(Math.abs(err)).toBeLessThan(0.06);
  });
  it('ligado: só nas trocas parado/andando/correndo; refaz os pontos do pé; 1ª medição perto sem esperar', () => {
    const hero = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(hero).toMatch(/if \(loco\(wantNow\) && loco\(groundWant\.current\)\) \{ groundFast\.current = GROUND_FAST_FRAMES; footCache\.current\.picks\.length = 0; \}/);
    expect(hero).toMatch(/const born = autoGround && !groundInit\.current && near && \+\+groundBorn\.current >= 3;/);
  });
});

/* Pedro, 26/10: "em alguns locais do mapa os bichos nascem mais embaixo". 1ª medição pegava a animação ainda entrando
   (fade 0,2 s da pose T) e LONGE nunca mais media → enterrado até você chegar perto. */
describe('assenta certo em qualquer lugar (nascer longe)', () => {
  it('1ª ao nascer, 2ª depois do fade (quadro 30, qualquer distância), perto a cada 18, longe a cada 120', async () => {
    const { groundStep, GROUND_SETTLE_FRAME, GROUND_FAR_EVERY } = await import('@/components/world/glb-creature');
    expect(groundStep(false, 2, false)).toBe(0);
    expect(groundStep(false, 3, false)).toBe(1);
    expect(groundStep(true, GROUND_SETTLE_FRAME, false)).toBe(1); // longe também re-encaixa com a pose de verdade
    expect(groundStep(true, 36, true)).toBe(0.35);
    expect(groundStep(true, 37, true)).toBe(0);
    expect(groundStep(true, GROUND_FAR_EVERY, false)).toBe(0.5); // antes: longe = nunca
    expect(groundStep(true, GROUND_FAR_EVERY + 1, false)).toBe(0);
  });
  it('bicho nascido longe com o pé 0,9 m errado (pose do fade) assenta em ≤ 0,5 s', () => {
    let off = 0, err = 0.9;
    for (let f = 1; f <= 30; f++) { // 1ª no quadro 3 mediu a pose errada; a 2ª (quadro 30) mede a certa e encaixa
      if (f === 30) { const n = nextGroundOffset(off, -err, 0, 1); err -= n - off; off = n; }
    }
    expect(Math.abs(err)).toBeLessThan(1e-9);
  });
  it('bichos e raiders usam a mesma regra', () => {
    const c = fs.readFileSync('src/components/world/glb-creature.tsx', 'utf8');
    expect(c).toMatch(/const step = groundStep\(groundInit\.current, groundAcc\.current, near\);/);
  });
});

/* 26/10 (Pedro: go): morto-vivo SÓ À NOITE — de dia nenhum; ao escurecer 6 espalhados pelo mapa; ao clarear somem. */
describe('morto-vivo só à noite', () => {
  it('de dia não nasce; a noite traz 6 espalhados (longe uns dos outros, lugar livre)', async () => {
    const { WILD_SPAWN_COUNTS, createNightZombies, NIGHT_ZOMBIES, NIGHT_ZOMBIE_PREFIX, createWildCreatures } = await import('@/game/systems/wildlifeSystem');
    expect(WILD_SPAWN_COUNTS['zombie']).toBe(0);
    expect(createWildCreatures().some((c) => c.speciesId === 'zombie')).toBe(false);
    let seed = 7;
    const rng = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const z = createNightZombies(rng);
    expect(z.length).toBe(NIGHT_ZOMBIES);
    for (const a of z) {
      expect(a.id.startsWith(NIGHT_ZOMBIE_PREFIX)).toBe(true);
      expect(isFreeForWildlife(a.position)).toBe(true);
      for (const b of z) if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThan(17);
    }
  });
  it('retomada de sala não apaga os da noite; o relógio da noite cuida dos dois (pombos e mortos-vivos)', async () => {
    const { mergeResumedWorld } = await import('@/game/systems/wildlifeSystem');
    const out = mergeResumedWorld([{ id: 'wild_zombie_night_2', speciesId: 'zombie' } as never], []);
    expect(out.length).toBe(1);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/if \(actZ === 'spawn'\) set\(\(s\) => \(\{ creatures: \[\.\.\.s\.creatures, \.\.\.createNightZombies\(\)\] \}\)\);/);
  });
});
