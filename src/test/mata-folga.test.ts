import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { decodeTerrain, type ZsTerrain, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_ROAD_MASK, ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { setCaveTerrain } from '@/components/zona-sul/zs-cave';
import { setZsVegRoadMask, ZS_VEG_BUSH_GAP, ZS_VEG_ROAD_BYTE, ZS_VEG_TREE_GAP, zsVegetationAround, type ZsVegItem } from '@/components/zona-sul/zs-vegetation';

/* Pedro 03/11: "na entrada do Rebouças parece várias pedras e árvores na pista e dentro da água — organizar direito, não
   deixar tudo juntinho demais, afastar levemente uma das outras". Antes (medido, 150 m em volta da boca): 5 troncos NA
   pista, 27 a < 3 m dela, 3 arbustos na pista, 20% das árvores com outra a < 3 m. */
let t: ZsTerrain;
let road: (x: number, z: number) => number;
beforeAll(async () => {
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
  const r = await sharp(fs.readFileSync('public' + ZS_ROAD_MASK.url)).raw().toBuffer({ resolveWithObject: true });
  const W = r.info.width, H = r.info.height, R8 = new Uint8Array(W * H);
  for (let i = 0; i < R8.length; i++) R8[i] = r.data[i * r.info.channels]!;
  road = (x, z) => { const u = Math.floor(x - ZS_ROAD_MASK.x0), v = Math.floor(z - ZS_ROAD_MASK.z0); return u < 0 || v < 0 || u >= W || v >= H ? 0 : R8[v * W + u]!; };
  setZsVegRoadMask({ data: R8, w: W, h: H });
});
const isTree = (it: ZsVegItem) => it.kind !== 'bush' && it.kind !== 'fern';
/** distância (varredura de 25 cm) até o pixel de pista mais perto, até `R` m */
const minRoad = (x: number, z: number, R: number) => {
  let m = Infinity;
  for (let a = -R; a <= R; a += 0.25) for (let b = -R; b <= R; b += 0.25) if (road(x + a, z + b) > ZS_VEG_ROAD_BYTE) m = Math.min(m, Math.hypot(a, b));
  return m;
};
const around = (hx: number, hz: number, R: number) => zsVegetationAround(t, hx, hz, R, R).filter((it) => Math.hypot(it.x - hx, it.z - hz) <= R);

describe('mata de enfeite: folga da pista e da água, espaço entre árvores', () => {
  for (const [nome, hx, hz] of [['boca do Rebouças', -70, -45], ['Lagoa', -150, 60], ['nascedouro', 90, 390]] as const) {
    it(`${nome}: nenhum tronco na pista (que o chão pinta) nem colado nela; arbusto fora da pista`, () => {
      const items = around(hx, hz, 150);
      const trees = items.filter(isTree);
      expect(trees.length).toBeGreaterThan(100);
      for (const it of trees) expect(minRoad(it.x, it.z, 3), `${it.kind} (${it.x.toFixed(1)}, ${it.z.toFixed(1)})`).toBeGreaterThan(2.3);
      for (const it of items.filter((q) => q.kind === 'bush')) expect(minRoad(it.x, it.z, 1.5)).toBeGreaterThan(1.1);
    }, 60_000); // varredura de 25 cm em volta de cada árvore: pesado com a suíte cheia
  }
  it('nenhum tronco na água nem na beirinha (coqueiro da praia pode)', () => {
    for (const [hx, hz] of [[-150, 60], [-70, -45], [90, 390]] as const) {
      for (const it of around(hx, hz, 200).filter((q) => isTree(q) && q.kind !== 'palm')) {
        for (let a = -2; a <= 2; a += 0.5) for (let b = -2; b <= 2; b += 0.5) {
          const s = zsSurfAt(t, it.x + a, it.z + b);
          expect(s === ZS_SURF.sea || s === ZS_SURF.lagoon, `${it.kind} (${it.x.toFixed(1)}, ${it.z.toFixed(1)})`).toBe(false);
        }
      }
    }
  }, 60_000);
  it(`não fica juntinho: árvore a ≥ ${ZS_VEG_TREE_GAP} m de outra, arbusto a ≥ ${ZS_VEG_BUSH_GAP} m de outro`, () => {
    for (const [hx, hz] of [[-70, -45], [-300, -150], [-150, 60]] as const) {
      const items = around(hx, hz, 150);
      for (const [grp, gap] of [[items.filter(isTree), ZS_VEG_TREE_GAP], [items.filter((q) => q.kind === 'bush'), ZS_VEG_BUSH_GAP]] as const) {
        for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) {
          expect(Math.hypot(grp[i]!.x - grp[j]!.x, grp[i]!.z - grp[j]!.z)).toBeGreaterThanOrEqual(gap);
        }
      }
    }
  }, 60_000);
  it('a mesma árvore no mesmo lugar, de onde quer que se olhe (a escolha não depende de onde o herói está)', () => {
    const key = (it: ZsVegItem) => `${it.x.toFixed(3)},${it.z.toFixed(3)}`;
    const mid = { x: -150, z: 0 };
    const inMid = (it: ZsVegItem) => Math.hypot(it.x - mid.x, it.z - mid.z) < 60;
    const a = new Set(zsVegetationAround(t, mid.x - 70, mid.z, 150, 150).filter(inMid).map(key));
    const b = new Set(zsVegetationAround(t, mid.x + 70, mid.z + 40, 150, 150).filter(inMid).map(key));
    expect(a.size).toBeGreaterThan(30);
    expect([...a].filter((k) => !b.has(k))).toEqual([]);
    expect([...b].filter((k) => !a.has(k))).toEqual([]);
  }, 60_000);
  it('a mata continua cheia: no Rebouças ainda ~80% das árvores (sai só o que estava na pista ou grudado)', () => {
    // medido 03/11: 291 árvores antes → 235 depois (150 m em volta da boca)
    expect(around(-70, -45, 150).filter(isTree).length).toBeGreaterThan(220);
  }, 60_000);
});
