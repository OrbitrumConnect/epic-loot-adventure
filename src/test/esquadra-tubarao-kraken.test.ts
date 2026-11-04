import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nearWarshipHull, newWarship, WARSHIP, warshipWorld } from '@/components/zona-sul/zs-warship';
import {
  BOARD, boarderStep, FLEET, fleetSteer, newEnemyShip, FLEET_KRAKEN_PREFIX, FLEET_SHARK_PREFIX, hullRing, hullRingLen, isFleetUnit, newBoarder, sharkDropSpots,
} from '@/components/zona-sul/zs-enemy-fleet';
import { deadCreature } from '@/game/state/game-store';
import type { CreatureState } from '@/game/types';

/* Pedro 03/11 (ETAPA 2 da esquadra pirata): "de perto, os navios soltam horda de tubarões e um Kraken que sobe no convés
   do navio do herói" — e online igual a tudo ("todos veem normal, sem regressão"). */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const rng = (seed = 7) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const HB = WARSHIP.LENGTH * 0.12;

describe('esquadra pirata — horda de tubarões', () => {
  it('soltam PERTO (≤ 90 m), 3 por navio, no máximo 6 no mar; caem em volta do navio caçado (12–28 m), só em água funda', () => {
    expect(BOARD.SHARK_NEAR).toBe(90);
    expect(BOARD.SHARKS_PER_SHIP).toBe(3);
    expect(BOARD.SHARKS_MAX).toBe(6);
    const at = { x: 100, z: -50 };
    const pts = sharkDropSpots(() => true, at, 3, rng());
    expect(pts).toHaveLength(3);
    for (const p of pts) { const d = Math.hypot(p.x - at.x, p.z - at.z); expect(d).toBeGreaterThanOrEqual(12); expect(d).toBeLessThanOrEqual(28); }
    expect(sharkDropSpots(() => false, at, 3, rng())).toHaveLength(0); // sem mar fundo: não solta
    expect(FLEET_SHARK_PREFIX.startsWith('wild_shark_')).toBe(true); // tubarão de verdade (IA/rede/fauna iguais aos do mapa)
    expect(isFleetUnit(`${FLEET_SHARK_PREFIX}1`)).toBe(false);        // desenhado e pensado como qualquer tubarão
  });

  it('rondam COLADOS no casco (perto o bastante pra morder) sem passar por baixo do navio', () => {
    const ship = newWarship(30, 40, 0.7), ring = hullRingLen(HB, WARSHIP.LENGTH, BOARD.SHARK_RING_GAP);
    for (let d = 0; d < ring; d += ring / 97) {
      const q = hullRing(d, HB, WARSHIP.LENGTH, BOARD.SHARK_RING_GAP), w = warshipWorld(ship, q.u, q.v);
      expect(nearWarshipHull(ship, w.x, w.z, HB, BOARD.SHARK_BITE_R)).toBe(true); // morde dali
      expect(nearWarshipHull(ship, w.x, w.z, HB, 0.5)).toBe(false);                // fora do casco (não atravessa)
    }
    // anda: dois instantes = dois pontos diferentes do contorno
    const a = hullRing(0, HB, WARSHIP.LENGTH, 1.8), b = hullRing(5, HB, WARSHIP.LENGTH, 1.8);
    expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeGreaterThan(4);
  });

  it('mordem o CASCO do navio caçado (120 a cada 2 s); a IA ganha a ISCA (ronda o navio em vez de vagar onde nasceu)', () => {
    expect(BOARD.SHARK_BITE).toBe(120);
    expect(BOARD.SHARK_BITE_S).toBe(2);
    const ai = read('src/components/world/hostile-ai.ts');
    expect(ai).toMatch(/export const creatureLure = new Map<string, \(t: number\) => \{ x: number; z: number \} \| null>\(\);/);
    expect(ai).toMatch(/\} else if \(lurePt\) \{/);
    // caçar quem está NA ÁGUA continua primeiro (o ramo da isca vem depois da perseguição)
    expect(ai.indexOf('} else if (lurePt) {')).toBeGreaterThan(ai.indexOf('distToPlayer < aggroRange && distToHome < tuning.leashRange'));
    const v = read('src/components/zona-sul/zs-enemy-fleet-view.tsx');
    expect(v).toMatch(/creatureLure\.set\(c\.id, \(t\) => \{/);
    expect(v).toMatch(/const sank = damageWarship\(my, BOARD\.SHARK_BITE\);/);
    expect(v).toMatch(/else broadcastPirateShipHit\(target\.id, BOARD\.SHARK_BITE\);/); // navio de outro jogador: o DONO aplica
    expect(v).toMatch(/for \(const id of ids\) creatureLure\.delete\(id\);/);          // saem com a caçada
  });

  it('não renascem (vêm e vão com a esquadra) — nem capitão/tripulação/Kraken; tubarão do mapa segue renascendo', () => {
    const mk = (id: string): CreatureState => ({ id, speciesId: 'shark', name: 't', hp: 10, maxHp: 10, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0, position: { x: 0, z: 0 }, behavior: 'patrol', lootTable: [], respawnAt: null });
    expect(deadCreature(mk(`${FLEET_SHARK_PREFIX}3`), 1000, () => 0.5).respawnAt).toBeNull();
    expect(deadCreature(mk(`${FLEET_KRAKEN_PREFIX}4`), 1000, () => 0.5).respawnAt).toBeNull();
    expect(deadCreature(mk('fleet_crew_f1_2'), 1000, () => 0.5).respawnAt).toBeNull();
    expect(deadCreature(mk('wild_shark_2'), 1000, () => 0.5).respawnAt).toBeGreaterThan(1000);
  });
});

describe('esquadra pirata — Kraken de abordagem', () => {
  it('sobe pelo LADO do pirata, em ~1,6 s; no convés anda até quem está lá e bate (pancada a cada 2,3 s)', () => {
    const ship = newWarship(0, 0, 0);
    const b = newBoarder(`${FLEET_KRAKEN_PREFIX}1`, 'eu', ship, { x: 60, z: 0 }, HB, WARSHIP.LENGTH, rng());
    expect(b.side).toBe(1);               // pirata a boreste (+u) → sobe por boreste
    expect(b.climb).toBe(0);
    let t = 0;
    while (b.climb < 1 && t < 5) { expect(boarderStep(b, { u: 0, v: 0 }, 0.1, HB, WARSHIP.LENGTH)).toBe(false); t += 0.1; }
    expect(t).toBeCloseTo(BOARD.KRAKEN_CLIMB_S, 1);
    expect(Math.abs(b.u)).toBeLessThan(HB); // já dentro do convés
    // anda até o herói (popa) e bate
    let slams = 0, tt = 0;
    for (; tt < 30; tt += 0.1) if (boarderStep(b, { u: -2, v: -12 }, 0.1, HB, WARSHIP.LENGTH)) slams++;
    expect(slams).toBeGreaterThanOrEqual(5);
    expect(slams).toBeLessThanOrEqual(Math.ceil(30 / BOARD.KRAKEN_SLAM_S) + 1);
    expect(Math.hypot(b.u + 2, b.v + 12)).toBeLessThanOrEqual(BOARD.KRAKEN_REACH);
    // sem ninguém no convés: para (não bate no vazio)
    expect(boarderStep(b, null, 3, HB, WARSHIP.LENGTH)).toBe(false);
    expect(b.act).toBe('idle');
  });

  it('nunca sai do convés (borda e proa/popa)', () => {
    const ship = newWarship(0, 0, 0);
    const b = newBoarder('k', 'eu', ship, { x: -60, z: 0 }, HB, WARSHIP.LENGTH, rng(3));
    for (let i = 0; i < 400; i++) {
      boarderStep(b, { u: -50, v: 90 }, 0.1, HB, WARSHIP.LENGTH);
      if (b.climb >= 1) { expect(Math.abs(b.u)).toBeLessThanOrEqual(HB * 0.8 + 1e-9); expect(Math.abs(b.v)).toBeLessThanOrEqual(WARSHIP.LENGTH / 2 - 2 + 1e-9); }
    }
  });

  it('mais fraco que o chefe (2/3 da vida, 80% do dano), 1 por caçada, só depois de 20 s de caçada com pirata a ≤ 120 m (a briga: eles seguram ~70–100 m)', () => {
    expect(BOARD.KRAKEN_HP_K).toBeCloseTo(0.67, 2);
    expect(BOARD.KRAKEN_ATK_K).toBeCloseTo(0.8, 2);
    expect(BOARD.KRAKEN_AFTER_S).toBe(20);
    expect(BOARD.KRAKEN_NEAR).toBe(120);
    const v = read('src/components/zona-sul/zs-enemy-fleet-view.tsx');
    expect(v).toMatch(/if \(!F\.boarded && !F\.boarder && near && F\.huntSince !== null && now - F\.huntSince >= BOARD\.KRAKEN_AFTER_S \* 1000\) \{/);
    // o Kraken mora em coordenadas DO NAVIO (u/v): anda junto com ele em todas as telas, sem atraso
    expect(v).toMatch(/const w = warshipWorld\(sh, u, b\.v\);/);
    // bate em mim (armadura/esquiva/morte iguais) ou avisa o dono do convés na sala
    expect(v).toMatch(/if \(meOwner\) hurtPlayerBy\('Kraken da abordagem', atk, w,/);
    expect(v).toMatch(/else broadcastMobHit\(b\.owner, atk, 'Kraken da abordagem'\);/);
    // a esquadra afundou: o Kraken que já subiu FICA até morrer
    expect(v).toMatch(/!isFleetUnit\(c\.id\) \|\| c\.id\.startsWith\(FLEET_KRAKEN_PREFIX\)/);
  });

  it('ONLINE: o anfitrião manda o Kraken no pacote da esquadra (k); o convidado desenha o mesmo, no navio do dono', () => {
    const net = read('src/net/multiplayer.ts');
    expect(net).toMatch(/export type NetFleetBoarder = \{/);
    expect(net).toMatch(/netFleet\.k = p\.k \?\? null/);
    const v = read('src/components/zona-sul/zs-enemy-fleet-view.tsx');
    expect(v).toMatch(/b \? \{ i: b\.id, o: b\.owner, u: r1\(b\.u\), v: r1\(b\.v\), c: Math\.round\(b\.climb \* 100\) \/ 100, a: BOARDER_ACT\[b\.act\] \} : null\);/);
    expect(v).toMatch(/const nk = stale \? null : netFleet\.k;/);
    // o navio do dono: o meu (shipRef) ou o da sala (pose que vem da rede)
    expect(v).toMatch(/function shipOf\(owner: string, my: ZsWarship \| null\)/);
    // e continua mandando sem navio pirata (o Kraken ainda no convés)
    expect(v).toMatch(/if \(F\.boarder \|\| boarderWasOut\.current\) \{ syncOut\(\);/);
  });
});

describe('esquadra pirata — não encosta no seu casco', () => {
  it('colado (< ~38 m): afasta com proa pra fora, toda força; a 70 m segue de lado', () => {
    const s = newEnemyShip('c', { x: 0, z: -25, yaw: 0 }); // proa apontada pra você, a 25 m
    const inp = fleetSteer(s, { x: 0, z: 0 }, []);
    expect(inp.throttle).toBe(1);
    expect(Math.abs(inp.steer)).toBe(1);                   // vira tudo pra sair
    const fora = newEnemyShip('d', { x: 0, z: -25, yaw: Math.PI }); // já de popa pra você
    expect(Math.abs(fleetSteer(fora, { x: 0, z: 0 }, []).steer)).toBeLessThan(0.05);
    expect(FLEET.PREF * 0.55).toBeLessThan(FLEET.PREF - 20);
  });
});
