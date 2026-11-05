import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultSpawn, deathStage, resolveSpawn, RESPAWN, samePoints, spawnNudge, spawnPoints, stageSecondsLeft, type SpawnInput,
} from '@/components/zona-sul/zs-respawn';
import { paintZsMap, zsMapColor } from '@/components/hud/zs-map-art';
import { ZS_SURF } from '@/components/zona-sul/zona-sul-meta';

/* Pedro, 05/11: "após a morte, antes de nascer, seria legal o mapa abrir e escolher nascer no navio, na base ou no carro" ·
   "morreu: aparece a mensagem, dura 6 s; depois aparece o mapa e aí tem os 6 s restantes vendo aonde quer nascer; passou os
   12 no total, ele nasce onde escolheu". */
const NOW = 1_000_000;
const base: SpawnInput = {
  now: NOW, base: { x: 100, z: 200 }, beach: { x: 2, z: -28 },
  ship: { x: 500, z: 600, gone: false, unlocked: true, hitAt: 0 },
  car: { x: 50, z: 60, gone: false, unlocked: true, underground: false },
  usedAt: { ship: 0, car: 0 },
};
const kinds = (i: SpawnInput) => spawnPoints(i).map((p) => `${p.kind}${p.ok ? '' : `(${p.why})`}`);

describe('renascer escolhendo no mapa', () => {
  it('6 s de mensagem, 6 s de mapa, nasce aos 12 s', () => {
    expect(RESPAWN.MSG_MS).toBe(6000); expect(RESPAWN.TOTAL_MS).toBe(12_000);
    expect(deathStage(NOW, NOW)).toBe('msg');
    expect(deathStage(NOW, NOW + 5999)).toBe('msg');
    expect(deathStage(NOW, NOW + 6000)).toBe('map');
    expect(deathStage(NOW, NOW + 11_999)).toBe('map');
    expect(deathStage(NOW, NOW + 12_000)).toBe('go');
    expect(stageSecondsLeft(NOW, NOW)).toBe(6);            // o mapa abre em 6
    expect(stageSecondsLeft(NOW, NOW + 6000)).toBe(6);     // nasce em 6
    expect(stageSecondsLeft(NOW, NOW + 11_100)).toBe(1);
  });
  it('pontos: base, navio, carro, praia — todos servem', () => {
    expect(kinds(base)).toEqual(['base', 'ship', 'car', 'beach']);
    const p = spawnPoints(base);
    expect(p.find((q) => q.kind === 'ship')).toMatchObject({ x: 500, z: 600, ok: true, why: null });
  });
  it('sem base / sem navio / sem carro: não aparecem; a praia sempre', () => {
    expect(kinds({ ...base, base: null, ship: null, car: null })).toEqual(['beach']);
  });
  it('navio afundado, sem o nível, em combate (tiro há < 30 s) ou na recarga de 3 min: aparece apagado com o porquê', () => {
    expect(kinds({ ...base, ship: { ...base.ship!, gone: true } })).toContain('ship(afundou)');
    expect(kinds({ ...base, ship: { ...base.ship!, unlocked: false } })).toContain('ship(nível do navio)');
    expect(kinds({ ...base, ship: { ...base.ship!, hitAt: NOW - 10_000 } })).toContain('ship(em combate)');
    expect(kinds({ ...base, ship: { ...base.ship!, hitAt: NOW - 31_000 } })).toContain('ship');
    expect(kinds({ ...base, usedAt: { ship: NOW - 50_000, car: 0 } })).toContain('ship(volta em 2:10)');
    expect(kinds({ ...base, usedAt: { ship: NOW - RESPAWN.VEH_CD_MS, car: 0 } })).toContain('ship');
  });
  it('carro explodido, sem o nível, dentro da caverna ou na recarga: apagado', () => {
    expect(kinds({ ...base, car: { ...base.car!, gone: true } })).toContain('car(explodiu)');
    expect(kinds({ ...base, car: { ...base.car!, unlocked: false } })).toContain('car(nível do carro)');
    expect(kinds({ ...base, car: { ...base.car!, underground: true } })).toContain('car(dentro da caverna)');
    expect(kinds({ ...base, usedAt: { ship: 0, car: NOW - 1000 } })).toContain('car(volta em 2:59)');
  });
  it('sem escolher: a base (senão a praia); escolheu e deixou de servir no meio: cai no padrão', () => {
    const p = spawnPoints(base);
    expect(defaultSpawn(p)).toBe('base');
    expect(resolveSpawn(p, null).kind).toBe('base');
    expect(resolveSpawn(p, 'ship').kind).toBe('ship');
    expect(resolveSpawn(p, 'car')).toMatchObject({ kind: 'car', x: 50, z: 60 });
    expect(resolveSpawn(p, 'beach').kind).toBe('beach');
    const sunk = spawnPoints({ ...base, ship: { ...base.ship!, gone: true } });
    expect(resolveSpawn(sunk, 'ship').kind).toBe('base');
    const noBase = spawnPoints({ ...base, base: null, ship: { ...base.ship!, gone: true } });
    expect(defaultSpawn(noBase)).toBe('beach');
    expect(resolveSpawn(noBase, 'ship').kind).toBe('beach');
  });
  it('samePoints: não repinta à toa (anda < 3 m), repinta se mudou o estado', () => {
    const a = spawnPoints(base), b = spawnPoints({ ...base, ship: { ...base.ship!, x: 501 } });
    expect(samePoints(a, b)).toBe(true);
    expect(samePoints(a, spawnPoints({ ...base, ship: { ...base.ship!, gone: true } }))).toBe(false);
    expect(samePoints(a, spawnPoints({ ...base, car: null }))).toBe(false);
  });
  it('morreu no caminho do Canibal (Pedro: "joga lá pra porta da cave, início de tudo"): a ENTRADA DA CAVERNA aparece, sem espera', () => {
    expect(kinds(base)).not.toContain('cave');                                       // sem morrer na caverna: nem aparece
    const p = spawnPoints({ ...base, cave: { x: -1110, z: -201 } });
    expect(p.map((q) => q.kind)).toEqual(['base', 'ship', 'car', 'cave', 'beach']);
    expect(p.find((q) => q.kind === 'cave')).toMatchObject({ x: -1110, z: -201, ok: true, why: null });
    expect(resolveSpawn(p, 'cave').kind).toBe('cave');
    expect(defaultSpawn(p)).toBe('base');                                            // o padrão segue a base
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain('zsRespawnMem.cave = zsChasm.last ? caveEntrySpot() : null; resetChasm(); }');
    expect(w).toContain('usedAt: zsRespawnMem.usedAt, cave: zsRespawnMem.cave,');
    expect(w).toContain("} else if (sp.kind === 'cave') {");
  });
  it('pontos quase no mesmo lugar (carro estacionado do lado da praia): o 2º vai de lado', () => {
    const p = spawnPoints({ ...base, car: { ...base.car!, x: 93, z: 388 }, beach: { x: 90, z: 390 } });
    expect(p.map((q) => q.kind)).toEqual(['base', 'ship', 'car', 'beach']);
    expect(spawnNudge(p)).toEqual([0, 0, 0, 1]);
    expect(spawnNudge(spawnPoints(base))).toEqual([0, 0, 0, 0]);
  });
  it('ligado: o mundo nasce aos 12 s no ponto escolhido (navio no convés, carro do lado); a tela só na Zona Sul', () => {
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain("if (deathStage(R.deathAt, wall) === 'go' && R.points.length) {");
    expect(w).toContain('const sp = resolveSpawn(R.points, R.choice);');
    expect(w).toContain('p.set(at.x, at.y, at.z); facing.current = ship.yaw; onDeck.current = true; zsRespawnMem.usedAt.ship = wall;');
    expect(w).toContain("underground: car.y < zsHeightAt(t, car.x, car.z) - 3");
    // navio em combate: o hp do MEU navio caiu
    expect(w).toContain('if (M.shipHp >= 0 && ship.hp < M.shipHp) M.shipHitAt = Date.now();');
    // o renascer antigo (15 s) saiu da Zona Sul
    expect(w).not.toContain('gs.player.respawnAt > 0 && Date.now() >= gs.player.respawnAt');
    const r = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(r).toContain('{player.dead && !inCity && zs && <ZsRespawnScreen deathBy={ui.deathBy} />}');
    expect(r).toContain('{player.dead && !inCity && !zs && ('); // o Vale segue com a tela de sempre
    const v = fs.readFileSync('src/components/hud/zs-respawn-screen.tsx', 'utf8');
    expect(v).toContain("if (stage === 'msg') {");
    expect(v).toContain('const pick = (k: SpawnKind) => useZsRespawn.setState({ choice: k });');
  });
});

/* o terrain.png é DADO (altura em R/G) — cru na tela fica verde-neon; o mapa do renascer é DESENHADO a partir dele */
describe('mapa desenhado (renascer)', () => {
  it('mar azul (mais escuro no fundo), areia, mata verde, pedra no alto; relevo clareia a encosta virada pra luz', () => {
    const raso = zsMapColor(ZS_SURF.sea, -1, 1), fundo = zsMapColor(ZS_SURF.sea, -40, 1);
    expect(raso[2]).toBeGreaterThan(raso[0]); expect(fundo[2]).toBeLessThan(raso[2]);   // azul, e mais escuro no fundo
    const areia = zsMapColor(ZS_SURF.beach, 1, 1); expect(areia[0]).toBeGreaterThan(200);
    const mata = zsMapColor(ZS_SURF.forest, 100, 1); expect(mata[1]).toBeGreaterThan(mata[0]); expect(mata[1]).toBeGreaterThan(mata[2]);
    const pico = zsMapColor(ZS_SURF.land, 900, 1); expect(Math.abs(pico[0] - pico[1])).toBeLessThan(20); // cinza
    expect(zsMapColor(ZS_SURF.land, 200, 1.3)[1]).toBeGreaterThan(zsMapColor(ZS_SURF.land, 200, 0.7)[1]);
  });
  it('pinta 1 pixel por célula, opaco; a encosta que sobe pro sudeste (olha pro noroeste) clareia', () => {
    const w = 4, h = 3, heights = new Float32Array(w * h), surf = new Uint8Array(w * h).fill(ZS_SURF.land);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) heights[j * w + i] = 100 + i * 10; // sobe pro leste
    const out = new Uint8ClampedArray(w * h * 4);
    paintZsMap({ w, h, cell: 4, x0: 0, z0: 0, heights, surf }, out);
    for (let k = 0; k < w * h; k++) expect(out[k * 4 + 3]).toBe(255);
    const plano = zsMapColor(ZS_SURF.land, 110, 1);
    expect(out[(1 * w + 1) * 4 + 1]).toBeGreaterThan(plano[1]); // encosta pro oeste/noroeste: mais clara
    const v = fs.readFileSync('src/components/hud/zs-respawn-screen.tsx', 'utf8');
    expect(v).toContain('zsMapArtUrl().then((u) => { if (on) setArt(u); })');
    expect(v).not.toContain('src={ZS_TERRAIN.url}'); // nunca o PNG de dado cru
  });
});
