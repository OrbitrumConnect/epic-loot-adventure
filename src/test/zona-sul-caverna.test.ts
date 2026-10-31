import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { triTable } from 'three/addons/objects/MarchingCubes.js';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import {
  CAVE_BOSS, CAVE_MOUTH_ZONE, CAVE_ROOMS, CAVE_TUNNELS, caveEnemySpots, caveCamFit, caveField, caveFloorAt, caveInside, caveLayer, caveMeshJob, caveMouthClear,
  caveMove, caveNearXZ, cavePoolY, caveStandAt, setCaveTerrain, ZS_CAVE_MOUTHS, zsCaveUnder,
} from '@/components/zona-sul/zs-cave';
import { zsVegetationAround } from '@/components/zona-sul/zs-vegetation';
import { createCaveBoss, createCaveCreatures } from '@/components/zona-sul/zs-world-profile';
import { WORLD } from '@/game/data/world-profile';
import { layers, resetLayers, sameLayerAsPlayer, setCreatureLayer } from '@/game/systems/layerSystem';

/* Pedro 30/10: "a estrada que chega na base do Cristo perto da subida do Humaitá — abrir um buraco, cave, entrada
   EXATAMENTE onde é a entrada do túnel Rebouças; pra dentro da pedra curvando pra baixo abrindo galerias, local com água e
   uma big cave pra explorar com salão no final no fundo pra boss. A cave pega todo o interior do maciço que envolve Jardim
   Botânico e Gávea e pode ter uma saída perto do Leblon, menor que a entrada do Rebouças. Só uma camada do mapa embaixo
   do que já tem, sem pesar, só shapes." */

let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});

/** Silhueta de longe do chão (mesma triangulação do `buildTerrainPatch`): a caverna não pode cortar nem ela. */
function chord(x: number, z: number, step: number, drop: number): number {
  const fi = (x - t.x0) / t.cell, fj = (z - t.z0) / t.cell;
  const i0 = Math.floor(fi / step) * step, j0 = Math.floor(fj / step) * step;
  const H = (i: number, j: number) => t.heights[Math.max(0, Math.min(t.h - 1, j)) * t.w + Math.max(0, Math.min(t.w - 1, i))]!;
  const u = (fi - i0) / step, v = (fj - j0) / step;
  const a = H(i0, j0), b = H(i0 + step, j0), c = H(i0, j0 + step), d = H(i0 + step, j0 + step);
  return (u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v)) - drop;
}
const mouth = (id: string) => ZS_CAVE_MOUTHS.find((m) => m.id === id)!;
const inFirstSeg = (x: number, z: number) => ZS_CAVE_MOUTHS.some((m) => {
  const abx = m.bx - m.ax, abz = m.bz - m.az, k = ((x - m.ax) * abx + (z - m.az) * abz) / (abx * abx + abz * abz);
  return k >= -0.05 && k <= 1;
});

describe('caverna da Zona Sul — onde fica', () => {
  it('a boca é EXATAMENTE a ponta sul do Túnel Rebouças (OSM, −70/−59), no chão da rua; a do Leblon é menor', () => {
    const r = mouth('reboucas'), l = mouth('leblon');
    expect(Math.hypot(r.ax - -70, r.az - -59)).toBeLessThan(6);
    expect(Math.abs(r.ay - zsHeightAt(t, r.ax, r.az))).toBeLessThan(0.3); // o chão do túnel começa no chão do mapa
    expect(Math.abs(l.ay - zsHeightAt(t, l.ax, l.az))).toBeLessThan(0.3);
    expect(l.ra * l.ha).toBeLessThan(r.ra * r.ha * 0.5);
    expect(l.az).toBeGreaterThan(330); // no pé do morro, no fim do Leblon
    // 31/10: saída de LARANJEIRAS (quase Flamengo) — pé do Morro de São Judas Tadeu, virada pra Rua das Laranjeiras
    const j = mouth('laranjeiras');
    expect(Math.abs(j.ay - zsHeightAt(t, j.ax, j.az))).toBeLessThan(0.3);
    expect(Math.hypot(j.ax - 149, j.az - -409)).toBeLessThan(80);
    expect(j.ra * j.ha).toBeLessThan(r.ra * r.ha);
  });
  it('túneis por dentro mais altos e largos (Pedro 31/10): ≥ 6 m de largura e ≥ 7 m de altura fora das bocas', () => {
    for (const tn of CAVE_TUNNELS) tn.pts.slice(tn.mouth ? 2 : 0).forEach((p) => { expect(p.r * 2, tn.id).toBeGreaterThanOrEqual(9); expect(p.h, tn.id).toBeGreaterThanOrEqual(6.2); });
  });
  it('o salão do chefe é o ponto MAIS FUNDO; tem galeria com ÁGUA e uma caverna GRANDE', () => {
    const boss = CAVE_ROOMS.find((r) => r.id === 'chefe')!;
    expect(Math.min(...CAVE_ROOMS.map((r) => r.y))).toBe(boss.y);
    expect(CAVE_ROOMS.some((r) => (r.pools?.length ?? 0) > 0)).toBe(true);
    const big = CAVE_ROOMS.find((r) => r.id === 'grande')!;
    expect(big.rx * big.rz).toBeGreaterThanOrEqual(Math.max(...CAVE_ROOMS.map((r) => r.rx * r.rz)));
  });
});

describe('caverna — uma camada EMBAIXO do mapa (não fura nada)', () => {
  it('em toda a caverna o teto fica abaixo do chão do mapa (e da silhueta de longe); o chão nunca passa da encosta', () => {
    let furos = 0, flutua = 0, n = 0;
    for (let x = -660; x <= -40; x += 3) for (let z = -260; z <= 400; z += 3) {
      if (!caveNearXZ(x, z)) continue;
      const fl = caveFloorAt(x, z);
      if (fl === null) continue;
      let top = -Infinity;
      for (let y = fl - 1; y < fl + 30; y += 0.5) if (caveField(x, y, z) < 0) top = y;
      if (top === -Infinity) continue;
      n++;
      const g = zsHeightAt(t, x, z);
      if (fl > g + 0.05) flutua++;
      if (inFirstSeg(x, z)) continue; // a boca: ali o buraco é de propósito
      const cover = Math.min(g, chord(x, z, 8, 2.5), chord(x, z, 4, 0), chord(x, z, 2, 0));
      if (cover - top < 0.4) furos++;
    }
    expect(n).toBeGreaterThan(1500);
    expect(furos).toBe(0);
    expect(flutua).toBe(0);
  });
  it('nenhuma árvore na boca (o buraco fica limpo)', () => {
    for (const m of ZS_CAVE_MOUTHS) {
      const veg = zsVegetationAround(t, m.ax, m.az, 60, 60);
      expect(veg.filter((v) => !caveMouthClear(v.x, v.z, 0))).toHaveLength(0);
    }
  });
});

describe('caverna — dá pra andar dela inteira', () => {
  it('da boca do Rebouças se chega (a pé, sem pular parede) em TODOS os salões, no fundo do chefe e na boca do Leblon', () => {
    const S = 2, X0 = -680, Z0 = -460, W = Math.ceil((120 - X0) / S), H = Math.ceil((420 - Z0) / S);
    const fl = new Float32Array(W * H).fill(NaN);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      if (!caveNearXZ(x, z)) continue;
      const f = caveStandAt(x, z);
      if (f !== null) fl[j * W + i] = f;
    }
    const idx = (x: number, z: number) => Math.round((z - Z0) / S) * W + Math.round((x - X0) / S);
    const near = (x: number, z: number) => { // célula andável mais perto (até 6 m)
      let best = -1, bd = Infinity;
      for (let dz = -6; dz <= 6; dz += S) for (let dx = -6; dx <= 6; dx += S) { const k = idx(x + dx, z + dz); if (!Number.isNaN(fl[k]!) && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = k; } }
      return best;
    };
    const r = mouth('reboucas');
    const start = near(r.ax + (r.bx - r.ax) * 0.15, r.az + (r.bz - r.az) * 0.15);
    expect(start).toBeGreaterThanOrEqual(0);
    const seen = new Uint8Array(W * H), q = [start]; seen[start] = 1;
    while (q.length) {
      const k = q.pop()!, i = k % W, j = (k - i) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj, nk = nj * W + ni;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H || seen[nk] || Number.isNaN(fl[nk]!)) continue;
        if (Math.abs(fl[nk]! - fl[k]!) > 0.85) continue; // degrau maior = parede
        seen[nk] = 1; q.push(nk);
      }
    }
    for (const room of CAVE_ROOMS) {
      const k = near(room.x + (room.id === 'grande' ? 0 : 0), room.z);
      expect(k, room.name).toBeGreaterThanOrEqual(0);
      expect(seen[k], room.name).toBe(1);
    }
    for (const id of ['leblon', 'laranjeiras']) {
      const l = mouth(id);
      const lk = near(l.ax + (l.bx - l.ax) * 0.15, l.az + (l.bz - l.az) * 0.15);
      expect(seen[lk], id).toBe(1);
    }
  });
  it('herói: entra pela boca (o chão é o do túnel), a parede segura, e sai pela boca do Leblon pro chão do mapa', () => {
    const r = mouth('reboucas');
    // de fora (rua do Humaitá), andando pra boca em passinhos de quadro: vira caverna e o chão desce junto
    let w = { x: r.ax, z: r.az + 4, y: zsHeightAt(t, r.ax, r.az + 4) };
    expect(caveInside(w.x, w.y, w.z)).toBe(false);
    let inCave = false;
    for (let s = 0; s < 80; s++) {
      const m = caveMove(t, w.x, w.z, w.y, 0, -0.25);
      if (m) { w = { x: m.x, z: m.z, y: m.ground }; inCave = m.inCave; } else w = { x: w.x, z: w.z - 0.25, y: zsHeightAt(t, w.x, w.z - 0.25) };
    }
    expect(inCave).toBe(true);
    expect(w.z).toBeLessThan(r.az - 15);                       // andou 20 m pra dentro, sem travar
    expect(w.y).toBeCloseTo(caveFloorAt(w.x, w.z)!, 3);         // no chão do túnel
    expect(zsHeightAt(t, w.x, w.z) - w.y).toBeGreaterThan(4);   // com rocha em cima
    // lá dentro, contra a parede: não atravessa (fica dentro da caverna)
    const fl = caveFloorAt(-112, -142)!;
    let p = { x: -112, z: -142, y: fl };
    for (let s = 0; s < 80; s++) { const m = caveMove(t, p.x, p.z, p.y, 0, 0.5)!; p = { x: m.x, z: m.z, y: m.ground }; }
    expect(caveInside(p.x, p.y, p.z)).toBe(true);
    expect(caveStandAt(p.x, p.z)).not.toBeNull();
    // Leblon: andando pra fora, termina no chão do mapa (fora da caverna)
    const l = mouth('leblon');
    let q = { x: l.ax - 10, z: l.az, y: caveFloorAt(l.ax - 10, l.az)! };
    let last = null as ReturnType<typeof caveMove>;
    for (let s = 0; s < 60; s++) { last = caveMove(t, q.x, q.z, q.y, 0.5, 0); if (!last) break; q = { x: last.x, z: last.z, y: last.ground }; if (!last.inCave) break; }
    expect(last?.inCave).toBe(false);
    expect(Math.abs(q.y - zsHeightAt(t, q.x, q.z))).toBeLessThan(0.5);
  });
  it('poça: dá pra entrar na água (raso) da galeria d\'água', () => {
    const w = CAVE_ROOMS.find((r) => r.id === 'agua')!;
    const py = cavePoolY(w.x, w.z)!, f = caveFloorAt(w.x, w.z)!;
    expect(py - f).toBeGreaterThan(0.5); // água no joelho
    expect(caveMove(t, w.x - 0.3, w.z, f, 0.3, 0)!.wading).toBe(true);
  });
  it('câmera dentro da caverna não entra na rocha', () => {
    const fl = caveFloorAt(-112, -142)!;
    // câmera 30 m "atrás" atravessando a parede: só uma parte do caminho cabe
    const k = caveCamFit(t, -112, fl + 1.6, -142, -112, fl + 6, -112);
    expect(k).toBeLessThan(1);
    const kk = k;
    const x = -112, y = fl + 1.6 + (fl + 6 - fl - 1.6) * kk, z = -142 + 30 * kk;
    expect(caveField(x, y, z)).toBeLessThan(0);
  });
});

describe('caverna — camada: ninguém briga através da rocha', () => {
  it('o chefe no salão é da caverna (1); em cima do morro é superfície (0); a boca conta como superfície', () => {
    const y = caveFloorAt(CAVE_BOSS.x, CAVE_BOSS.z)!;
    expect(caveLayer(CAVE_BOSS.x, y, CAVE_BOSS.z)).toBe(1);
    expect(caveLayer(CAVE_BOSS.x, zsHeightAt(t, CAVE_BOSS.x, CAVE_BOSS.z), CAVE_BOSS.z)).toBe(0);
    const r = mouth('reboucas'), mx = r.ax + (r.bx - r.ax) * 0.2, mz = r.az + (r.bz - r.az) * 0.2;
    expect(caveInside(mx, caveFloorAt(mx, mz)!, mz)).toBe(true);
    expect(caveLayer(mx, caveFloorAt(mx, mz)!, mz)).toBe(0);
    expect(CAVE_MOUTH_ZONE).toBeGreaterThan(8);
  });
  it('mesma camada pra mirar/atacar; sem mundo embaixo (Vale) tudo vale como antes', () => {
    const before = WORLD.under;
    try {
      WORLD.under = zsCaveUnder(t);
      resetLayers();
      setCreatureLayer('chefe', 1);
      expect(sameLayerAsPlayer('chefe')).toBe(false);
      expect(sameLayerAsPlayer('macaco')).toBe(true);
      layers.player = 1;
      expect(sameLayerAsPlayer('chefe')).toBe(true);
      expect(sameLayerAsPlayer('macaco')).toBe(false);
      WORLD.under = null;
      expect(sameLayerAsPlayer('chefe')).toBe(true);
      expect(sameLayerAsPlayer('macaco')).toBe(true);
    } finally { WORLD.under = before; resetLayers(); setCaveTerrain(t); }
  });
  it('inimigos DENTRO da caverna (Pedro 31/10): nos salões, em pé no chão, camada da caverna, fauna (força pela região)', () => {
    const spots = caveEnemySpots();
    expect(spots.length).toBeGreaterThanOrEqual(12);
    const u = zsCaveUnder(t);
    for (const s of spots) {
      expect(s.id.startsWith('wild_cave_'), s.id).toBe(true);
      const fl = caveStandAt(s.x, s.z);
      expect(fl, s.id).not.toBeNull();
      expect(u.homeY(s.id, s.x, s.z)).toBeCloseTo(fl!, 3);
      expect(caveLayer(s.x, fl!, s.z), s.id).toBe(1);
    }
    const all = createCaveCreatures();
    expect(all.filter((c) => c.id.startsWith('wild_cave_'))).toHaveLength(spots.length);
    expect(all.some((c) => c.id === CAVE_BOSS.id)).toBe(true);
  });
  it('o chefe (Aberração Fúngica, 1,5× vida) nasce no chão do salão do fundo', () => {
    const b = createCaveBoss()!;
    expect(b.speciesId).toBe('raider_mushroom');
    const u = zsCaveUnder(t);
    const hy = u.homeY(b.id, b.position.x, b.position.z)!;
    expect(hy).toBeLessThan(-25);
    expect(u.floor(b.position.x, b.position.z, hy)).toBeCloseTo(hy, 3);
    expect(u.homeY('wild_monster_1', b.position.x, b.position.z)).toBeNull();
  });
});

describe('caverna — leve', () => {
  it('a malha sai da mesma conta (marching cubes) e cabe no orçamento: < 90 mil triângulos (túneis maiores + Laranjeiras), < 70 pedaços', () => {
    const job = caveMeshJob(triTable);
    let r = job.next();
    while (!r.done) r = job.next();
    const tris = r.value.reduce((s, x) => s + x.idx.length / 3, 0);
    expect(tris).toBeGreaterThan(20000);
    expect(tris).toBeLessThan(90000);
    expect(r.value.length).toBeLessThan(70);
    // as normais apontam pro AR (de dentro da caverna)
    const tile = r.value[0]!;
    let ok = 0;
    for (let i = 0; i < Math.min(200, tile.pos.length / 3); i++) {
      const x = tile.pos[i * 3]! + tile.nor[i * 3]! * 0.4, y = tile.pos[i * 3 + 1]! + tile.nor[i * 3 + 1]! * 0.4, z = tile.pos[i * 3 + 2]! + tile.nor[i * 3 + 2]! * 0.4;
      if (caveField(x, y, z) < 0) ok++;
    }
    expect(ok / Math.min(200, tile.pos.length / 3)).toBeGreaterThan(0.9);
  }, 60000);
});
