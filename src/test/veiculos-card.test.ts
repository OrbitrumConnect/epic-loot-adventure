import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sameVeh, useZsVehicles, zsVehicleApi } from '@/components/zona-sul/zs-context';
import { unlockLevel } from '@/game/systems/unlockSystem';
import { VEHICLE_COST } from '@/game/data/vehicle-costs';

/* Pedro 03/11: "fabricar o carro e o navio não estão disponíveis no card Minha base igual skate e prancha — por quê?!
   ambos sumiram; queria poder construir; no mapa deveria aparecer pra mim pelo menos pra eu saber". Não estava quebrado:
   explodiu/afundou = perdido no save, e outro só se construía indo à garagem/âncora e apertando E — a "garagem" do carro
   era onde você ENTROU no mapa (mudava a cada sessão) e nada avisava no card nem no mapa. */
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('carro e navio: construir pelo card da base e ver no mapa', () => {
  it('a ponte do mundo pro card/mapa: só redesenha quando muda o estado ou anda > 3 m', () => {
    expect(useZsVehicles.getState()).toEqual({ car: null, ship: null });
    expect(zsVehicleApi.build).toBeNull(); // fora da Zona Sul: o card não mostra as linhas
    const a = { state: 'ok' as const, x: 10, z: 10 };
    expect(sameVeh(a, { ...a, x: 12 })).toBe(true);
    expect(sameVeh(a, { ...a, x: 14 })).toBe(false);
    expect(sameVeh(a, { ...a, state: 'gone' })).toBe(false);
    expect(sameVeh(null, null)).toBe(true);
    expect(sameVeh(a, null)).toBe(false);
  });

  it('mesmas regras do E na garagem/âncora: nível (carro 25, navio 35), recurso da bolsa, 1 de cada', () => {
    expect(unlockLevel('flying_car')).toBe(25);
    expect(unlockLevel('war_ship')).toBe(35);
    const zs = read('src/components/zona-sul/zona-sul-world.tsx');
    expect(zs).toMatch(/if \(car && !carGone\(car\)\) return '🚗 Você já tem o carro voador — ele está no mapa \(M\)\.';/);
    expect(zs).toMatch(/if \(!isUnlocked\('flying_car', lvl\)\) return lockedMessage\('O carro voador', 'flying_car'\);/);
    expect(zs).toMatch(/const r = st\.spendItems\(VEHICLE_COST\.flying_car\);/);
    expect(zs).toMatch(/carRef\.current = newCar\(at\.x, at\.z, 0, t\);/); // nasce do SEU lado
    expect(zs).toMatch(/if \(ship && !warshipGone\(ship\)\) return '⚓ Você já tem o navio de guerra — ele está no mapa \(M\)\.';/);
    expect(zs).toMatch(/if \(!isUnlocked\(WARSHIP\.UNLOCK_ID, lvl\)\) return lockedMessage\('O navio de guerra', WARSHIP\.UNLOCK_ID\);/);
    expect(zs).toMatch(/shipRef\.current = newWarship\(d\.x, d\.z, d\.yaw\);/); // na âncora (mar fundo)
    expect(zs).toMatch(/publishVehicles\(car, ship, dt\);/);
    expect(zs).toMatch(/return \(\) => \{ zsVehicleApi\.build = null; useZsVehicles\.setState\(\{ car: null, ship: null \}\); \};/);
    expect(VEHICLE_COST.flying_car.length).toBeGreaterThan(0); expect(VEHICLE_COST.war_ship.length).toBeGreaterThan(0);
  });

  it('card "Fabricar no campo": linhas do carro e do navio (status, recurso, motivo); mapa (M): 🚗 e ⚓', () => {
    const card = read('src/components/hud/tool-crafting.tsx');
    expect(card).toMatch(/<VehicleRows \/>/);
    expect(card).toMatch(/if \(!zsVehicleApi\.build\) return null;/);
    expect(card).toMatch(/const status = have \? 'No mapa \(M\)' : info\?\.state === 'gone' \? lost : where;/);
    expect(card).toMatch(/onClick=\{\(\) => \{ const m = zsVehicleApi\.build\?\.\(kind\) \?\? '';/);
    const map = read('src/components/hud/zs-map.tsx');
    expect(map).toMatch(/const car = useZsVehicles\(\(s\) => s\.car\), ship = useZsVehicles\(\(s\) => s\.ship\);/);
    expect(map).toMatch(/className=\{`zs-mapmark zs-mapmark--\$\{k\}`\} data-gone=/);
  });
});
