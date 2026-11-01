import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_ROAD_MASK, ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsNavigable, zsSwimmable } from '@/components/zona-sul/zs-world-profile';
import { hullFits, newWarship, WARSHIP, warshipStep } from '@/components/zona-sul/zs-warship';

/* Pedro 01/11: "o canal do Jardim de Alah um pouco mais fundo, mais água ali pra passar o navio — não precisa arrombar,
   pode passar um navio apenas por vez, mas com uma sobrinha normal boa". Conferido no MAPA DE VERDADE (o PNG do jogo)
   com a MESMA física do navio: ele entra do mar, atravessa o canal e chega no meio da Lagoa — e volta. */
let t: ZsTerrain;
let road: { data: Buffer; w: number; c: number };
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  const r = await sharp(fs.readFileSync('public' + ZS_ROAD_MASK.url)).raw().toBuffer({ resolveWithObject: true });
  road = { data: r.data, w: r.info.width, c: r.info.channels };
});

/** rota do mar ao meio da Lagoa pelo canal (x leste, z sul) */
const ROUTE: [number, number][] = [[-224, 470], [-224, 420], [-223, 372], [-223, 340], [-205, 280], [-205, 268], [-206, 240], [-200, 200], [-180, 150], [-160, 110]];

/** Piloto simples (persegue um ponto 18 m à frente na rota) com a física do jogo. Devolve se chegou e quantos s levou. */
function sail(route: [number, number][], yaw0: number, maxS = 300) {
  const swim = (x: number, z: number) => zsNavigable(t, x, z, WARSHIP.MIN_DEPTH);
  const [sx, sz] = route[0]!, [ex, ez] = route[route.length - 1]!;
  const s = newWarship(sx, sz, yaw0);
  expect(hullFits(swim, s.x, s.z, s.yaw)).toBe(true);
  const dt = 1 / 30;
  let seg = 0;
  for (let k = 0; k < maxS / dt; k++) {
    // ponto mais perto na rota (a partir do trecho atual) + 18 m adiante
    let best = Infinity, bi = seg, bu = 0;
    for (let i = seg; i < Math.min(route.length - 1, seg + 3); i++) {
      const [ax, az] = route[i]!, [bx, bz] = route[i + 1]!, vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const u = Math.max(0, Math.min(1, ((s.x - ax) * vx + (s.z - az) * vz) / l2));
      const d = Math.hypot(s.x - ax - vx * u, s.z - az - vz * u);
      if (d < best) { best = d; bi = i; bu = u; }
    }
    seg = bi;
    let left = 18, i = bi, u = bu, tx = ex, tz = ez;
    while (i < route.length - 1) {
      const [ax, az] = route[i]!, [bx, bz] = route[i + 1]!, len = Math.hypot(bx - ax, bz - az), rest = len * (1 - u);
      if (rest >= left) { const f = u + left / len; tx = ax + (bx - ax) * f; tz = az + (bz - az) * f; break; }
      left -= rest; i++; u = 0;
    }
    let diff = Math.atan2(tx - s.x, tz - s.z) - s.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steer = Math.max(-1, Math.min(1, -diff * 3));
    warshipStep(swim, s, { throttle: Math.abs(diff) > 0.5 ? 0.15 : 0.55, steer }, dt);
    if (Math.hypot(s.x - ex, s.z - ez) < 14) return { ok: true, secs: k * dt, at: { x: s.x, z: s.z } };
  }
  return { ok: false, secs: maxS, at: { x: s.x, z: s.z } };
}

describe('canal do Jardim de Alah navegável', () => {
  it('o navio entra do mar, atravessa o canal e chega no meio da Lagoa', () => {
    const r = sail(ROUTE, Math.PI); // proa pro norte
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  });

  it('chegando TORTO do mar e pilotando "no olho" (sem antecipar a curva) não encalha: boca em funil + casco raspa e segue', () => {
    // piloto desajeitado: mira SÓ o próximo ponto (sem olhar à frente) e vem 28 m de lado, em diagonal
    const swim = (x: number, z: number) => zsNavigable(t, x, z, WARSHIP.MIN_DEPTH);
    const pts: [number, number][] = [[-223, 395], [-223, 372], [-223, 340], [-205, 280], [-205, 262], [-206, 240], [-200, 200], [-180, 150]];
    const s = newWarship(-195, 455, Math.PI + 0.45);
    expect(hullFits(swim, s.x, s.z, s.yaw)).toBe(true);
    let i = 0, stuck = 0, worstStuck = 0;
    const dt = 1 / 30;
    for (let k = 0; k < 400 / dt && i < pts.length; k++) {
      const [tx, tz] = pts[i]!;
      if (Math.hypot(tx - s.x, tz - s.z) < 9) { i++; continue; }
      let diff = Math.atan2(tx - s.x, tz - s.z) - s.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const x0 = s.x, z0 = s.z;
      warshipStep(swim, s, { throttle: 1, steer: diff > 0.05 ? -1 : diff < -0.05 ? 1 : 0 }, dt);
      if (Math.hypot(s.x - x0, s.z - z0) < 0.01) { stuck++; worstStuck = Math.max(worstStuck, stuck); } else stuck = 0;
    }
    expect(i, `parou antes do ponto ${i} em (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`).toBe(pts.length);
    expect(worstStuck * dt).toBeLessThan(2); // nunca fica mais de 2 s parado
  });

  it('e volta da Lagoa pro mar', () => {
    const back = [...ROUTE].reverse() as [number, number][];
    const [ax, az] = back[0]!, [bx, bz] = back[1]!;
    const r = sail(back, Math.atan2(bx - ax, bz - az));
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  });

  /** eixo do canal no trecho estreito (das avenidas do Jardim de Alah até a areia) */
  const axisX = (z: number) => (z <= 280 ? -205 : z <= 340 ? -205 + (z - 280) * (-18 / 60) : -223);

  it('"um navio por vez com sobrinha": no trecho estreito (entre as avenidas e na praia) a água navegável tem ~2 m de folga de cada lado do casco e a água à vista fica em ~16–19 m (não arromba)', () => {
    const beam = WARSHIP.LENGTH * 0.12 * 2; // a boca que o casco confere (7,7 m)
    let navMin = Infinity, wetMax = 0, wetSum = 0, n = 0;
    for (let z = 276; z <= 368; z += 2) {
      const cx = axisX(z);
      let nav = 0, wet = 0;
      for (let x = cx - 16; x <= cx + 16; x += 0.25) {
        if (zsNavigable(t, x, z, WARSHIP.MIN_DEPTH)) nav += 0.25;
        if (zsHeightAt(t, x, z) < 0) wet += 0.25;
      }
      navMin = Math.min(navMin, nav); wetMax = Math.max(wetMax, wet); wetSum += wet; n++;
    }
    expect(navMin).toBeGreaterThanOrEqual(beam + 2 * 2); // medido: 12,25 m (casco 7,7 → 2,3 m de cada lado)
    expect(wetMax).toBeLessThanOrEqual(20);              // medido: 19,25 no pior ponto (a grade de 4 m na diagonal)
    expect(wetSum / n).toBeLessThanOrEqual(18);          // medido: ~17 m em média
  });

  it('tubarão continua só no mar (canal e Lagoa não são dele); a margem da Lagoa segue rasa como era', () => {
    expect(zsSwimmable(t, -213, 320)).toBe(false);
    expect(zsSurfAt(t, -213, 320)).toBe(ZS_SURF.lagoon);
    expect(zsSwimmable(t, -150, 120)).toBe(false);
    expect(zsNavigable(t, -150, 120, WARSHIP.MIN_DEPTH)).toBe(true);
    // beirinha da Lagoa (a ~6 m da margem oeste, longe do canal): fundura de antes (≤ 1,2 m)
    expect(-zsHeightAt(t, -226, 150)).toBeLessThan(1.6);
  });

  it('não sobra rua pintada no fundo do canal (a pista para antes da beira d\'água)', () => {
    let wetRoad = 0, checked = 0;
    for (let v = 256; v <= 366; v++) for (let u = -240; u <= -185; u++) {
      const x = u + 0.5, z = v + 0.5; // centro do pixel do mapa das ruas (1 m)
      if (Math.abs(x - axisX(z)) > 12 || zsHeightAt(t, x, z) >= 0) continue;
      checked++;
      const pu = Math.floor(x - ZS_ROAD_MASK.x0), pv = Math.floor(z - ZS_ROAD_MASK.z0);
      if (road.data[(pv * road.w + pu) * road.c]! > 0) wetRoad++;
    }
    expect(checked).toBeGreaterThan(1500);
    expect(wetRoad).toBe(0);
  });
});
