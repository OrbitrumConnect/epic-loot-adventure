import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt, zsSurfAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_SURF, ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery, zsWorldProfile } from '@/components/zona-sul/zs-world-profile';
import { caveFloorAt, ZS_CAVE_MOUTHS } from '@/components/zona-sul/zs-cave';
import { resetWorldProfile, setWorldProfile, WORLD } from '@/game/data/world-profile';
import { CAMP_PLACEMENTS, SAFE_ZONE } from '@/game/data/camps';
import { CLAIM_SIZE } from '@/game/data/base-pieces';
import { BASE_GRID } from '@/game/types/playerbase';
import { checkClaim, worldToCell } from '@/game/systems/playerBaseSystem';
import { spawnWaveRaiders } from '@/game/state/game-store';
import { createNightPigeons, createNightZombies, isFreeForWildlife } from '@/game/systems/wildlifeSystem';
import { selectTowerTarget } from '@/game/systems/towerSystem';
import { resetLayers, setCreatureLayer } from '@/game/systems/layerSystem';
import type { CreatureState } from '@/game/types';

/* Pedro 31/10: "o go… tudo do Vale passa pra cá, a base toda, a mecânica — sem demorar, sem quebrar, sem mistério, já que
   no Vale já temos tudo correto… e esses avisos online (ver jogador fora da cave) não pode ter". As REGRAS são as do Vale;
   aqui só confere que as medidas do Vale (±90 m, rio, ruínas) viraram as do MAPA ATIVO na Zona Sul. */

let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setWorldProfile(zsWorldProfile(t, zsQuery(t)));
});
afterAll(() => { resetWorldProfile(); resetLayers(); });

const h = (x: number, z: number) => zsHeightAt(t, x, z);
const claimAt = (x: number, z: number) => {
  const cell = worldToCell({ x, z }), half = Math.floor(CLAIM_SIZE / 2);
  return checkClaim({ gx: cell.gx - half, gz: cell.gz - half }, CLAIM_SIZE, { bases: [], heightAt: h }, Date.now());
};
/** Acha um terreno bom pra base (pra provar que DÁ pra reivindicar na Zona Sul). */
function findGoodClaim(): { x: number; z: number } | null {
  for (let x = -600; x <= 600; x += 24) for (let z = -400; z <= 360; z += 24) if (claimAt(x, z).ok) return { x, z };
  return null;
}

describe('base na Zona Sul — reivindicar com as medidas do mapa ativo', () => {
  it('existe terreno bom (plano, seco, longe de acampamento/zona segura) e ele passa', () => {
    const p = findGoodClaim();
    expect(p).not.toBeNull();
    expect(Math.abs(p!.x) > 90 || Math.abs(p!.z) > 90).toBe(true); // fora do quadrado do Vale (±90 m) — antes dava "fora do mapa"
  });
  it('no mar = água; na zona segura (Arpoador) = perto do nascedouro; fora dos limites = fora do mapa', () => {
    // mar: um ponto de mar de Copacabana
    let sea: { x: number; z: number } | null = null;
    for (let x = 200; x <= 500 && !sea; x += 10) for (let z = 200; z <= 450 && !sea; z += 10) if (zsSurfAt(t, x, z) === ZS_SURF.sea && zsSurfAt(t, x - 30, z - 30) === ZS_SURF.sea) sea = { x, z };
    expect(claimAt(sea!.x, sea!.z).issues).toContain('sobre-agua');
    expect(claimAt(SAFE_ZONE.x, SAFE_ZONE.z).issues).toContain('perto-do-nascedouro');
    expect(claimAt(WORLD.bounds.maxX - 2, 0).issues).toContain('fora-do-mapa');
  });
  it('em cima de acampamento não pode; na BOCA da caverna também não', () => {
    const camp = CAMP_PLACEMENTS[0]!;
    expect(claimAt(camp.position.x, camp.position.z).issues).toContain('sobre-acampamento');
    const m = ZS_CAVE_MOUTHS[0]!, mx = m.ax + (m.bx - m.ax) * 0.3, mz = m.az + (m.bz - m.az) * 0.3;
    expect(caveFloorAt(mx, mz)).not.toBeNull();
    expect(claimAt(mx, mz).issues).toContain('sobre-caverna');
  });
});

describe('hordas, chefe e noite na Zona Sul', () => {
  it('a HORDA nasce em volta da base, dentro do mapa e em chão firme (nunca no mar) — não mais presa a ±90 m', () => {
    const p = findGoodClaim()!;
    for (const wave of [1, 5, 12]) {
      const raiders = spawnWaveRaiders(wave, p, 1000 + wave);
      expect(raiders.length).toBeGreaterThan(0);
      for (const r of raiders) {
        expect(WORLD.walkable!(r.position.x, r.position.z), `${r.id} @ ${r.position.x},${r.position.z}`).toBe(true);
        expect(Math.hypot(r.position.x - p.x, r.position.z - p.z)).toBeLessThan(60);
      }
    }
  });
  it('pombos e mortos-vivos da noite nascem perto de quem joga, em chão firme, fora da zona segura', () => {
    const p = findGoodClaim()!;
    let s = 1; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const z = createNightZombies(rng, 6, p), g = createNightPigeons(p, rng);
    expect(z.length).toBeGreaterThan(0);
    expect(g.length).toBeGreaterThan(0);
    for (const c of [...z, ...g]) {
      expect(isFreeForWildlife(c.position)).toBe(true);
      expect(Math.hypot(c.position.x - p.x, c.position.z - p.z)).toBeLessThan(130);
    }
  });
});

describe('base × caverna: a base (superfície) não atira no que está na caverna embaixo', () => {
  it('torre ignora bicho da camada da caverna', () => {
    const mk = (id: string, x: number, z: number): CreatureState => ({ id, speciesId: 'monster', name: 'Aberração', hp: 100, maxHp: 100, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0, position: { x, z }, behavior: 'chase', lootTable: [], respawnAt: null });
    const tower = { id: 't', x: 0, z: 0, tier: 1 as const, hp: 100 };
    const embaixo = mk('wild_cave_x', 2, 0), emCima = mk('wild_monster_1', 4, 0);
    resetLayers(); setCreatureLayer(embaixo.id, 1);
    expect(selectTowerTarget(tower, [embaixo, emCima], undefined, 10_000)).toBe(1);
    expect(selectTowerTarget(tower, [embaixo], undefined, 10_000)).toBe(-1);
    resetLayers();
    expect(selectTowerTarget(tower, [embaixo], undefined, 10_000)).toBe(0);
  });
});

describe('a mecânica é a MESMA do Vale (montada na Zona Sul, sem cópia)', () => {
  it('o mundo da Zona Sul monta base, fogo/luz da base, rota do alvo, bases e jogadores online e o mundo do host', () => {
    const src = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    for (const tag of ['<PlayerBase ', '<NetBases ', '<BaseFireFX', '<BaseNightLights', '<TargetRoute ', '<RemotePlayers', '<MultiplayerWorldSync']) expect(src).toContain(tag);
    expect(src).toContain('broadcastPose(p.x, p.z,'); // pose COM a altura (caverna) vai pra rede
    expect(src).toContain('pushOutHouseWalls'); expect(src).toContain('pushOutBasePieces'); // casa e cerca sólidas
    const home = fs.readFileSync('src/routes/index.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(home).toContain("{!playerBase && (\n");
    expect(home).not.toContain('!zs && <PiecePicker />');
    expect(home).not.toContain("!zs && <BossSpawner />");
  });
  it('luz da base pelo POOL na Zona Sul (sem ligar/desligar luz → sem travada); no Vale como antes', () => {
    for (const f of ['src/components/world/base-night-lights.tsx', 'src/components/world/base-fire.tsx']) expect(fs.readFileSync(f, 'utf8')).toContain('requestLight(');
  });
  it('online × caverna: a IA mira convidado pela camada dele (altura da rede); plaquinha/PvP só na mesma camada', () => {
    expect(fs.readFileSync('src/net/multiplayer.ts', 'utf8')).toMatch(/remoteTargets\(\): \{ id: string; x: number; z: number; y\?: number \}\[\]/);
    expect(fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8')).toContain('under.layer(r.x, r.y, r.z)');
    const rp = fs.readFileSync('src/components/world/remote-players.tsx', 'utf8');
    expect(rp).toContain('sameLayerAsMe(p)');
  });
});
