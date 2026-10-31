/**
 * CAVERNA DA ZONA SUL (30/10, Pedro): "a estrada que chega na base do Cristo, perto da subida do Humaitá — abrir um
 * buraco, cave, entrada EXATAMENTE onde é a entrada do Túnel Rebouças; pra dentro da pedra curvando pra baixo, abrindo
 * galerias, local com água e uma big cave pra explorar, com salão no final, no fundo, pro boss. A cave pega todo o
 * interior do maciço que envolve Jardim Botânico e Gávea e pode ter uma saída perto do Leblon, menor que a entrada do
 * Rebouças. É só uma camada do mapa embaixo do que já tem — sem pesar, só shapes."
 *
 * Como (puro e leve — sem malha de colisão, sem raio):
 *  - a caverna é UMA FUNÇÃO (`caveField`, distância com sinal): túneis em ARCO de chão reto e SALÕES em cúpula, unidos
 *    suave, rocha rugosa por ruído, pilares de pedra. Ar = valor < 0. O chão tem função própria (`caveFloorAt`), plano.
 *  - andar (herói e bichos), câmera, tiro e camada consultam a função (umas contas por quadro);
 *  - o DESENHO sai da MESMA função (marching cubes por blocos, montado aos poucos — `caveMeshJob`), então o que se vê é
 *    o que se pisa;
 *  - as BOCAS: o chão do mapa abre um buraco exato onde o túnel corta a encosta (shader do terreno, `ZS_CAVE_MOUTHS`).
 * Pontos (coordenadas do jogo, bake 1:7,4): a boca do Rebouças é a ponta sul do Túnel Rebouças no OSM (−70, −59), na
 * Rua Jardim Botânico/Humaitá; o túnel entra pro norte, curva pro oeste descendo por baixo do Corcovado, galerias,
 * águas, a grande caverna embaixo do maciço do Jardim Botânico e, no fundo (−32 m), o salão do chefe. O ramal do Leblon
 * passa por baixo dos morros da Gávea e sai no pé do Dois Irmãos, no fim do Leblon (boca menor).
 */
import type { UnderLayer } from '@/game/data/world-profile';
import { ZS_SURF } from './zona-sul-meta';
import { type ZsTerrain, zsHeightAt, zsSurfAt } from './zs-terrain-data';

/* ------------------------------------------------------------------ desenho da rede */

/** Ponto de túnel: chão `y`, meia-largura `r` e altura do arco `h` (m). */
export type CaveTunnelPt = { x: number; z: number; y: number; r: number; h: number };
/** Túnel: polilinha; `mouth` = o 1º ponto é uma BOCA (corte reto, chão = encosta). */
export type CaveTunnel = { id: string; name: string; pts: CaveTunnelPt[]; mouth?: boolean };
/** Poça no salão (no referencial do salão: u ao longo de `yaw`): o chão afunda até `depth`, a água fica no chão. */
export type CavePool = { u: number; v: number; rx: number; rz: number; depth: number };
export type CaveRoom = {
  id: string; name: string; x: number; z: number; y: number; rx: number; rz: number; h: number; yaw: number;
  /** contorno irregular (m) */
  lobe: number; pools?: CavePool[]; pillars?: { x: number; z: number; r: number }[];
  /** tom da rocha */
  tint: readonly [number, number, number];
};

const P = (x: number, z: number, y: number, r: number, h: number): CaveTunnelPt => ({ x, z, y, r, h });

// 31/10 (Pedro: "os túneis são um pouco baixos e poderiam ser mais largos"): por dentro ~+30% de largura e altura (as
// bocas quase iguais); conferido pelo teste "não fura o mapa".
export const CAVE_TUNNELS: CaveTunnel[] = [
  // BOCA DO REBOUÇAS (larga: 12 m × 6,5 m) — entra pro norte e curva pro oeste descendo por baixo do Corcovado
  { id: 'reboucas', name: 'entrada do Rebouças', mouth: true, pts: [
    P(-70, -63, 10.6, 6, 6.5), P(-71, -96, 7, 7, 8.5), P(-78, -118, 4, 7, 9), P(-98, -136, 1, 6.5, 8.5),
    P(-132, -149, -2, 6.5, 8.5), P(-180, -158, -5, 6.5, 9)] },
  { id: 'galeria-agua', name: 'galeria', pts: [P(-220, -158, -5, 6, 8.5), P(-262, -150, -7, 6, 8), P(-300, -152, -9, 6, 8), P(-338, -162, -10, 6, 8)] },
  // as duas galerias d'água: passagem entre elas (pela beira das poças)
  { id: 'agua-agua', name: "galeria d'água", pts: [P(-366, -175, -10, 5.8, 8), P(-376, -181, -10.5, 5.8, 8), P(-386, -185, -11, 5.8, 8)] },
  { id: 'agua-grande', name: 'galeria', pts: [P(-396, -178, -11, 6, 8.5), P(-418, -171, -14, 6.2, 8.5), P(-430, -168, -16, 6.5, 9)] },
  // descendo pro FUNDO: o salão do chefe
  { id: 'grande-chefe', name: 'descida pro salão do chefe', pts: [P(-482, -178, -16, 6.5, 9), P(-503, -188, -22, 7, 10), P(-526, -194, -28, 7.5, 11), P(-536, -195, -32, 8, 12)] },
  // RAMAL DO LEBLON (boca menor: 6,4 m × 4,2 m) — sai no pé do Dois Irmãos, no fim do Leblon
  { id: 'leblon', name: 'saída do Leblon', mouth: true, pts: [
    P(-446, 366, 10.45, 3.2, 4.2), P(-470, 366, 8, 3.8, 5.2), P(-500, 364, 5, 4.6, 6.2), P(-540, 360, 2, 5, 6.5),
    P(-584, 344, -1, 5.2, 6.5), P(-600, 300, -4, 5.4, 7), P(-606, 230, -6, 5.4, 7), P(-610, 205, -7.5, 5.4, 7)] },
  { id: 'gavea', name: 'passagem da Gávea', pts: [
    P(-612, 165, -7.5, 5.4, 7), P(-610, 130, -8.5, 5.4, 7), P(-596, 75, -10, 5.6, 7), P(-570, 5, -12, 5.6, 7.2),
    P(-525, -48, -14, 5.8, 7.5), P(-478, -102, -16, 6, 8), P(-458, -140, -16, 6.5, 8.5)] },
  // RAMAL DE LARANJEIRAS (31/10, Pedro: "uma saída pra quase Flamengo/Laranjeiras") — boca no pé do Morro de São Judas
  // Tadeu virada pra Rua das Laranjeiras; o túnel desce pelo vale do Cosme Velho (sob o Rebouças de verdade) até a
  // galeria do Cosme Velho e liga no túnel do Rebouças pela encruzilhada
  { id: 'laranjeiras', name: 'saída de Laranjeiras', mouth: true, pts: [
    P(84, -416, 13.4, 3.8, 5), P(68, -432, 11, 4.6, 6.5), P(32, -402, 6, 5.6, 7.5), P(2, -372, 2, 6, 8),
    P(-24, -336, -1, 6, 8), P(-42, -290, -2, 6, 8), P(-50, -245, -2, 6, 8)] },
  { id: 'cosme-encruzilhada', name: 'túnel do Cosme Velho', pts: [P(-54, -205, -2, 6, 8), P(-62, -170, 0, 6, 8), P(-70, -140, 2.5, 6.5, 8.5), P(-76, -124, 4, 6.5, 8.5)] },
];

export const CAVE_ROOMS: CaveRoom[] = [
  { id: 'encruzilhada', name: 'encruzilhada', x: -80, z: -120, y: 4, rx: 13, rz: 11, h: 11, yaw: 0.6, lobe: 1.8, tint: [0.45, 0.42, 0.38] },
  { id: 'corcovado', name: 'galeria do Corcovado', x: -200, z: -160, y: -5, rx: 26, rz: 17, h: 13, yaw: 0.15, lobe: 2.2,
    pillars: [{ x: -207, z: -154, r: 2.6 }], tint: [0.46, 0.43, 0.39] },
  { id: 'agua', name: "galeria d'água", x: -357, z: -166, y: -10, rx: 21, rz: 14, h: 10, yaw: 0.25, lobe: 2,
    pools: [{ u: 0, v: 0, rx: 12, rz: 7, depth: 0.85 }], tint: [0.36, 0.42, 0.42] },
  { id: 'agua2', name: "galeria d'água", x: -386, z: -185, y: -11, rx: 15, rz: 13, h: 9, yaw: -0.4, lobe: 1.8,
    pools: [{ u: 2, v: -1, rx: 9, rz: 8, depth: 0.9 }], tint: [0.34, 0.41, 0.42] },
  { id: 'grande', name: 'grande caverna', x: -452, z: -165, y: -16, rx: 34, rz: 25, h: 22, yaw: -0.25, lobe: 3,
    pillars: [{ x: -462, z: -158, r: 3.4 }, { x: -440, z: -177, r: 2.6 }], pools: [{ u: 14, v: 10, rx: 8, rz: 6, depth: 0.7 }],
    tint: [0.44, 0.41, 0.37] },
  { id: 'chefe', name: 'salão do chefe', x: -556, z: -196, y: -32, rx: 24, rz: 21, h: 19, yaw: 0.1, lobe: 2.4, tint: [0.47, 0.36, 0.32] },
  { id: 'cristais', name: 'galeria dos cristais', x: -610, z: 185, y: -7.5, rx: 15, rz: 22, h: 12, yaw: 0.05, lobe: 2, tint: [0.4, 0.37, 0.46] },
  { id: 'poco', name: 'poço da Gávea', x: -596, z: 70, y: -10, rx: 11, rz: 11, h: 8, yaw: 0, lobe: 1.5,
    pools: [{ u: 0, v: 0, rx: 7, rz: 6, depth: 0.8 }], tint: [0.35, 0.41, 0.41] },
  { id: 'cosme', name: 'galeria do Cosme Velho', x: -52, z: -225, y: -2, rx: 16, rz: 20, h: 12, yaw: 0.15, lobe: 2.2,
    pools: [{ u: -4, v: 6, rx: 7, rz: 9, depth: 0.8 }], tint: [0.38, 0.41, 0.4] },
];

/** INIMIGOS DA CAVERNA (31/10, Pedro: "falta os inimigos dentro da cave"): Fauce de Sílex e Aberração (os bichos da mata
 *  alta) espalhados nos salões — [salão, espécie, u, v] (u/v = fração do raio do salão). Nascem como FAUNA
 *  (`wild_cave_*`): força pela região (a caverna fica embaixo da Tijuca), renascem em casa, no chão da caverna. */
export const CAVE_ENEMIES: readonly (readonly [string, string, number, number])[] = [
  ['encruzilhada', 'flintmaw', 0.3, -0.3],
  ['corcovado', 'flintmaw', 0.35, 0.3], ['corcovado', 'flintmaw', -0.4, -0.2],
  ['agua', 'monster', 0.55, -0.4], ['agua2', 'flintmaw', -0.3, 0.45],
  ['grande', 'monster', 0.3, 0.35], ['grande', 'monster', -0.35, -0.3], ['grande', 'flintmaw', 0.55, -0.25],
  ['poco', 'monster', 0.5, 0.3],
  ['cristais', 'flintmaw', 0.3, 0.4], ['cristais', 'flintmaw', -0.35, -0.45],
  ['cosme', 'monster', 0.35, -0.3], ['cosme', 'flintmaw', -0.4, 0.2],
];

/** O CHEFE mora no salão do fundo: a Aberração Fúngica (o chefão das hordas), com 1,5× a vida — é o fim da caverna. */
export const CAVE_BOSS = { id: 'zs_cave_boss', speciesId: 'raider_mushroom', x: -560, z: -196, hpK: 1.5 } as const;
/** Os primeiros metros de cada boca contam como SUPERFÍCIE (bicho de fora entra atrás de você; ninguém briga através
 *  da rocha mais pra dentro). */
export const CAVE_MOUTH_ZONE = 14;
/** Água das poças: a lâmina fica 4 cm abaixo do chão do salão. */
const POOL_Y = -0.04;
/** O buraco do chão do mapa começa este tanto (m) DEPOIS do plano da boca: o chão do mapa cobre o cantinho arredondado
 *  da malha (voxel de 1,6 m) — sem fresta pro céu. */
export const CAVE_HOLE_IN = 0.3;

/* ------------------------------------------------------------------ peças (pré-calculadas) */

type Seg = { ax: number; az: number; ay: number; bx: number; bz: number; by: number; ra: number; rb: number; ha: number; hb: number; abx: number; abz: number; l2: number; cap: boolean; tunnel: number };
type Room = CaveRoom & { c: number; s: number; m: number; seed: number };
type Pillar = { x: number; z: number; r: number };

const SEGS: Seg[] = [];
CAVE_TUNNELS.forEach((tn, ti) => {
  for (let i = 0; i + 1 < tn.pts.length; i++) {
    const a = tn.pts[i]!, b = tn.pts[i + 1]!, abx = b.x - a.x, abz = b.z - a.z;
    SEGS.push({ ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, ra: a.r, rb: b.r, ha: a.h, hb: b.h, abx, abz, l2: abx * abx + abz * abz, cap: !!tn.mouth && i === 0, tunnel: ti });
  }
});
const ROOMS: Room[] = CAVE_ROOMS.map((r, i) => ({ ...r, c: Math.cos(r.yaw), s: Math.sin(r.yaw), m: Math.min(r.rx, r.rz, r.h), seed: i * 31.7 }));
const PILLARS: Pillar[] = CAVE_ROOMS.flatMap((r) => r.pillars ?? []);

/** As BOCAS: o 1º trecho de cada túnel com boca (o shader do chão abre o buraco nele). */
export type CaveMouth = { id: string; name: string; ax: number; az: number; ay: number; bx: number; bz: number; by: number; ra: number; rb: number; ha: number; hb: number };
export const ZS_CAVE_MOUTHS: CaveMouth[] = CAVE_TUNNELS.filter((t) => t.mouth).map((t) => {
  const a = t.pts[0]!, b = t.pts[1]!;
  return { id: t.id, name: t.name, ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, ra: a.r, rb: b.r, ha: a.h, hb: b.h };
});

/* ------------------------------------------------------------------ grade 2D (só as peças perto de cada ponto) */

const CELL = 16, PAD = 9;
let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
const boxes2: { x0: number; z0: number; x1: number; z1: number; kind: 0 | 1 | 2; i: number }[] = [];
SEGS.forEach((s, i) => boxes2.push({ x0: Math.min(s.ax, s.bx) - Math.max(s.ra, s.rb) * 1.5 - PAD, x1: Math.max(s.ax, s.bx) + Math.max(s.ra, s.rb) * 1.5 + PAD, z0: Math.min(s.az, s.bz) - Math.max(s.ra, s.rb) * 1.5 - PAD, z1: Math.max(s.az, s.bz) + Math.max(s.ra, s.rb) * 1.5 + PAD, kind: 0, i }));
ROOMS.forEach((r, i) => { const R = Math.max(r.rx, r.rz) * 1.35 + r.lobe + PAD; boxes2.push({ x0: r.x - R, x1: r.x + R, z0: r.z - R, z1: r.z + R, kind: 1, i }); });
PILLARS.forEach((p, i) => boxes2.push({ x0: p.x - p.r - 3, x1: p.x + p.r + 3, z0: p.z - p.r - 3, z1: p.z + p.r + 3, kind: 2, i }));
for (const b of boxes2) { gx0 = Math.min(gx0, b.x0); gz0 = Math.min(gz0, b.z0); gx1 = Math.max(gx1, b.x1); gz1 = Math.max(gz1, b.z1); }
gx0 = Math.floor(gx0 / CELL) * CELL; gz0 = Math.floor(gz0 / CELL) * CELL;
const GW = Math.ceil((gx1 - gx0) / CELL) + 1, GH = Math.ceil((gz1 - gz0) / CELL) + 1;
type GCell = { segs: number[]; rooms: number[]; pillars: number[] };
const GRID: (GCell | null)[] = new Array(GW * GH).fill(null);
for (const b of boxes2) {
  for (let j = Math.floor((b.z0 - gz0) / CELL); j <= Math.floor((b.z1 - gz0) / CELL); j++) {
    for (let i = Math.floor((b.x0 - gx0) / CELL); i <= Math.floor((b.x1 - gx0) / CELL); i++) {
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const c = GRID[j * GW + i] ?? (GRID[j * GW + i] = { segs: [], rooms: [], pillars: [] });
      (b.kind === 0 ? c.segs : b.kind === 1 ? c.rooms : c.pillars).push(b.i);
    }
  }
}
function cellOf(x: number, z: number): GCell | null {
  const i = Math.floor((x - gx0) / CELL), j = Math.floor((z - gz0) / CELL);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return null;
  return GRID[j * GW + i]!;
}
/** Tem caverna perto de (x, z)? (conta de grade — barato pra quem está longe) */
export function caveNearXZ(x: number, z: number): boolean { return cellOf(x, z) !== null; }

/* ------------------------------------------------------------------ chão do mapa (pra boca) */

let groundAt: (x: number, z: number) => number = () => Infinity;
/** Liga a caverna ao chão do mapa (a boca nunca fica com o chão acima da encosta). */
export function setCaveTerrain(t: ZsTerrain | null): void { groundAt = t ? (x, z) => zsHeightAt(t, x, z) : () => Infinity; }

/* ------------------------------------------------------------------ ruído + contas */

export const CAVE_BIG = 1e3;
function hash3(i: number, j: number, k: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Ruído de valor 3D, 0..1 (suave). */
export function caveNoise(x: number, y: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
  const e = hash3(i, j, k + 1), f = hash3(i + 1, j, k + 1), g = hash3(i, j + 1, k + 1), h = hash3(i + 1, j + 1, k + 1);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}
const smooth01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
/** União suave (raio K m): emendas de túnel e salão sem quina. */
const K = 3;
function smin(a: number, b: number): number {
  const h = Math.max(K - Math.abs(a - b), 0) / K;
  return Math.min(a, b) - h * h * K * 0.25;
}
/** Distância até a boca mais perto (3D). */
export function caveMouthDist(x: number, y: number, z: number): number {
  let best = Infinity;
  for (const m of ZS_CAVE_MOUTHS) best = Math.min(best, Math.hypot(x - m.ax, y - m.ay, z - m.az));
  return best;
}
/** Rugosidade da rocha: lisa nas bocas (o buraco do chão casa certinho com o túnel), cheia a 32 m pra dentro. */
function roughAt(x: number, y: number, z: number): number { return 0.85 * smooth01((caveMouthDist(x, y, z) - 16) / 16); }

function segVal(s: Seg, x: number, y: number, z: number): number {
  let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2;
  // boca: corte RETO no plano da boca (fora dela é a encosta) — como distância (contínua), pra malha fechar certinho
  const cut = s.cap && t < 0 ? -t * Math.sqrt(s.l2) : -Infinity;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - (s.ax + s.abx * t), dz = z - (s.az + s.abz * t);
  const r = s.ra + (s.rb - s.ra) * t, h = s.ha + (s.hb - s.ha) * t, yf = s.ay + (s.by - s.ay) * t;
  const q = (dx * dx + dz * dz) / (r * r) + ((y - yf) / h) ** 2;
  return Math.max((Math.sqrt(q) - 1) * Math.min(r, h), cut);
}
function roomUV(r: Room, x: number, z: number): [number, number] {
  const dx = x - r.x, dz = z - r.z;
  return [dx * r.c + dz * r.s, -dx * r.s + dz * r.c];
}
function roomVal(r: Room, x: number, y: number, z: number): number {
  const [u, v] = roomUV(r, x, z);
  const q = (u / r.rx) ** 2 + (v / r.rz) ** 2 + ((y - r.y) / r.h) ** 2;
  const lobe = (caveNoise(x * 0.05 + r.seed, y * 0.07, z * 0.05) - 0.5) * 2 * r.lobe;
  return (Math.sqrt(q) - 1) * r.m - lobe;
}
function roomFloor(r: Room, u: number, v: number): number {
  let y = r.y;
  for (const p of r.pools ?? []) {
    const e = Math.hypot((u - p.u) / p.rx, (v - p.v) / p.rz);
    if (e < 1) y -= p.depth * smooth01((1 - e) / 0.6);
  }
  return y;
}

/** Chão da caverna em (x, z) (null = rocha: não tem caverna ali). Plano por trecho, emendado suave; nas bocas nunca
 *  passa da encosta (o chão do túnel encontra o chão do mapa). */
export function caveFloorAt(x: number, z: number): number | null {
  const c = cellOf(x, z);
  if (!c) return null;
  return floorIn(c, x, z);
}
function floorIn(c: GCell, x: number, z: number): number | null {
  let sw = 0, sf = 0;
  for (const i of c.segs) {
    const s = SEGS[i]!;
    let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2;
    if (s.cap && t < -0.12) continue; // boca: o chão vai só um pouquinho além do plano (o corte fica contínuo)
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const r = s.ra + (s.rb - s.ra) * t;
    const d = Math.hypot(x - (s.ax + s.abx * t), z - (s.az + s.abz * t));
    const w = smooth01((1.4 * r - d) / (0.85 * r));
    if (w <= 0) continue;
    sw += w; sf += w * (s.ay + (s.by - s.ay) * t);
  }
  for (const i of c.rooms) {
    const r = ROOMS[i]!;
    const [u, v] = roomUV(r, x, z);
    const e = Math.hypot(u / r.rx, v / r.rz);
    const w = smooth01((1.3 - e) / 0.5);
    if (w <= 0) continue;
    sw += w; sf += w * roomFloor(r, u, v);
  }
  if (sw <= 1e-6) return null;
  // 5 cm abaixo do chão do mapa quando o segue (beira baixa da boca): o chão do mapa cobre, sem piscar
  return Math.min(sf / sw, groundAt(x, z) - 0.05);
}

/**
 * A CAVERNA: valor < 0 = ar da caverna; > 0 = rocha (ou fora dela). Aproximadamente a distância em metros até a parede.
 * Fora da área da caverna: CAVE_BIG (uma conta de grade).
 */
export function caveField(x: number, y: number, z: number): number {
  const c = cellOf(x, z);
  if (!c) return CAVE_BIG;
  const fl = floorIn(c, x, z);
  if (fl === null) return CAVE_BIG;
  let f = CAVE_BIG;
  for (const i of c.segs) f = smin(f, segVal(SEGS[i]!, x, y, z));
  for (const i of c.rooms) f = smin(f, roomVal(ROOMS[i]!, x, y, z));
  if (f >= CAVE_BIG * 0.5) return CAVE_BIG;
  const amp = roughAt(x, y, z);
  if (amp > 0) f += ((caveNoise(x * 0.16, y * 0.16, z * 0.16) - 0.5) * 2 + (caveNoise(x * 0.42 + 17, y * 0.42, z * 0.42) - 0.5) * 0.7) * amp;
  for (const i of c.pillars) {
    const p = PILLARS[i]!;
    const d = Math.hypot(x - p.x, z - p.z) - p.r * (1 + 0.22 * (caveNoise(x * 0.3, y * 0.25, z * 0.3) - 0.5));
    f = Math.max(f, -d);
  }
  return Math.max(f, fl - y);
}

/** Ar da caverna em (x, y, z)? */
export function caveAir(x: number, y: number, z: number): boolean { return caveField(x, y, z) < 0; }
/** Quem tem os pés em `feetY` está DENTRO da caverna? (conta meio metro acima do pé) */
export function caveInside(x: number, feetY: number, z: number): boolean { return caveField(x, feetY + 0.5, z) < 0; }
/** Camada: 1 = caverna (mais de CAVE_MOUTH_ZONE m pra dentro), 0 = superfície (inclui a boca). */
export function caveLayer(x: number, y: number, z: number): number {
  if (!caveInside(x, y, z)) return 0;
  return caveMouthDist(x, y, z) > CAVE_MOUTH_ZONE ? 1 : 0;
}
/** Rocha MESMO (pra tiro/visão de dentro da caverna): fora do ar da caverna e abaixo do chão do mapa. */
export function caveSolid(x: number, y: number, z: number): boolean { return caveField(x, y, z) > 0 && y < groundAt(x, z); }
/** Lâmina d'água da poça em (x, z) (null = seco). */
export function cavePoolY(x: number, z: number): number | null {
  const c = cellOf(x, z);
  if (!c) return null;
  for (const i of c.rooms) {
    const r = ROOMS[i]!;
    if (!r.pools) continue;
    const [u, v] = roomUV(r, x, z);
    for (const p of r.pools) if (Math.hypot((u - p.u) / p.rx, (v - p.v) / p.rz) < 1) return r.y + POOL_Y;
  }
  return null;
}
/** Onde estou (pro status): o salão mais perto, senão o túnel. */
export function caveRoomName(x: number, z: number): string {
  let best = '', bd = Infinity;
  for (const r of ROOMS) { const [u, v] = roomUV(r, x, z); const e = Math.hypot(u / r.rx, v / r.rz); if (e < 1.25 && e < bd) { bd = e; best = r.name; } }
  if (best) return best;
  let ds = Infinity;
  for (const s of SEGS) {
    let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.ax + s.abx * t), z - (s.az + s.abz * t));
    if (d < ds) { ds = d; best = CAVE_TUNNELS[s.tunnel]!.name; }
  }
  return best;
}
/** Árvore/bicho/acampamento NÃO nasce na boca (o buraco fica limpo). */
export function caveMouthClear(x: number, z: number, pad = 4): boolean {
  for (const m of ZS_CAVE_MOUTHS) {
    const abx = m.bx - m.ax, abz = m.bz - m.az, l2 = abx * abx + abz * abz;
    let t = ((x - m.ax) * abx + (z - m.az) * abz) / l2;
    if (t < -0.35 || t > 1.05) continue;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(x - (m.ax + abx * t), z - (m.az + abz * t)) < m.ra + (m.rb - m.ra) * t + pad) return false;
  }
  return true;
}

/** A caverna como CAMADA DE BAIXO do mapa (perfil do mundo): o jogo (bichos, tiro, luz, efeitos) pergunta por aqui. */
export function zsCaveUnder(t: ZsTerrain): UnderLayer {
  setCaveTerrain(t);
  return {
    floor: (x, z, feetY) => (caveInside(x, feetY, z) ? caveFloorAt(x, z) : null),
    floorAt: caveFloorAt,
    step: caveCreatureStep,
    layer: caveLayer,
    solid: caveSolid,
    inside: caveAir,
    homeY: (id, x, z) => (id.startsWith('zs_cave_') || id.startsWith('wild_cave_') ? caveFloorAt(x, z) : null),
  };
}

/* ------------------------------------------------------------------ andar */

export type CaveMove = { x: number; z: number; ground: number; inCave: boolean; wading: boolean };
const BODY_Y = 1.0, BODY_R = 0.3, HEAD_Y = 1.75, STEP_UP = 0.9;
/** Cabe um corpo em pé em (x, z) com o chão `fl`? (cintura com folga + cabeça) */
function bodyFits(x: number, fl: number, z: number): boolean {
  return caveField(x, fl + BODY_Y, z) < -BODY_R && caveField(x, fl + HEAD_Y, z) < -0.05;
}
/** Onde nasce cada inimigo da caverna (`CAVE_ENEMIES`): no salão, num chão onde cabe em pé (se a posição pedida cair na
 *  parede, puxa pro meio do salão). Puro. */
export function caveEnemySpots(): { id: string; speciesId: string; x: number; z: number }[] {
  return CAVE_ENEMIES.map(([room, speciesId, fu, fv], i) => {
    const r = ROOMS.find((q) => q.id === room)!;
    for (let k = 1; k >= 0; k -= 0.1) {
      const u = fu * r.rx * k, v = fv * r.rz * k, x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
      if (caveStandAt(x, z) !== null) return { id: `wild_cave_${room}_${i}`, speciesId, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
    }
    return { id: `wild_cave_${room}_${i}`, speciesId, x: r.x, z: r.z };
  });
}
/** Chão onde cabe um corpo EM PÉ em (x, z) (null = rocha/parede). */
export function caveStandAt(x: number, z: number): number | null {
  const fl = caveFloorAt(x, z);
  return fl !== null && bodyFits(x, fl, z) ? fl : null;
}
/**
 * Passo de quem anda na CAVERNA (herói; puro). null = não está na caverna nem entrando nela (anda no mapa como sempre).
 * Parede = desliza no eixo livre (igual muro); pela BOCA sai pro chão do mapa (degrau até STEP_UP).
 */
export function caveMove(t: ZsTerrain, x: number, z: number, feetY: number, dx: number, dz: number): CaveMove | null {
  const here = caveInside(x, feetY, z);
  const nx0 = x + dx, nz0 = z + dz;
  if (!here && !caveInside(nx0, feetY, nz0)) return null;
  const at = (px: number, pz: number): CaveMove | null => {
    const fl = caveFloorAt(px, pz);
    if (fl !== null && fl - feetY < STEP_UP && caveInside(px, Math.max(fl, feetY - 2), pz) && bodyFits(px, fl, pz)) {
      const w = cavePoolY(px, pz);
      return { x: px, z: pz, ground: fl, inCave: true, wading: w !== null && fl < w - 0.15 };
    }
    // não cabe na caverna: só passa se for o céu aberto da boca — o chão do mapa ali na altura do pé (lá no fundo o
    // chão do mapa está dezenas de metros acima: é parede)
    const g = zsHeightAt(t, px, pz);
    if (g - feetY < STEP_UP && zsSurfAt(t, px, pz) !== ZS_SURF.out) return { x: px, z: pz, ground: g, inCave: false, wading: false };
    return null;
  };
  if (Math.abs(dx) + Math.abs(dz) < 1e-9) {
    const fl = caveFloorAt(x, z) ?? feetY, w = cavePoolY(x, z);
    return { x, z, ground: fl, inCave: true, wading: w !== null && fl < w - 0.15 };
  }
  const r = at(nx0, nz0) ?? at(nx0, z) ?? at(x, nz0);
  if (r) return r;
  const fl = caveFloorAt(x, z) ?? feetY, w = cavePoolY(x, z);
  return { x, z, ground: fl, inCave: here, wading: w !== null && fl < w - 0.15 };
}
/** Passo de BICHO na caverna (x, z; o chão sai de `caveFloorAt`). Fora dela: o passo como veio. */
export function caveCreatureStep(ox: number, oz: number, nx: number, nz: number, feetY: number): [number, number] {
  if (!caveInside(ox, feetY, oz) && !caveInside(nx, feetY, nz)) return [nx, nz];
  const ok = (px: number, pz: number) => {
    const fl = caveFloorAt(px, pz);
    if (fl !== null && fl - feetY < STEP_UP && bodyFits(px, fl, pz)) return true;
    return groundAt(px, pz) - feetY < STEP_UP; // sai pela boca (o chão do mapa na altura do pé)
  };
  if (ok(nx, nz)) return [nx, nz];
  if (ok(nx, oz)) return [nx, oz];
  if (ok(ox, nz)) return [ox, nz];
  return [ox, oz];
}

/** Câmera: quanto (0..1) do caminho alvo→câmera cabe sem entrar na rocha (dentro da caverna ou no céu aberto). */
export function caveCamFit(t: ZsTerrain, tx: number, ty: number, tz: number, cx: number, cy: number, cz: number): number {
  const N = 14;
  let ok = 0;
  for (let i = 1; i <= N; i++) {
    const k = i / N, x = tx + (cx - tx) * k, y = ty + (cy - ty) * k, z = tz + (cz - tz) * k;
    if (caveField(x, y, z) < -0.35 || y > zsHeightAt(t, x, z) + 0.6) ok = k; else break;
  }
  return ok;
}

/* ------------------------------------------------------------------ desenho: marching cubes por blocos */

export type CaveTile = { key: string; cx: number; cz: number; pos: Float32Array; nor: Float32Array; col: Float32Array; top: Float32Array; out: Float32Array; idx: Uint32Array };

/** Plano de cada boca (normal pra DENTRO, no chão): pra malha cortar exatamente nele. */
const MOUTH_PLANES = ZS_CAVE_MOUTHS.map((m) => {
  const L = Math.hypot(m.bx - m.ax, m.bz - m.az);
  return { ax: m.ax, az: m.az, dx: (m.bx - m.ax) / L, dz: (m.bz - m.az) / L, r: m.ra };
});
/** Tamanho do voxel (m), voxels por bloco, blocos por pedaço desenhado. */
export const CAVE_VOXEL = 1.6, CAVE_BLOCK = 16, CAVE_TILE_BLOCKS = 2;
const Y_MIN = -46, Y_MAX = 30;

/** Caixas 3D das peças (onde vale a pena calcular). */
function shapeBoxes(): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[] {
  const out: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[] = [];
  for (const s of SEGS) {
    const R = Math.max(s.ra, s.rb) * 1.5 + 3;
    out.push({ x0: Math.min(s.ax, s.bx) - R, x1: Math.max(s.ax, s.bx) + R, z0: Math.min(s.az, s.bz) - R, z1: Math.max(s.az, s.bz) + R, y0: Math.min(s.ay, s.by) - 2, y1: Math.max(s.ay + s.ha, s.by + s.hb) + 3 });
  }
  for (const r of ROOMS) {
    const R = Math.max(r.rx, r.rz) * 1.3 + r.lobe + 3;
    out.push({ x0: r.x - R, x1: r.x + R, z0: r.z - R, z1: r.z + R, y0: r.y - 3, y1: r.y + r.h + r.lobe + 3 });
  }
  return out;
}

// arestas do cubo (Paul Bourke — mesma ordem das tabelas do three): [canto a, canto b, eixo, dx, dy, dz do início]
const CORNER: readonly (readonly [number, number, number])[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGE: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 1, 0, 0, 0, 0], [1, 2, 1, 1, 0, 0], [3, 2, 0, 0, 1, 0], [0, 3, 1, 0, 0, 0],
  [4, 5, 0, 0, 0, 1], [5, 6, 1, 1, 0, 1], [7, 6, 0, 0, 1, 1], [4, 7, 1, 0, 0, 1],
  [0, 4, 2, 0, 0, 0], [1, 5, 2, 1, 0, 0], [2, 6, 2, 1, 1, 0], [3, 7, 2, 0, 1, 0],
];

/** Tom da rocha num ponto (salão mais perto, senão o padrão). */
function tintAt(x: number, z: number): readonly [number, number, number] {
  let best: readonly [number, number, number] = [0.43, 0.4, 0.36], bd = 1.35;
  for (const r of ROOMS) { const [u, v] = roomUV(r, x, z); const e = Math.hypot(u / r.rx, v / r.rz); if (e < bd) { bd = e; best = r.tint; } }
  return best;
}

/**
 * Monta a malha da caverna AOS POUCOS (gerador: 1 bloco por `next()`) — quem chama decide quantos blocos por quadro.
 * `triTable` vem das tabelas do three (marching cubes). Devolve os pedaços (cada um vira 1 malha).
 */
export function* caveMeshJob(triTable: ArrayLike<number>): Generator<number, CaveTile[], void> {
  const V = CAVE_VOXEL, B = CAVE_BLOCK, BS = V * B;
  const boxes = shapeBoxes();
  let X0 = Infinity, Z0 = Infinity;
  for (const b of boxes) { X0 = Math.min(X0, b.x0); Z0 = Math.min(Z0, b.z0); }
  X0 = Math.floor(X0 / BS) * BS; Z0 = Math.floor(Z0 / BS) * BS;
  const Y0 = Y_MIN;
  // blocos que encostam em alguma peça
  const active = new Set<string>();
  for (const b of boxes) {
    for (let bi = Math.floor((b.x0 - X0) / BS); bi <= Math.floor((b.x1 - X0) / BS); bi++)
      for (let bk = Math.floor((b.z0 - Z0) / BS); bk <= Math.floor((b.z1 - Z0) / BS); bk++)
        for (let bj = Math.max(0, Math.floor((b.y0 - Y0) / BS)); bj <= Math.min(Math.floor((Y_MAX - Y0) / BS), Math.floor((b.y1 - Y0) / BS)); bj++) active.add(`${bi},${bj},${bk}`);
  }
  const list = [...active].map((k) => k.split(',').map(Number) as [number, number, number]).sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const NY = Math.ceil((Y_MAX - Y0) / V) + 2, NZ = 100000;
  type Acc = { pos: number[]; nor: number[]; col: number[]; top: number[]; out: number[]; idx: number[]; map: Map<number, number> };
  const tiles = new Map<string, Acc & { cx: number; cz: number }>();
  const vals = new Float32Array((B + 1) ** 3);
  const at3 = (i: number, j: number, k: number) => (i * (B + 1) + j) * (B + 1) + k;
  const e = 0.3;
  let done = 0;
  for (const [bi, bj, bk] of list) {
    const bx = X0 + bi * BS, by = Y0 + bj * BS, bz = Z0 + bk * BS;
    let neg = false, pos = false;
    for (let i = 0; i <= B; i++) for (let j = 0; j <= B; j++) for (let k = 0; k <= B; k++) {
      const v = caveField(bx + i * V, by + j * V, bz + k * V);
      vals[at3(i, j, k)] = v;
      if (v < 0) neg = true; else pos = true;
    }
    done++;
    if (!(neg && pos)) { yield done / list.length; continue; }
    const tcx = Math.floor(bi / CAVE_TILE_BLOCKS), tcz = Math.floor(bk / CAVE_TILE_BLOCKS), tkey = `${tcx},${tcz}`;
    let acc = tiles.get(tkey);
    if (!acc) { acc = { pos: [], nor: [], col: [], top: [], out: [], idx: [], map: new Map(), cx: X0 + (tcx + 0.5) * BS * CAVE_TILE_BLOCKS, cz: Z0 + (tcz + 0.5) * BS * CAVE_TILE_BLOCKS }; tiles.set(tkey, acc); }
    const A = acc;
    const vert = (gi: number, gj: number, gk: number, axis: number, va: number, vb: number): number => {
      const key = ((gi * NY + gj) * NZ + gk) * 3 + axis;
      const got = A.map.get(key);
      if (got !== undefined) return got;
      let f = va / (va - vb);
      // aresta que atravessa o PLANO DA BOCA: o vértice vai exatamente no plano (o canto chão×corte não arredonda — o
      // chão do túnel encosta certinho no buraco do chão do mapa)
      if (axis !== 1) {
        const xa = X0 + gi * V, za = Z0 + gk * V, xb = xa + (axis === 0 ? V : 0), zb = za + (axis === 2 ? V : 0);
        for (const m of MOUTH_PLANES) {
          const ta = (xa - m.ax) * m.dx + (za - m.az) * m.dz, tb = (xb - m.ax) * m.dx + (zb - m.az) * m.dz;
          if ((ta < 0) === (tb < 0) || Math.abs((xa - m.ax) * m.dz - (za - m.az) * m.dx) > m.r * 1.4) continue;
          if ((va < 0 && ta >= 0) || (vb < 0 && tb >= 0)) f = ta / (ta - tb);
        }
      }
      const x = X0 + gi * V + (axis === 0 ? f * V : 0), y = Y0 + gj * V + (axis === 1 ? f * V : 0), z = Z0 + gk * V + (axis === 2 ? f * V : 0);
      // normal = −gradiente (aponta pro AR, de dentro da caverna)
      let nx = caveField(x - e, y, z) - caveField(x + e, y, z), ny = caveField(x, y - e, z) - caveField(x, y + e, z), nz = caveField(x, y, z - e) - caveField(x, y, z + e);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const tn = tintAt(x, z), n1 = caveNoise(x * 0.35, y * 0.35, z * 0.35), n2 = caveNoise(x * 0.07 + 5, y * 0.09, z * 0.07);
      let k = 0.78 + n1 * 0.32 + (n2 - 0.5) * 0.25;
      let cr = tn[0], cg = tn[1], cb = tn[2];
      if (ny > 0.62) { cr *= 1.12; cg *= 1.02; cb *= 0.86; }        // chão: terra/cascalho
      else if (ny < -0.45) k *= 0.82;                              // teto mais escuro
      const pool = cavePoolY(x, z);
      if (pool !== null && y < pool + 0.6) { k *= 0.72; cb *= 1.12; } // pedra molhada na poça
      A.col.push(cr * k, cg * k, cb * k);
      A.pos.push(x, y, z); A.nor.push(nx, ny, nz);
      const dm = caveMouthDist(x, y, z);
      A.top.push(dm < 60 ? groundAt(x, z) : 1e4);
      A.out.push(1 - smooth01((dm - 4) / 22));
      const id = A.pos.length / 3 - 1;
      A.map.set(key, id);
      return id;
    };
    for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) for (let k = 0; k < B; k++) {
      let ci = 0;
      for (let c = 0; c < 8; c++) { const o = CORNER[c]!; if (vals[at3(i + o[0], j + o[1], k + o[2])]! < 0) ci |= 1 << c; }
      if (ci === 0 || ci === 255) continue;
      const gi = bi * B + i, gj = bj * B + j, gk = bk * B + k;
      const ids: number[] = [];
      for (let n = 0; n < 16; n++) {
        const ed = triTable[ci * 16 + n]!;
        if (ed < 0) break;
        const E = EDGE[ed]!, ca = CORNER[E[0]]!, cb = CORNER[E[1]]!;
        ids.push(vert(gi + E[3], gj + E[4], gk + E[5], E[2], vals[at3(i + ca[0], j + ca[1], k + ca[2])]!, vals[at3(i + cb[0], j + cb[1], k + cb[2])]!));
      }
      for (let n = 0; n + 2 < ids.length; n += 3) A.idx.push(ids[n]!, ids[n + 1]!, ids[n + 2]!);
    }
    yield done / list.length;
  }
  // a face da frente aponta pro ar (o lado de dentro): confere com a normal e vira se preciso
  const out: CaveTile[] = [];
  let flip: boolean | null = null;
  for (const [key, a] of tiles) {
    if (a.idx.length === 0) continue;
    if (flip === null) {
      let agree = 0;
      for (let n = 0; n < Math.min(a.idx.length, 600); n += 3) {
        const i0 = a.idx[n]! * 3, i1 = a.idx[n + 1]! * 3, i2 = a.idx[n + 2]! * 3, p = a.pos;
        const ux = p[i1]! - p[i0]!, uy = p[i1 + 1]! - p[i0 + 1]!, uz = p[i1 + 2]! - p[i0 + 2]!;
        const vx = p[i2]! - p[i0]!, vy = p[i2 + 1]! - p[i0 + 1]!, vz = p[i2 + 2]! - p[i0 + 2]!;
        const gxn = uy * vz - uz * vy, gyn = uz * vx - ux * vz, gzn = ux * vy - uy * vx;
        agree += Math.sign(gxn * a.nor[i0]! + gyn * a.nor[i0 + 1]! + gzn * a.nor[i0 + 2]!);
      }
      flip = agree < 0;
    }
    if (flip) for (let n = 0; n < a.idx.length; n += 3) { const tmp = a.idx[n + 1]!; a.idx[n + 1] = a.idx[n + 2]!; a.idx[n + 2] = tmp; }
    out.push({ key, cx: a.cx, cz: a.cz, pos: new Float32Array(a.pos), nor: new Float32Array(a.nor), col: new Float32Array(a.col), top: new Float32Array(a.top), out: new Float32Array(a.out), idx: new Uint32Array(a.idx) });
  }
  return out;
}

/* ------------------------------------------------------------------ enfeites (estalactites, cristais, cogumelos) */

export type CaveDecor = { kind: 'stalactite' | 'stalagmite' | 'crystal' | 'mushroom'; x: number; y: number; z: number; s: number; yaw: number; tilt: number };
/** Enfeites determinísticos: estalactites no teto dos salões, estalagmites rente às paredes, cristais (galeria dos
 *  cristais + uns soltos), cogumelos brilhando no salão do chefe. Puro. */
export function caveDecor(): CaveDecor[] {
  const out: CaveDecor[] = [];
  ROOMS.forEach((r, ri) => {
    const n = Math.round((r.rx * r.rz) / 28);
    for (let k = 0; k < n; k++) {
      const a = hash3(ri, k, 1) * Math.PI * 2, e = Math.sqrt(hash3(ri, k, 2)) * 0.85;
      const u = Math.cos(a) * e * r.rx, v = Math.sin(a) * e * r.rz;
      const x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
      const fl = caveFloorAt(x, z);
      if (fl === null || cavePoolY(x, z) !== null) continue;
      // teto: sobe do chão até a rocha
      let y = fl + 1;
      while (y < fl + r.h + r.lobe + 4 && caveField(x, y, z) < 0) y += 0.5;
      if (y - fl < 4) continue;
      const pick = hash3(ri, k, 3);
      if (pick < 0.62) out.push({ kind: 'stalactite', x, y: y + 0.3, z, s: 0.8 + hash3(ri, k, 4) * 1.8, yaw: a, tilt: 0 });
      else if (e > 0.55) out.push({ kind: 'stalagmite', x, y: fl - 0.1, z, s: 0.6 + hash3(ri, k, 5) * 1.3, yaw: a, tilt: 0 });
    }
    const crystals = r.id === 'cristais' ? 26 : r.id === 'grande' || r.id === 'corcovado' ? 6 : r.id === 'chefe' ? 0 : 3;
    for (let k = 0; k < crystals; k++) {
      const a = hash3(ri, k, 11) * Math.PI * 2, e = 0.6 + hash3(ri, k, 12) * 0.3;
      const u = Math.cos(a) * e * r.rx, v = Math.sin(a) * e * r.rz;
      const x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
      const fl = caveFloorAt(x, z);
      if (fl === null || cavePoolY(x, z) !== null || !caveAir(x, fl + 1, z)) continue;
      // 1 cacho por ponto (o cristal GLB já é um cacho — 31/10)
      out.push({ kind: 'crystal', x, y: fl - 0.12, z, s: 0.8 + hash3(ri, k, 15) * 0.9, yaw: hash3(ri, k, 16) * 6.28, tilt: (hash3(ri, k, 17) - 0.5) * 0.3 });
    }
    if (r.id === 'chefe') {
      for (let k = 0; k < 22; k++) {
        const a = hash3(ri, k, 21) * Math.PI * 2, e = 0.7 + hash3(ri, k, 22) * 0.22;
        const u = Math.cos(a) * e * r.rx, v = Math.sin(a) * e * r.rz;
        const x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
        const fl = caveFloorAt(x, z);
        if (fl === null || !caveAir(x, fl + 1, z)) continue;
        out.push({ kind: 'mushroom', x, y: fl - 0.05, z, s: 0.7 + hash3(ri, k, 23) * 1.2, yaw: a, tilt: (hash3(ri, k, 24) - 0.5) * 0.4 });
      }
    }
  });
  return out;
}

/** As poças (pra desenhar a água): centro, raios, giro e a altura da lâmina. */
export function cavePools(): { x: number; z: number; rx: number; rz: number; yaw: number; y: number }[] {
  return ROOMS.flatMap((r) => (r.pools ?? []).map((p) => ({ x: r.x + p.u * r.c - p.v * r.s, z: r.z + p.u * r.s + p.v * r.c, rx: p.rx, rz: p.rz, yaw: r.yaw, y: r.y + POOL_Y })));
}
