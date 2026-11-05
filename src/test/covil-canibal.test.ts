import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_LAIR, CAVE_ROOMS, CAVE_TUNNELS, caveField, caveFloorAt, caveMove, caveNearXZ, caveRoomName, setCaveTerrain } from '@/components/zona-sul/zs-cave';

/* Pedro, 04/11: "precisamos ver o boss que fica dentro da cave profunda! da forma que fizemos a cave do Pico da Tijuca, que
   desce arredondando — precisa mais baixo, depois lá pro fundo onde tá o boss … o corpo dele vem do meio … canibal gigante
   meio que do tamanho do Kraken dentro da terra, será que dá?!" → 1º passo: o COVIL (o 2º poço, bem mais fundo). */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});
const covil = CAVE_ROOMS.find((r) => r.id === 'covil')!;
const abismo = CAVE_ROOMS.find((r) => r.id === 'abismo')!;
const at = (e: number, deg: number) => { const a = (deg * Math.PI) / 180; return { x: covil.x + e * covil.rx * Math.cos(a), z: covil.z + e * covil.rz * Math.sin(a) }; };
function walk(start: { x: number; z: number; y: number }, targets: { x: number; z: number }[]) {
  let { x, z, y } = start;
  for (const tg of targets) {
    for (let k = 0; k < 6000 && Math.hypot(tg.x - x, tg.z - z) > 0.6; k++) {
      const d = Math.hypot(tg.x - x, tg.z - z), dx = ((tg.x - x) / d) * 0.3, dz = ((tg.z - z) / d) * 0.3;
      const m = caveMove(t, x, z, y, dx, dz);
      const nx = m ? m.x : x + dx, nz = m ? m.z : z + dz, ny = m ? m.ground : zsHeightAt(t, x + dx, z + dz);
      if (Math.hypot(nx - x, nz - z) < 1e-4) return { x, z, y, stuck: true, at: tg };
      x = nx; z = nz; y = ny;
    }
  }
  return { x, z, y, stuck: false, at: null };
}

describe('covil do Canibal (o poço fundo do chefe gigante)', () => {
  it('ao lado do abismo, bem mais fundo (abaixo do mar) e grande o bastante pra um chefe do tamanho do Kraken', () => {
    expect(Math.hypot(covil.x - abismo.x, covil.z - abismo.z)).toBeLessThan(140);
    expect(covil.y).toBeLessThan(-50);                         // o fundo, abaixo do nível do mar
    expect(Math.min(covil.rx, covil.rz) * 2).toBeGreaterThan(120); // arena de ~130 m
    expect(covil.spiral!.yTop - covil.y).toBeGreaterThan(90);  // ~93 m de descida em espiral
    expect(caveFloorAt(covil.x, covil.z)).toBeCloseTo(covil.y, 1); // miolo = a arena
    expect(caveRoomName(covil.x, covil.z)).toBe('covil do Canibal');
    // vai no FIM das listas: as sementes de ruído e os enfeites das peças de antes ficam iguais (05/11: depois dele só a
    // FENDA do caminho e o túnel dela — parkour-canibal.test.ts)
    expect(CAVE_ROOMS[CAVE_ROOMS.length - 2]!.id).toBe('covil');
    expect(CAVE_TUNNELS[CAVE_TUNNELS.length - 2]!.id).toBe('garganta');
  });

  it('teto bem debaixo do chão do mapa (≥ 3 m de rocha em todo ponto)', () => {
    let n = 0, furos = 0, minCover = Infinity;
    for (let x = covil.x - 90; x <= covil.x + 90; x += 4) for (let z = covil.z - 90; z <= covil.z + 90; z += 4) {
      if (!caveNearXZ(x, z)) continue;
      let top = -Infinity;
      for (let y = -70; y < 140; y += 0.5) if (caveField(x, y, z) < 0) top = y;
      if (top === -Infinity) continue;
      n++;
      const cover = zsHeightAt(t, x, z) - top;
      minCover = Math.min(minCover, cover);
      if (cover < 3) furos++;
    }
    expect(n).toBeGreaterThan(500);
    expect(furos, `rocha mínima ${minCover}`).toBe(0);
  }, 60_000);

  // 05/11 (Pedro: "o caminho vai ficar curto até ali?" · "o ideal: no túnel, no caminho"): a garganta vai do fundo do abismo
  // até a FENDA (o precipício — só pulando, parkour-canibal.test.ts); do outro lado um túnel até o balcão NOVO do covil
  // (a rampa girou pro nordeste) e a rampa inteira até a arena.
  it('a pé: fundo do abismo → galeria → garganta → beira da fenda (para no precipício); do outro lado → balcão (38 m) → rampa → arena', () => {
    const fenda = CAVE_ROOMS.find((q) => q.id === 'fenda')!;
    // fundo do abismo → galeria grande → (sai dela) garganta → fenda
    const gal = CAVE_TUNNELS.find((q) => q.id === 'galeria-alto')!.pts, g = CAVE_TUNNELS.find((q) => q.id === 'garganta')!.pts;
    let r = walk({ x: abismo.x, z: abismo.z, y: caveFloorAt(abismo.x, abismo.z)! }, [gal[0]!, gal[1]!, ...g].map((p) => ({ x: p.x, z: p.z })));
    expect(r.stuck, `travou na garganta ${JSON.stringify(r)}`).toBe(false);
    r = walk(r, [{ x: fenda.x - 22, z: fenda.z }]);
    expect(r.stuck).toBe(false); expect(r.y).toBeCloseTo(fenda.y, 1); // na beira de cá
    // um passo além da beira: o chão some (o precipício, 28 m) — sem pular cai (no jogo: pego no ar → checkpoint)
    const edge = walk(r, [{ x: fenda.x - 19, z: fenda.z }]), m = caveMove(t, edge.x, edge.z, edge.y, 2.5, 0); // (o walk para a 0,6 m)
    expect(m!.ground, 'sem pular: cai no precipício').toBeLessThan(fenda.y - 20);
    // do outro lado da fenda
    r = walk({ x: fenda.x + 22, z: fenda.z, y: fenda.y }, CAVE_TUNNELS.find((q) => q.id === 'fenda-covil')!.pts.map((p) => ({ x: p.x, z: p.z })));
    expect(r.stuck, `travou no túnel ${JSON.stringify(r)}`).toBe(false);
    expect(r.y).toBeGreaterThan(36);                           // no balcão
    const a0 = (covil.spiral!.a0 * 180) / Math.PI, rampa: { x: number; z: number }[] = [];
    for (let d = a0 + 6; d <= a0 + 340; d += 8) rampa.push(at(0.92, d));
    r = walk(r, rampa);
    expect(r.stuck, `travou na rampa ${JSON.stringify(r)}`).toBe(false);
    expect(r.y).toBeLessThan(-48);                             // desceu a rampa inteira (sem vão)
    r = walk(r, [{ x: covil.x + 10, z: covil.z }]);
    expect(r.stuck).toBe(false);
    expect(r.y).toBeCloseTo(covil.y, 1);                       // na arena
  }, 60_000);

  it('a malha desce 1 bloco inteiro (a caverna de antes sai igual) e o covil tem luz quente e névoa longa', () => {
    const cave = fs.readFileSync('src/components/zona-sul/zs-cave.ts', 'utf8');
    expect(cave).toMatch(/const Y_MIN = -46 - CAVE_BLOCK \* CAVE_VOXEL, Y_MAX = 140;/);
    expect(CAVE_LAIR.fogFar).toBeGreaterThan(200);
    expect(CAVE_LAIR.light.y).toBeGreaterThan(covil.y);
    const v = fs.readFileSync('src/components/zona-sul/zs-cave-view.tsx', 'utf8');
    expect(v).toContain('if (inLair) requestLight(lr.light.x, lr.light.y, lr.light.z, LAIR_LIGHT, lr.light.i, lr.light.d, 1.2);');
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('(lair ? CAVE_LAIR.fogFar : ab ? CAVE_ABYSS.fogFar : 75)');
  });
});
