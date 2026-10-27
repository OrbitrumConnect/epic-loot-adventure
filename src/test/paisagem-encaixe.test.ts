import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP_EDGE_R, MAP_EDGE_SEG, MAP_EDGE_START, MAP_EDGE_Y, MAP_PLATEAU_MASK } from '@/components/world/map-edge-contour';

/* 27/10 — paisagem de fundo encaixada na BORDA REAL da ilha GLB (antes: quadrado fixo a 102 m, por cima da ilha que vai
   até 115–190 m, e fresta nas diagonais). Contorno + máscara gerados por tools/bake-map-edge.mjs (0 fresta, 0 lábio). */
describe('paisagem de fundo encaixada na ilha', () => {
  it('contorno: 720 direções; começo DENTRO da borda; borda entre 110 e 195 m; altura da emenda plausível', () => {
    for (const arr of [MAP_EDGE_R, MAP_EDGE_START, MAP_EDGE_Y]) expect(arr).toHaveLength(MAP_EDGE_SEG);
    expect(MAP_EDGE_SEG).toBe(720);
    MAP_EDGE_R.forEach((r, i) => {
      expect(MAP_EDGE_START[i]!).toBeLessThan(r);
      expect(r).toBeGreaterThan(110);
      expect(r).toBeLessThan(195);
      expect(MAP_EDGE_Y[i]!).toBeGreaterThan(-6);
      expect(MAP_EDGE_Y[i]!).toBeLessThan(1);
    });
  });
  it('geometria: 1ª volta no começo medido, emenda na ALTURA da borda, relevo só depois', async () => {
    const { buildRingGeometry, ringHeight } = await import('@/components/world/distant-landscape');
    const c = new Proxy({}, { get: () => '#808080' }) as never;
    const g = buildRingGeometry(c);
    const pos = g.getAttribute('position');
    const fineCount = (MAP_EDGE_SEG + 1) * 3; // 3 voltas finas por direção (começo, emenda, 5 m)
    for (const k of [0, 90, 180, 360, 540, 719]) {
      const a = k / MAP_EDGE_SEG * Math.PI * 2;
      expect(Math.hypot(pos.getX(k * 3), pos.getZ(k * 3))).toBeCloseTo(MAP_EDGE_START[k]!, 3);
      const i1 = k * 3 + 1; // volta 1 = emenda
      expect(Math.hypot(pos.getX(i1), pos.getZ(i1))).toBeCloseTo(MAP_EDGE_R[k]! + 0.3, 3);
      expect(pos.getY(i1)).toBeCloseTo(MAP_EDGE_Y[k]!, 4);
      expect(ringHeight(a, 0, MAP_EDGE_Y[k]!)).toBeCloseTo(MAP_EDGE_Y[k]!, 6);
    }
    // o anel nunca invade o meio da ilha: finas a partir do começo medido; grossas além da borda
    for (let v = 0; v < pos.count; v++) {
      const r = Math.hypot(pos.getX(v), pos.getZ(v));
      if (v < fineCount) expect(r).toBeGreaterThanOrEqual(MAP_EDGE_START[Math.floor(v / 3) % MAP_EDGE_SEG]! - 1e-3);
      else expect(r).toBeGreaterThan(Math.min(...MAP_EDGE_R));
    }
  });
  it('LEVE (fora da área de acesso): ≤ 10 mil triângulos (o quadrado antigo tinha ~12 mil) e nada além de 260 m', async () => {
    const { buildRingGeometry, MAX_R } = await import('@/components/world/distant-landscape');
    const g = buildRingGeometry(new Proxy({}, { get: () => '#808080' }) as never);
    expect(g.getIndex()!.count / 3).toBeLessThanOrEqual(10_000);
    const pos = g.getAttribute('position');
    let maxR = 0;
    for (let v = 0; v < pos.count; v++) maxR = Math.max(maxR, Math.hypot(pos.getX(v), pos.getZ(v)));
    expect(maxR).toBeLessThanOrEqual(MAX_R + 0.5);
    expect(MAX_R).toBe(260);
  });
  it('máscara do platô existe e bate com o tamanho declarado (0,5 m por pixel)', () => {
    const png = fs.readFileSync('public' + MAP_PLATEAU_MASK.url);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16) * 0.5).toBe(MAP_PLATEAU_MASK.w);
    expect(png.readUInt32BE(20) * 0.5).toBe(MAP_PLATEAU_MASK.h);
  });
  it('ligado: o anel não desenha onde há platô e fica escondido até a máscara carregar', () => {
    const src = fs.readFileSync('src/components/world/distant-landscape.tsx', 'utf8');
    expect(src).toMatch(/if \(uMaskOn < 0\.5\) discard;/);
    expect(src).toMatch(/texture2D\(uPlatMask, muv\)\.r > 0\.5\) discard;/);
    expect(src).not.toMatch(/MAP_HALF \+ 12/); // o quadrado fixo de 102 m saiu
    expect(src).toMatch(/THREE\.RedFormat/);   // máscara em 1 canal na placa de vídeo
  });
});
