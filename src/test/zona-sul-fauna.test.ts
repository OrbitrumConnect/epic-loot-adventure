import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery, zsWorldProfile } from '@/components/zona-sul/zs-world-profile';
import { createZsWildlife, near, SURF, ZS_CLEAR_R, ZS_FAUNA, ZS_SAFE, type ZsQuery } from '@/game/systems/zsSpawnSystem';
import { CAMP_PLACEMENTS, CAMPS, PLAYER_SPAWN, SAFE_ZONE } from '@/game/data/camps';
import { resetWorldProfile, setWorldProfile, WORLD } from '@/game/data/world-profile';
import { terrainHeight } from '@/components/world/world-kit';
import { isWalkable } from '@/components/world/map-walk';
import { zoneAt } from '@/game/systems/difficultySystem';
import { useGameStore } from '@/game/state/game-store';

/* Pedro 29/10: "espalhar nas áreas: jacaré na Lagoa, leão no campo aberto, acampamentos inimigos entre os matos em locais
   adequados, praia mais vazia". Conferido no TERRENO DE VERDADE (o PNG do jogo). */
let t: ZsTerrain;
let q: ZsQuery;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  q = zsQuery(t);
});
afterAll(() => resetWorldProfile());

describe('Zona Sul — fauna por região e acampamentos na mata', () => {
  it('as espécies saem completas e cada uma no seu lugar; praia e nascedouro vazios', () => {
    const t0 = performance.now();
    const wild = createZsWildlife(q);
    expect(performance.now() - t0).toBeLessThan(1500);
    for (const r of ZS_FAUNA) expect(wild.filter((c) => c.speciesId === r.speciesId).length, r.speciesId).toBe(r.count);
    for (const c of wild) {
      expect(q.surf(c.position.x, c.position.z)).not.toBe(SURF.beach);
      expect(Math.hypot(c.position.x - ZS_SAFE.x, c.position.z - ZS_SAFE.z)).toBeGreaterThanOrEqual(ZS_CLEAR_R);
      expect(zsHeightAt(t, c.position.x, c.position.z)).toBeGreaterThan(0); // ninguém dentro d'água
    }
    for (const c of wild.filter((w) => w.speciesId === 'boar')) expect(near(q, c.position.x, c.position.z, SURF.lagoon, 18)).toBe(true); // jacaré na Lagoa
    for (const c of wild.filter((w) => w.speciesId === 'wolf_alpha')) expect(q.surf(c.position.x, c.position.z)).toBe(ZS_SURF.land);    // leoa no campo
    for (const c of wild.filter((w) => w.speciesId === 'monster')) expect(q.height(c.position.x, c.position.z)).toBeGreaterThanOrEqual(100); // mata alta (morros/Tijuca)
  });

  it('8 acampamentos em clareira plana encostada na mata, longe do nascedouro e uns dos outros; fraco perto, forte longe', () => {
    const p = zsWorldProfile(t, q);
    const sorteados = p.camps.filter((c) => c.id.startsWith('zs_camp_'));
    expect(sorteados).toHaveLength(8);
    for (const c of sorteados) {
      expect(near(q, c.position.x, c.position.z, SURF.forest, 25)).toBe(true);
      expect(q.slope(c.position.x, c.position.z)).toBeLessThan(14);
      expect(Math.hypot(c.position.x - ZS_SAFE.x, c.position.z - ZS_SAFE.z)).toBeGreaterThan(ZS_CLEAR_R);
      for (const o of sorteados) if (o !== c) expect(Math.hypot(o.position.x - c.position.x, o.position.z - c.position.z)).toBeGreaterThanOrEqual(170);
    }
  });

  it('TOPOS armados (Pedro 31/10): Sumaré, Horto, Gávea e Rocinha — no alto, plano, com atirador, sem colar nos outros', () => {
    const p = zsWorldProfile(t, q);
    const topos = p.camps.filter((c) => c.id.startsWith('zs_top_'));
    expect(topos.map((c) => c.id)).toEqual(['zs_top_sumare', 'zs_top_horto', 'zs_top_gavea', 'zs_top_rocinha']);
    for (const c of topos) {
      const { x, z } = c.position;
      expect(q.height(x, z), c.id).toBeGreaterThan(30);                 // no alto
      expect(q.slope(x, z), c.id).toBeLessThan(12);                     // dá pra montar o acampamento
      expect([SURF.sea, SURF.lagoon, SURF.out, SURF.road]).not.toContain(q.surf(x, z));
      expect(CAMPS[c.defId]!.spawns.some((s) => s.speciesId === 'raider_scout'), c.id).toBe(true); // pirata atirador
      for (const o of p.camps) if (o !== c) expect(Math.hypot(o.position.x - x, o.position.z - z), `${c.id}×${o.id}`).toBeGreaterThan(90);
    }
    expect(CAMPS[topos[0]!.defId]!.spawns.some((s) => s.speciesId === 'raider_samurai')).toBe(true); // Sumaré tem Couraça
  });

  it('trocar de mapa troca chão/terra/perigo/acampamentos; voltar ao Vale restaura TUDO igual', () => {
    const before = { spawn: { ...PLAYER_SPAWN }, safe: { ...SAFE_ZONE }, camps: CAMP_PLACEMENTS.map((c) => c.id), h: terrainHeight(10, 10), walk: isWalkable(200, 200) };
    const p = zsWorldProfile(t, q);
    setWorldProfile(p);
    expect(WORLD.id).toBe('zona-sul');
    expect(SAFE_ZONE).toMatchObject({ x: ZS_SAFE.x, z: ZS_SAFE.z });
    expect(CAMP_PLACEMENTS.map((c) => c.id)).toEqual(p.camps.map((c) => c.id));
    expect(terrainHeight(ZS_SAFE.x, ZS_SAFE.z)).toBeCloseTo(zsHeightAt(t, ZS_SAFE.x, ZS_SAFE.z), 5);
    expect(isWalkable(ZS_SAFE.x, ZS_SAFE.z - 200)).toBe(zsHeightAt(t, ZS_SAFE.x, ZS_SAFE.z - 200) > 0.25);
    expect(isWalkable(ZS_SAFE.x, ZS_SAFE.z + 120)).toBe(false); // mar
    expect(zoneAt({ x: ZS_SAFE.x, z: ZS_SAFE.z })).toBe(1);
    expect(zoneAt({ x: -450, z: -150 })).toBe(5); // Floresta da Tijuca
    resetWorldProfile();
    expect({ spawn: { ...PLAYER_SPAWN }, safe: { ...SAFE_ZONE }, camps: CAMP_PLACEMENTS.map((c) => c.id), h: terrainHeight(10, 10), walk: isWalkable(200, 200) }).toEqual(before);
  });

  it('enterWorld: Zona Sul põe a fauna/acampamentos dela e tira os recursos do Vale; voltar recria o Vale', () => {
    const p = zsWorldProfile(t, q);
    setWorldProfile(p);
    const wild = createZsWildlife(q, 1, ZS_FAUNA, p.camps);
    useGameStore.getState().enterWorld('zona-sul', { creatures: wild, position: { x: ZS_SAFE.x, z: ZS_SAFE.z } });
    const s = useGameStore.getState();
    expect(s.camps.map((c) => c.id).sort()).toEqual(p.camps.map((c) => c.id).sort());
    expect(s.harvestNodes).toHaveLength(0);
    expect(s.player.position).toEqual({ x: ZS_SAFE.x, z: ZS_SAFE.z });
    expect(s.creatures.filter((c) => c.id.startsWith('wild_')).length).toBe(wild.length);
    resetWorldProfile();
    useGameStore.getState().enterWorld('classic');
    const v = useGameStore.getState();
    expect(v.harvestNodes.length).toBeGreaterThan(100);
    expect(v.player.position).toEqual({ x: SAFE_ZONE.x, z: SAFE_ZONE.z });
  });
});

describe('Zona Sul — postes nas pistas e o sol do relógio do jogo', () => {
  it('postes na BEIRA das pistas, em terra seca e plana, a ~36 m uns dos outros; cálculo rápido', async () => {
    const { zsLampSpots, LAMP_SPACING } = await import('@/components/zona-sul/zs-daynight');
    const t0 = performance.now();
    const spots = zsLampSpots(t);
    expect(performance.now() - t0).toBeLessThan(800);
    expect(spots.length).toBeGreaterThan(80);
    for (const s of spots) {
      expect(zsHeightAt(t, s.x, s.z)).toBeGreaterThan(0.5);
      expect(near(q, s.x, s.z, ZS_SURF.road, 6)).toBe(true);
      for (const o of spots) if (o !== s) expect((o.x - s.x) ** 2 + (o.z - s.z) ** 2).toBeGreaterThanOrEqual(LAMP_SPACING * LAMP_SPACING);
    }
  }, 30_000); // terreno real inteiro: com a bateria toda rodando junto passa de 5 s
  it('sol: nasce a LESTE às 6h, alto pelo NORTE ao meio-dia, põe a OESTE às 18h, abaixo do horizonte de noite', async () => {
    const { sunDirAt } = await import('@/components/zona-sul/zs-daynight');
    expect(sunDirAt(6).x).toBeGreaterThan(0.8);
    const noon = sunDirAt(12); expect(noon.y).toBeGreaterThan(0.8); expect(noon.z).toBeLessThan(0);
    expect(sunDirAt(18).x).toBeLessThan(-0.8);
    expect(sunDirAt(0).y).toBeLessThan(0);
  });
});
