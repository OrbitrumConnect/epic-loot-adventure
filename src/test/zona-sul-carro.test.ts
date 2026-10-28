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
/** Pista plana comprida (300 × 8 células de 4 m = 1,2 km) pra medir velocidade máxima. */
function strip() {
  const w = 300, h = 8, rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) { const v = Math.round((1 + 30) * 100); rgba[p * 4] = v >> 8; rgba[p * 4 + 1] = v & 255; rgba[p * 4 + 2] = ZS_SURF.land; rgba[p * 4 + 3] = 255; }
  return decodeTerrain(rgba, w, h, 4, 30);
}

describe('carro voador (Zona Sul)', () => {
  it('flutua 0,5 m do chão e 0,25 m sobre a água', () => {
    const t = fake();
    expect(carSurface(t, X(t, 5), 0).y).toBeCloseTo(1 + 0.5, 3);
    expect(carSurface(t, X(t, 32), 0)).toEqual({ y: 0.25, water: true });
    expect(CAR.HOVER).toBe(0.5); expect(CAR.HOVER_WATER).toBe(0.25);
  });
  it('segurar ESPAÇO sobe até o limite; soltou fica; segurar C desce rápido', () => {
    const t = fake();
    const c = newCar(X(t, 30), 0, 0, t); let now = 0; const dt = 0.05;
    const run = (n: number, inp: object) => { for (let k = 0; k < n; k++) { now += dt * 1000; carStep(t, c, { throttle: 0, steer: 0, ...inp }, dt, now); } };
    run(40, { up: true });                                   // 2 s segurando
    expect(c.alt).toBeCloseTo(CAR.CLIMB * 2, 0);
    run(40, {});                                             // soltou: fica
    const held = c.altitude; run(40, {});
    expect(Math.abs(c.altitude - held)).toBeLessThan(0.5);
    run(200, { up: true });                                  // segura muito: para no limite
    expect(c.alt).toBe(CAR.MAX_ALT);
    expect(c.altitude).toBeLessThanOrEqual(CAR.MAX_ALT + 0.5);
    const top = c.altitude; run(20, { down: true });        // 1 s de C
    expect(top - c.altitude).toBeGreaterThan(8);             // desce RÁPIDO
    expect(CAR.DESCEND).toBeGreaterThan(CAR.CLIMB);
  });
  it('energia de voo: 60 s no ar; acabou → desce sozinho e recarga de 15 s; no chão enche de novo', () => {
    const t = fake();
    const c = newCar(X(t, 30), 0, 0, t); let now = 0; const dt = 0.05;
    const run = (n: number, inp: object) => { for (let k = 0; k < n; k++) { now += dt * 1000; carStep(t, c, { throttle: 0, steer: 0, ...inp }, dt, now); } };
    run(70 * 20, { up: true });                               // segura 70 s
    expect(c.energy).toBe(0);
    expect(c.cooldownUntil).toBeGreaterThan(now);
    run(10 * 20, { up: true });                               // em recarga: não sobe, desce
    expect(c.altitude).toBeLessThan(CAR.MAX_ALT - 5);
    run(40 * 20, {});
    expect(c.altitude).toBeLessThan(CAR.AIR_ALT);
    expect(c.energy).toBeGreaterThan(CAR.FLY_S * 0.9);        // passou a recarga e encheu no chão
  });
  it('mais rápido e fluido: ~86 km/h, Shift ~120 km/h; escorrega um pouco de lado na curva', () => {
    const t = fake();
    const c = newCar(X(t, 30), -30, 0, t); let now = 0; const dt = 0.05;
    // o mapa de teste é pequeno (bate na borda): mede a MÁXIMA atingida
    const pista = strip();
    const peak = (turbo: boolean) => { const d = newCar(pista.x0 + 12, 0, Math.PI / 2, pista); let m = 0, n = 0; for (let k = 0; k < 300; k++) { n += 50; carStep(pista, d, { throttle: 1, steer: 0, turbo }, dt, n); m = Math.max(m, d.speed); } return m * 3.6; };
    void now;
    expect(peak(false)).toBeGreaterThan(80);
    expect(peak(true)).toBeGreaterThan(110);
    carStep(t, c, { throttle: 1, steer: 1, turbo: true }, dt, now);
    const lateral = Math.abs(c.vx * Math.cos(c.yaw) - c.vz * Math.sin(c.yaw));
    expect(lateral).toBeGreaterThan(0);                       // vetor de velocidade ≠ direção (desliza)
  });
  it('paredão (muralha de 60 m) é parede: rente ao chão não atravessa', () => {
    const t = fake();
    const c = newCar(X(t, 10), 0, Math.PI / 2, t); let now = 0; // virado pro leste (+x), muralha em i = 14
    for (let k = 0; k < 200; k++) { now += 50; carStep(t, c, { throttle: 1, steer: 0 }, 0.05, now); }
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
