import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { parseRuins, placeRuins, pushOutRuins, ruinBlocks, ruinChunks, ruinMesh, RUINS, ruinTris, setRuinsWorld, type RuinRaw } from '@/components/zona-sul/zs-ruins';

/* Pedro, 05/11: "por bairro uns 2 a 5% da estrutura, nada colado, onde realmente são os prédios, já com textura, como
   ruína" · "o ideal: mais área de favela no morro, alguns da pista, detalhes" · "15 mil triângulos — dá pra pôr mais uns
   15 mil, ficar nos 30 mil?" */
let t: ZsTerrain, raw: RuinRaw[];
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  raw = parseRuins(JSON.parse(fs.readFileSync('public/zona-sul/ruins.json', 'utf8')));
});
const BAD = [ZS_SURF.sea, ZS_SURF.lagoon, ZS_SURF.beach, ZS_SURF.out, ZS_SURF.road, ZS_SURF.forest] as number[];
const R = (q: RuinRaw) => Math.max(...q.pts.map(([x, z]) => Math.hypot(x, z)));

describe('ruínas por bairro (prédios reais do OSM)', () => {
  it('por bairro, com mais FAVELA no morro (Rocinha, Santa Marta, Vidigal…) e prédio no asfalto (Copa, Ipanema, Leblon, Botafogo, São Conrado…)', () => {
    const fav = raw.filter((q) => q.k === 1), pre = raw.filter((q) => q.k === 0);
    expect(raw.length).toBeGreaterThan(500); expect(fav.length).toBeGreaterThan(pre.length);
    const bairros = new Set(raw.map((q) => q.bairro));
    for (const b of ['Rocinha', 'Santa Marta', 'Vidigal', 'Copacabana', 'Ipanema', 'Leblon', 'Botafogo', 'São Conrado', 'Urca', 'Leme']) expect(bairros.has(b), b).toBe(true);
    expect(fav.filter((q) => q.bairro === 'Rocinha').length).toBeGreaterThan(100);   // o maior morro
    // prédio: 12–30 m de ruína; favela: 2–4 andares
    for (const q of pre) { expect(q.h).toBeGreaterThanOrEqual(12); expect(q.h).toBeLessThanOrEqual(30); }
    for (const q of fav) { expect(q.h).toBeGreaterThanOrEqual(5.6); expect(q.h).toBeLessThanOrEqual(11.2); }
  });

  it('no lugar de verdade, mas NUNCA em rua, praia, mar, lagoa, mata ou fora do mapa (nem um canto)', () => {
    for (const q of raw) {
      expect(BAD.includes(zsSurfAt(t, q.x, q.z)), `${q.bairro} ${q.x},${q.z}`).toBe(false);
      for (const [dx, dz] of q.pts) expect(BAD.includes(zsSurfAt(t, q.x + dx, q.z + dz)), `canto ${q.bairro} ${q.x},${q.z}`).toBe(false);
    }
  });

  it('nada colado: nenhuma encosta na outra; prédio a ≥ 16 m de prédio (favela em cacho, mas com vão)', () => {
    let minPre = Infinity;
    for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) {
      const a = raw[i]!, b = raw[j]!, d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 80) continue;
      expect(d, `${a.bairro} × ${b.bairro}`).toBeGreaterThan(R(a) + R(b));
      if (a.k === 0 && b.k === 0) minPre = Math.min(minPre, d - R(a) - R(b));
    }
    expect(minPre).toBeGreaterThanOrEqual(16);
  });

  it('cabe no orçamento de 30 mil triângulos (a mesma conta do desenho) e é sempre igual (sorteio fixo)', () => {
    const placed = placeRuins(raw, { blocked: () => false, ground: (x, z) => zsHeightAt(t, x, z) });
    const sum = placed.reduce((s, r) => s + ruinTris(r), 0);
    expect(sum).toBeLessThanOrEqual(RUINS.TRI_MAX);
    expect(ruinChunks(placed).reduce((s, m) => s + m.tris, 0)).toBe(sum);
    const again = placeRuins(raw, { blocked: () => false, ground: (x, z) => zsHeightAt(t, x, z) });
    expect(again.map((r) => r.tops.join())).toEqual(placed.map((r) => r.tops.join()));
  });

  it('cara de RUÍNA: prédio com topo quebrado e um canto "comido"; a parede desce até o canto mais baixo da encosta', () => {
    const placed = placeRuins(raw, { blocked: () => false, ground: (x, z) => zsHeightAt(t, x, z) });
    for (const r of placed) {
      for (let i = 0; i < r.wx.length; i++) expect(r.base).toBeLessThan(zsHeightAt(t, r.wx[i]!, r.wz[i]!));
      if (r.k === 0) { const lo = Math.min(...r.tops), hi = Math.max(...r.tops); expect(hi - lo).toBeGreaterThan(0.15 * (hi - r.base)); }
    }
    expect(placed.filter((r) => r.tier2).length).toBeGreaterThan(50);                        // o 2º bloco torto
    expect(placed.filter((r) => r.tank).length).toBeGreaterThan(50);                         // caixa d'água na laje (favela)
    expect(placed.filter((r) => r.rubble).length).toBeGreaterThan(50);                       // entulho no pé
  });

  it('o que já é do jogo fica livre: com acampamento/farm/base no lugar, a ruína dali sai', () => {
    const q = raw[0]!;
    const placed = placeRuins(raw, { blocked: (x, z, _r, dist) => dist(q.x, q.z) < 0 && x === q.x && z === q.z, ground: (x, z) => zsHeightAt(t, x, z) });
    expect(placed.some((r) => r.x === q.x && r.z === q.z)).toBe(false);
    expect(placed.length).toBe(raw.length - 1);
  });

  it('COLISÃO: o herói não atravessa (sai pela parede mais perto); quem está acima do topo passa; o carro bate', () => {
    const placed = placeRuins(raw.filter((q) => q.k === 0).slice(0, 5), { blocked: () => false, ground: (x, z) => zsHeightAt(t, x, z) });
    setRuinsWorld(placed);
    const r = placed[0]!, y = r.base + 1;
    const [px, pz] = pushOutRuins(r.x, r.z, 0.45, y);                                       // no meio do prédio → sai
    expect(Math.hypot(px - r.x, pz - r.z)).toBeGreaterThan(0.3);
    expect(pushOutRuins(px, pz, 0.45, y)).toEqual([px, pz]);                                 // já fora: fica
    expect(pushOutRuins(r.x, r.z, 0.45, Math.max(...r.tops, ...(r.tier2?.tops ?? [])) + 5)).toEqual([r.x, r.z]); // por cima (do 2º bloco também): passa
    expect(ruinBlocks(r.x, r.z, 1.6, y)).toBe(true);
    expect(ruinBlocks(r.x + 200, r.z + 200, 1.6, y)).toBe(false);
    setRuinsWorld([]);
  });

  it('a malha: cada vértice com a fachada (u, altura, tipo); janela no shader (sem textura por prédio)', () => {
    const m = ruinMesh(placeRuins(raw.slice(0, 20), { blocked: () => false, ground: (x, z) => zsHeightAt(t, x, z) }));
    expect(m.fac.length).toBe(m.pos.length);
    expect(m.idx.length % 3).toBe(0);
    const v = fs.readFileSync('src/components/zona-sul/zs-ruins-view.tsx', 'utf8');
    expect(v).toContain("float win = step(0.22, c.x) * step(c.x, 0.72) * step(0.32, c.y) * step(c.y, 0.82);");
    expect(v).toContain('vine * 0.75); // trepadeira no pé');
  });

  it('ligado no jogo: desenho na superfície, parede do herói, parede do carro, a mata não nasce dentro', () => {
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain('[bx, bz] = pushOutRuins(bx, bz, HERO_RADIUS, p.y);');
    expect(w).toContain('<ZsRuins t={t} />');
    expect(fs.readFileSync('src/components/zona-sul/zs-car.ts', 'utf8')).toContain('if (ruinBlocks(px, pz, CAR_RUIN_R, c.y)) return false;');
    expect(fs.readFileSync('src/components/zona-sul/zs-vegetation.tsx', 'utf8')).toContain('if (ruinAt(it.x, it.z, 1)) continue;');
  });
});
