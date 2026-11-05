import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLEET, homeBounds, newEnemyShip, shipHunts, squadBeaten, squadPresent, zsFleet } from '@/components/zona-sul/zs-enemy-fleet';
import { WARSHIP } from '@/components/zona-sul/zs-warship';
import { ALLY_LABEL_RANGE, allyLabelScale } from '@/components/world/remote-players';

/* Pedro, 05/11: "no multiplayer os barcos pararam de nascer? nasceu 1 vez, matamos e não vejo mais!" → (o "mais uns 4–6
   barcos por aí espalhados" aprovado) 3 esquadras de 2, só os perto caçam, cada uma volta em 3 min. */
describe('esquadras espalhadas', () => {
  it('3 esquadras, cada uma com o seu tempo de voltar', () => {
    expect(FLEET.SQUADS).toBe(3);
    expect(zsFleet.squadNext).toHaveLength(3);
    const a = newEnemyShip('a', { x: 0, z: 0, yaw: 0 }, 0), b = newEnemyShip('b', { x: 10, z: 0, yaw: 0 }, 0), c = newEnemyShip('c', { x: 900, z: 0, yaw: 0 }, 1);
    expect(squadPresent([a, b, c], 0)).toBe(true); expect(squadPresent([a, b, c], 2)).toBe(false);
    a.sinkT = WARSHIP.SINK_S; expect(squadBeaten([a, b, c], 0)).toBe(false);
    b.sinkT = WARSHIP.SINK_S; expect(squadBeaten([a, b, c], 0)).toBe(true);
    expect(squadBeaten([a, b, c], 1)).toBe(false);
  });
  it('só caça quem está a até 500 m do alvo (os do outro lado do mar seguem rondando)', () => {
    const near = newEnemyShip('n', { x: 0, z: 0, yaw: 0 }), far = newEnemyShip('f', { x: 800, z: 0, yaw: 0 });
    const tgt = { x: 100, z: 0 };
    expect(shipHunts(near, tgt)).toBe(true);
    expect(shipHunts(far, tgt)).toBe(false);
    expect(shipHunts(near, null)).toBe(false);
  });
  it('cada esquadra ronda em volta da casa dela (sem sair do mar do mapa); sem casa = como antes (convidado)', () => {
    const b = homeBounds({ x: 0, z: 0 }, { minX: -200, maxX: 2000, minZ: -2000, maxZ: 2000 });
    expect(b).toEqual({ minX: -200, maxX: FLEET.HOME_R, minZ: -FLEET.HOME_R, maxZ: FLEET.HOME_R });
    const g = newEnemyShip('g', { x: 5, z: 6, yaw: 0 });
    expect(g.squad).toBe(0); expect(g.home).toEqual({ x: 5, z: 6 });
  });
  it('medido no navegador: 6 navios em 3 esquadras a 610–1810 m; caçada só da esquadra perto; FPS 44; afundou → volta em 3 min', () => {
    const v = fs.readFileSync('src/components/zona-sul/zs-enemy-fleet-view.tsx', 'utf8');
    expect(v).toContain('const hunts = shipHunts(s, target);');
    expect(v).toContain('F.squadNext[k] = now + FLEET.REST_MS;');
    expect(v).toContain('grp.visible = !warshipGone(ship) && !far;');
  });
});

/* Pedro, 05/11: "não vejo vida e nome do meu aliado — deveria ver normal como vejo inimigo!" · "meu amigo não ouviu o tiro
   da bazuca". */
describe('online: plaquinha do aliado e som do míssil dos outros', () => {
  it('aliado: nome + vida até 120 m, a plaquinha crescendo pra ler; inimigo (PvP): perto ou ferido', () => {
    expect(ALLY_LABEL_RANGE).toBe(120);
    expect(allyLabelScale(5)).toBe(1); expect(allyLabelScale(28)).toBe(2); expect(allyLabelScale(500)).toBe(6);
    const r = fs.readFileSync('src/components/world/remote-players.tsx', 'utf8');
    expect(r).toContain('labelGroup.current.visible = sameL && (enemy ? dist <= LABEL_RANGE || hurt : dist <= ALLY_LABEL_RANGE);');
  });
  it('o míssil dos outros soa aqui (o canhão, pela distância) no disparo e no estouro', () => {
    const p = fs.readFileSync('src/components/world/projectiles.tsx', 'utf8');
    expect(p).toContain("if (g > 0.01) audioManager.playWorld('cannon', g);");
    expect(p).toContain("if (s.remote) { const me = useGameStore.getState().player.position, g = distanceGain(Math.hypot(s.to.x - me.x, s.to.z - me.z)); if (g > 0.01) audioManager.playWorld('cannon', g * 0.8); }");
  });
});
