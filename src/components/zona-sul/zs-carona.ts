/**
 * CARONA (02/11, Pedro: "aliado de qualquer nível entra no carro que o outro aliado dirige — eu tenho nível, meu amigo
 * não, mas eu dirijo e ele vem junto"). O carro tem 5 lugares (CAR_SEATS[0] = motorista); quem pega carona senta num
 * banco LIVRE do carro do outro (o nível só trava quem DIRIGE) e vai junto na pose suavizada do carro dele. Só aliado
 * (inimigo não entra no carro do outro). Puro.
 */
import { CAR, CAR_SEATS, SEAT_FOOT_K } from './zs-car';

type CarPose = { x: number; y: number; z: number; yaw: number };
type Dims = { width: number; length: number; height: number } | null | undefined;

/** Banco `k` (CAR_SEATS) no mundo: posição do pé do herói sentado. A mesma conta do banco do motorista. */
export function carSeatWorld(car: CarPose, k: number, dims: Dims): { x: number; y: number; z: number } {
  const seat = CAR_SEATS[k] ?? CAR_SEATS[0]!, wv = dims?.width ?? 2.2, lv = dims?.length ?? CAR.LENGTH;
  const sx = seat.x * wv, sz = seat.z * lv, c = Math.cos(car.yaw), s = Math.sin(car.yaw);
  return { x: car.x + c * sx + s * sz, y: car.y + (dims?.height ?? 1.4) * SEAT_FOOT_K, z: car.z - s * sx + c * sz };
}

/** Carro de OUTRO jogador onde dá pra pegar carona daqui: perto (CAR.ENTER_DIST), inteiro e de ALIADO. O mais perto. */
export function caronaCarNear<T extends CarPose & { id: string; hp: number }>(px: number, pz: number, cars: Iterable<T>, hostile: (ownerId: string) => boolean): T | null {
  let best: T | null = null, bd: number = CAR.ENTER_DIST;
  for (const c of cars) {
    if (c.hp <= 0 || hostile(c.id)) continue;
    const d = Math.hypot(c.x - px, c.z - pz);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** O MEU carro (o herói escreve a cada quadro) — pra encaixar no banco quem pega carona COMIGO. */
export const caronaMine: { car: CarPose | null; dims: Dims } = { car: null, dims: null };
/**
 * Encaixe no BANCO: quem está sentado (ação "drive") é desenhado no banco do carro que EU vejo, sem atraso — a pose dele
 * chega atrasada (ele mesmo calculou o banco com atraso + a rede) e, com o carro rápido, ele ficava metros atrás. O banco
 * mais perto (até 3,5 m na horizontal, até 3 m na altura) de qualquer carro; null = não está num carro.
 */
export function caronaSeatSnap(x: number, y: number, z: number, cars: Iterable<CarPose>, dims: Dims): { x: number; y: number; z: number; yaw: number } | null {
  let best: { x: number; y: number; z: number; yaw: number } | null = null, bd = 3.5;
  for (const c of cars) for (let k = 0; k < CAR_SEATS.length; k++) {
    const s = carSeatWorld(c, k, dims), d = Math.hypot(s.x - x, s.z - z);
    if (d < bd && Math.abs(s.y - y) < 3) { bd = d; best = { ...s, yaw: c.yaw }; }
  }
  return best;
}

/** Banco livre (1..4 — o 0 é do motorista): ocupado = tem outro jogador a menos de 0,9 m dele. null = carro cheio. */
export function freeCarSeat(car: CarPose, dims: Dims, others: readonly { x: number; z: number }[]): number | null {
  for (let k = 1; k < CAR_SEATS.length; k++) {
    const s = carSeatWorld(car, k, dims);
    if (!others.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 0.9)) return k;
  }
  return null;
}
