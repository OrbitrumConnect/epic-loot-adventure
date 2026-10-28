import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain } from '@/components/zona-sul/zs-terrain-data';
import { CAR, CAR_SEATS, carStep, carSurface, newCar } from '@/components/zona-sul/zs-car';
import { ZS_SURF } from '@/components/zona-sul/zona-sul-meta';

/* 28/10 — CARRO VOADOR (só na Zona Sul): flutua 0,5 m (0,25 m na água), Espaço = impulso + voo até ~25 m por 60 s,
   desce suave, recarga 15 s; paredão é parede; 5 lugares. O jogo de sempre não é tocado. */
const src = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/** 40×20 células de 4 m: oeste terra plana (1 m), leste mar (−4 m), uma muralha de 60 m em i = 14. */
function fake() {
  const w = 40, h = 20, rgba = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [hm, s] = i >= 26 ? [-4, ZS_SURF.sea] : i === 14 ? [60, ZS_SURF.land] : [1, ZS_SURF.land];
    const v = Math.round((hm + 30) * 100), p = (j * w + i) * 4;
    rgba[p] = v >> 8; rgba[p + 1] = v & 255; rgba[p + 2] = s; rgba[p + 3] = 255;
  }
  return decodeTerrain(rgba, w, h, 4, 30);
}
const X = (t: ReturnType<typeof fake>, i: number) => t.x0 + i * t.cell;

describe('carro voador (Zona Sul)', () => {
  it('flutua 0,5 m do chão e 0,25 m sobre a água', () => {
    const t = fake();
    expect(carSurface(t, X(t, 5), 0).y).toBeCloseTo(1 + 0.5, 3);
    expect(carSurface(t, X(t, 32), 0)).toEqual({ y: 0.25, water: true });
    expect(CAR.HOVER).toBe(0.5); expect(CAR.HOVER_WATER).toBe(0.25);
  });
  it('Espaço: sobe aos poucos até ~35 m, voa 60 s, desce suave, recarga 15 s; impulso de velocidade', () => {
    const t = fake();
    const c = newCar(X(t, 30), 0, 0, t); // sobre o mar: nada no caminho
    let now = 0; const dt = 0.05;
    carStep(t, c, { throttle: 0, steer: 0, boost: true }, dt, now);
    expect(c.flying).toBe(true);
    for (let k = 0; k < 20 * 20; k++) { now += dt * 1000; carStep(t, c, { throttle: 0, steer: 0, boost: false }, dt, now); } // 20 s
    expect(c.altitude).toBeGreaterThan(32);                        // subiu GRADUAL (2,4 m/s) até ~35
    expect(c.altitude).toBeLessThanOrEqual(CAR.FLY_ALT + 0.01);
    for (let k = 0; k < 41 * 20; k++) { now += dt * 1000; carStep(t, c, { throttle: 0, steer: 0, boost: false }, dt, now); } // passa dos 60 s
    expect(c.flying).toBe(false);
    const cdEnd = c.cooldownUntil;
    expect(cdEnd - now).toBeGreaterThan(13_000); // recarga de 15 s começou ao fim do voo
    carStep(t, c, { throttle: 0, steer: 0, boost: true }, dt, now);   // em recarga: não volta a voar
    expect(c.flying).toBe(false);
    const alt0 = c.altitude;
    for (let k = 0; k < 20; k++) { now += dt * 1000; carStep(t, c, { throttle: 0, steer: 0, boost: false }, dt, now); }
    expect(alt0 - c.altitude).toBeLessThan(CAR.SINK * 1.05 + 0.01); // desce SUAVE (≤ 2,2 m/s)
    // impulso: no voo a máxima é 30% maior
    const d = newCar(X(t, 30), 0, Math.PI / 2, t); let n2 = 0;
    carStep(t, d, { throttle: 1, steer: 0, boost: true }, dt, n2);
    for (let k = 0; k < 200; k++) { n2 += 50; carStep(t, d, { throttle: 1, steer: 0, boost: false }, dt, n2); }
    expect(d.speed).toBeGreaterThan(CAR.MAX * 1.2);
  });
  it('C desce quando quiser: encerra o voo na hora, desce suave e começa a recarga', () => {
    const t = fake();
    const c = newCar(X(t, 30), 0, 0, t); let now = 0;
    carStep(t, c, { throttle: 0, steer: 0, boost: true }, 0.05, now);
    for (let k = 0; k < 200; k++) { now += 50; carStep(t, c, { throttle: 0, steer: 0, boost: false }, 0.05, now); } // 10 s no ar
    expect(c.flying).toBe(true);
    carStep(t, c, { throttle: 0, steer: 0, boost: false, descend: true }, 0.05, now);
    expect(c.flying).toBe(false);
    expect(c.cooldownUntil - now).toBeGreaterThan(14_000);
    const a0 = c.altitude; now += 50; carStep(t, c, { throttle: 0, steer: 0, boost: false }, 0.05, now);
    expect(a0 - c.altitude).toBeLessThanOrEqual(CAR.SINK * 0.05 + 1e-6); // suave
  });
  it('paredão (muralha de 60 m) é parede: rente ao chão não atravessa', () => {
    const t = fake();
    const c = newCar(X(t, 10), 0, Math.PI / 2, t); let now = 0; // virado pro leste (+x), muralha em i = 14
    for (let k = 0; k < 200; k++) { now += 50; carStep(t, c, { throttle: 1, steer: 0, boost: false }, 0.05, now); }
    expect(c.x).toBeLessThan(X(t, 14));
  });
  it('5 lugares; o jogo de sempre NÃO usa os clips da Zona Sul (opção nova é opcional)', () => {
    expect(CAR_SEATS).toHaveLength(5);
    expect(src('src/components/game-world.tsx')).not.toMatch(/customClips/);
    expect(src('src/components/world/glb-hero-mixamo.tsx')).toMatch(/customClips\?: Record<string, string>;/);
    const w = src('src/components/zona-sul/zona-sul-world.tsx');
    expect(w).toMatch(/customClips=\{HERO_CLIPS\}/);
    expect(w).toMatch(/e\.code === 'KeyE' && !e\.repeat/);
  });
  it('carro compactado: ≤ 2 MB e ≤ 30 mil triângulos (veio com 60 MB / 500 mil)', () => {
    const b = fs.readFileSync('public/zona-sul/car.glb');
    expect(b.length).toBeLessThan(2 * 1024 * 1024);
    const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    let tri = 0;
    for (const m of j.meshes) for (const p of m.primitives) tri += j.accessors[p.indices].count / 3;
    expect(tri).toBeLessThanOrEqual(30_000);
  });
});
