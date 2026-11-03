import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt, ZS_SPAWN_TERRAIN_URL } from '@/components/zona-sul/zs-terrain-data';
import { ZS_LANDMARKS, ZS_SPAWN, ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsSeaRadius } from '@/components/zona-sul/zs-water';
import { ZS_MAP_BOUNDS } from '@/components/hud/zs-map';

/* Pedro 02/11: "abrir um pouco até a Pedra da Gávea e fazer aparecer as Ilhas Cagarras — sem bugar, quebrar nada que
   temos". O mapa cresceu pra oeste (Gávea, Pedra Bonita, São Conrado; o maciço da Tijuca atrás fica fora, como em 28/10)
   e pro sul (mar até as Cagarras), ALINHADO à grade de 28/10 e com o (0, 0) no mesmo lugar. */
const sharpLoad = async (f: string) => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeTerrain(data, info.width, info.height);
};
let now: ZsTerrain, old: ZsTerrain;
beforeAll(async () => { now = await sharpLoad('public' + ZS_TERRAIN.url); old = await sharpLoad('public' + ZS_SPAWN_TERRAIN_URL); });

// lat/lon → jogo (a mesma conta do bake: escala presa à latitude média do recorte de 28/10; origem no centro dele)
const V1 = { s: -22.993, w: -43.252, n: -22.932, e: -43.147 }, PXM = 4 * 7.4;
const M_LON = 111320 * Math.cos((V1.s + V1.n) / 2 * Math.PI / 180), M_LAT = 110574;
const W_OLD = Math.round((V1.e - V1.w) * M_LON / PXM), H_OLD = Math.round((V1.n - V1.s) * M_LAT / PXM);
const gx = (lon: number) => ((lon - V1.w) * M_LON / PXM - W_OLD / 2) * 4, gz = (lat: number) => ((V1.n - lat) * M_LAT / PXM - H_OLD / 2) * 4;
const maxH = (t: ZsTerrain, x: number, z: number, r: number) => { let m = -Infinity; for (let a = -r; a <= r; a += 4) for (let b = -r; b <= r; b += 4) m = Math.max(m, zsHeightAt(t, x + a, z + b)); return m; };

describe('Gávea + Cagarras — o que entrou', () => {
  it('Pedra da Gávea (~171 m no jogo, mais alta que o Cristo) e Pedra Bonita no mapa; marcos novos com nome', () => {
    expect(maxH(now, gx(-43.2830), gz(-22.9990), 40)).toBeGreaterThan(150);
    expect(maxH(now, gx(-43.2841), gz(-22.9892), 40)).toBeGreaterThan(120);
    for (const n of ['Pedra da Gávea', 'Pedra Bonita', 'Corcovado', 'Irmão Maior']) expect(ZS_LANDMARKS.some((l) => l.name === n), n).toBe(true);
  });
  it('Ilhas Cagarras (Cagarra, Palmas, Comprida) saem do mar; no mapa de antes era só mar', () => {
    // topo medido no jogo: Cagarra ~14 m, Comprida ~12 m, Palmas ~4 m (o relevo de 30 m do satélite achata ilha pequena)
    for (const [nome, lat, lon, min] of [['Cagarra', -23.0268, -43.1925, 10], ['Palmas', -23.0264, -43.2035, 2], ['Comprida', -23.0374, -43.2026, 8]] as const) {
      const x = gx(lon), z = gz(lat);
      expect(maxH(now, x, z, 80), nome).toBeGreaterThan(min);
      expect(maxH(old, x, z, 80), nome).toBeLessThan(0);
    }
  });
  // 02/11 noite (Pedro, vendo o mapa de cima: "aquele vazio estranho — põe o Alto da Boa Vista, a descida pra Tijuca e
  // beira de praia igual o restante"): o maciço da Tijuca ENTROU (até então ficava fora e o vazio era um paredão pro mar)
  it('o maciço da Tijuca ENTROU: Pico da Tijuca (~200 m, o mais alto do mapa), Bico do Papagaio, platô do Alto da Boa Vista', () => {
    expect(ZS_LANDMARKS.some((l) => l.name === 'Pico da Tijuca')).toBe(true);
    expect(maxH(now, gx(-43.2853), gz(-22.9437), 40)).toBeGreaterThan(190);
    expect(maxH(now, gx(-43.2754), gz(-22.9473), 40)).toBeGreaterThan(140);
    const ab = zsHeightAt(now, gx(-43.2792), gz(-22.9660));          // Alto da Boa Vista: platô a ~70 m
    expect(ab).toBeGreaterThan(55); expect(ab).toBeLessThan(90);
    expect(zsSurfAt(now, gx(-43.2792), gz(-22.9660))).not.toBe(ZS_SURF.sea);
  });
  it('a borda norte do maciço DESCE até a praia (sem paredão): no máx. ~40° entre vizinhos, e chega no mar', () => {
    const zEdge = gz(-22.932);
    for (const lon of [-43.295, -43.285, -43.275, -43.265]) {
      const x = gx(lon); let worst = 0, sea = false;
      for (let z = zEdge; z > zEdge - 300; z -= 4) {
        const a = zsHeightAt(now, x, z), b = zsHeightAt(now, x, z - 4);
        if (a > 0.2) worst = Math.max(worst, (a - b) / 4);
        if (zsSurfAt(now, x, z) === ZS_SURF.sea) { sea = true; break; }
      }
      expect(worst, `lon ${lon}`).toBeLessThan(Math.tan(40 * Math.PI / 180));
      expect(sea, `lon ${lon}`).toBe(true);
    }
  });
});

describe('Gávea + Cagarras — sem mexer no que existe', () => {
  it('a área de 28/10 sai IGUAL (altura e superfície), menos a faixa de 8 px da borda oeste/sul antiga e os FUROS do satélite consertados', () => {
    // 02/11 (Pedro, item 3: "consertar o furo antigo da Urca/Pão de Açúcar"): o lixo do dado da AWS (< −1000 m) virava
    // buraco com AREIA no meio da terra (Urca/Praia Vermelha, Leme, Babilônia, Leblon…). Consertado: 559 px em 17 manchas
    // pequenas; o chão SÓ SOBE (no máx. ~1 m desce, na borda de uma mancha) e a superfície só sai de areia pra terra/mata/rua.
    const A = 18; let n = 0, diff = 0;
    for (let j = A; j < old.h - A - 8; j++) for (let i = A + 8; i < old.w - A; i++) {
      const x = old.x0 + i * old.cell, z = old.z0 + j * old.cell;
      const ib = Math.round((x - now.x0) / now.cell), jb = Math.round((z - now.z0) / now.cell);
      expect(now.x0 + ib * now.cell).toBeCloseTo(x, 6); // grade alinhada
      n++;
      const dh = now.heights[jb * now.w + ib]! - old.heights[j * old.w + i]!, s0 = old.surf[j * old.w + i]!, s1 = now.surf[jb * now.w + ib]!;
      if (Math.abs(dh) > 1e-6 || s1 !== s0) {
        diff++;
        expect(dh).toBeGreaterThan(-1.05);
        if (s1 !== s0) { expect(s0).toBe(ZS_SURF.beach); expect([ZS_SURF.land, ZS_SURF.forest, ZS_SURF.road]).toContain(s1); }
      }
    }
    expect(n).toBeGreaterThan(75000);
    expect(diff).toBeLessThanOrEqual(650); // medido: 632 (559 com mais de 1 cm + vizinhos de 1 cm)
  }, 30_000);
  it('furo consertado no mapa todo (antes só na área nova): o bake não guarda mais o recorte de 28/10 com o lixo', () => {
    const bake = fs.readFileSync('tools/zona-sul/bake.mjs', 'utf8');
    expect(bake).toContain('const { at } = await loadDem();');
    expect(bake).not.toContain('loadDem({ keep: BBOX_V1 })');
  });
  it('o (0, 0) e a partida no mesmo lugar; o meta traz o canto (mapa não é mais centrado); o mapa (M) e o mar cobrem tudo', () => {
    expect(ZS_SPAWN).toEqual({ x: 90, z: 390, name: 'Praia do Arpoador' });
    expect(zsSurfAt(now, ZS_SPAWN.x, ZS_SPAWN.z)).toBe(ZS_SURF.beach);
    expect(ZS_TERRAIN.z0).toBe(old.z0 - 64 * 4);        // o norte cresceu SÓ a faixa da descida do maciço (NORTH_PX)
    expect(ZS_TERRAIN.x0).toBeLessThan(old.x0 - 600);   // cresceu pra oeste
    expect(ZS_MAP_BOUNDS.minX).toBe(ZS_TERRAIN.x0);
    const { r0 } = zsSeaRadius(now);
    const far = Math.hypot(now.x0, now.z0 + (now.h - 1) * now.cell); // canto sudoeste (o mais longe do 0,0)
    expect(r0).toBeGreaterThan(far);
  });
  it('tudo que é SORTEADO (bichos, farm, acampamentos, bandidos, tubarões, postes) e o pico da onda saem do terreno de 28/10', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('Promise.all([loadZsTerrain(), loadZsTerrain(ZS_SPAWN_TERRAIN_URL)])');
    expect(zs).toContain('const query = zsQuery(st); // SORTEIOS no terreno de 28/10');
    expect(zs).toContain('const prof = zsWorldProfile(tt, zsQuery(tt), query);');
    expect(zs).toContain('createZsSharks(query, zsSharkPeaks(st))');
    expect(zs).toContain('const base = createZsHarvestNodes(query); return [...base, ...createZsNewAreaTrees(zsQuery(tt), query.bounds, base), ...createCaveOreNodes()];');
    expect(zs).toContain('<ZsLamps t={t} spotsFrom={spawnT ?? t} heroRef={heroRef} />');
    expect(zs).toContain('<SurfBreak t={spawnT ?? t} shoreX={ZS_SPAWN.x} shoreZ={ZS_SPAWN.z} />');
    expect(zs).toContain('<SorrisoBreak t={spawnT ?? t} />');
    expect(fs.existsSync('public' + ZS_SPAWN_TERRAIN_URL)).toBe(true);
  });
});
