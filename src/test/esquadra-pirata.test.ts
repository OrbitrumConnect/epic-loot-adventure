import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ballLanding, hullFits, newWarship, WARSHIP } from '@/components/zona-sul/zs-warship';
import {
  crewHitChance, crewSpot, elevationFor, FLEET, FLEET_HALF_BEAM, FLEET_LEN, fleetFire, fleetMaySpawn, fleetShipAt, fleetSpawnSpots, fleetSteer,
  fleetVerdict, isFleetPilot, isFleetUnit, newEnemyShip,
} from '@/components/zona-sul/zs-enemy-fleet';

/* Pedro 03/11: "tropas de navios juntas, 2 3, ~35% menores que o galeão do herói, que luram no barco do herói, atacam com
   canhão" · "o navio deve ter alguém pilotando, possível de matar" · "cada navio inimigo pode ter uns 8 inimigos dentro que
   atiram, fora o capitão". ETAPA 1 (os navios caçam e atiram; capitão e tripulação matáveis). */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const sea = () => true;
const rng = (seed = 5) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('esquadra pirata — navios', () => {
  it('35% menores, 2–3 por esquadra, mais lentos que o seu (dá pra fugir); o seu navio não mudou', () => {
    expect(FLEET.SCALE).toBe(0.65);
    expect(FLEET_LEN).toBeCloseTo(WARSHIP.LENGTH * 0.65, 5);
    expect(FLEET.MIN).toBe(2); expect(FLEET.MAX).toBe(3);
    expect(FLEET.MAX_SPEED).toBeLessThan(WARSHIP.MAX);
    // o casco do herói segue do mesmo tamanho (o comprimento novo é opcional)
    const narrow = (x: number) => Math.abs(x) < 14; // canal de 28 m: o menor cabe de través… o do herói não
    expect(hullFits((x) => narrow(x), 0, 0, Math.PI / 2, FLEET_LEN)).toBe(true);
    expect(hullFits((x) => narrow(x), 0, 0, Math.PI / 2)).toBe(false);
  });

  it('chegam com você NAVEGANDO há 1 min (fora do descanso), a ~260 m, em mar fundo, de proa pra você e lado a lado', () => {
    expect(fleetMaySpawn({ now: 70_000, sailing: true, sailingSince: 0, nextAt: 0, present: false })).toBe(true);
    expect(fleetMaySpawn({ now: 30_000, sailing: true, sailingSince: 0, nextAt: 0, present: false })).toBe(false); // < 1 min
    expect(fleetMaySpawn({ now: 70_000, sailing: false, sailingSince: null, nextAt: 0, present: false })).toBe(false); // a pé
    expect(fleetMaySpawn({ now: 70_000, sailing: true, sailingSince: 0, nextAt: 99_000, present: false })).toBe(false); // descanso
    const spots = fleetSpawnSpots(sea, { x: 0, z: 0 }, 3, rng());
    expect(spots).toHaveLength(3);
    for (const s of spots) {
      const d = Math.hypot(s.x, s.z);
      expect(d).toBeGreaterThan(FLEET.SPAWN_DIST * 0.75); expect(d).toBeLessThan(FLEET.SPAWN_DIST * 1.35);
      expect(Math.abs(wrap(Math.atan2(-s.x, -s.z) - s.yaw))).toBeLessThan(0.35); // proa pra você
    }
    expect(fleetSpawnSpots(() => false, { x: 0, z: 0 }, 3, rng())).toEqual([]); // sem mar fundo: não nasce
  });

  it('caçam: longe = proa pra você; perto = DE LADO (través pra você); sem capitão = à deriva', () => {
    const far = newEnemyShip('a', { x: 0, z: -300, yaw: 0.8 });
    const inp = fleetSteer(far, { x: 0, z: 0 }, []);
    expect(inp.throttle).toBe(1);
    expect(Math.sign(inp.steer)).toBe(1); // yaw 0,8 → precisa voltar pra 0 (diminuir) = leme +
    const near = newEnemyShip('b', { x: 0, z: -70, yaw: 0 }); // proa apontada pra você, a 70 m
    const n = fleetSteer(near, { x: 0, z: 0 }, []);
    expect(Math.abs(n.steer)).toBeGreaterThan(0.9); // vira forte pra pôr o costado
    near.pilotDead = true;
    expect(fleetSteer(near, { x: 0, z: 0 }, [])).toEqual({ throttle: 0, steer: 0 });
  });

  it('atiram com você no TRAVÉS, na distância certa e recarregado; a bala cai perto de onde mirou (balística)', () => {
    const s = newEnemyShip('c', { x: 0, z: 0, yaw: 0 }); // proa +Z; boreste = +X
    expect(fleetFire(s, { x: 0, z: 90 }, 4)).toBeNull(); // de proa: não
    expect(fleetFire(s, { x: 200, z: 0 }, 4)).toBeNull(); // longe demais
    const shot = fleetFire(s, { x: 90, z: 0 }, 4)!;
    expect(shot.side).toBe('starboard');
    expect(shot.balls).toHaveLength(WARSHIP.SALVO);
    expect(s.reload.starboard).toBe(FLEET.RELOAD_S);
    expect(fleetFire(s, { x: 90, z: 0 }, 4)).toBeNull(); // recarregando
    const mid = shot.balls[1]!, land = ballLanding(mid, () => 0);
    // bug pego aqui: sem a altura do costado (4 m) a bala caía 25 m LONGE demais a 90 m
    expect(Math.hypot(land.x - 90, land.z)).toBeLessThan(5);
    for (const d of [35, 60, 140]) { // perto (aponta um pouco pra baixo), médio e longe: cai onde mirou
      const t = newEnemyShip('t', { x: 0, z: 0, yaw: 0 });
      const b = fleetFire(t, { x: d, z: 0 }, 4)!.balls[1]!, l = ballLanding(b, () => 0);
      expect(Math.abs(l.x - d), `d=${d}`).toBeLessThan(5);
    }
    expect(elevationFor(1000)).toBeNull();
    s.pilotDead = true; s.reload.port = 0;
    expect(fleetFire(s, { x: -90, z: 0 }, 4)).toBeNull(); // sem capitão: não atira
  });

  it('vão embora: você abriu 520 m ou saiu do navio por 20 s; derrotados quando todos afundam', () => {
    const s = newEnemyShip('d', { x: 0, z: 0, yaw: 0 });
    expect(fleetVerdict({ now: 0, ships: [s], target: { x: 100, z: 0 }, ashoreSince: null })).toBe('stay');
    expect(fleetVerdict({ now: 0, ships: [s], target: { x: 600, z: 0 }, ashoreSince: null })).toBe('escaped');
    expect(fleetVerdict({ now: 25_000, ships: [s], target: null, ashoreSince: 0 })).toBe('escaped');
    s.sinkT = WARSHIP.SINK_S;
    expect(fleetVerdict({ now: 0, ships: [s], target: { x: 100, z: 0 }, ashoreSince: null })).toBe('beaten');
  });

  it('minha bala no casco DELE (o casco menor): acerta dentro, erra fora', () => {
    const s = newEnemyShip('e', { x: 0, z: 0, yaw: 0 });
    expect(fleetShipAt([s], 0, FLEET_LEN / 2 - 1)).toBe(s);
    expect(fleetShipAt([s], FLEET_HALF_BEAM + 0.5, 0)).toBe(s);
    expect(fleetShipAt([s], 0, FLEET_LEN / 2 + 3)).toBeNull();
    expect(fleetShipAt([s], 8, 0)).toBeNull();
    void newWarship;
  });
});

describe('esquadra pirata — capitão e tripulação', () => {
  it('cada navio: o capitão + 8 de fuzil no convés (dentro do casco), todos matáveis; fora da IA de terra e da rede', () => {
    const s = newEnemyShip('f', { x: 0, z: 0, yaw: 0 });
    expect(isFleetPilot(s.pilotId)).toBe(true);
    expect(s.crewIds).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      const p = crewSpot(i);
      expect(Math.abs(p.u)).toBeLessThan(FLEET_HALF_BEAM);
      expect(Math.abs(p.v)).toBeLessThan(FLEET_LEN / 2);
      expect(isFleetUnit(s.crewIds[i]!)).toBe(true);
    }
    expect(crewHitChance(10)).toBeCloseTo(0.6, 5);
    expect(crewHitChance(FLEET.CREW_RANGE)).toBeCloseTo(0.25, 5);
    expect(crewHitChance(FLEET.CREW_RANGE + 1)).toBe(0);
    expect(FLEET.CREW_RANGE).toBeGreaterThanOrEqual(FLEET.PREF + 20); // alcançam de onde os navios seguram
    expect(read('src/components/world/world-entities.tsx')).toMatch(/creatures\.filter\(\(cr\) => !cr\.id\.startsWith\('fleet_'\)\)/);
    expect(read('src/net/multiplayer.ts')).toMatch(/creatures\.filter\(\(c\) => !c\.id\.startsWith\('fleet_'\)\)/);
    expect(read('src/game/systems/objectiveSystem.ts')).toMatch(/if \(creature\.id\?\.startsWith\('fleet_'\)\) return false;/); // piloto automático não nada até lá
  });

  it('ligado: balas da esquadra tiram vida do seu navio/de você; as suas no casco deles; capitão morto = à deriva', () => {
    const v = read('src/components/zona-sul/zs-warship-view.tsx');
    expect(v).toMatch(/if \(fb\.enemy\) enemyBallLanded\(fb\.land, shipRef\.current, heroRef\.current, warshipHalfBeam\(\)\);/);
    expect(v).toMatch(/const es = fleetShipAt\(zsFleet\.ships, fb\.land\.x, fb\.land\.z\);/);
    const fv = read('src/components/zona-sul/zs-enemy-fleet-view.tsx');
    expect(fv).toMatch(/if \(!s\.pilotDead && \(!pilot \|\| pilot\.behavior === 'dead'\) && s\.sinkT === null\) \{/);
    expect(fv).toMatch(/crs = useGameStore\.getState\(\)\.creatures; \/\/ a lista DE AGORA/); // bug pego: nasciam "abatidos"
    expect(fv).toMatch(/hurtPlayerBy\('Pirata do navio', FLEET\.CREW_DMG/);
    expect(read('src/components/zona-sul/zona-sul-world.tsx')).toMatch(/<ZsEnemyFleetView shipRef=\{shipRef\} heroRef=\{heroRef\} terrain=\{t\} \/>/);
    const hits = read('src/components/zona-sul/zs-enemy-fleet-hits.ts');
    expect(hits).toMatch(/c\.id !== s\.pilotId && !s\.crewIds\.includes\(c\.id\)/); // afundou: capitão e tripulação vão junto
  });
});
