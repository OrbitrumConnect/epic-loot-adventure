import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { findSorrisoFrame, SORRISO, SORRISO_MESH, SORRISO_SERIES, SORRISO_SHORE_Q } from '@/components/zona-sul/surf/sorriso';
import { ARPOADOR, barrelAt, barrelBand, crestQ, curlOf, type Lim, SURF, surfChurnAt, surfHeightAt, surfInTubeAt, surfPushAt, type WaveVar, waveStateAt } from '@/components/zona-sul/surf/surf-wave';
import { newRide, RIDE, rideStep, type RideWater } from '@/components/zona-sul/surf/surf-ride';
import { SERIES, SurfScheduler, waveLife } from '@/components/zona-sul/surf/surf-scheduler';

/* Pedro 30/10: "no meio de Copacabana existe uma onda famosa chamada Sorriso (na vida real, na ressaca)… quebra
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
  it('lá fora quebra GRANDE com o formato NORMAL de quebra (véu): o lip lança e fecha em espuma COM VOLUME', () => {
    // Pedro 30/10: "está quebrando sem fazer o véu, parece uma montanha de água — pode quebrar normal"
    const qOut = SORRISO.BREAK_Q + 30, st = waveStateAt(ageAt(qOut), V, SORRISO);
    expect(st.h).toBeGreaterThan(6);                       // grande (o Arpoador vai a 6,3)
    expect(st.reform).toBe(0);
    // na boca da abertura o lip já lançou por completo (formato de quebra, igual ao Arpoador)…
    const d = st.peelR, mouth = barrelAt(d - 20, st, V, SORRISO);
    expect(curlOf(mouth.open, mouth.closed, mouth.ramp, mouth.shape).curl).toBeGreaterThan(0.95);
    expect(curlOf(mouth.open, mouth.closed, mouth.ramp, mouth.shape).blend).toBeGreaterThan(0.5);
    // …e no pico já fechou em espuma — que baixa só 35% ("mais volume", era 65%)
    const b = barrelAt(0, st, V, SORRISO);
    expect(b.closed).toBeGreaterThan(0.9);
    expect(SORRISO.CLOSED_DROP).toBeLessThan(ARPOADOR.CLOSED_DROP);
    expect(surfChurnAt(0, crestQ(st, 0, SORRISO) + 2, [st], [V], [150, 150], SORRISO)).toBeGreaterThan(0.3);
  });
  it('costas em RAMPA descendo (não "retão"): atrás da crista a onda desce bem mais devagar que no Arpoador', () => {
    // Pedro 30/10: "atrás dela está meio reto — pode ter mais volume em formato de rampa descendo"
    const qOut = SORRISO.BREAK_Q - 10, st = waveStateAt(ageAt(qOut), V, SORRISO), lim: Lim = [150, 150];
    const top = surfHeightAt(0, crestQ(st, 0, SORRISO), [st], [V], Infinity, lim, SORRISO);
    const back = surfHeightAt(0, crestQ(st, 0, SORRISO) - 14, [st], [V], Infinity, lim, SORRISO);
    expect(back / top).toBeGreaterThan(0.4);               // 14 m atrás ainda tem volume (no Arpoador sobra ~2%)
    expect(SORRISO.BACK_W).toBeGreaterThan(ARPOADOR.BACK_W * 2);
  });
  it('vai se formando: a espuma se DESFAZ chegando perto da beira (antes da 2ª quebra a onda está inteira de novo)', () => {
    const inner = SORRISO.INNER[0]!, st = waveStateAt(ageAt(inner.Q - 0.5), V, SORRISO);
    expect(st.reform).toBeGreaterThan(0.95);
    expect(barrelAt(0, st, V, SORRISO).closed).toBeLessThan(0.05);
  });
  it('antes da beira ABRE UM TUBO (dá pra entrar) e morre na areia', () => {
    const inner = SORRISO.INNER[SORRISO.INNER.length - 1]!;
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
    expect(ARPOADOR).toMatchObject({ ...SURF, CURL_OUT: 1, INNER: [] });
  });
  it('ondas da série nunca encostam (distância > faixa do tubo da maior onda) e cada uma vive ~1 min', () => {
    const maxBand = barrelBand(SORRISO.H_MAX * 1.25 * 1.08);
    expect(SORRISO_SERIES.GAP_MIN * SORRISO.C).toBeGreaterThan(maxBand.wf + maxBand.wb);
    expect(waveLife(SORRISO)).toBeGreaterThan(100); expect(waveLife(SORRISO)).toBeLessThan(125); // vem do fundo (~350 m)
    expect(SORRISO.C).toBe(ARPOADOR.C); // "está meio rápida demais" → a mesma velocidade do Arpoador
  });
  it('agenda desligada não começa série nova (as que vinham terminam); ligada vem série', () => {
    const off = new SurfScheduler(1, SORRISO, SORRISO_SERIES); off.enabled = false;
    for (let i = 0; i < 600; i++) off.advance(0.1);
    expect(off.states.some((s) => s.active)).toBe(false);
    expect(off.trigger()).toBe(false);
    off.enabled = true;
    for (let i = 0; i < 40; i++) off.advance(0.1);
    expect(off.states.some((s) => s.active)).toBe(true);
  });
});

describe('Sorriso — 2ª seção mais cedo e de trás; surfar a espuma e emendar', () => {
  it('TRÊS seções (176 / 112 / 48 m da areia), vindo do FUNDO (~350 m); chega gorda na beira (~5 m)', () => {
    // Pedro 30/10 (desenho): "são 3 seções e olha o fundo que ela vem"; antes: "a 2ª seção demora, pode vir mais de trás"
    expect([SORRISO.BREAK_Q, ...SORRISO.INNER.map((x) => x.Q)].map((q) => SORRISO_SHORE_Q - q)).toEqual([176, 112, 48]);
    expect(SORRISO_SHORE_Q - SORRISO.Q_MIN).toBe(350);
    expect(waveStateAt(ageAt(SORRISO.INNER[1]!.Q), V, SORRISO).h).toBeGreaterThan(4.5);
    // cada seção se refaz da espuma da anterior: logo antes de quebrar a seção k, a anterior já não tem espuma
    for (const sec of SORRISO.INNER) expect(barrelAt(0, waveStateAt(ageAt(sec.Q - 0.5), V, SORRISO), V, SORRISO).closed).toBeLessThan(0.05);
    // e entre elas a espuma da seção anterior existe (quebrou mesmo)
    expect(barrelAt(0, waveStateAt(ageAt(SORRISO.INNER[0]!.Q + 20), V, SORRISO), V, SORRISO).closed).toBeGreaterThan(0.9);
  });
  it('EM PÉ na espuma do Sorriso não toma vaca (ela te leva); deitado/levantando sim; no Arpoador tudo como antes', () => {
    const ax = { qx: 0, qz: 1, sx: 1, sz: 0 }, foam: RideWater = { pushX: 0, pushZ: 3, churn: 0.9, surfY: 1, gradX: 0, gradZ: 0, foamRide: true };
    const r = newRide(); r.mode = 'ride'; r.speed = RIDE.S_CRUISE;
    rideStep(r, { dirX: 0, dirZ: 0, pop: false, fast: false }, foam, ax, 3.2, 0.05);
    expect(r.mode).toBe('ride'); expect(r.trick).toContain('espuma');
    const arp = newRide(); arp.mode = 'ride'; arp.speed = RIDE.S_CRUISE;
    rideStep(arp, { dirX: 0, dirZ: 0, pop: false, fast: false }, { ...foam, foamRide: false }, ax, 3.2, 0.05);
    expect(arp.mode).toBe('wipe');
    const lying = newRide();
    rideStep(lying, { dirX: 0, dirZ: 0, pop: false, fast: false }, foam, ax, 3.2, 0.05);
    expect(lying.mode).toBe('wipe');
  });
  it('EMENDA: em pé na espuma da 1ª seção, segurando perto da crista, atravessa as seções sem vaca até a da beira', () => {
    // Pedro 30/10: "dá pra ficar ali pela espuma em pé e emendar na próxima seção?"
    const lim: Lim = [150, 150], ax = { qx: 0, qz: 1, sx: 1, sz: 0 }, dt = 0.05, wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const run = (foamRide: boolean) => {
      let age = ageAt(SORRISO.BREAK_Q + 20), st = waveStateAt(age, V, SORRISO);
      let s = 15, q = crestQ(st, s, SORRISO) + 2;
      const r = newRide(); r.mode = 'ride'; r.speed = RIDE.S_CRUISE; r.yaw = Math.atan2(1, 0.2);
      let wiped = false, maxChurn = 0, dir = 1;
      while (st.active && st.qc < SORRISO.INNER[SORRISO.INNER.length - 1]!.Q + 2) {
        age += dt; st = waveStateAt(age, V, SORRISO);
        const surfY = surfHeightAt(s, q, [st], [V], Infinity, lim, SORRISO), yRef = surfY + 0.3, e = 0.5;
        const churn = surfChurnAt(s, q, [st], [V], lim, SORRISO); maxChurn = Math.max(maxChurn, churn);
        const w: RideWater = {
          pushX: 0, pushZ: surfPushAt(s, q, [st], [V], lim, yRef, SORRISO), churn, surfY, side: 1, foamRide,
          gradX: (surfHeightAt(s + e, q, [st], [V], yRef, lim, SORRISO) - surfHeightAt(s - e, q, [st], [V], yRef, lim, SORRISO)) / (2 * e),
          gradZ: (surfHeightAt(s, q + e, [st], [V], yRef, lim, SORRISO) - surfHeightAt(s, q - e, [st], [V], yRef, lim, SORRISO)) / (2 * e),
        };
        // o jogador segura perto da crista: aponta ao longo da onda, subindo/descendo pra ficar ~2 m à frente dela, e
        // faz a curva de volta antes de sair pela lateral da zona (como quem surfa de verdade)
        if (s > 70) dir = -1; else if (s < -70) dir = 1;
        const x = q - crestQ(st, s, SORRISO), k = Math.max(-0.8, Math.min(0.8, -(x - 2) * 0.3));
        const want = Math.atan2(dir, k), steer = Math.max(-1, Math.min(1, -wrap(want - r.yaw) * 3));
        const d = rideStep(r, { dirX: 0, dirZ: 0, pop: false, fast: false, steer, throttle: 0 }, w, ax, SORRISO.C, dt);
        s += d.dx; q += d.dz;
        if ((r.mode as string) === 'wipe') wiped = true;
      }
      return { wiped, standing: r.mode === 'ride', near: Math.abs(q - crestQ(st, s, SORRISO)) < 12, maxChurn };
    };
    const sorriso = run(true);
    expect(sorriso.maxChurn).toBeGreaterThan(RIDE.WIPE_CHURN); // passou mesmo pela espuma forte
    expect(sorriso.wiped).toBe(false);
    expect(sorriso.standing).toBe(true);
    expect(sorriso.near).toBe(true);                           // emendou até a seção da beira, junto da onda
    expect(run(false).wiped).toBe(true);                        // sem a regra (Arpoador): a espuma derrubava
  });
});

describe('Sorriso — mesmo tempo do Arpoador', () => {
  it('sempre ligado, com a MESMA agenda de séries do Arpoador (sem janela de ressaca)', () => {
    // Pedro 30/10: "as ondas do Sorriso não aparecem mais — está com tempo grande de intervalo? só ajustar o mesmo tempo do Arpoador"
    expect(SORRISO_SERIES).toBe(SERIES);
    const src = fs.readFileSync('src/components/zona-sul/surf/sorriso-break.tsx', 'utf8');
    expect(src).not.toContain('enabled=');
    expect(fs.existsSync('src/components/zona-sul/zs-ressaca.ts')).toBe(false);
    const sch = new SurfScheduler(20261030, SORRISO, SORRISO_SERIES);
    for (let i = 0; i < 120; i++) sch.advance(0.1); // 12 s: a 1ª série já começou (FIRST_AT 10 s)
    expect(sch.states.some((st) => st.active)).toBe(true);
  });
});
