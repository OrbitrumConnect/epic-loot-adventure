import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { damageWarship, newWarship, WARSHIP, warshipGone, warshipStep } from '@/components/zona-sul/zs-warship';

/* Pedro 01/11: "navio 5k vida" (online: "ver o navio dar dano, atacar outro player e ser atacado"). */
describe('navio de guerra — vida, afundar e construir outro', () => {
  const sea = () => true;
  it('5 mil de vida; canhão tira; zerou = afunda (parado), some depois de SINK_S', () => {
    expect(WARSHIP.HP).toBe(5000);
    const s = newWarship(0, 0, 0);
    expect(s.hp).toBe(5000);
    expect(damageWarship(s, 1200)).toBe(false);
    expect(s.hp).toBe(3800);
    expect(damageWarship(s, 99999)).toBe(true); // afundou agora
    expect(s.hp).toBe(0);
    expect(damageWarship(s, 100)).toBe(false);  // já afundando: não conta de novo
    warshipStep(sea, s, { throttle: 1, steer: 1 }, 1);
    expect(s.speed).toBe(0);                    // afundando não anda
    expect(warshipGone(s)).toBe(false);
    for (let i = 0; i < WARSHIP.SINK_S * 10; i++) warshipStep(sea, s, { throttle: 0, steer: 0 }, 0.1);
    expect(warshipGone(s)).toBe(true);
  });
  it('construir outro custa da bolsa (600 madeira, 240 ferro, 120 pedra — "os de nível alto 3×") e nasce inteiro na âncora', () => {
    expect(WARSHIP.BUILD_COST).toEqual([{ id: 'wood', n: 600 }, { id: 'iron_ore', n: 240 }, { id: 'stone', n: 120 }]);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/const r = useGameStore\.getState\(\)\.spendItems\(WARSHIP\.BUILD_COST\);/);
    expect(zs).toMatch(/shipRef\.current = newWarship\(d\.x, d\.z, d\.yaw\);/);
    expect(zs).toMatch(/if \(ship && !warshipGone\(ship\)\) netVehicles\.push\(\{ k: 's'.*h: ship\.hp \}\);/);
  });
  it('rede: canhão no navio de outro → o DONO aplica, só com inimizade (aliado não afunda aliado)', () => {
    const net = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(net).toMatch(/ch\.on\('broadcast', \{ event: 'ship-hit' \}/);
    expect(net).toMatch(/if \(hit\.fromSide !== 'enemy' && get\(\)\.selfSide !== 'enemy'\) return;\n\s+shipHitHandler\?\.\(hit\);/);
    const view = fs.readFileSync('src/components/zona-sul/zs-warship-view.tsx', 'utf8');
    expect(view).toMatch(/broadcastShipHit\(d\.id, useGameStore\.getState\(\)\.cannonPower\(\)\)/);
  });
});
