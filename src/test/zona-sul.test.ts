import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, zsHeightAt, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { zsStep, ZS_MAX_CLIMB, ZS_SWIM_DEPTH } from '@/components/zona-sul/zs-move';
import { ZS_TREE_H, zsVegetationAround } from '@/components/zona-sul/zs-vegetation';
import { ZS_LANDMARKS, ZS_SPAWN, ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';

/* 28/10 — Zona Sul do RJ (rota isolada /zona-sul, branch feat/zona-sul): relevo real + OSM, escala 1:7,4 com altura
   ×1,5; mar/Lagoa com nado; mata atlântica instanciada; paredão íngreme é parede. */
const src = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/** Terreno sintético 16×8 (célula 4 m; a borda de 6 m não interfere no meio): oeste em terra subindo, leste no mar
 *  fundo (i ≥ 6), uma coluna de paredão (i = 3). */
function fake() {
  const w = 16, h = 8, rgba = new Uint8Array(w * h * 4);
  const put = (i: number, j: number, hm: number, s: number) => {
    const v = Math.round((hm + 30) * 100), p = (j * w + i) * 4;
    rgba[p] = v >> 8; rgba[p + 1] = v & 255; rgba[p + 2] = s; rgba[p + 3] = 255;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (i >= 10) put(i, j, -4, ZS_SURF.sea);            // mar fundo
    else if (i === 6) put(i, j, 12, ZS_SURF.land);      // paredão: +8,5 m em 4 m
    else put(i, j, i < 6 ? 1 + i * 0.5 : 1, ZS_SURF.land);
  }
  return decodeTerrain(rgba, w, h, 4, 30);
}

describe('Zona Sul — terreno, movimento, água e mata', () => {
  it('decodifica altura (cm) e superfície; altura bilinear entre células', () => {
    const t = fake();
    const x = (i: number) => t.x0 + i * t.cell, z = (j: number) => t.z0 + j * t.cell;
    expect(zsHeightAt(t, x(0), z(1))).toBeCloseTo(1, 2);
    expect(zsHeightAt(t, x(1), z(1))).toBeCloseTo(1.5, 2);
    expect(zsHeightAt(t, (x(0) + x(1)) / 2, z(1))).toBeCloseTo(1.25, 2);
    expect(zsSurfAt(t, x(12), z(1))).toBe(ZS_SURF.sea);
  });
  it('paredão íngreme (> 45°) é PAREDE: não sobe; ladeira suave sobe', () => {
    const t = fake();
    const x = (i: number) => t.x0 + i * t.cell, z1 = t.z0 + t.cell;
    expect(zsStep(t, x(3), z1 + 8, 1, 0).x).toBeCloseTo(x(3) + 1, 5);      // 0,5 m em 4 m: sobe
    const r = zsStep(t, x(5), z1 + 8, 1, 0);                                // entra no paredão
    expect(r.x).toBe(x(5));
    expect(ZS_MAX_CLIMB).toBe(1);
  });
  it('água: funda = NADA; e dá pra encostar na margem nadando', () => {
    const t = fake();
    const r = zsStep(t, t.x0 + 12.5 * t.cell, t.z0 + 3 * t.cell, 0.5, 0);
    expect(r.swimming).toBe(true);
    expect(-r.ground).toBeGreaterThan(ZS_SWIM_DEPTH);
  });
  it('mata: árvore de cenário pelo menos 3 m MAIS ALTA que a de farm; nada na água', () => {
    expect(ZS_TREE_H.canopy[0] - ZS_TREE_H.farm[1]).toBeGreaterThanOrEqual(3);
    expect(ZS_TREE_H.emergent[0]).toBeGreaterThan(ZS_TREE_H.canopy[1]);
    const t = fake();
    const items = zsVegetationAround(t, 0, 0, 60, 60);
    for (const it of items) expect(zsSurfAt(t, it.x, it.z)).not.toBe(ZS_SURF.sea);
  });
  it('terreno assado bate com o meta (tamanho do PNG) e a partida é PRAIA', async () => {
    const png = fs.readFileSync('public' + ZS_TERRAIN.url);
    expect(png.readUInt32BE(16)).toBe(ZS_TERRAIN.w);
    expect(png.readUInt32BE(20)).toBe(ZS_TERRAIN.h);
    expect(ZS_TERRAIN.scale).toBeCloseTo(7.4, 5);
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const t = decodeTerrain(data, info.width, info.height);
    expect(zsSurfAt(t, ZS_SPAWN.x, ZS_SPAWN.z)).toBe(ZS_SURF.beach);
    // marcos famosos dentro da área
    for (const n of ['Corcovado', 'Pão de Açúcar', 'Irmão Maior']) expect(ZS_LANDMARKS.some((l) => l.name === n)).toBe(true);
  }, 30_000);
  it('RUAS como TEXTURA do chão (não chapa): mapa de 1 m cobre o terreno inteiro; barro mais escuro que a praia', async () => {
    const { ZS_ROAD_MASK } = await import('@/components/zona-sul/zona-sul-meta');
    const png = fs.readFileSync('public' + ZS_ROAD_MASK.url);
    expect(png.readUInt32BE(16)).toBe(ZS_TERRAIN.w * ZS_TERRAIN.cell);
    expect(png.readUInt32BE(20)).toBe(ZS_TERRAIN.h * ZS_TERRAIN.cell);
    expect(ZS_ROAD_MASK.w).toBe(ZS_TERRAIN.w * ZS_TERRAIN.cell);
    expect(fs.existsSync('src/components/zona-sul/zs-roads.tsx')).toBe(false); // a "chapa" saiu
    const mesh = src('src/components/zona-sul/zs-terrain-mesh.tsx');
    expect(mesh).toMatch(/texture2D\(uRoadMask, ruv\)/);
    expect(mesh).toMatch(/vec3 dirt = vec3\(0\.33, 0\.21, 0\.10\)/); // barro (linear) mais escuro que a areia da praia
    const roads = src('tools/zona-sul/roads.mjs');
    expect(roads).toMatch(/MAIN_ROADS\.has\(e\.tags\?\.name\)/);              // só avenidas que ligam a cidade
    expect(roads).toMatch(/'Rua Francisco Otaviano': 5/);                     // trilha Arpoador ↔ Copa
    expect(roads).toMatch(/if \(surf\[p\] === SURF\.sea \|\| surf\[p\] === SURF\.lagoon \|\| surf\[p\] === SURF\.beach\) continue;/);
    expect(roads).toMatch(/export const MAX_GRADE = 1\.0;/);
  });
  it('ISOLADA: a rota /zona-sul não importa o mundo do jogo; crédito ODbL na tela; tecla K = vista de cima', () => {
    const w = src('src/components/zona-sul/zona-sul-world.tsx');
    expect(w).not.toMatch(/from '@\/components\/game-world'/);
    expect(w).toMatch(/© OpenStreetMap contributors \(ODbL\)/);
    expect(w).toMatch(/e\.code === 'KeyK' && !e\.repeat/);
    expect(src('src/routes/zona-sul.tsx')).toMatch(/createFileRoute\('\/zona-sul'\)/);
  });
});
