import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creatureBody } from '@/components/world/aim';

/* Pedro, 26/10 (prints): "no manual a bala passa nos inimigos sem dano"; "dá muito zoom no celular quando vai atirar";
   "quando viro o celular os botões não acompanham". */
describe('bala acerta bicho comprido', () => {
  it('jacaré (barra a 1,9 m, corpo 2,5 m): raio da mira 2,5 (era 0,67); pirata pequeno: igual (pela altura)', () => {
    expect(creatureBody({ y: 0, top: 1.9, r: 2.5 }).r).toBe(2.5);
    expect(creatureBody({ y: 0, top: 1.9 }).r).toBeCloseTo(0.665, 3);          // sem corpo = como antes
    expect(creatureBody({ y: 0, top: 2.15, r: 0.4 }).r).toBeCloseTo(0.7525, 4); // raider: altura ganha (igual)
    expect(creatureBody({ y: 0, top: 3.6, r: 9 }).r).toBe(3.5);                  // teto
  });
});

describe('celular: mira sem zoom exagerado e controles de toque deitado', () => {
  it('mirando no celular: câmera a 3,2 m e campo 58° (PC: 1,7 m e 52°, igual)', () => {
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/export const AIM_DIST_TOUCH = 3\.2;/);
    expect(gw).toMatch(/export const AIM_FOV_TOUCH = 58;/);
    expect(gw).toMatch(/const aimDist = touchLayout\.on \? AIM_DIST_TOUCH : 1\.7;/);
    expect(gw).toMatch(/const wantFov = aiming \? \(touchLayout\.on \? AIM_FOV_TOUCH : 52\) \/ aimNow\.zoom : 65;/);
  });
  it('controles de toque: tela estreita OU tela de toque (celular deitado não perde mais os botões)', () => {
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toMatch(/const isMobile = useIsMobile\(\) \|\| touchScreen;/);
    expect(fs.readFileSync('src/hooks/use-mobile.tsx', 'utf8')).toMatch(/window\.matchMedia\("\(pointer: coarse\)"\)/);
  });
});
