// Relevo da Zona Sul: junta os tiles terrarium baixados num grid de altitude (m reais) e amostra por lat/lon.
import fs from 'node:fs';
import sharp from 'sharp';

const RAW = 'tools/zona-sul/raw/dem';
const TILE = 256;

/** `keep` (lat/lon): dentro dele o relevo fica EXATAMENTE como veio (o mapa de 28/10 não muda) — o conserto de furo
 *  (abaixo) só vale fora. */
export async function loadDem({ keep } = {}) {
  const t = JSON.parse(fs.readFileSync(`${RAW}/tiles.json`, 'utf8'));
  const nx = t.x1 - t.x0 + 1, ny = t.y1 - t.y0 + 1, W = nx * TILE, H = ny * TILE;
  const elev = new Float32Array(W * H);
  for (let x = t.x0; x <= t.x1; x++) for (let y = t.y0; y <= t.y1; y++) {
    const { data } = await sharp(`${RAW}/${t.z}_${x}_${y}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ox = (x - t.x0) * TILE, oy = (y - t.y0) * TILE;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const p = (j * TILE + i) * 3;
      elev[(oy + j) * W + ox + i] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
    }
  }
  // FURO NO DADO (02/11, expansão da Gávea): os tiles da AWS têm fileiras com lixo (−3273 m, −3474 m no meio de São
  // Conrado — virava uma vala reta de ponta a ponta). Aqui não existe nada abaixo de −1000 m (o mar em volta tem dezenas
  // de metros); esse valor vira a média dos vizinhos BONS (janela crescendo até achar). Valor bom não é tocado.
  // (dentro de `keep` fica como está: lá há um furo antigo perto da Urca que o mapa de 28/10 já tem — anotado no diário)
  // 02/11 (item 3 do Pedro): o bake NÃO passa mais `keep` → o conserto vale no mapa todo (Urca, Leme, Babilônia, Leblon).
  const BAD = -1000, nT = 2 ** t.z;
  const lonOfPx = (i) => ((i + 0.5) / TILE + t.x0) / nT * 360 - 180;
  const latOfPx = (j) => { const m = Math.PI * (1 - 2 * ((j + 0.5) / TILE + t.y0) / nT); return Math.atan(Math.sinh(m)) * 180 / Math.PI; };
  let fixed = 0;
  for (let p = 0; p < W * H; p++) {
    if (!(elev[p] < BAD)) continue;
    const i = p % W, j = (p - i) / W;
    if (keep) { const la = latOfPx(j), lo = lonOfPx(i); if (la >= keep.s && la <= keep.n && lo >= keep.w && lo <= keep.e) continue; }
    for (let r = 1; r <= 4; r++) {
      let s = 0, k = 0;
      for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) {
        const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const v = elev[y * W + x]; if (v >= BAD) { s += v; k++; }
      }
      if (k) { elev[p] = s / k; fixed++; break; }
    }
  }
  if (fixed) console.log(JSON.stringify({ relevo_furos_consertados: fixed }));
  const n = 2 ** t.z;
  // pixel global (web mercator) ↔ lat/lon
  const px = (lon) => ((lon + 180) / 360 * n - t.x0) * TILE;
  const py = (lat) => { const r = lat * Math.PI / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - t.y0) * TILE; };
  /** Altitude (m) em lat/lon, bilinear. */
  const at = (lat, lon) => {
    const fx = px(lon) - 0.5, fy = py(lat) - 0.5;
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0));
    const e = (i, j) => elev[j * W + i];
    return (e(x0, y0) * (1 - ax) + e(x0 + 1, y0) * ax) * (1 - ay) + (e(x0, y0 + 1) * (1 - ax) + e(x0 + 1, y0 + 1) * ax) * ay;
  };
  return { at, W, H };
}
