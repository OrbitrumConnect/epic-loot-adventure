import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newWarship, WARSHIP } from '@/components/zona-sul/zs-warship';
import {
  allTentaclesCut, hullNearestPoint, isKrakenBoss, KRAKEN_BODY_ID, KRAKEN_BOSS, KRAKEN_SPAWN_PREFIX, krakenBallHit, krakenGaveUp, krakenPhaseStep,
  krakenShapes, krakenTentId, krakenWalk, nearestShip, newKraken, pullBoost, slamLean, SLAM_TOTAL_S, spawnCount, suckedDown, tentacleBase, tentacleStep,
  tentacleTarget, whirlpoolOn, whirlpoolPull,
} from '@/components/zona-sul/zs-kraken-boss';
import { deadCreature } from '@/game/state/game-store';
import type { CreatureState } from '@/game/types';

/* Pedro 03/11 (ETAPA 3 da esquadra pirata): "o Kraken chefe nas Cagarras: metade do corpo pra fora d'água, tentáculos;
   luta de navio, com os canhões nos tentáculos". 04/11 (v2 KAIJU): "bem maior; mar turvo em volta (vejo a perna); pés
   enterrados até a cintura; sem tentáculos ele sai e vem devagar (o barco um pouco mais rápido); fugiu ~80 m, volta 100%;
   redemoinho puxando o barco; mais vida; cada tentáculo cortado = 1–2 krakens sobem no barco; tubarões vêm junto". */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const HB = WARSHIP.LENGTH * 0.12, L = KRAKEN_BOSS.LAIR;

describe('Kraken das Cagarras — kaiju', () => {
  it('mora no mar aberto a OESTE das Palmas (Pedro: "aqui!" e depois "mais pro lado, mais afastado das ilhas"), de frente pra praia', () => {
    // 04/11 (noite, Pedro, na foto: "ele poderia estar bem mais pro lado, um pouco mais afastado das ilhas"): ~310 m pra
    // oeste/mar aberto — mar fundo (−12 m), a terra mais perto a 310 m (o redemoinho de 210 m não pega ilha)
    expect(L).toEqual({ x: -500, z: 1110 });
    const palmas = Math.hypot(L.x + 56, L.z - 955);
    expect(palmas).toBeGreaterThan(KRAKEN_BOSS.TENT_RING + 100); // nenhum tentáculo em cima da ilha
    expect(palmas).toBeLessThan(520);                               // as Cagarras ainda de fundo (04/11 noite: mais longe, ~470 m)
    expect(KRAKEN_BOSS.FACE_BEACH_YAW).toBeCloseTo(Math.PI, 5);     // olha pro norte (a praia: z menor)
    expect(read('src/components/zona-sul/zs-kraken-boss-view.tsx')).toContain('ns && ns.d < KRAKEN_BOSS.ROCK_RANGE ? Math.atan2(ns.ship.x - K.x, ns.ship.z - K.z) : KRAKEN_BOSS.FACE_BEACH_YAW');
  });
  it('tamanho: ~52 m pra fora d\'água (Pedro: "uns 50–70 m"; 05/11: "mais uns 20%"), enterrado até a cintura; tentáculos de 76 m', () => {
    expect(KRAKEN_BOSS.BODY_H).toBe(104); expect(KRAKEN_BOSS.TENT_LEN).toBe(76); expect(KRAKEN_BOSS.TENT_REACH).toBe(72);
    expect(KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K)).toBeGreaterThanOrEqual(50);
    expect(KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K)).toBeLessThanOrEqual(70);
    expect(KRAKEN_BOSS.SUBMERGED_K).toBe(0.5);
    expect(KRAKEN_BOSS.TENT_LEN).toBeGreaterThan(WARSHIP.LENGTH * 2);
    expect(KRAKEN_BOSS.MURK_R).toBeGreaterThan(KRAKEN_BOSS.TENT_RING);  // a água turva cobre o corpo e a base dos tentáculos
  });
  it('mais vida: tentáculo 8 mil, corpo 60 mil (04/11: recomendado nv 60 — era 80 mil e nv 80)', () => {
    expect(KRAKEN_BOSS.TENT_HP).toBe(8000);
    expect(KRAKEN_BOSS.BODY_HP).toBe(60_000);
    expect(KRAKEN_BOSS.ROCK_DMG).toBe(800);
    // sozinho no nv 60 (bala ~470, 3 por salva a cada 4 s): matar < o navio aguentar de longe (só a pedra)
    const total = KRAKEN_BOSS.TENT_HP * 6 + KRAKEN_BOSS.BODY_HP, killS = total / (470 * 3 / WARSHIP.RELOAD_S);
    const shipS = WARSHIP.HP / (KRAKEN_BOSS.ROCK_DMG / KRAKEN_BOSS.ROCK_S);
    expect(killS).toBeLessThan(shipS);
  });
});

describe('Kraken das Cagarras — fases', () => {
  it('dorme → NAVIO a ≤ 320 m acorda → sobe → luta; todos longe 30 s = afunda e volta inteiro', () => {
    const k = newKraken();
    expect(krakenPhaseStep(k, 0, 0.1, 400)).toBe('sleep');
    expect(krakenPhaseStep(k, 100, 0.1, 300)).toBe('rise');
    for (let i = 0; i < 70; i++) krakenPhaseStep(k, 200 + i * 100, 0.1, 150);
    expect(k.phase).toBe('fight');
    k.tents[0]!.alive = false;
    krakenPhaseStep(k, 10_000, 0.1, 1000);
    krakenPhaseStep(k, 10_000 + KRAKEN_BOSS.SLEEP_MS + 1, 0.1, 1000);
    expect(k.phase).toBe('sleep');
    expect(k.tents[0]!.alive).toBe(true);
  });
  it('despistado: afunda em 5 s e volta INTEIRO pro covil; morto volta em 20 min; não renasce pelo relógio dos bichos', () => {
    const k = newKraken(); k.phase = 'sink'; k.x = 300; k.z = 500; k.tents.forEach((t) => { t.alive = false; });
    for (let i = 0; i < 49; i++) krakenPhaseStep(k, 0, 0.1, 999);
    expect(k.phase).toBe('sink');
    krakenPhaseStep(k, 0, 0.2, 999);
    expect(k.phase).toBe('sleep');
    expect([k.x, k.z]).toEqual([L.x, L.z]);
    expect(k.tents.every((t) => t.alive)).toBe(true);
    const d = newKraken(); d.phase = 'dead'; d.nextAt = 5000;
    expect(krakenPhaseStep(d, 4999, 0.1, 9999)).toBe('dead');
    expect(krakenPhaseStep(d, 5000, 0.1, 9999)).toBe('sleep');
    const c = { id: KRAKEN_BODY_ID, speciesId: 'raider_kraken', name: 'K', hp: 1, maxHp: 1, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0, position: { x: 0, z: 0 }, behavior: 'patrol', lootTable: [], respawnAt: null } as CreatureState;
    expect(deadCreature(c, 1000, () => 0.5).respawnAt).toBeNull();
    expect(deadCreature({ ...c, id: `${KRAKEN_SPAWN_PREFIX}3` }, 1000, () => 0.5).respawnAt).toBeNull(); // cria
  });
  it('fora do covil: anda atrás do navio um pouco mais devagar que o navio a toda; só por mar; despistou = casco > golpe + 80 m', () => {
    expect(KRAKEN_BOSS.WALK_SPEED).toBeLessThan(WARSHIP.MAX);
    expect(KRAKEN_BOSS.WALK_SPEED).toBeCloseTo(WARSHIP.MAX * 0.85 * 0.85, 5); // 04/11: 15% mais lento (~8,7 m/s)
    const k = newKraken(); k.x = 0; k.z = 0;
    krakenWalk(k, { x: 0, z: 300 }, 280, 1, () => true);
    expect(k.z).toBeCloseTo(KRAKEN_BOSS.WALK_SPEED, 5);
    expect(k.moving).toBe(true);
    const z0 = k.z; krakenWalk(k, { x: 0, z: 300 }, 280, 1, () => false);   // terra na frente: para
    expect(k.z).toBe(z0); expect(k.moving).toBe(false);
    krakenWalk(k, { x: 0, z: 30 }, KRAKEN_BOSS.BODY_REACH * 0.5, 1, () => true); // já no alcance do golpe: para
    expect(k.moving).toBe(false);
    expect(krakenGaveUp(KRAKEN_BOSS.BODY_REACH + 79)).toBe(false);
    expect(krakenGaveUp(KRAKEN_BOSS.BODY_REACH + 81)).toBe(true);
    // bug do Pedro (04/11): cortou o último tentáculo de LONGE (250 m) → ele tem que vir, não sumir
    expect(krakenGaveUp(250, 250)).toBe(false);
    expect(krakenGaveUp(320, 250)).toBe(false);   // fugiu 70 m: ainda vem
    expect(krakenGaveUp(331, 250)).toBe(true);    // fugiu mais de 80 m do mais perto: despistou
    expect(krakenGaveUp(200, 120)).toBe(false);   // chegou a 120 m, você está a 200: ainda vem
    expect(krakenGaveUp(201, 120)).toBe(true);
    expect(read('src/components/zona-sul/zs-kraken-boss-view.tsx')).toContain('K.bodyOut = true; K.phase = \x27hunt\x27; K.closest = ns ? ns.d : Infinity;');
  });
});

describe('Kraken das Cagarras — redemoinho, tentáculos, crias, bala', () => {
  it('REDEMOINHO puxa o navio pro centro dele (mais forte perto), menos que o navio a toda; desligado dormindo/morto', () => {
    const k = { x: 0, z: 0 };
    expect(whirlpoolPull(k, { x: 0, z: KRAKEN_BOSS.PULL_R + 1 })).toEqual({ x: 0, z: 0 });
    const far = whirlpoolPull(k, { x: 0, z: 180 }), near = whirlpoolPull(k, { x: 0, z: 60 });
    expect(far.z).toBeLessThan(0);                // pra ele (z diminui)
    expect(Math.abs(near.z)).toBeGreaterThan(Math.abs(far.z));
    expect(Math.abs(near.z)).toBeLessThan(WARSHIP.MAX / 2);
    expect(whirlpoolOn('fight')).toBe(true); expect(whirlpoolOn('hunt')).toBe(true);
    expect(whirlpoolOn('sleep')).toBe(false); expect(whirlpoolOn('dead')).toBe(false);
    // com os tentáculos de pé: +10% (Pedro 04/11)
    expect(pullBoost({ bodyOut: false })).toBeCloseTo(1.1, 5); expect(pullBoost({ bodyOut: true })).toBe(1);
    expect(whirlpoolPull(k, { x: 0, z: 120 }, 1.1).z).toBeCloseTo(whirlpoolPull(k, { x: 0, z: 120 }).z * 1.1, 5);
    expect(read('src/components/zona-sul/zona-sul-world.tsx').match(/driftWarship\(shipSwim, ship, dt\);/g)?.length).toBe(2); // parado e navegando
  });
  it('6 tentáculos no anel; chicoteiam o casco ao alcance (ou quem nada); longe, nada', () => {
    for (let i = 0; i < 6; i++) expect(Math.hypot(tentacleBase(i).x - L.x, tentacleBase(i).z - L.z)).toBeCloseTo(KRAKEN_BOSS.TENT_RING, 5);
    const b = tentacleBase(0), near = newWarship(b.x + 60, b.z, 0);
    const tg = tentacleTarget(b, [{ owner: 'eu', ...near }], [], HB)!;
    expect(tg.kind).toBe('ship');
    expect(hullNearestPoint(near, b, HB).x).toBeCloseTo(near.x - HB, 5);
    expect(tentacleTarget(b, [{ owner: 'eu', ...newWarship(b.x + 200, b.z, 0) }], [], HB)).toBeNull();
    expect(tentacleTarget(b, [], [{ id: 'x', x: b.x + 5, z: b.z, inWater: true }], HB)?.kind).toBe('hero');
    expect(nearestShip([{ owner: 'a', ...newWarship(L.x, L.z - 80, 0) }, { owner: 'b', ...newWarship(L.x + 300, L.z, 0) }], HB)!.ship.owner).toBe('a');
  });
  it('chicotada: arma, bate (dano 1×), fica na água e volta; cortado não bate', () => {
    const tn = newKraken().tents[0]!; tn.reload = 0;
    const tg = { kind: 'ship' as const, owner: 'eu', x: 1, z: 2 };
    let hits = 0;
    for (let t = 0; t < SLAM_TOTAL_S + 0.2; t += 0.05) if (tentacleStep(tn, 0.05, () => tg)) hits++;
    expect(hits).toBe(1);
    expect(slamLean(0.5)).toBeLessThan(0);
    expect(slamLean(KRAKEN_BOSS.TENT_WIND_S + KRAKEN_BOSS.TENT_STRIKE_S + 0.1)).toBeCloseTo(Math.PI / 2, 5);
    tn.alive = false;
    expect(tentacleStep(tn, 5, () => tg)).toBeNull();
    const k = newKraken(); expect(allTentaclesCut(k)).toBe(false); k.tents.forEach((t) => { t.alive = false; }); expect(allTentaclesCut(k)).toBe(true);
  });
  it('cada tentáculo cortado: 1–2 crias sobem no navio (no máximo 5 vivas)', () => {
    expect(spawnCount(0, () => 0.2)).toBe(1);
    expect(spawnCount(0, () => 0.8)).toBe(2);
    expect(spawnCount(4, () => 0.8)).toBe(1);
    expect(spawnCount(5, () => 0.8)).toBe(0);
    expect(KRAKEN_SPAWN_PREFIX.startsWith('fleet_')).toBe(true); // fora da IA de terra / piloto / renascer
    expect(isKrakenBoss(krakenTentId(2))).toBe(true);
  });
  it('a bala acerta NO AR o tentáculo ou o corpo; corpo protegido = estoura sem dano (id vazio)', () => {
    krakenShapes.segs = [{ x: 10, y: 30, z: 0, r: 5, id: krakenTentId(1) }];
    krakenShapes.body = { x: 0, z: 0, y0: -4, y1: 65, r: 15, id: '' };
    expect(krakenBallHit({ x: 12, y: 31, z: 1 })).toBe(krakenTentId(1));
    expect(krakenBallHit({ x: 2, y: 40, z: 0 })).toBe('');     // no corpo protegido
    expect(krakenBallHit({ x: 60, y: 10, z: 60 })).toBeNull();
    krakenShapes.segs = []; krakenShapes.body = null;
    const wv = read('src/components/zona-sul/zs-warship-view.tsx');
    expect(wv).toMatch(/const kid = krakenBallHit\(p\);/);
    expect(wv).toMatch(/if \(!fb\.remote && kid\) \{/); // dano só de quem atirou
  });
});

describe('Kraken das Cagarras — ligado no jogo e online', () => {
  const v = read('src/components/zona-sul/zs-kraken-boss-view.tsx');
  it('tentáculos/corpo/crias são bichos da store; o corpo só entra exposto (lista de agora)', () => {
    expect(v).toMatch(/krakenCreature\(krakenTentId\(i\), 'Tentáculo do Kraken', KRAKEN_BOSS\.TENT_HP/);
    expect(v).toMatch(/if \(allTentaclesCut\(K\) && !K\.bodyOut\) \{/);
    expect(v).toMatch(/const bodyC = useGameStore\.getState\(\)\.creatures\.find\(\(q\) => q\.id === KRAKEN_BODY_ID\);/);
    expect(v).toMatch(/krakenCreature\(id, 'Cria do Kraken', hp/);
  });
  it('tubarões vêm junto (isca da IA: rondam ele / o casco do navio perto) e mordem o casco', () => {
    expect(v).toMatch(/for \(let i = 0; i < KRAKEN_BOSS\.SHARKS; i\+\+\)/);
    expect(v).toMatch(/creatureLure\.set\(id, \(tt\) => \{/);
    expect(v).toMatch(/BOARD\.SHARK_BITE, 0, 'Tubarão do Kraken'\)/);
  });
  it('dano: meu navio direto; o de quem está na sala pelo ship-hit de bicho; a pedra pela bala inimiga de sempre', () => {
    expect(v).toMatch(/else broadcastPirateShipHit\(tg\.owner, shipDmg, 'Kraken das Cagarras'\);/);
    expect(v).toMatch(/warshipFx\.balls\.push\(\{ b: ball, t0: performance\.now\(\), land, hit: false, enemy: 'kraken' \}\);/);
  });
  it('online: o anfitrião manda fase/posição/chicotadas/crias; o convidado espelha', () => {
    const net = read('src/net/multiplayer.ts');
    expect(net).toMatch(/ch\.on\('broadcast', \{ event: 'kraken' \}/);
    expect(net).toMatch(/x: number; z: number; mv: 0 \| 1; sk: number; b: NetFleetBoarder\[\] \};/);
    expect(v).toMatch(/if \(isGuestInRoom\(\)\) \{/);
    expect(v).toMatch(/broadcastKraken\(\{/);
  });
  it('fora da IA de terra, do piloto automático e da lista de inimigos; montado no mundo', () => {
    expect(read('src/components/world/world-entities.tsx')).toMatch(/!cr\.id\.startsWith\('zs_kraken_'\)/);
    expect(read('src/game/systems/objectiveSystem.ts')).toMatch(/if \(creature\.id\?\.startsWith\('zs_kraken_'\)\) return false;/);
    expect(read('src/components/zona-sul/zona-sul-world.tsx')).toMatch(/<ZsKrakenBoss shipRef=\{shipRef\} heroRef=\{heroRef\} terrain=\{t\} \/>/);
  });
});

describe('esquadra pirata — atacada de longe vem atrás', () => {
  it('levou tiro = caça QUEM ATIROU (Pedro: "ataquei de longe um navio inimigo, ele deve vir atrás de mim")', () => {
    const h = read('src/components/zona-sul/zs-enemy-fleet-hits.ts');
    expect(h).toMatch(/if \(s\.sinkT === null\) fleetProvoked\(byId \|\| useNet\.getState\(\)\.selfId \|\| 'eu'\);\n\s+if \(!damageWarship\(s, dmg\)\) return false;/);
    expect(h).toMatch(/F\.targetId = who; F\.lostSince = null; F\.huntSince = null;/);
  });
});

describe('Kraken das Cagarras — sugado com o navio', () => {
  it('o navio afundou DENTRO do redemoinho com o herói a bordo/perto = sugado (morre e renasce na base/praia)', () => {
    const k = { phase: 'fight' as const, x: 0, z: 0 };
    const ship = { x: 0, z: 120, sinkT: 0 as number | null };
    expect(suckedDown(k, ship, { x: 0, z: 120 })).toBe(true);              // no convés
    expect(suckedDown(k, ship, { x: 0, z: 150 })).toBe(true);              // na água do lado
    expect(suckedDown(k, ship, { x: 0, z: 200 })).toBe(false);             // longe do navio (nadou pra longe / desceu antes)
    expect(suckedDown(k, { ...ship, sinkT: null }, { x: 0, z: 120 })).toBe(false); // navio inteiro
    expect(suckedDown({ ...k, phase: 'sleep' }, ship, { x: 0, z: 120 })).toBe(false);
    expect(suckedDown(k, { ...ship, z: KRAKEN_BOSS.PULL_R + 10 }, { x: 0, z: KRAKEN_BOSS.PULL_R + 10 })).toBe(false); // fora do redemoinho
    const v = read('src/components/zona-sul/zs-kraken-boss-view.tsx');
    expect(v).toContain('else if (my && !S.sucked && suckedDown(K, my, hero)) {');
    expect(v).toMatch(/deathBy: { name: 'Kraken das Cagarras', pvp: false }/);
  });
});
