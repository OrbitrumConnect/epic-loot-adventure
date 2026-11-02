/**
 * NAVIO e CARRO SALVOS ENTRE SESSÕES (02/11, Pedro item 5: "navio/carro salvos entre sessões"). Antes: recarregou = o
 * navio voltava inteiro na âncora e o carro inteiro do seu lado (dano e lugar perdidos). Agora ficam NESTE aparelho
 * (como a posição do herói, `tribos.zs.pos`): onde estavam, virados pra onde estavam, com a vida que tinham. Afundou /
 * explodiu = continua perdido — constrói outro (âncora / garagem) com recurso, igual a antes.
 * Lixo, fora do mapa ou navio em lugar sem água funda: volta pro lugar de sempre (âncora / garagem), mantendo a vida.
 */
import { CAR, newCar, type ZsCar } from './zs-car';
import { newWarship, WARSHIP, type ZsWarship } from './zs-warship';
import type { ZsTerrain } from './zs-terrain-data';

export const ZS_VEHICLES_KEY = 'tribos.zs.vehicles';
type Spot = { x: number; z: number; yaw: number };
export type SavedVehicle = (Spot & { hp: number }) | { gone: true };
export type SavedVehicles = { ship?: SavedVehicle; car?: SavedVehicle };

const r2 = (n: number) => Math.round(n * 100) / 100;
/** O que vai pro save: afundando/explodindo já conta como perdido (vai sumir em segundos). */
export function vehiclesSnapshot(ship: ZsWarship | null, car: ZsCar | null): SavedVehicles {
  const out: SavedVehicles = {};
  if (ship) out.ship = ship.sinkT !== null || ship.hp <= 0 ? { gone: true } : { x: r2(ship.x), z: r2(ship.z), yaw: r2(ship.yaw), hp: Math.round(ship.hp) };
  if (car) out.car = car.wreckT !== null || car.hp <= 0 ? { gone: true } : { x: r2(car.x), z: r2(car.z), yaw: r2(car.yaw), hp: Math.round(car.hp) };
  return out;
}

/** Lê e confere (lixo = null). */
export function parseSavedVehicles(raw: string | null): SavedVehicles | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (!v || typeof v !== 'object') return null;
    const one = (o: unknown): SavedVehicle | undefined => {
      if (!o || typeof o !== 'object') return undefined;
      const r = o as Record<string, unknown>;
      if (r['gone'] === true) return { gone: true };
      const x = Number(r['x']), z = Number(r['z']), yaw = Number(r['yaw']), hp = Number(r['hp']);
      return [x, z, yaw, hp].every(Number.isFinite) ? { x, z, yaw, hp } : undefined;
    };
    const out: SavedVehicles = {}, s = one(v['ship']), c = one(v['car']);
    if (s) out.ship = s;
    if (c) out.car = c;
    return out;
  } catch { return null; }
}

const clampHp = (hp: number, max: number) => Math.max(1, Math.min(max, Math.round(hp)));

/** O navio desta sessão: o salvo (se a água ali ainda é funda), senão na âncora — com a vida salva. Sem âncora = null. */
export function restoreWarship(saved: SavedVehicle | undefined, dock: Spot | null, swimmable: (x: number, z: number) => boolean): ZsWarship | null {
  if (!dock) return null;
  if (saved && 'gone' in saved) { const s = newWarship(dock.x, dock.z, dock.yaw); s.hp = 0; s.sinkT = WARSHIP.SINK_S; return s; } // afundado: constrói outro
  const s = saved && swimmable(saved.x, saved.z) ? newWarship(saved.x, saved.z, saved.yaw) : newWarship(dock.x, dock.z, dock.yaw);
  if (saved) s.hp = clampHp(saved.hp, WARSHIP.HP);
  return s;
}

/** O carro desta sessão: o salvo (dentro do mapa), senão na garagem — com a vida salva. Explodido = constrói outro. */
export function restoreCar(saved: SavedVehicle | undefined, garage: Spot, t: ZsTerrain): ZsCar {
  if (saved && 'gone' in saved) { const c = newCar(garage.x, garage.z, garage.yaw, t); c.hp = 0; c.wreckT = CAR.WRECK_S; return c; }
  const inMap = (x: number, z: number) => x > t.x0 + 4 && x < t.x0 + (t.w - 2) * t.cell && z > t.z0 + 4 && z < t.z0 + (t.h - 2) * t.cell;
  const c = saved && inMap(saved.x, saved.z) ? newCar(saved.x, saved.z, saved.yaw, t) : newCar(garage.x, garage.z, garage.yaw, t);
  if (saved) c.hp = clampHp(saved.hp, CAR.HP);
  return c;
}

export function readZsVehicles(): SavedVehicles | null {
  try { return parseSavedVehicles(localStorage.getItem(ZS_VEHICLES_KEY)); } catch { return null; }
}
export function saveZsVehicles(ship: ZsWarship | null, car: ZsCar | null): void {
  try { localStorage.setItem(ZS_VEHICLES_KEY, JSON.stringify(vehiclesSnapshot(ship, car))); } catch { /* sem storage */ }
}
