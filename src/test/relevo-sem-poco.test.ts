import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';

/* Pedro, 05/11 noite: "achei uma falha no mapa — um buraco reto estranho perto da cave do boss, no meio do mato verde no
   alto da montanha" · "não é gigante mas é fundo" · "estou dentro do buraco com o personagem, pra sair não dá — é quase na
   frente da cave". Era o bake: toda água do OSM virava LAGOA no nível do mar (−0,7 m), e os açudes/represas da Floresta
   da Tijuca (a 55–113 m no jogo) viraram poços de paredes retas. Laguinho com a margem alta agora vira chão (bake.mjs,
   `POND_BANK_M`). */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});

describe('relevo sem poço (05/11 noite — o buraco perto da boca do Pico)', () => {
  it('nenhuma célula do mapa fica mais de 6 m abaixo de TODA a volta dela (poço de paredes retas onde se fica preso)', () => {
    const H = t.heights, W = t.w, pits: string[] = [];
    for (let j = 2; j < t.h - 2; j++) for (let i = 2; i < W - 2; i++) {
      let lo = Infinity;
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (Math.max(Math.abs(a), Math.abs(b)) === 2) lo = Math.min(lo, H[(j + b) * W + i + a]!);
      if (lo - H[j * W + i]! > 6) pits.push(`(${t.x0 + i * t.cell}, ${t.z0 + j * t.cell})`);
    }
    expect(pits).toEqual([]);
  });

  it('água de dentro (lagoa/laguinho) só onde a margem é baixa — no alto do morro não tem água no nível do mar', () => {
    const W = t.w, seen = new Uint8Array(W * t.h), bad: string[] = [];
    for (let p0 = 0; p0 < W * t.h; p0++) {
      if (seen[p0] || t.surf[p0] !== ZS_SURF.lagoon) continue;
      const st = [p0], bank: number[] = []; seen[p0] = 1;
      while (st.length) {
        const p = st.pop()!, i = p % W, j = (p - i) / W;
        for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as const) {
          if (a < 0 || b < 0 || a >= W || b >= t.h) continue;
          const q = b * W + a;
          if (t.surf[q] === ZS_SURF.lagoon) { if (!seen[q]) { seen[q] = 1; st.push(q); } } else if (t.surf[q] !== ZS_SURF.sea) bank.push(t.heights[q]!);
        }
      }
      bank.sort((x, y) => x - y);
      const med = bank[bank.length >> 1] ?? 0;
      if (med > 3) bad.push(`(${t.x0 + (p0 % W) * t.cell}, ${t.z0 + Math.floor(p0 / W) * t.cell}) margem ${med.toFixed(1)} m`);
    }
    expect(bad).toEqual([]);
  });

  it('os 5 laguinhos do maciço viraram mata na altura da volta (o do Pedro: 70 m da boca do Pico)', () => {
    for (const [x, z] of [[-1166, -154], [-1082, -50], [-1242, -6], [-1128, 208], [-1018, 252]] as const) {
      const c = zsHeightAt(t, x, z);
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 8; k++) { const an = (k / 8) * Math.PI * 2, v = zsHeightAt(t, x + Math.cos(an) * 10, z + Math.sin(an) * 10); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      expect(c, `(${x}, ${z})`).toBeGreaterThan(lo - 3);
      expect(c, `(${x}, ${z})`).toBeGreaterThan(50);
      expect(zsSurfAt(t, x, z), `(${x}, ${z})`).toBe(ZS_SURF.forest);
    }
  });
});
