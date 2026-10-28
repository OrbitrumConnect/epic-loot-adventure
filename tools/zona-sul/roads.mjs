// RUAS da Zona Sul (Pedro 28/10: "pistas interligando a praia, contornando a Lagoa, cortando os bairros, 2 veículos de
// cada lado; asfalto quebrado") — avenidas reais do OSM com NOME (motorway/trunk/primary/secondary), SEM túnel e sem
// alça. Saída: polilinhas no sistema do jogo (x, z, y) + largura. Nivelamento LEVE do chão debaixo da rua, com travas
// (Pedro: "nada deve alterar tamanho e formato de montanhas; a pista pode ajustar a passagem, mas não quebra praia nada"):
//  - mexe no máximo MAX_GRADE m na altura de qualquer ponto; - nunca mexe em praia, mar ou Lagoa;
//  - encosta íngreme (costão, ex. Niemeyer): a rua só ACOMPANHA o chão (não corta o morro).
export const ROAD_W = { motorway: 13, trunk: 13, primary: 13, secondary: 9 }; // m no jogo (2 faixas por lado ≈ 13 m)
/** SÓ as avenidas que ligam a cidade (Pedro: "muitas paralelas") — orla, volta da Lagoa, ligações entre bairros. */
export const MAIN_ROADS = new Set([
  'Avenida Epitácio Pessoa', 'Avenida Borges de Medeiros',                                   // volta da Lagoa
  'Avenida Delfim Moreira', 'Avenida Vieira Souto', 'Avenida Atlântica',                      // orla
  'Avenida Princesa Isabel', 'Praia de Botafogo', 'Avenida Pasteur', 'Avenida Venceslau Braz', 'Avenida Lauro Sodré',
  'Avenida Niemeyer', 'Avenida Infante Dom Henrique',                                          // São Conrado · Aterro
  'Rua Jardim Botânico', 'Avenida Padre Leonel Franca', 'Rua Humaitá', 'Rua São Clemente',   // bairros
  'Avenida Bartolomeu Mitre', 'Avenida Henrique Dodsworth',                                   // Lagoa ↔ praia
  'Rua Francisco Otaviano',                                                                     // trilha Arpoador ↔ Copa
]);
/** ESTRADINHA estreita pelo mato (Pedro: "conecta Ipanema/Arpoador a Copa pelo meio do mato, sem tirar muita árvore"). */
export const NARROW_ROADS = { 'Rua Francisco Otaviano': 5 };
export const MAX_GRADE = 1.0;
const SHOULDER = 3; // m de transição do nivelamento pro chão natural

/** Simplifica (Douglas–Peucker) pontos [x, z] com tolerância `tol` (m). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); const [ax, az] = pts[a], [bx, bz] = pts[b];
    const L = Math.hypot(bx - ax, bz - az) || 1e-9; let md = -1, mi = -1;
    for (let k = a + 1; k < b; k++) { const d = Math.abs((bx - ax) * (az - pts[k][1]) - (ax - pts[k][0]) * (bz - az)) / L; if (d > md) { md = d; mi = k; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/**
 * @param o { osm, toPx, W, H, CELL, hg, surf, SURF, gameX, gameZ, minX, maxX, minZ, maxZ }
 * Mexe em `hg` (nivelamento com travas) e marca `surf` = SURF.road sob a rua (terra). Devolve as ruas (jogo).
 */
export function buildRoads(o) {
  const { osm, toPx, W, H, CELL, hg, surf, SURF } = o;
  const heightAt = (x, z) => { // bilinear no grid ORIGINAL (x, z do jogo → pixel)
    const fx = Math.max(0, Math.min(W - 1.001, x / CELL + W / 2 - 0.5)), fz = Math.max(0, Math.min(H - 1.001, z / CELL + H / 2 - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j, p = j * W + i;
    return (hg[p] * (1 - ax) + hg[p + 1] * ax) * (1 - az) + (hg[p + W] * (1 - ax) + hg[p + W + 1] * ax) * az;
  };
  const ways = osm.filter((e) => e.type === 'way' && e.geometry && MAIN_ROADS.has(e.tags?.name) && ROAD_W[e.tags.highway] && e.tags.tunnel !== 'yes' && !(+e.tags.layer < 0) && e.tags.covered !== 'yes');
  const roads = [];
  for (const e of ways) {
    const fullW = NARROW_ROADS[e.tags.name] ?? ROAD_W[e.tags.highway];
    let w = fullW;
    if (e.tags.oneway === 'yes' && !NARROW_ROADS[e.tags.name]) w = w / 2 + 1; // avenida de mão dupla vem em 2 pistas separadas no OSM
    const raw = e.geometry.map((g) => { const [px, py] = toPx(g.lat, g.lon); return [o.gameX(px), o.gameZ(py)]; })
      .filter(([x, z]) => x > o.minX + 2 && x < o.maxX - 2 && z > o.minZ + 2 && z < o.maxZ - 2);
    if (raw.length < 2) continue;
    // reamostra a cada 3 m e suaviza a altura AO LONGO da rua (janela ~24 m): a pista não copia cada calombo
    const pts = simplify(raw, 0.8), dense = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
      for (let s = 0; s < n; s++) dense.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n]);
    }
    dense.push(pts[pts.length - 1]);
    const ground = dense.map(([x, z]) => heightAt(x, z));
    const smooth = ground.map((_, k) => { let s = 0, n = 0; for (let d = -4; d <= 4; d++) { const q = k + d; if (q >= 0 && q < ground.length) { s += ground[q]; n++; } } return s / n; });
    // altura da pista: suavizada, mas no máximo MAX_GRADE do chão natural; sobre água vira ponte (≥ 0,6 m)
    const bridge = e.tags.bridge === 'yes';
    const y = dense.map((_, k) => Math.max(bridge ? 0.6 : -Infinity, ground[k] + Math.max(-MAX_GRADE, Math.min(MAX_GRADE, smooth[k] - ground[k]))));
    roads.push({ name: e.tags.name, full: fullW, oneway: e.tags.oneway === 'yes', w, bridge, pts: dense.map(([x, z], k) => [+x.toFixed(2), +z.toFixed(2), +Math.max(y[k], 0.2).toFixed(2)]) });
  }
  // MÃO DUPLA vira UMA pista (Pedro: "pista em cima de pista na praia"): no OSM a Atlântica/Vieira Souto/Epitácio vêm em
  // 2 pistas separadas, que no jogo (1:7,4) ficam encostadas. Pista de mão única com ≥ 60% dos pontos a até 9 m de outra
  // do MESMO nome some, e a que fica ganha a largura cheia.
  const near = (a, b) => { let hit = 0; for (const [x, z] of a.pts) { let best = Infinity; for (let k = 0; k + 1 < b.pts.length; k++) { const [ax, az] = b.pts[k], [bx, bz] = b.pts[k + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); if (best < 9) break; } if (best < 9) hit++; } return hit / a.pts.length; };
  const kept = [];
  for (const r of roads.sort((a, b) => b.pts.length - a.pts.length)) {
    const twin = r.oneway ? kept.find((q) => q.name === r.name && q.oneway && near(r, q) >= 0.6) : null;
    if (twin) { twin.w = twin.full; continue; }
    kept.push(r);
  }
  roads.length = 0; roads.push(...kept);
  // nivelamento do chão debaixo da rua (só terra; trava MAX_GRADE; costão íngreme não)
  const target = new Float32Array(W * H).fill(NaN), weight = new Float32Array(W * H);
  for (const r of roads) {
    if (r.bridge) continue;
    const hw = r.w / 2;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, az, ay] = r.pts[k], [bx, bz, by] = r.pts[k + 1];
      const x0 = Math.floor((Math.min(ax, bx) - hw - SHOULDER) / CELL + W / 2 - 0.5), x1 = Math.ceil((Math.max(ax, bx) + hw + SHOULDER) / CELL + W / 2 - 0.5);
      const z0 = Math.floor((Math.min(az, bz) - hw - SHOULDER) / CELL + H / 2 - 0.5), z1 = Math.ceil((Math.max(az, bz) + hw + SHOULDER) / CELL + H / 2 - 0.5);
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      for (let j = Math.max(0, z0); j <= Math.min(H - 1, z1); j++) for (let i = Math.max(0, x0); i <= Math.min(W - 1, x1); i++) {
        const p = j * W + i;
        if (surf[p] === SURF.sea || surf[p] === SURF.lagoon || surf[p] === SURF.beach) continue; // praia/água: intocadas
        const px = (i + 0.5 - W / 2) * CELL, pz = (j + 0.5 - H / 2) * CELL;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
        const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
        if (d > hw + SHOULDER) continue;
        const wgt = d <= hw ? 1 : 1 - (d - hw) / SHOULDER;
        if (wgt > weight[p]) { weight[p] = wgt; target[p] = ay + (by - ay) * t; }
        if (d <= hw) surf[p] = SURF.road;
      }
    }
  }
  let graded = 0, maxDelta = 0;
  for (let p = 0; p < W * H; p++) {
    if (!(weight[p] > 0)) continue;
    // costão íngreme (inclinação > 30° no ponto): a rua acompanha o chão — não corta o morro
    const i = p % W, j = (p - i) / W;
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) continue; // borda: a faixa estendida (praia de fora) copia dela — intocada
    const gx = (hg[Math.min(W - 1, i + 1) + j * W] - hg[Math.max(0, i - 1) + j * W]) / (2 * CELL), gz = (hg[i + Math.min(H - 1, j + 1) * W] - hg[i + Math.max(0, j - 1) * W]) / (2 * CELL);
    if (Math.atan(Math.hypot(gx, gz)) * 57.3 > 30) continue;
    const d = Math.max(-MAX_GRADE, Math.min(MAX_GRADE, target[p] - hg[p])) * weight[p];
    if (Math.abs(d) < 0.01) continue;
    hg[p] += d; graded++; maxDelta = Math.max(maxDelta, Math.abs(d));
  }
  return { roads, graded, maxDelta, km: roads.reduce((s, r) => { let l = 0; for (let k = 1; k < r.pts.length; k++) l += Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1]); return s + l; }, 0) / 1000 };
}

/**
 * MAPA DAS RUAS pra TEXTURA do chão (Pedro: "a pista parece uma chapa; o correto é ser textura do mapa, não colocada
 * em cima"). Grade fina (RES m/px) cobrindo o mapa inteiro: R = cobertura (borda suave), G = posição atravessada na
 * pista (0 = beira esquerda, 255 = direita — o shader desenha as marcas de pneu). Puro: só lê as ruas.
 */
export function rasterRoadMask(roads, { minX, minZ, sizeX, sizeZ, res = 1 }) {
  const MW = Math.ceil(sizeX / res), MH = Math.ceil(sizeZ / res);
  const cov = new Float32Array(MW * MH), lat = new Float32Array(MW * MH).fill(0.5);
  for (const r of roads) {
    const hw = r.w / 2;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, L = Math.sqrt(L2);
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw - 2 - minX) / res)), i1 = Math.min(MW - 1, Math.ceil((Math.max(ax, bx) + hw + 2 - minX) / res));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - hw - 2 - minZ) / res)), j1 = Math.min(MH - 1, Math.ceil((Math.max(az, bz) + hw + 2 - minZ) / res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = minX + (i + 0.5) * res, pz = minZ + (j + 0.5) * res;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
        const ox = px - (ax + dx * t), oz = pz - (az + dz * t), d = Math.hypot(ox, oz);
        const c = 1 - Math.max(0, Math.min(1, (d - (hw - 1.2)) / 1.8)); // 1 dentro, some em ~1,8 m na beira
        const p = j * MW + i;
        if (c > cov[p]) { cov[p] = c; lat[p] = 0.5 + ((-dz * ox + dx * oz) / L) / (2 * hw); }
      }
    }
  }
  const buf = Buffer.alloc(MW * MH * 3);
  for (let p = 0; p < MW * MH; p++) { buf[p * 3] = Math.round(cov[p] * 255); buf[p * 3 + 1] = Math.round(Math.max(0, Math.min(1, lat[p])) * 255); }
  return { buf, MW, MH };
}
