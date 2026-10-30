// BICHOS MAIS LEVES (30/10, Pedro: "goall"): os GLBs dos bichos têm 2–7 MB — metade é ANIMAÇÃO com chave repetida
// (ganso: 202 mil chaves) e o resto textura PNG. Sem mudar o que aparece:
//  - animação: tira só chaves REDUNDANTES (resample, tolerância 1e-4 — o movimento interpolado é o mesmo);
//  - texturas: PNG/JPEG → WebP no MESMO tamanho, mesma ORDEM e mesma quantidade (alguns bichos ligam a textura pela
//    posição — nada é removido nem reordenado);
//  - NADA de quantizar malha (deixou "animais gigantes" em 21/10) e nada de prune/dedup.
// Uso: node tools/zona-sul/slim-creature-glb.mjs <entrada.glb> <saida.glb> [qualidadeWebp=92]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { resample } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, qArg = '92'] = process.argv.slice(2);
/** fidelidade (dB) entre duas imagens RGBA cruas do mesmo tamanho; ∞ = iguais */
function psnr(a, b) {
  if (a.length !== b.length) return 0;
  let se = 0; for (let k = 0; k < a.length; k++) { const d = a[k] - b[k]; se += d * d; }
  return se === 0 ? Infinity : 10 * Math.log10((255 * 255) / (se / a.length));
}
if (!input || !output) { console.error('uso: slim-creature-glb.mjs <entrada.glb> <saida.glb> [qualidade]'); process.exit(1); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
const root = doc.getRoot();
const keys = () => root.listAnimations().flatMap((a) => a.listSamplers()).reduce((s, x) => s + (x.getInput()?.getCount() ?? 0), 0);
const k0 = keys();
await doc.transform(resample({ tolerance: 1e-4 }));
let webp = false;
for (const t of root.listTextures()) {
  const mime = t.getMimeType();
  if (mime !== 'image/png' && mime !== 'image/jpeg') continue;
  const img = Buffer.from(t.getImage());
  // exact: mantém a COR embaixo das áreas transparentes (material opaco usa ela — o faisão ficava manchado sem isto).
  // Fidelidade mínima 40 dB (idêntico a olho): q92 → q98 → sem perda, o primeiro que passar.
  const ref = await sharp(img).ensureAlpha().raw().toBuffer();
  let out = null;
  for (const opt of [{ quality: Number(qArg) }, { quality: 98 }, { lossless: true }]) {
    const cand = await sharp(img).webp({ ...opt, alphaQuality: 100, effort: 6, smartSubsample: true, exact: true }).toBuffer();
    if (psnr(ref, await sharp(cand).ensureAlpha().raw().toBuffer()) >= 40) { out = cand; break; }
  }
  if (!out || out.byteLength >= img.byteLength) continue; // não ganhou (ou não ficou fiel): fica como estava
  t.setImage(new Uint8Array(out)).setMimeType('image/webp');
  if (t.getURI()) t.setURI(t.getURI().replace(/\.(png|jpe?g)$/i, '.webp'));
  webp = true;
}
if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);
await io.write(output, doc);
console.log(JSON.stringify({ arquivo: input.split(/[\\/]/).pop(), chaves: [k0, keys()], mb: [+(fs.statSync(input).size / 1048576).toFixed(2), +(fs.statSync(output).size / 1048576).toFixed(2)] }));
