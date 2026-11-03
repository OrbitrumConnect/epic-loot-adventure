import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAR, CAR_SEATS } from '@/components/zona-sul/zs-car';
import { carSeatWorld, caronaCarNear, caronaSeatSnap, freeCarSeat } from '@/components/zona-sul/zs-carona';

/* Pedro 02/11: "aliado de qualquer nível entra no carro que o outro aliado dirige — eu tenho nível, meu amigo não, mas
   eu dirijo e ele vem junto". */
const dims = { width: 2.4, length: 7.4, height: 1.5 };
describe('carona no carro', () => {
  it('banco no mundo: o 0 é o motorista (a mesma conta de sempre), gira com o carro', () => {
    const car = { x: 10, y: 2, z: 20, yaw: 0 };
    const s0 = carSeatWorld(car, 0, dims);
    expect(s0.x).toBeCloseTo(10 + CAR_SEATS[0]!.x * dims.width, 6);
    expect(s0.z).toBeCloseTo(20 + CAR_SEATS[0]!.z * dims.length, 6);
    const r = carSeatWorld({ ...car, yaw: Math.PI / 2 }, 0, dims);
    expect(Math.hypot(r.x - car.x, r.z - car.z)).toBeCloseTo(Math.hypot(s0.x - car.x, s0.z - car.z), 6);
  });
  it('só ALIADO dá carona, perto (≤ ENTER_DIST), carro inteiro; banco livre (1..4), cheio = null', () => {
    const cars = [{ id: 'A', x: 3, y: 0, z: 0, yaw: 0, hp: 600 }, { id: 'B', x: 1, y: 0, z: 0, yaw: 0, hp: 600 }, { id: 'C', x: 0.5, y: 0, z: 0, yaw: 0, hp: 0 }];
    expect(caronaCarNear(0, 0, cars, (id) => id === 'B')?.id).toBe('A');   // B é inimigo, C explodiu
    expect(caronaCarNear(CAR.ENTER_DIST + 4, 0, cars, () => false)).toBeNull();
    const car = cars[0]!;
    expect(freeCarSeat(car, dims, [])).toBe(1);
    const s1 = carSeatWorld(car, 1, dims), s2 = carSeatWorld(car, 2, dims);
    expect(freeCarSeat(car, dims, [s1])).toBe(2);
    expect(freeCarSeat(car, dims, [s1, s2, carSeatWorld(car, 3, dims), carSeatWorld(car, 4, dims)])).toBeNull();
  });
  it('quem está SENTADO é desenhado no banco do carro que eu vejo (sem o atraso da pose dele)', () => {
    const car = { x: 0, y: 0, z: 0, yaw: 0 }, s2 = carSeatWorld(car, 2, dims);
    const snap = caronaSeatSnap(s2.x + 1.5, s2.y + 0.2, s2.z - 1, [car], dims)!; // pose dele 1,8 m atrasada
    expect([snap.x, snap.z]).toEqual([s2.x, s2.z]);
    expect(caronaSeatSnap(20, 0, 0, [car], dims)).toBeNull();
  });
  it('ligado: E entra/sai, nível NÃO trava quem pega carona, carro sumiu/explodiu = cai; botão no celular', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain("} else if (drive.mode === 'foot' && caronaCar) {");
    expect(zs).toContain("drive.mode = 'riding'; drive.rideWho = caronaCar.id; drive.seat = seat;");
    expect(zs).toMatch(/caronaCar\) \{[^]*?if \(seat === null\)/); // sem isUnlocked no caminho da carona
    expect(zs).toContain("useGameStore.getState().setMessage(rc ? '🔥 O carro explodiu — você caiu!' : '🚗 A carona acabou (o carro sumiu).');");
    expect(zs).toContain("outer: [carBtn('Sair da carona', <LogOut />)]");
    expect(fs.readFileSync('src/components/world/remote-players.tsx', 'utf8')).toContain("if (zs?.seatSnap && p.action === 'drive') {");
  });
});
