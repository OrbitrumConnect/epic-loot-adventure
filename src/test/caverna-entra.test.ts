import fs from 'node:fs';
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { CAVE_DROP_AIR, caveStep, ceilingAbove, groundUnder, nearCave, registerTerrain } from '@/components/world/terrain-collision';

/* 28/10 — Pedro: "não consigo entrar nas caves do GLB, ando por cima delas". Desde 20/10 o chão era o TOPO da malha
   (raio do céu) → no túnel o topo é a montanha. Agora `groundUnder`: céu aberto = topo (igual antes); rocha em cima =
   piso logo abaixo do pé. Cena de teste (lados duplos, igual o mapa):
     x < 8: chão y=0 · túnel em x∈[-5,5]: teto y=2,5 e topo da montanha y=10 · x∈[8,12]: morro maciço (topo y=5, nada embaixo) */
const src = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const plane = (x0: number, x1: number, y: number) => {
  const g = new THREE.PlaneGeometry(x1 - x0, 40).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, y, 0); return m;
};
const scene = new THREE.Group();
scene.add(plane(-40, 8, 0), plane(-5, 5, 2.5), plane(-5, 5, 10), plane(8, 12, 5), plane(12, 40, 0));
const unregister = registerTerrain(scene);
/* Caverna sintética DENTRO da caixa do túnel do oeste (−88, 52): túnel ao longo de x com piso y=0 em |z−52|<3,
   teto 2,5 e topo 10 sobre |z−52|<6 (lateral = rocha maciça, sem piso), e uma RAMPA de 45° debaixo do teto em
   z∈[46,49] (a "curva" da parede). */
const cave = new THREE.Group();
const at = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); return m; };
const strip = (w: number, d: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
cave.add(
  at(new THREE.Mesh(strip(30, 3), mat), -88, 0, 50.5 + 3),     // piso z∈[52,55]
  at(new THREE.Mesh(strip(30, 1), mat), -88, 0, 49.5),         // piso z∈[49,50] (antes da rampa)
  at(new THREE.Mesh(strip(30, 2), mat), -88, 0, 51),           // piso z∈[50,52]
  at(new THREE.Mesh(strip(30, 12), mat), -88, 2.5, 52),        // teto
  at(new THREE.Mesh(strip(30, 12), mat), -88, 10, 52),         // topo da montanha
);
const ramp = new THREE.Mesh(new THREE.PlaneGeometry(30, 3 * Math.SQRT2).rotateX(-Math.PI / 2).rotateX(-Math.PI / 4), mat);
cave.add(at(ramp, -88, 1.5, 47.5)); // 45°: sobe de y=0 em z=49 pra y=3 em z=46
const unregisterCave = registerTerrain(cave);
afterAll(() => { unregister(); unregisterCave(); });

describe('caverna: entra pelo túnel, não sobe a montanha', () => {
  it('céu aberto: chão = topo, igual antes', () => {
    expect(groundUnder(-20, 0, 0, -99)).toBeCloseTo(0, 5);
    expect(groundUnder(20, 0, 0, -99)).toBeCloseTo(0, 5);
  });
  it('dentro do túnel: anda no PISO (0), não no topo da montanha (10)', () => {
    expect(groundUnder(0, 0, 0, -99)).toBeCloseTo(0, 5);
    expect(groundUnder(4.9, 3, 0.05, -99)).toBeCloseTo(0, 5);
  });
  it('em cima da montanha continua em cima (não afunda pro túnel)', () => {
    expect(groundUnder(0, 0, 10, -99)).toBeCloseTo(10, 5);
  });
  it('morro maciço (nada embaixo): sobe, como antes — nunca cai pro fundo', () => {
    expect(groundUnder(9, 0, 0, -99)).toBeCloseTo(5, 5);
  });
  it('pulo dentro do túnel: no ar (pé a 1,6 m) continua no túnel', () => {
    expect(groundUnder(0, 0, 1.6, -99, CAVE_DROP_AIR)).toBeCloseTo(0, 5);
  });
  it('teto: 2,5 m no túnel; céu aberto = infinito', () => {
    expect(ceilingAbove(0, 0, 1)).toBeCloseTo(2.5, 5);
    expect(ceilingAbove(-20, 0, 1)).toBe(Infinity);
  });
  it('PAREDE de caverna: bater na lateral PARA (não sobe pro topo); a curva/rampa debaixo do teto também é parede', () => {
    expect(nearCave(-88, 52)).toBe(true);
    // anda ao longo do túnel: livre
    expect(caveStep(-90, 53, -89.9, 53, 0)).toEqual([-89.9, 53]);
    // lateral: rocha maciça (sem piso, topo a 10 m) → fica
    expect(caveStep(-90, 54.95, -90, 55.05, 0)).toEqual([-90, 54.95]);
    // diagonal contra a lateral: DESLIZA ao longo (x anda, z fica)
    expect(caveStep(-90, 54.95, -89.9, 55.05, 0)).toEqual([-89.9, 54.95]);
    // rampa de 45° debaixo do teto (a curva): não sobe
    const [, z] = caveStep(-90, 49.0, -90, 48.9, 0);
    expect(z).toBe(49.0);
  });
  it('longe das cavernas nada muda: morro maciço continua escalável', () => {
    expect(nearCave(9, 0)).toBe(false);
    expect(caveStep(7.95, 0, 8.05, 0, 0)).toEqual([8.05, 0]);
  });
  it('ligado: herói (pé, pulo bate no teto, corte na câmera de cima), câmera de 3ª pessoa e bichos', () => {
    const gw = src('src/components/game-world.tsx');
    expect(gw).toMatch(/groundUnder\(bx, bz, feetY, Math\.max\(terrainHeight\(bx, bz\), bridgeSurfaceY\(bx, bz\), houseFloor\), isGrounded\.current \? undefined : CAVE_DROP_AIR\)/);
    expect(gw).toMatch(/const roof = ceilingAbove\(bx, bz, groundY \+ 0\.5\);/);
    expect(gw).toMatch(/mapCaveClip\.constant = caveRoof < body\.current\.position\.y \+ 8 \? body\.current\.position\.y \+ 2\.4 : 1e9;/);
    expect(gw).toMatch(/const hitFloor = sy < groundUnder\(sx, sz, py, terrainHeight\(sx, sz\)\) \+ 0\.3;/);
    expect(gw).toMatch(/const hitRoof = underRoof && sy > ceilingAbove\(sx, sz, py \+ 1\) - 0\.25;/);
    expect(src('src/components/world/hostile-ai.ts')).toMatch(/g\.position\.y = groundUnder\(\n\s*g\.position\.x, g\.position\.z, g\.position\.y,/);
    expect(src('src/components/world/map-floor.tsx')).toMatch(/pm\.clippingPlanes = \[mapCaveClip\];/);
    expect(gw).toMatch(/\[nx, nz\] = caveStep\(body\.current\.position\.x, body\.current\.position\.z, nx, nz, body\.current\.position\.y, isGrounded\.current \? undefined : CAVE_DROP_AIR\);/);
    expect(src('src/components/world/hostile-ai.ts')).toMatch(/\[targetX, targetZ\] = caveStep\(g\.position\.x, g\.position\.z, targetX, targetZ, g\.position\.y\);/);
  });
});
