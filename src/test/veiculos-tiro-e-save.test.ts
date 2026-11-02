import fs from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pickAimTarget, vehicleAimSpheres } from '@/components/world/aim';
import { creatureAnchors } from '@/components/world/hostile-ai';
import { type NetVehicle, useNet } from '@/net/multiplayer';
import { decodeTerrain, type ZsTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAR, carGone, damageCar, newCar } from '@/components/zona-sul/zs-car';
import { damageWarship, newWarship, WARSHIP, warshipGone } from '@/components/zona-sul/zs-warship';
import { parseSavedVehicles, restoreCar, restoreWarship, vehiclesSnapshot } from '@/components/zona-sul/zs-vehicle-save';

/* Pedro 02/11 (item 5): "fuzil tirando vida do navio/carro; navio/carro salvos entre sessões". */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});
afterEach(() => { creatureAnchors.clear(); useNet.setState({ players: {}, selfSide: 'ally' }); });
const cam = (x: number, y: number, z: number, lx: number, ly: number, lz: number) => {
  const c = new THREE.PerspectiveCamera(50, 1, 0.1, 800); c.position.set(x, y, z); c.lookAt(lx, ly, lz); c.updateMatrixWorld(true); return c;
};
const enemy = (v: NetVehicle[]) => ({ p2: { id: 'p2', name: 'Caio', level: 50, hp: 100, maxHp: 100, x: 0, z: 0, yaw: 0, action: 'idle', t: 0, y: 4, side: 'enemy' as const, v } });

describe('fuzil no navio/carro de outro jogador', () => {
  it('casco do navio = fileira de bolas ao longo dos 36,8 m (frente = sen/cos yaw); carro 3 bolas; afundado/explodido não conta', () => {
    const sh = vehicleAimSpheres({ k: 's', x: 100, z: 50, yaw: Math.PI / 2, h: 5000 });
    expect(sh).toHaveLength(5);
    expect(Math.max(...sh.map((b) => b.x)) - Math.min(...sh.map((b) => b.x))).toBeCloseTo(0.8 * WARSHIP.LENGTH, 6); // yaw 90° = ao longo de x
    for (const b of sh) expect(b.z).toBeCloseTo(50, 6);
    const car = vehicleAimSpheres({ k: 'c', x: 0, z: 0, yaw: 0, y: 12, h: 600 });
    expect(car).toHaveLength(3);
    for (const b of car) expect(b.y).toBeCloseTo(12.9, 6);
    expect(vehicleAimSpheres({ k: 's', x: 0, z: 0, yaw: 0, h: 0 })).toEqual([]);
  });
  it('mirando no casco do navio INIMIGO = alvo "vehicle" (ele morto também); aliado não; mirando no jogador em cima, o jogador', () => {
    // câmera a 40 m mirando a proa do navio dele (navio de lado, ao longo de x)
    const ship = { k: 's' as const, x: 0, z: 40, yaw: Math.PI / 2, h: 4000 };
    useNet.setState({ players: enemy([ship]), selfSide: 'ally' });
    const c = cam(0, 3, 0, 10, 2.2, 40);
    expect(pickAimTarget(c)).toMatchObject({ kind: 'vehicle', ownerId: 'p2', vk: 's' });
    useNet.setState({ players: { p2: { ...enemy([ship]).p2, hp: 0 } } });
    expect(pickAimTarget(c)).toMatchObject({ kind: 'vehicle', vk: 's' });
    useNet.setState({ players: { p2: { ...enemy([ship]).p2, side: 'ally' } } });
    expect(pickAimTarget(c)).toBeNull();
    // ele em pé no convés (pés a 4 m) e o pontinho no PEITO dele → o jogador (não o casco)
    useNet.setState({ players: { p2: { ...enemy([ship]).p2, x: 0, z: 40, y: 4 } } });
    expect(pickAimTarget(cam(0, 5, 0, 0, 5, 40))).toMatchObject({ kind: 'player', id: 'p2' });
  });
  it('carro dele voando: o pontinho no carro = alvo "vehicle" c', () => {
    useNet.setState({ players: enemy([{ k: 'c', x: 0, z: 30, yaw: 0, y: 10, h: 600 }]) });
    expect(pickAimTarget(cam(0, 10.9, 0, 0, 10.9, 30))).toMatchObject({ kind: 'vehicle', vk: 'c' });
  });
  it('o tiro sai pelo golpe do PvP (cadência/alcance/munição) e o DONO aplica — só com inimizade; mensagem diz "tiro"', () => {
    const aim = fs.readFileSync('src/components/world/aim.ts', 'utf8');
    expect(aim).toContain("(raw) => (ship ? broadcastShipHit(t.ownerId, raw, 'gun') : broadcastCarHit(t.ownerId, raw)), false, true);");
    const net = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(net).toMatch(/ch\.on\('broadcast', \{ event: 'car-hit' \}[^]*?if \(hit\.fromSide !== 'enemy' && get\(\)\.selfSide !== 'enemy'\) return;\n\s+carHitHandler\?\.\(hit\);/);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('const boom = damageCar(c, hit.damage), st = useGameStore.getState();');
    expect(zs).toContain("const what = hit.w === 'gun' ? `tiro de ${hit.fromName}` : `canhão de ${hit.fromName}`;");
  });
});

describe('navio e carro salvos entre sessões', () => {
  const dock = { x: -140, z: 470, yaw: 0 }, sea = () => true;
  it('o navio volta ONDE estava, virado igual, com a vida que tinha; sem água funda lá = âncora (vida mantida)', () => {
    const s = newWarship(-300, 520, 1.2); damageWarship(s, 1800);
    const saved = parseSavedVehicles(JSON.stringify(vehiclesSnapshot(s, null)))!;
    const back = restoreWarship(saved.ship, dock, sea)!;
    expect([back.x, back.z, back.yaw, back.hp]).toEqual([-300, 520, 1.2, 3200]);
    const dry = restoreWarship(saved.ship, dock, () => false)!;
    expect([dry.x, dry.z, dry.hp]).toEqual([dock.x, dock.z, 3200]);
    expect(restoreWarship(undefined, dock, sea)!.hp).toBe(WARSHIP.HP); // 1ª vez: inteiro na âncora
    expect(restoreWarship(saved.ship, null, sea)).toBeNull();          // mapa sem âncora: como antes
  });
  it('afundou (ou estava afundando) = continua perdido: constrói outro na âncora', () => {
    const s = newWarship(0, 0, 0); damageWarship(s, 99999);
    const back = restoreWarship(parseSavedVehicles(JSON.stringify(vehiclesSnapshot(s, null)))!.ship, dock, sea)!;
    expect(warshipGone(back)).toBe(true);
  });
  it('carro: volta onde estava com a vida; explodiu = perdido (garagem); fora do mapa = garagem', () => {
    const garage = { x: 93, z: 388, yaw: 0 };
    const c = newCar(60, 380, 0.7, t); damageCar(c, 250);
    const saved = parseSavedVehicles(JSON.stringify(vehiclesSnapshot(null, c)))!;
    const back = restoreCar(saved.car, garage, t);
    expect([back.x, back.z, back.yaw, back.hp]).toEqual([60, 380, 0.7, CAR.HP - 250]);
    const far = restoreCar({ x: 99999, z: 0, yaw: 0, hp: 100 }, garage, t);
    expect([far.x, far.z, far.hp]).toEqual([garage.x, garage.z, 100]);
    const boom = newCar(0, 0, 0, t); damageCar(boom, 9999);
    expect(carGone(restoreCar(parseSavedVehicles(JSON.stringify(vehiclesSnapshot(null, boom)))!.car, garage, t))).toBe(true);
  });
  it('lixo no save = como se não tivesse (navio/carro novos); salva a cada 2 s junto com a posição', () => {
    expect(parseSavedVehicles('{lixo')).toBeNull();
    expect(parseSavedVehicles(JSON.stringify({ ship: { x: 'a' }, car: { gone: true } }))).toEqual({ car: { gone: true } });
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('if (carRef.current) { saveZsPos(heroRef.current); saveZsVehicles(shipRef.current, carRef.current); } }, 2000);');
    expect(zs).toContain('carRef.current = restoreCar(saved?.car, carGarage.at, tt);');
  });
});
