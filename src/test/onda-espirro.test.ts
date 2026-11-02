import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SurfScheduler } from '@/components/zona-sul/surf/surf-scheduler';
import { ARPOADOR } from '@/components/zona-sul/surf/surf-wave';
import { SPRAY, sprayEmit, sprayWeights } from '@/components/zona-sul/surf/surf-spray';

/* Pedro 02/11 (item 4): "espirro de água na crista da onda". */
const frame = { px: 0, pz: 0, qx: 0, qz: 1, sx: 1, sz: 0, water: 1, depth: 5, lim: [160, 160] as [number, number] };
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const drop = () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, a0: 0 });
const series = (t: number) => { const sc = new SurfScheduler(20261028, ARPOADOR); sc.syncTo(0); sc.trigger(); sc.syncTo(t); return sc; };

describe('espirro da onda', () => {
  it('ondulação lá fora (ainda sem empinar) não espirra; quebrando espirra bastante', () => {
    const calm = series(10), rnd = rng(7), d = drop();
    let n = 0; for (let k = 0; k < 500; k++) if (sprayEmit(calm.states, calm.vars, frame, ARPOADOR, rnd, d)) n++;
    expect(n).toBe(0);
    const brk = series(55);
    n = 0; for (let k = 0; k < 500; k++) if (sprayEmit(brk.states, brk.vars, frame, ARPOADOR, rnd, d)) n++;
    expect(n).toBeGreaterThan(250);
    const off = { ...brk.states[0]!, active: false };
    expect(sprayWeights(0, off, brk.vars[0]!, ARPOADOR)).toEqual({ crest: 0, burst: 0, hSide: 0, r: 0 });
  });
  it('névoa sai da crista pra TRÁS (vento terral, pro mar); explosão sobe e vai pra frente (praia); nada fora da zona', () => {
    const sc = series(55), rnd = rng(11), d = drop();
    let mist = 0, boom = 0;
    for (let k = 0; k < 2000; k++) {
      if (!sprayEmit(sc.states, sc.vars, frame, ARPOADOR, rnd, d)) continue;
      expect(d.vy).toBeGreaterThan(0);
      expect(d.y).toBeGreaterThan(-0.5);
      expect(Math.abs(d.x)).toBeLessThanOrEqual(160);
      expect(d.life).toBeGreaterThanOrEqual(SPRAY.LIFE[0]); expect(d.life).toBeLessThanOrEqual(SPRAY.LIFE[1]);
      if (d.a0 > 0.6) { boom++; expect(d.vz).toBeGreaterThan(0); } else { mist++; expect(d.vz).toBeLessThan(0); }
    }
    expect(mist).toBeGreaterThan(500); expect(boom).toBeGreaterThan(200); // medido: 1081 névoa · 336 explosão
  });
  it('leve: um desenho de pontos, limite de gotas (celular menos), só perto e com a onda desenhada; ?spray=0 desliga', () => {
    expect(SPRAY.N_MOBILE).toBeLessThan(SPRAY.N);
    expect(SPRAY.N).toBeLessThanOrEqual(800);
    const src = fs.readFileSync('src/components/zona-sul/surf/surf-spray.tsx', 'utf8');
    expect(src.match(/<points /g)).toHaveLength(1);
    expect(src).toContain("const on = !!zoneRef.current?.drawn && Math.hypot(cam.x - frame.px, cam.z - frame.pz) < SPRAY.DIST;");
    const brk = fs.readFileSync('src/components/zona-sul/surf/surf-break.tsx', 'utf8');
    expect(brk).toContain("{SPRAY_ON && <SurfSpray frame={frame} pf={pf} zoneRef={zoneRef} statesOf={statesOf} />}");
    expect(brk).toContain("get('spray') !== '0'");
  });
});
