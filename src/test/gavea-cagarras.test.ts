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
  it('o maciço da Tijuca (atrás da Gávea, fora desde 28/10) continua FORA: lá é a faixa que desce pro mar', () => {
    expect(ZS_LANDMARKS.some((l) => l.name === 'Pico da Tijuca')).toBe(false);
    expect(zsHeightAt(now, gx(-43.2867), gz(-22.9440))).toBeLessThan(0);
    expect(zsSurfAt(now, gx(-43.2867), gz(-22.9440))).toBe(ZS_SURF.sea);
  });
});

describe('Gávea + Cagarras — sem mexer no que existe', () => {
  it('a área de 28/10 sai IGUAL (altura e superfície), menos a faixa de 8 px da borda oeste/sul antiga', () => {
    const A = 18; let n = 0, diff = 0;
    for (let j = A; j < old.h - A - 8; j++) for (let i = A + 8; i < old.w - A; i++) {
      const x = old.x0 + i * old.cell, z = old.z0 + j * old.cell;
      const ib = Math.round((x - now.x0) / now.cell), jb = Math.round((z - now.z0) / now.cell);
      expect(now.x0 + ib * now.cell).toBeCloseTo(x, 6); // grade alinhada
      n++;
      if (Math.abs(now.heights[jb * now.w + ib]! - old.heights[j * old.w + i]!) > 1e-6 || now.surf[jb * now.w + ib] !== old.surf[j * old.w + i]) diff++;
    }
    expect(n).toBeGreaterThan(75000);
    expect(diff).toBe(0);
  }, 30_000);
  it('o (0, 0) e a partida no mesmo lugar; o meta traz o canto (mapa não é mais centrado); o mapa (M) e o mar cobrem tudo', () => {
    expect(ZS_SPAWN).toEqual({ x: 90, z: 390, name: 'Praia do Arpoador' });
    expect(zsSurfAt(now, ZS_SPAWN.x, ZS_SPAWN.z)).toBe(ZS_SURF.beach);
    expect(ZS_TERRAIN.z0).toBe(old.z0);                 // o norte não mudou
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
    expect(zs).toContain('harvestNodes: [...createZsHarvestNodes(query), ...createCaveOreNodes()]');
    expect(zs).toContain('<ZsLamps t={t} spotsFrom={spawnT ?? t} heroRef={heroRef} />');
    expect(zs).toContain('<SurfBreak t={spawnT ?? t} shoreX={ZS_SPAWN.x} shoreZ={ZS_SPAWN.z} />');
    expect(zs).toContain('<SorrisoBreak t={spawnT ?? t} />');
    expect(fs.existsSync('public' + ZS_SPAWN_TERRAIN_URL)).toBe(true);
  });
});
