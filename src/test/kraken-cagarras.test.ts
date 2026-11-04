import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newWarship, WARSHIP } from '@/components/zona-sul/zs-warship';
import {
  allTentaclesCut, hullNearestPoint, isKrakenBoss, KRAKEN_BODY_ID, KRAKEN_BOSS, krakenPhaseStep, krakenTentId, nearestShip, newKraken,
  slamLean, SLAM_TOTAL_S, tentacleBase, tentacleStep, tentacleTarget,
} from '@/components/zona-sul/zs-kraken-boss';
import { deadCreature } from '@/game/state/game-store';
import type { CreatureState } from '@/game/types';

/* Pedro 03/11 (ETAPA 3 da esquadra pirata): "o Kraken chefe nas Cagarras: metade do corpo pra fora d'água, tentáculos;
   luta de navio, com os canhões nos tentáculos" — e online como tudo. */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const HB = WARSHIP.LENGTH * 0.12, L = KRAKEN_BOSS.LAIR;

describe('Kraken das Cagarras — covil e fases', () => {
  it('mora no mar fundo ao norte das Cagarras (~110 m das ilhas Cagarra e Palmas)', () => {
    expect(Math.hypot(L.x - 96, L.z - 961)).toBeLessThan(130);   // Ilha Cagarra no jogo
    expect(Math.hypot(L.x + 56, L.z - 955)).toBeLessThan(130);   // Palmas
  });
  it('dorme → NAVIO a ≤ 220 m acorda → sobe em 4 s → luta; todos longe 30 s = afunda e volta inteiro', () => {
    const k = newKraken();
    expect(krakenPhaseStep(k, 0, 0.1, 300)).toBe('sleep');
    expect(krakenPhaseStep(k, 100, 0.1, 200)).toBe('rise');
    for (let i = 0; i < 40; i++) krakenPhaseStep(k, 200 + i * 100, 0.1, 150);
    expect(k.phase).toBe('fight');
    k.tents[0]!.alive = false;
    krakenPhaseStep(k, 10_000, 0.1, 1000);          // longe agora…
    expect(k.phase).toBe('fight');
    krakenPhaseStep(k, 10_000 + KRAKEN_BOSS.SLEEP_MS + 1, 0.1, 1000);
    expect(k.phase).toBe('sleep');
    expect(k.tents[0]!.alive).toBe(true);            // volta inteiro
  });
  it('morto: volta em 20 min; não renasce pelo relógio dos bichos (o dele manda)', () => {
    const k = newKraken(); k.phase = 'dead'; k.nextAt = 5000;
    expect(krakenPhaseStep(k, 4999, 0.1, 9999)).toBe('dead');
    expect(krakenPhaseStep(k, 5000, 0.1, 9999)).toBe('sleep');
    expect(KRAKEN_BOSS.RESPAWN_MS).toBe(20 * 60_000);
    const c = { id: KRAKEN_BODY_ID, speciesId: 'raider_kraken', name: 'K', hp: 1, maxHp: 1, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0, position: { x: 0, z: 0 }, behavior: 'patrol', lootTable: [], respawnAt: null } as CreatureState;
    expect(deadCreature(c, 1000, () => 0.5).respawnAt).toBeNull();
  });
});

describe('Kraken das Cagarras — tentáculos e corpo', () => {
  it('6 tentáculos num anel de 13 m; cada um com vida própria (bicho `zs_kraken_t*`)', () => {
    expect(KRAKEN_BOSS.TENTACLES).toBe(6);
    for (let i = 0; i < 6; i++) expect(Math.hypot(tentacleBase(i).x - L.x, tentacleBase(i).z - L.z)).toBeCloseTo(KRAKEN_BOSS.TENT_RING, 5);
    expect(isKrakenBoss(krakenTentId(3))).toBe(true);
    expect(isKrakenBoss(KRAKEN_BODY_ID)).toBe(true);
  });
  it('chicoteia o CASCO ao alcance (ponto do casco mais perto); sem navio, quem NADA; longe, nada', () => {
    const b = tentacleBase(0);
    const near = newWarship(b.x + 18, b.z, 0); // casco a ~18 − meia boca da base
    const tg = tentacleTarget(b, [{ owner: 'eu', ...near }], [], HB)!;
    expect(tg.kind).toBe('ship');
    expect(Math.hypot(tg.x - b.x, tg.z - b.z)).toBeLessThanOrEqual(KRAKEN_BOSS.TENT_REACH);
    const q = hullNearestPoint(near, b, HB);
    expect(q.x).toBeCloseTo(near.x - HB, 5);
    expect(tentacleTarget(b, [{ owner: 'eu', ...newWarship(b.x + 80, b.z, 0) }], [], HB)).toBeNull();
    expect(tentacleTarget(b, [], [{ id: 'x', x: b.x + 5, z: b.z, inWater: true }], HB)?.kind).toBe('hero');
    expect(tentacleTarget(b, [], [{ id: 'x', x: b.x + 5, z: b.z, inWater: false }], HB)).toBeNull(); // na areia/convés longe: não
  });
  it('chicotada: levanta pra trás, bate (dano 1× no quadro da pancada), fica na água e volta; recarga 4,2 s', () => {
    const tn = newKraken().tents[0]!; tn.reload = 0;
    const tg = { kind: 'ship' as const, owner: 'eu', x: 1, z: 2 };
    let hits = 0, t = 0;
    for (; t < SLAM_TOTAL_S + 0.2; t += 0.05) if (tentacleStep(tn, 0.05, () => tg)) hits++;
    expect(hits).toBe(1);
    expect(tn.slam).toBeNull();
    expect(tn.reload).toBeGreaterThan(KRAKEN_BOSS.TENT_SLAM_S - 0.3);
    expect(slamLean(0.5)).toBeLessThan(0);                                         // arma o golpe
    expect(slamLean(KRAKEN_BOSS.TENT_WIND_S + KRAKEN_BOSS.TENT_STRIKE_S + 0.1)).toBeCloseTo(Math.PI / 2, 5); // na água
    tn.alive = false;
    expect(tentacleStep(tn, 5, () => tg)).toBeNull();                              // cortado não bate
  });
  it('corpo protegido até cortar TODOS; o navio mais perto (pelo casco) é o alvo da pedra/pancada', () => {
    const k = newKraken();
    expect(allTentaclesCut(k)).toBe(false);
    k.tents.forEach((t) => { t.alive = false; });
    expect(allTentaclesCut(k)).toBe(true);
    const a = newWarship(L.x, L.z - 60, 0), b2 = newWarship(L.x + 150, L.z, 0);
    expect(nearestShip([{ owner: 'b', ...b2 }, { owner: 'a', ...a }], HB)!.ship.owner).toBe('a');
    expect(KRAKEN_BOSS.ROCK_RANGE).toBeLessThan(276); // alcance da bala a 45° (52 m/s): a pedra chega
  });
});

describe('Kraken das Cagarras — ligado no jogo e online', () => {
  const v = read('src/components/zona-sul/zs-kraken-boss-view.tsx');
  it('canhão e fuzil pegam pelo caminho de sempre (bichos da store); o corpo só entra exposto', () => {
    expect(v).toMatch(/krakenCreature\(krakenTentId\(i\), 'Tentáculo do Kraken', KRAKEN_BOSS\.TENT_HP/);
    expect(v).toMatch(/if \(allTentaclesCut\(K\) && !K\.bodyOut\) \{/);
    // bug pego no navegador: o corpo acabado de entrar não estava na lista antiga (dava o Kraken por morto)
    expect(v).toMatch(/const body = useGameStore\.getState\(\)\.creatures\.find\(\(q\) => q\.id === KRAKEN_BODY_ID\);/);
  });
  it('dano: meu navio direto; o de quem está na sala pelo ship-hit de bicho; a pedra pela bala inimiga de sempre', () => {
    expect(v).toMatch(/else broadcastPirateShipHit\(tg\.owner, shipDmg, 'Kraken das Cagarras'\);/);
    expect(v).toMatch(/warshipFx\.balls\.push\(\{ b: ball, t0: performance\.now\(\), land, hit: false, enemy: 'kraken' \}\);/);
    expect(read('src/components/zona-sul/zs-warship-view.tsx')).toMatch(/fb\.enemy === 'kraken' \? 'kraken' : 'pirata'/);
  });
  it('online: o anfitrião manda fase/olhar/chicotadas (kraken); o convidado espelha', () => {
    const net = read('src/net/multiplayer.ts');
    expect(net).toMatch(/ch\.on\('broadcast', \{ event: 'kraken' \}/);
    expect(v).toMatch(/if \(isGuestInRoom\(\)\) \{/);
    expect(v).toMatch(/broadcastKraken\(\{/);
  });
  it('fora da IA de terra, do piloto automático e da lista de inimigos; montado no mundo', () => {
    expect(read('src/components/world/world-entities.tsx')).toMatch(/!cr\.id\.startsWith\('zs_kraken_'\)/);
    expect(read('src/game/systems/objectiveSystem.ts')).toMatch(/if \(creature\.id\?\.startsWith\('zs_kraken_'\)\) return false;/);
    expect(read('src/components/zona-sul/zona-sul-world.tsx')).toMatch(/<ZsKrakenBoss shipRef=\{shipRef\} heroRef=\{heroRef\} terrain=\{t\} \/>/);
  });
});
