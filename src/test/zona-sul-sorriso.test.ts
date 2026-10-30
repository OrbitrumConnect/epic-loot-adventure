import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { findSorrisoFrame, SORRISO, SORRISO_MESH, SORRISO_SERIES, SORRISO_SHORE_Q } from '@/components/zona-sul/surf/sorriso';
import { ARPOADOR, barrelAt, barrelBand, crestQ, curlOf, SURF, surfChurnAt, surfInTubeAt, type WaveVar, waveStateAt } from '@/components/zona-sul/surf/surf-wave';
import { SurfScheduler, waveLife } from '@/components/zona-sul/surf/surf-scheduler';
import { ressacaAt, RESSACA } from '@/components/zona-sul/zs-ressaca';

/* Pedro 30/10: "no meio de Copacabana existe uma onda famosa chamada Sorriso que só acontece quando tem ressaca… quebra
   grande, mais cheia, menos tubular, vai se formando e antes da beira abre um tubo e morre pela areia. Extensão real
   ~1.300 m da costa" → mapa 1:7,4 = ~176 m. */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});
const V: WaveVar = { hR: 1, hL: 1, vR: 1, vL: 1 };
const ageAt = (q: number) => (q - SORRISO.Q_MIN) / SORRISO.C;

describe('Sorriso — onde fica', () => {
  it('no MEIO de Copacabana, em mar aberto, eixo q apontando pra areia; quebra a ~176 m da beira (1.300 m reais / 7,4)', () => {
    const f = findSorrisoFrame(t)!;
    expect(f).not.toBeNull();
    expect(f.px).toBeGreaterThan(330); expect(f.px).toBeLessThan(460);       // meio da praia (x 220–560)
    expect(f.water).toBeGreaterThan(0.95);                                    // a zona da onda toda em água
    // andando +q a partir do pico chega na areia perto de SORRISO_SHORE_Q
    let dry = NaN; for (let q = 0; q <= 60; q += 0.5) if (zsHeightAt(t, f.px + f.qx * q, f.pz + f.qz * q) >= 0) { dry = q; break; }
    expect(Math.abs(dry - SORRISO_SHORE_Q)).toBeLessThan(3);
    expect(SORRISO_SHORE_Q - SORRISO.BREAK_Q).toBe(176);
    expect(f.lim[0]).toBeGreaterThan(60); expect(f.lim[1]).toBeGreaterThan(60); // larga pros dois lados
  });
});

describe('Sorriso — a onda', () => {
  it('lá fora quebra GRANDE e CHEIA: sem tubo pra entrar, vira espuma', () => {
    const qOut = SORRISO.BREAK_Q + 30, st = waveStateAt(ageAt(qOut), V, SORRISO);
    expect(st.h).toBeGreaterThan(6);                       // grande (o Arpoador vai a 6,3)
    expect(st.reform).toBe(0);
    let tube = false;
    for (let s = -60; s <= 60; s += 4) for (let dq = -12; dq <= 12; dq += 1) for (const y of [0.3, 1, 2]) if (surfInTubeAt(s, crestQ(st, s, SORRISO) + dq, [st], [V], y, [150, 150], SORRISO)) tube = true;
    expect(tube).toBe(false);
    // o lip arremessa pouco (curl ≤ CURL_OUT) e, mais atrás, fechou em espuma
    const b = barrelAt(0, st, V, SORRISO);
    expect(curlOf(b.open, b.closed, b.ramp).curl).toBeLessThanOrEqual(SORRISO.CURL_OUT + 1e-9);
    expect(b.closed).toBeGreaterThan(0.9);
    expect(surfChurnAt(0, crestQ(st, 0, SORRISO) + 2, [st], [V], [150, 150], SORRISO)).toBeGreaterThan(0.3);
  });
  it('vai se formando: a espuma se DESFAZ chegando perto da beira (antes da 2ª quebra a onda está inteira de novo)', () => {
    const inner = SORRISO.INNER!, st = waveStateAt(ageAt(inner.Q - 0.5), V, SORRISO);
    expect(st.reform).toBeGreaterThan(0.95);
    expect(barrelAt(0, st, V, SORRISO).closed).toBeLessThan(0.05);
  });
  it('antes da beira ABRE UM TUBO (dá pra entrar) e morre na areia', () => {
    const inner = SORRISO.INNER!;
    let tube = false;
    for (let k = 1; k <= 30 && !tube; k++) {
      const st = waveStateAt(ageAt(inner.Q) + k * 0.25, V, SORRISO), R = barrelBand(barrelAt(0, st, V, SORRISO).hSide).r;
      for (let s = -40; s <= 40 && !tube; s += 2) for (let dq = -2 * R; dq <= 2 * R; dq += 0.25) if (surfInTubeAt(s, crestQ(st, s, SORRISO) + dq, [st], [V], 0.3, [150, 150], SORRISO)) { tube = true; break; }
    }
    expect(tube).toBe(true);
    const end = waveStateAt(ageAt(SORRISO.Q_MAX + 7), V, SORRISO);
    expect(end.active).toBe(false); // passou da areia: acabou
  });
});

describe('Sorriso — custo e séries', () => {
  it('malha leve (≤ ~80 mil vértices no PC, ≤ ~25 mil no celular) e o Arpoador segue igual', async () => {
    const { buildSurfGeometry } = await import('@/components/zona-sul/surf/surf-break');
    const pc = buildSurfGeometry(false, [150, 150], SORRISO, SORRISO_MESH).getAttribute('aRest').count;
    const cel = buildSurfGeometry(true, [150, 150], SORRISO, SORRISO_MESH).getAttribute('aRest').count;
    expect(pc).toBeLessThan(82000); expect(cel).toBeLessThan(26000);
    expect(ARPOADOR).toMatchObject({ ...SURF, CURL_OUT: 1, INNER: null });
  });
  it('ondas da série nunca encostam (distância > faixa do tubo da maior onda) e cada uma vive ~1 min', () => {
    const maxBand = barrelBand(SORRISO.H_MAX * 1.25 * 1.08);
    expect(SORRISO_SERIES.GAP_MIN * SORRISO.C).toBeGreaterThan(maxBand.wf + maxBand.wb);
    expect(waveLife(SORRISO)).toBeGreaterThan(50); expect(waveLife(SORRISO)).toBeLessThan(70);
  });
  it('fora da RESSACA não começa série nova (as que vinham terminam); na ressaca vem série', () => {
    const off = new SurfScheduler(1, SORRISO, SORRISO_SERIES); off.enabled = false;
    for (let i = 0; i < 600; i++) off.advance(0.1);
    expect(off.states.some((s) => s.active)).toBe(false);
    expect(off.trigger()).toBe(false);
    off.enabled = true;
    for (let i = 0; i < 40; i++) off.advance(0.1);
    expect(off.states.some((s) => s.active)).toBe(true);
  });
});

describe('ressaca', () => {
  it(`${RESSACA.ON_MIN} min a cada ${RESSACA.EVERY_MIN} min pelo relógio real (todo mundo vê a mesma); ?ressaca=1 força`, () => {
    const per = RESSACA.EVERY_MIN * 60_000;
    expect(ressacaAt(10 * per + 1000).on).toBe(true);
    expect(ressacaAt(10 * per + RESSACA.ON_MIN * 60_000 + 1000).on).toBe(false);
    expect(ressacaAt(10 * per + RESSACA.ON_MIN * 60_000 + 1000).nextS).toBeCloseTo((RESSACA.EVERY_MIN - RESSACA.ON_MIN) * 60 - 1, 3);
    expect(ressacaAt(10 * per + RESSACA.ON_MIN * 60_000 + 1000, true).on).toBe(true);
  });
});
