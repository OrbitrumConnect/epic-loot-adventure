import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barrelAt, barrelBand, branchOf, crestQ, FULL, SURF, surfHeightAt, surfPoint, surfPushAt, TUBE, tubeAx, type WaveState, type WaveVar, waveStateAt } from '@/components/zona-sul/surf/surf-wave';
import { SERIES, SERIES_GROW, SERIES_GROW_MAX, SurfScheduler, WAVE_LIFE } from '@/components/zona-sul/surf/surf-scheduler';
import { findSurfFrame, toSurfLocal } from '@/components/zona-sul/surf/surf-frame';
import { decodeTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SPAWN, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';

/* 28/10 — MOTOR DE SURF fase B (documento do Pedro): onda A-frame com 2 tubos OCOS, abertura pros dois lados, espuma,
   séries a cada ~180 s com 3–5 ondas, 5 vagas fixas, zona no Arpoador em água aberta. Só na Zona Sul. */
const V: WaveVar = { hR: 1, hL: 1, vR: 1.1, vL: 0.9 };
const ageAtBreak = (SURF.BREAK_Q - SURF.Q_MIN) / SURF.C;

describe('surf — onda e tubo', () => {
  it('vida ~82 s (veloz, quebra mais atrás e vem até a beirada, 28/10); quebra no pico; abre pros DOIS lados com velocidades diferentes (sem espelho perfeito)', () => {
    expect(WAVE_LIFE).toBeGreaterThan(78); expect(WAVE_LIFE).toBeLessThan(86);
    const before = waveStateAt(ageAtBreak - 1, V), after = waveStateAt(ageAtBreak + 3, V);
    expect(before.peelR).toBe(0); expect(before.peelL).toBe(0);
    expect(after.peelR).toBeGreaterThan(after.peelL);             // direita 10% mais rápida, esquerda 10% mais lenta
    expect(after.peelL).toBeGreaterThan(0);
    expect(branchOf(5)).toBe('direita'); expect(branchOf(-5)).toBe('esquerda');
  });
  it('TUBO OCO: perto do pico, logo depois de abrir, há água POR CIMA da cavidade (lip projetado), não só altura', () => {
    const st = waveStateAt(ageAtBreak + 1.5, V);
    const b = barrelAt(1, st, V);
    expect(b.open).toBeGreaterThan(0.9); expect(b.closed).toBe(0);
    // percorre a seção (q0 do mar pra praia) e acha um trecho onde a superfície "volta" (q diminui) bem no alto = dobra
    const pts: number[][] = [];
    for (let q0 = st.qc - 12; q0 <= st.qc + 10; q0 += 0.1) pts.push(surfPoint(1, q0, [st], [V]).slice());
    let overhang = false;
    for (let i = 1; i < pts.length; i++) if (pts[i]![2]! < pts[i - 1]![2]! - 0.02 && pts[i]![1]! > 1.5) overhang = true;
    expect(overhang).toBe(true);
    const band = barrelBand(b.hSide);
    expect(band.r).toBeGreaterThan(1.2); // tubo de verdade: onda de 3 m → ~2,7 m de vão por dentro
    // o tubo CABE na onda (28/10: com raio 0,85h saía um "salsichão" com o dobro da altura da onda)
    const top = Math.max(...pts.map(p => p[1]!));
    expect(top).toBeLessThan(b.hSide * 1.2); expect(top).toBeGreaterThan(b.hSide * 0.85);
  });
  it('fecha atrás da abertura e vira ESPUMA; nada de rachadura: vizinhos da malha nunca se separam muito', () => {
    const st = waveStateAt(ageAtBreak + 8, V);
    const near = barrelAt(0, st, V), edge = barrelAt(st.peelR - 2, st, V);
    expect(near.closed).toBeGreaterThan(0.9);                    // perto do pico já fechou
    expect(edge.open).toBeGreaterThan(0.2); expect(edge.closed).toBe(0); // na frente da abertura ainda é tubo
    let foam = 0;
    for (let q0 = st.qc - 8; q0 <= st.qc + 6; q0 += 0.5) foam = Math.max(foam, surfPoint(0, q0, [st], [V])[3]!);
    expect(foam).toBeGreaterThan(0.6);
    // continuidade: passo de 0,35 m na malha → os pontos nunca saltam mais que ~1,1 m (a dobra estica POR IGUAL, não rasga)
    for (const s of [-30, -10, -2, 2, 10, 30]) {
      let prev = surfPoint(s, SURF.Q_MIN, [st], [V]).slice();
      for (let q0 = SURF.Q_MIN + 0.35; q0 <= SURF.Q_MAX; q0 += 0.35) {
        const p = surfPoint(s, q0, [st], [V]);
        expect(Math.hypot(p[1]! - prev[1]!, p[2]! - prev[2]!)).toBeLessThan(1.1);
        prev = p.slice();
      }
    }
  });
  it('tubo AMENDOADO (mais largo que alto) e lip FINO; dá pra ENTRAR: dentro da cavidade o nível é o chão, por fora é o topo', () => {
    const st = waveStateAt(ageAtBreak + 2, V), b = barrelAt(2, st, V), R = barrelBand(b.hSide).r;
    expect(tubeAx(R)).toBeGreaterThanOrEqual(1.5); expect(tubeAx(2)).toBeGreaterThan(tubeAx(1)); // onda maior joga o lip mais longe expect(TUBE.LIP).toBeLessThanOrEqual(0.16);
    const xIn = st.qc + TUBE.CQ * R;                                // meio da cavidade
    const top = surfHeightAt(2, xIn, [st], [V]);                    // sem altura de referência: topo (carro passa por cima)
    const inside = surfHeightAt(2, xIn, [st], [V], 0.2);            // nadando lá embaixo: chão do tubo
    expect(top).toBeGreaterThan(R * 1.8);
    expect(inside).toBeLessThan(0.5);
    expect(surfHeightAt(2, xIn, [st], [V], top - 0.1)).toBeGreaterThan(R * 1.8); // quem está em cima continua em cima
  });
  it('a onda LEVA quem está na crista quando quebra (Pedro: "só passou por mim") — vai junto até perto da areia', () => {
    // boiando na crista, 10 m à esquerda do pico, na hora que quebra; a água leva (carry 1, sem nadar)
    let age = ageAtBreak + 1, st = waveStateAt(age, V), q = st.qc;
    const q0 = q, dt = 1 / 30;
    for (let k = 0; k < 30 * 15; k++) { q += surfPushAt(-10, q, [st], [V]) * dt; age += dt; st = waveStateAt(age, V); }
    const R = barrelBand(st.h).r, x = q - st.qc;
    expect(q - q0).toBeGreaterThan(SURF.C * 15 * 0.8);             // andou quase tudo que a onda andou em 15 s
    expect(x).toBeGreaterThan(-2 * R); expect(x).toBeLessThan(4 * R); // continua no bolso da frente da onda
  });
  it('DENTRO do tubo sem tranco ("leve colisão"): água lisa, entra/sai atravessando a cortina, anda JUNTO com a onda', () => {
    const st = waveStateAt(ageAtBreak + 3, V), s = -6, R = barrelBand(barrelAt(s, st, V).hSide).r;
    const crest = crestQ(st, s), y = 0.2;                            // nadando lá embaixo
    const x0 = TUBE.CQ * R - 0.9 * tubeAx(R) * R;                    // dentro, junto da face (atrás dela é a massa da onda)
    let prev = surfHeightAt(s, crest + x0, [st], [V], y), maxJump = 0;
    for (let x = x0; x <= 3 * tubeAx(R) * R; x += 0.25) {
      const h = surfHeightAt(s, crest + x, [st], [V], y);
      maxJump = Math.max(maxJump, Math.abs(h - prev)); prev = h;
      if (x > 0 && x < tubeAx(R) * R) expect(h).toBeLessThan(0.3);   // da cavidade até a cortina: água baixa (passa)
    }
    expect(maxJump).toBeLessThan(0.6);                               // nada de pulo pro topo do lip no meio do caminho
    const inside = surfPushAt(s, crest + 0.3 * R, [st], [V], FULL, y);
    expect(Math.abs(inside - SURF.C)).toBeLessThan(0.35);            // dentro: só anda junto (nada livre)
  });
  it('a face é uma RAMPA que anda: na face da frente a gravidade leva pra praia; nas costas não empurra', () => {
    const st = waveStateAt(ageAtBreak - 4, V), R = barrelBand(st.h).r; // empinando, antes de quebrar
    const face = surfPushAt(-30, st.qc + 1.2 * R, [st], [V]), back = surfPushAt(-30, st.qc - 2 * R, [st], [V]);
    expect(face).toBeGreaterThan(back);
    expect(face).toBeGreaterThan(SURF.C * 0.8);
  });
  it('a onda EMPURRA rumo à praia: espuma forte (~velocidade da onda), ondulação longe quase nada', () => {
    const st = waveStateAt(ageAtBreak + 8, V), R = barrelBand(st.h).r;
    expect(surfPushAt(0, st.qc + R, [st], [V])).toBeGreaterThan(SURF.C * 0.8); // espuma já fechada no pico: ~velocidade da onda
    expect(surfPushAt(0, st.qc + 40, [st], [V])).toBeLessThan(0.05);                 // longe na frente: nada
    const swell = waveStateAt(ageAtBreak - 20, V);
    expect(surfPushAt(0, swell.qc, [swell], [V])).toBeLessThan(SURF.C * 0.3);       // ondulação sem quebrar: só um embalo
  });
  it('malha: a FRENTE dos triângulos é o lado do ar (normal pra cima no mar liso) — senão a luz sai invertida', async () => {
    const { buildSurfGeometry } = await import('@/components/zona-sul/surf/surf-break');
    const g = buildSurfGeometry(false), rest = g.getAttribute('aRest'), idx = g.getIndex()!;
    // mundo = pico + S·s + Q·q, com S = (−qz, qx) (mesma convenção do surf-frame); aqui Q = +z
    const W = (k: number) => [-rest.getX(k), 0, rest.getY(k)] as const;
    for (const t of [0, 7, idx.count / 3 - 1]) {
      const a = W(idx.getX(t * 3)), b = W(idx.getX(t * 3 + 1)), c = W(idx.getX(t * 3 + 2));
      const e1 = [b[0] - a[0], b[2] - a[2]], e2 = [c[0] - a[0], c[2] - a[2]];
      expect(e1[1]! * e2[0]! - e1[0]! * e2[1]!).toBeGreaterThan(0);   // (e1 × e2).y
    }
    g.dispose();
  });
  it('bordas da zona: superfície volta ao nível do mar (sem degrau com o mar em volta)', () => {
    const st: WaveState = waveStateAt(ageAtBreak + 2, V);
    expect(Math.abs(surfPoint(SURF.ZONE_S, 0, [st], [V])[1]!)).toBeLessThan(1e-6);
    expect(Math.abs(surfPoint(0, SURF.Q_MIN, [st], [V])[1]!)).toBeLessThan(1e-6);
    expect(Math.abs(surfHeightAt(0, SURF.Q_MAX, [st], [V]))).toBeLessThan(1e-6);
  });
});

describe('surf — séries', () => {
  it('ondas da série nunca encostam: distância mínima entre elas > faixa do tubo da maior onda possível (sem rachadura)', () => {
    const band = barrelBand(SURF.H_MAX * 1.08 * SERIES_GROW_MAX);   // a maior onda da série (3ª) com +8% de um lado
    expect(SERIES.GAP_MIN * SURF.C).toBeGreaterThan(band.wf + band.wb);
  });
  it('séries de 3–5 ondas; CALMARIA de 45–60 s depois da última onda (Pedro: "uns 45 s, 1 min"); NUNCA sobrepõe; 5 vagas', () => {
    const sc = new SurfScheduler(7);
    const band = barrelBand(SURF.H_MAX * 1.08 * SERIES_GROW_MAX), minSep = band.wf + band.wb;
    const seen = new Set<number>(), births: number[] = [];
    let closest = Infinity;
    for (let k = 0; k < 10 * 1800; k++) {                         // 30 min de jogo
      sc.advance(0.1);
      for (const b of sc.births) if (b > -1e8 && b <= sc.clock && !seen.has(b)) { seen.add(b); births.push(b); }
      const S = sc.states;
      for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (S[i]!.active && S[j]!.active) closest = Math.min(closest, Math.abs(S[i]!.qc - S[j]!.qc));
    }
    expect(closest).toBeGreaterThan(minSep);                       // duas ondas vivas nunca encostam
    births.sort((a, b) => a - b);
    const gaps = births.slice(1).map((b, i) => b - births[i]!);
    const calms = gaps.filter((g) => g > SERIES.GAP_MAX + 0.01);   // intervalo entre séries
    expect(sc.seriesCount).toBeGreaterThanOrEqual(15);             // ~1 série por ~1,5 min (antes: 1 a cada 3 min)
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(SERIES.GAP_MIN - 0.06);
    for (const c of calms) { expect(c).toBeGreaterThanOrEqual(SERIES.CALM_MIN - 0.06); expect(c).toBeLessThanOrEqual(SERIES.CALM_MAX + 1.1); }
    expect(sc.births).toHaveLength(5);
  });
  it('a série CRESCE: 1ª normal, 2ª maior, 3ª maior ainda (a onda da série)', () => {
    expect(SERIES_GROW[0]).toBe(1);
    expect(SERIES_GROW[1]).toBeGreaterThan(SERIES_GROW[0]); expect(SERIES_GROW[2]).toBeGreaterThan(SERIES_GROW[1]);
    expect(SERIES_GROW_MAX).toBe(SERIES_GROW[2]);
    const sc = new SurfScheduler(11);
    while (sc.seriesCount === 0) sc.advance(0.1);
    while (sc.arriving()) sc.advance(0.1);
    const order = sc.births.map((b, i) => ({ b, h: (sc.vars[i]!.hR + sc.vars[i]!.hL) / 2 })).filter((o) => o.b > -1e8).sort((a, b) => a.b - b.b);
    expect(order.length).toBeGreaterThanOrEqual(3);
    expect(order[1]!.h).toBeGreaterThan(order[0]!.h * 0.98); expect(order[2]!.h).toBeGreaterThan(order[0]!.h * 1.1);
  });
  it('aba que volta não solta séries atrasadas (passo travado); J não chama série enquanto a atual ainda está chegando', () => {
    const sc = new SurfScheduler(3);
    sc.advance(600);                                              // "voltou depois de 10 min"
    expect(sc.clock).toBeCloseTo(SERIES.MAX_DT, 6);
    expect(sc.seriesCount).toBe(0);
    while (sc.seriesCount === 0) sc.advance(0.05);                 // 1ª série aos 10 s
    expect(sc.arriving()).toBe(true);
    expect(sc.trigger()).toBe(false);                              // ainda chegando: não sobrepõe
    while (sc.arriving()) sc.advance(0.05);
    while (!sc.trigger()) sc.advance(0.05);                        // assim que há vaga livre, J chama na hora
    sc.advance(0.05);
    expect(sc.seriesCount).toBe(2);
  });
});

describe('surf — zona no Arpoador (terreno de verdade)', () => {
  it('acha o pico perto da partida com a zona INTEIRA em água aberta e o eixo q apontando pra praia', async () => {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const t = decodeTerrain(data, info.width, info.height);
    const f = findSurfFrame(t, ZS_SPAWN.x, ZS_SPAWN.z)!;
    expect(f).not.toBeNull();
    expect(f.water).toBeGreaterThanOrEqual(0.97);
    expect(f.depth).toBeGreaterThan(2.5);
    const [, qSpawn] = toSurfLocal(f, ZS_SPAWN.x, ZS_SPAWN.z);
    expect(qSpawn).toBeGreaterThan(SURF.Q_OPEN + 20);              // a praia fica bem além de onde o tubo existe
    expect(SURF.Q_MAX).toBeGreaterThan(qSpawn - 15);               // e a espuma vem até a beira da areia (Pedro 28/10)
    expect(SURF.BREAK_Q).toBeLessThan(-45);                        // quebra bem mais atrás (2ª: "quebra muito à frente")
    // a Pedra do Arpoador fica à DIREITA de quem olha pra praia: desse lado a onda MORRE antes dela; o outro é mar aberto
    expect(f.lim[0]).toBeLessThan(SURF.ZONE_S); expect(f.lim[0]).toBeGreaterThanOrEqual(SURF.EDGE_S);
    expect(f.lim[1]).toBeGreaterThanOrEqual(150);                  // lado do Leblon: mar aberto — vai bem mais longe (29/10)
    const st = waveStateAt(ageAtBreak + 12, V);
    expect(surfPoint(f.lim[0] + 0.5, st.qc, [st], [V], [0, 0, 0, 0], f.lim)[1]).toBe(0); // passou do limite: mar liso
  }, 30_000);
});
