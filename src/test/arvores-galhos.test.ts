import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { ZS_TREE_H, ZS_VEG_DETAIL, ZS_VEG_NEAR, zsVegetationAround, zsVegGeometry } from '@/components/zona-sul/zs-vegetation';
import { farmTreeSize } from '@/components/world/harvest-nodes';
import { TREE_HEIGHT_K } from '@/components/world/world-kit';

/* Pedro 02/11: "as árvores de farm já são mais bonitas que as low poly do jogo — add mais delas? tamanhos variados?" ·
   "sem regressão, pro elite, sem perder FPS e performance". */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});
const tris = (k: Parameters<typeof zsVegGeometry>[0]) => zsVegGeometry(k).getAttribute('position').count / 3;

describe('mata com galhos (estilo da árvore de farm), leve', () => {
  it('orçamento: dossel perto ~400 tri (a de farm tem ~8,9 mil), médio < 200, baixa de cenário < 300', () => {
    expect(tris('canopy')).toBeGreaterThan(250);
    expect(tris('canopy')).toBeLessThan(450);
    expect(tris('canopyMid')).toBeLessThan(200);
    expect(tris('emergent')).toBeLessThan(450);
    expect(tris('farm')).toBeLessThan(300);
  });
  it('perto do herói: completo até 70 m, a MESMA árvore média até 150 m (mesma altura — não pula ao trocar)', () => {
    const hx = -300, hz = -150, items = zsVegetationAround(t, hx, hz);
    const d = (i: { x: number; z: number }) => Math.hypot(i.x - hx, i.z - hz);
    const near = items.filter((i) => i.kind === 'canopy'), mid = items.filter((i) => i.kind === 'canopyMid');
    expect(near.length).toBeGreaterThan(10); expect(mid.length).toBeGreaterThan(50);
    for (const i of near) expect(d(i)).toBeLessThan(ZS_VEG_DETAIL + 16);           // (a troca é pela célula de 16 m)
    for (const i of mid) { expect(d(i)).toBeGreaterThan(ZS_VEG_DETAIL - 16); expect(d(i)).toBeLessThan(ZS_VEG_NEAR + 16); }
    for (const i of [...near, ...mid]) { expect(i.h).toBeGreaterThanOrEqual(ZS_TREE_H.canopy[0]); expect(i.h).toBeLessThanOrEqual(ZS_TREE_H.canopy[1]); }
  });
});

describe('árvore de farm: porte variado', () => {
  it('~25% muda, ~55% normal, ~20% grande; a maior continua ABAIXO da mata de cenário (dá pra ver qual se colhe)', () => {
    const n = { muda: 0, normal: 0, grande: 0 };
    for (let s = 0; s < 4000; s++) { const [h] = farmTreeSize(s / 4000); n[h < 1 ? 'muda' : h > 1 ? 'grande' : 'normal']++; }
    expect(n.muda / 4000).toBeGreaterThan(0.18); expect(n.muda / 4000).toBeLessThan(0.32);
    expect(n.grande / 4000).toBeGreaterThan(0.13); expect(n.grande / 4000).toBeLessThan(0.27);
    const tallest = 4.9 * 1.42 * TREE_HEIGHT_K * Math.max(...Array.from({ length: 200 }, (_, s) => farmTreeSize(s / 200)[0]));
    expect(tallest).toBeLessThan(ZS_TREE_H.canopy[0]);
  });
});
