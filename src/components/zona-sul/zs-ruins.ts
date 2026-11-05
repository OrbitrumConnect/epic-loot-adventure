/**
 * RUÍNAS POR BAIRRO (05/11, Pedro: "por bairro uns 2 a 5% da estrutura, nada colado, onde realmente são os prédios, já
 * com textura, como ruína" · "o ideal: mais área de favela no morro, alguns da pista, detalhes" · "15 mil triângulos —
 * dá pra pôr mais 15 mil, ficar nos 30 mil?").
 * Os prédios de VERDADE do OpenStreetMap (contorno + altura), escolhidos e espaçados por bairro em
 * `tools/zona-sul/ruins-bake.mjs` → `public/zona-sul/ruins.json`. Aqui (puro, testável): ler, tirar o que caiu em cima de
 * coisa do jogo (acampamento, farm, boca da caverna, base, zona segura), montar a forma de RUÍNA (topo quebrado, um
 * "pedaço comido", 2º bloco torto em parte dos prédios, caixa d'água azul na laje da favela, entulho no pé) e a COLISÃO
 * (herói e carro não atravessam; o carro voando passa por cima). O desenho (fachada com janelas no shader) em
 * `zs-ruins-view.tsx`.
 */
export const RUINS = {
  URL: '/zona-sul/ruins.json',
  /** orçamento de triângulos (Pedro: "ficar nos 30 mil") */
  TRI_MAX: 30_000,
  /** andar (m) — a fachada desenha uma fileira de janelas por andar */
  FLOOR_PREDIO: 3, FLOOR_FAVELA: 2.8,
  /** folga (m) em volta de acampamento / farm / boca de caverna / base / zona segura */
  CLEAR_CAMP: 14, CLEAR_NODE: 2.5, CLEAR_MOUTH: 6, CLEAR_BASE: 4,
  /** pedaço do chão do mapa pra juntar a malha (m) — cada pedaço é 1 desenho */
  CHUNK: 256,
} as const;

/** 0 = prédio (asfalto) · 1 = casa de favela (morro) */
export type RuinKind = 0 | 1;
export type RuinRaw = { k: RuinKind; bairro: string; x: number; z: number; h: number; seed: number; pts: [number, number][] };
/** Ruína no lugar: contorno no MUNDO (anti-horário), chão (o mais baixo do contorno) e o topo de cada canto. */
export type Ruin = RuinRaw & { wx: number[]; wz: number[]; base: number; tops: number[]; r: number; tier2: { wx: number[]; wz: number[]; from: number; tops: number[] } | null; tank: boolean; rubble: boolean;
  /** LAJES QUEBRADAS penduradas pra fora da parede (detalhe — Pedro: "detalhes"): parede, altura, quanto sai */
  slabs: { wall: number; y: number; out: number }[] };

/** Lê o ruins.json: [k, bairro, x, z, h, semente, [dx, dz, dx, dz…]] por ruína. */
export function parseRuins(j: { v: number; bairros: string[]; ruins: [number, number, number, number, number, number, number[]][] }): RuinRaw[] {
  return j.ruins.map(([k, b, x, z, h, s, flat]) => {
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i]!, flat[i + 1]!]);
    return { k: (k === 1 ? 1 : 0) as RuinKind, bairro: j.bairros[b] ?? '?', x, z, h, seed: s, pts };
  });
}

/** sorteio fixo (o mesmo em todo jogo) */
export function ruinRand(seed: number, k: number): number {
  let h = Math.imul((seed | 0) ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export type RuinBlockers = {
  /** o que já é do jogo naquele ponto (true = não pode ruína aqui); `dist(px, pz)` = distância (m) do ponto até a PLANTA
   *  (negativa dentro) — pra coisa pequena (farm) valer o contorno de verdade, não o círculo em volta */
  blocked: (x: number, z: number, r: number, dist: (px: number, pz: number) => number) => boolean;
  /** chão do mapa */
  ground: (x: number, z: number) => number;
};
/** Põe no mundo: tira as que caem em cima de coisa do jogo; o chão é o canto MAIS BAIXO (na encosta a parede desce até ele);
 *  o topo de cada canto quebrado (prédio: 70–100% com um canto "comido" a ~50%; favela: quase inteira). */
export function placeRuins(raw: RuinRaw[], b: RuinBlockers): Ruin[] {
  const out: Ruin[] = [];
  for (const q of raw) {
    const r = Math.max(...q.pts.map(([x, z]) => Math.hypot(x, z)));
    const wx = q.pts.map(([x]) => q.x + x), wz = q.pts.map(([, z]) => q.z + z);
    if (b.blocked(q.x, q.z, r, (px, pz) => polyDist(px, pz, wx, wz))) continue;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < wx.length; i++) { const g = b.ground(wx[i]!, wz[i]!); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const g0 = b.ground(q.x, q.z); lo = Math.min(lo, g0); hi = Math.max(hi, g0);
    if (!Number.isFinite(lo)) continue;
    const base = lo - 0.4, top = hi + q.h, n = wx.length;
    let tops: number[], tier2: Ruin['tier2'] = null;
    if (q.k === 0) {
      const bite = Math.floor(ruinRand(q.seed, 1) * n);
      tops = wx.map((_, i) => (i === bite ? base + (top - base) * (0.45 + 0.12 * ruinRand(q.seed, 2)) : base + (top - base) * (0.72 + 0.28 * ruinRand(q.seed, 10 + i))));
      if (ruinRand(q.seed, 3) < 0.5) {
        // 2º bloco: o que sobrou da torre, encolhido pra um lado, saindo do topo mais baixo
        const from = Math.min(...tops), toward = Math.floor(ruinRand(q.seed, 4) * n), s = 0.55;
        const ax = wx[toward]!, az = wz[toward]!;
        const t2x = wx.map((x) => ax + (x - ax) * s), t2z = wz.map((z) => az + (z - az) * s);
        tier2 = { wx: t2x, wz: t2z, from, tops: t2x.map((_, i) => from + (top + q.h * 0.15 - from) * (0.6 + 0.4 * ruinRand(q.seed, 20 + i))) };
      }
    } else tops = wx.map((_, i) => top - 0.4 * ruinRand(q.seed, 10 + i));
    const slabs: Ruin['slabs'] = [];
    if (q.k === 0) {
      const lo = Math.min(...tops), floors = Math.floor((lo - base - 3) / RUINS.FLOOR_PREDIO);
      for (let s = 0; s < 2 && floors > 1; s++) if (ruinRand(q.seed, 30 + s) < 0.45) slabs.push({ wall: Math.floor(ruinRand(q.seed, 32 + s) * n), y: base + RUINS.FLOOR_PREDIO * (1 + Math.floor(ruinRand(q.seed, 34 + s) * floors)), out: 1.2 + ruinRand(q.seed, 36 + s) * 1.0 });
    }
    out.push({ ...q, wx, wz, base, tops, r, tier2, tank: q.k === 1 && ruinRand(q.seed, 5) < 0.35, rubble: q.k === 0 && ruinRand(q.seed, 6) < 0.55, slabs });
  }
  return out;
}

/** Distância (m) do ponto até o contorno CONVEXO anti-horário (negativa dentro). */
export function polyDist(px: number, pz: number, wx: number[], wz: number[]): number {
  let inside = true, best = Infinity;
  for (let i = 0, n = wx.length; i < n; i++) {
    const ax = wx[i]!, az = wz[i]!, ex = wx[(i + 1) % n]! - ax, ez = wz[(i + 1) % n]! - az, l2 = ex * ex + ez * ez || 1;
    if (ex * (pz - az) - ez * (px - ax) < 0) inside = false;
    let t = ((px - ax) * ex + (pz - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(px - (ax + ex * t), pz - (az + ez * t)));
  }
  return inside ? -best : best;
}
/** Triângulos de uma ruína (a mesma conta do desenho): paredes 2 por lado, laje (n−2), 2º bloco, caixa d'água, entulho. */
export function ruinTris(r: Ruin): number {
  const n = r.wx.length;
  return 2 * n + (n - 2) + (r.tier2 ? 2 * n + (n - 2) : 0) + (r.tank ? 10 : 0) + (r.rubble ? 4 : 0) + r.slabs.length * 10;
}

/* ------------------------------------------------------------------ colisão (herói e carro) */

const CG = 16;
let grid = new Map<string, Ruin[]>();
let placed: Ruin[] = [], version = 0;
/** O desenho avisa as ruínas que ficaram no mundo (a colisão usa as mesmas). */
export function setRuinsWorld(list: Ruin[]): void {
  placed = list; grid = new Map(); version++;
  for (const r of list) {
    for (let i = Math.floor((r.x - r.r) / CG); i <= Math.floor((r.x + r.r) / CG); i++) for (let j = Math.floor((r.z - r.r) / CG); j <= Math.floor((r.z + r.r) / CG); j++) {
      const k = `${i},${j}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(r);
    }
  }
}
export function ruinsWorld(): readonly Ruin[] { return placed; }
/** muda quando as ruínas mudam (a mata refaz sem árvore dentro delas) */
export function ruinsVersion(): number { return version; }
/** (x, z) dentro de uma ruína (ou a menos de `pad` m da parede)? — a mata não nasce aí */
export function ruinAt(x: number, z: number, pad: number): boolean { return ruinBlocks(x, z, pad, -1e9); }
/** Empurra o círculo (x, z, raio) pra fora das paredes das ruínas (quem está acima do topo passa por cima). */
export function pushOutRuins(x: number, z: number, rad: number, y: number): [number, number] {
  const cell = grid.get(`${Math.floor(x / CG)},${Math.floor(z / CG)}`);
  if (!cell) return [x, z];
  let px = x, pz = z;
  for (const r of cell) {
    if (Math.hypot(px - r.x, pz - r.z) > r.r + rad + 0.5) continue;
    if (y > Math.max(...r.tops, ...(r.tier2?.tops ?? [])) + 0.5) continue;
    // dentro do polígono? (anti-horário) → sai pela parede mais perto; perto de uma parede → afasta até `rad`
    const n = r.wx.length;
    let inside = true, best = Infinity, bx = 0, bz = 0, nx = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const ax = r.wx[i]!, az = r.wz[i]!, cx = r.wx[(i + 1) % n]!, cz = r.wz[(i + 1) % n]!;
      const ex = cx - ax, ez = cz - az, l2 = ex * ex + ez * ez || 1;
      if (ex * (pz - az) - ez * (px - ax) < 0) inside = false;
      let t = ((px - ax) * ex + (pz - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(px - qx, pz - qz);
      if (d < best) { best = d; bx = qx; bz = qz; const l = Math.sqrt(l2); nx = ez / l; nz = -ex / l; } // normal pra FORA (anti-horário)
    }
    if (inside) { px = bx + nx * rad; pz = bz + nz * rad; }
    else if (best < rad) { const dx = px - bx, dz = pz - bz, d = Math.hypot(dx, dz) || 1; px = bx + (dx / d) * rad; pz = bz + (dz / d) * rad; }
  }
  return [px, pz];
}
/** O círculo (x, z, raio) encosta numa ruína abaixo do topo? (o carro) */
export function ruinBlocks(x: number, z: number, rad: number, y: number): boolean {
  const [px, pz] = pushOutRuins(x, z, rad, y);
  return Math.abs(px - x) + Math.abs(pz - z) > 1e-6;
}

/* ------------------------------------------------------------------ malha (puro: o desenho só copia pra GPU) */

export type RuinMesh = { cx: number; cz: number; pos: Float32Array; nor: Float32Array; col: Float32Array; fac: Float32Array; idx: Uint32Array; tris: number };
// cores: concreto/bege/pastel desbotado (prédio) · tijolo cru ou pintura desbotada (favela) · caixa d'água azul · entulho
const PREDIO_TINTS = [[0.62, 0.6, 0.56], [0.7, 0.66, 0.58], [0.56, 0.55, 0.53], [0.72, 0.62, 0.55], [0.6, 0.64, 0.66], [0.68, 0.66, 0.6]];
const FAVELA_TINTS = [[0.66, 0.4, 0.28], [0.7, 0.44, 0.3], [0.62, 0.38, 0.27], [0.75, 0.68, 0.45], [0.72, 0.5, 0.5], [0.5, 0.62, 0.66], [0.58, 0.66, 0.48], [0.76, 0.74, 0.7]];
const TANK = [0.18, 0.42, 0.72], RUBBLE = [0.42, 0.4, 0.37], SLAB = [0.5, 0.49, 0.47];

/** Monta a malha de um grupo de ruínas. fac = (u ao longo da parede em m, v altura acima do chão em m, tipo: 0 prédio ·
 *  1 favela · 2 laje/topo · 3 caixa d'água/entulho) — o shader desenha janelas/manchas/trepadeira com isso. */
export function ruinMesh(list: Ruin[]): RuinMesh {
  const P: number[] = [], N: number[] = [], C: number[] = [], F: number[] = [], I: number[] = [];
  let cx = 0, cz = 0;
  const v = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: number[], u: number, h: number, kind: number) => {
    P.push(x, y, z); N.push(nx, ny, nz); C.push(c[0]!, c[1]!, c[2]!); F.push(u, h, kind); return P.length / 3 - 1;
  };
  const walls = (wx: number[], wz: number[], from: number, tops: number[], c: number[], kind: number, u0: number) => {
    const n = wx.length; let u = u0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = wx[i]!, az = wz[i]!, bx = wx[j]!, bz = wz[j]!, L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (bz - az) / L, nz = -(bx - ax) / L; // pra fora (anti-horário)
      const a = v(ax, from, az, nx, 0, nz, c, u, 0, kind), b = v(bx, from, bz, nx, 0, nz, c, u + L, 0, kind);
      const d = v(ax, tops[i]!, az, nx, 0, nz, c, u, tops[i]! - from, kind), e = v(bx, tops[j]!, bz, nx, 0, nz, c, u + L, tops[j]! - from, kind);
      I.push(a, d, b, b, d, e); u += L;
    }
    return u;
  };
  const cap = (wx: number[], wz: number[], y: number, c: number[]) => {
    const n = wx.length, s = P.length / 3;
    for (let i = 0; i < n; i++) v(wx[i]!, y, wz[i]!, 0, 1, 0, c, 0, -1, 2);
    for (let i = 1; i + 1 < n; i++) I.push(s, s + i + 1, s + i);
  };
  const box = (x: number, z: number, y: number, sx: number, sy: number, sz: number, c: number[], kind: number) => {
    const xs = [x - sx, x + sx, x + sx, x - sx], zs = [z - sz, z - sz, z + sz, z + sz];
    walls(xs, zs, y, [y + sy, y + sy, y + sy, y + sy], c, kind, 0); cap(xs, zs, y + sy, c);
  };
  for (const r of list) {
    cx += r.x; cz += r.z;
    const tint = r.k === 0 ? PREDIO_TINTS[Math.floor(ruinRand(r.seed, 7) * PREDIO_TINTS.length)]! : FAVELA_TINTS[Math.floor(ruinRand(r.seed, 7) * FAVELA_TINTS.length)]!;
    const u = walls(r.wx, r.wz, r.base, r.tops, tint, r.k, 0);
    cap(r.wx, r.wz, Math.min(...r.tops), tint.map((q) => q * 0.8));
    if (r.tier2) { walls(r.tier2.wx, r.tier2.wz, r.tier2.from - 0.2, r.tier2.tops, tint, r.k, u); cap(r.tier2.wx, r.tier2.wz, Math.min(...r.tier2.tops), tint.map((q) => q * 0.8)); }
    if (r.tank) box(r.x + (ruinRand(r.seed, 8) - 0.5) * r.r * 0.6, r.z + (ruinRand(r.seed, 9) - 0.5) * r.r * 0.6, Math.min(...r.tops), 0.55, 0.9, 0.55, TANK, 3);
    for (const sl of r.slabs) {
      // laje quebrada: placa fina saindo da parede `wall` (no meio dela, metade da largura), na altura de um andar
      const i = sl.wall, j = (i + 1) % r.wx.length, ax = r.wx[i]!, az = r.wz[i]!, bx = r.wx[j]!, bz = r.wz[j]!, L = Math.hypot(bx - ax, bz - az) || 1;
      const ox = (bz - az) / L, oz = -(bx - ax) / L, mx = (ax + bx) / 2 + ox * sl.out * 0.5, mz = (az + bz) / 2 + oz * sl.out * 0.5;
      const ux = (bx - ax) / L, uz = (bz - az) / L, hw = Math.min(L * 0.3, 3), hd = sl.out * 0.5 + 0.2;
      const xs = [mx - ux * hw - ox * hd, mx + ux * hw - ox * hd, mx + ux * hw + ox * hd, mx - ux * hw + ox * hd], zs = [mz - uz * hw - oz * hd, mz + uz * hw - oz * hd, mz + uz * hw + oz * hd, mz - uz * hw + oz * hd];
      // (a ordem dos 4 cantos anti-horária: largura ao longo da parede, profundidade pra fora)
      const ccw = (xs[1]! - xs[0]!) * (zs[2]! - zs[0]!) - (zs[1]! - zs[0]!) * (xs[2]! - xs[0]!) > 0;
      const X = ccw ? xs : xs.slice().reverse(), Z = ccw ? zs : zs.slice().reverse();
      walls(X, Z, sl.y - 0.35, [sl.y, sl.y, sl.y, sl.y], SLAB, 2, 0); cap(X, Z, sl.y, SLAB);
    }
    if (r.rubble) {
      // entulho no pé de uma parede: monte baixo (pirâmide de 4 faces)
      const i = Math.floor(ruinRand(r.seed, 11) * r.wx.length), j = (i + 1) % r.wx.length;
      const mx = (r.wx[i]! + r.wx[j]!) / 2, mz = (r.wz[i]! + r.wz[j]!) / 2, L = Math.hypot(r.wx[j]! - r.wx[i]!, r.wz[j]! - r.wz[i]!) || 1;
      const ox = (r.wz[j]! - r.wz[i]!) / L, oz = -(r.wx[j]! - r.wx[i]!) / L, px = mx + ox * 1.6, pz = mz + oz * 1.6, s = 2 + ruinRand(r.seed, 12) * 1.5;
      const top = v(px, r.base + 0.4 + 1.3, pz, 0, 1, 0, RUBBLE, 0, 0, 3);
      const ring = [[px - s, pz - s], [px + s, pz - s], [px + s, pz + s], [px - s, pz + s]].map(([qx, qz]) => v(qx!, r.base + 0.35, qz!, (qx! - px) / s, 0.6, (qz! - pz) / s, RUBBLE, 0, 0, 3));
      for (let k = 0; k < 4; k++) I.push(ring[k]!, top, ring[(k + 1) % 4]!);
    }
  }
  return { cx: list.length ? cx / list.length : 0, cz: list.length ? cz / list.length : 0, pos: new Float32Array(P), nor: new Float32Array(N), col: new Float32Array(C), fac: new Float32Array(F), idx: new Uint32Array(I), tris: I.length / 3 };
}
/** Junta por pedaço do chão (CHUNK m) — cada pedaço vira 1 desenho (corta fora da câmera). */
export function ruinChunks(list: Ruin[]): RuinMesh[] {
  const by = new Map<string, Ruin[]>();
  for (const r of list) { const k = `${Math.floor(r.x / RUINS.CHUNK)},${Math.floor(r.z / RUINS.CHUNK)}`; (by.get(k) ?? by.set(k, []).get(k)!).push(r); }
  return [...by.values()].map(ruinMesh);
}
