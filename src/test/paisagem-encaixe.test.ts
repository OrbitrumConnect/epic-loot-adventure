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
    const cols = MAP_EDGE_SEG + 1;
    for (const k of [0, 90, 180, 360, 540, 719]) {
      const a = k / MAP_EDGE_SEG * Math.PI * 2;
      const r0 = Math.hypot(pos.getX(k), pos.getZ(k));
      expect(r0).toBeCloseTo(MAP_EDGE_START[k]!, 3);
      const i1 = cols + k; // volta 1 = emenda
      expect(Math.hypot(pos.getX(i1), pos.getZ(i1))).toBeCloseTo(MAP_EDGE_R[k]! + 0.3, 3);
      expect(pos.getY(i1)).toBeCloseTo(MAP_EDGE_Y[k]!, 4);
      expect(ringHeight(a, 0, MAP_EDGE_Y[k]!)).toBeCloseTo(MAP_EDGE_Y[k]!, 6);
    }
    // nenhum vértice entra além do começo medido (o anel nunca invade o meio da ilha)
    for (let v = 0; v < pos.count; v++) {
      const k = (v % cols) % MAP_EDGE_SEG;
      expect(Math.hypot(pos.getX(v), pos.getZ(v))).toBeGreaterThanOrEqual(MAP_EDGE_START[k]! - 1e-3);
    }
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
  });
});
