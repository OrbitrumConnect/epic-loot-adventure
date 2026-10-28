// CARRO VOADOR (Pedro 28/10, GLB baixado: 500 mil triângulos + 3 PNG de 45 MB — sozinho pesaria 5× o mapa). Compacta:
// solda vértices → SIMPLIFICA a malha (meshoptimizer) → texturas 1024 (cor) / 512 (normal, rugosidade) em JPEG → limpa.
// Uso: node tools/zona-sul/optimize-car.mjs <entrada.glb> [alvoTriangulos=14000]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, alvo = '14000'] = process.argv.slice(2);
const OUT = 'public/zona-sul/car.glb';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const tris = () => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const t0 = tris();
await MeshoptSimplifier.ready;
await doc.transform(weld());
const ratio = Math.min(1, Number(alvo) / t0);
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.012, lockBorder: false }));
// texturas: a de COR em 1024, as de dado (normal / metal-rugosidade) em 512 — JPEG (sem transparência no carro)
const mat = doc.getRoot().listMaterials()[0];
const colorTex = mat?.getBaseColorTexture();
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 85, resize: [1024, 1024], pattern: /.*/, slots: /baseColor/ }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 85, resize: [512, 512], slots: /^(?!baseColor).*/ }),
  dedup(), prune(),
);
await io.write(OUT, doc);
// medidas (caixa) pra escalar no jogo
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], v = [0, 0, 0];
for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
const node = doc.getRoot().listNodes()[0];
console.log(JSON.stringify({
  triangulos: [Math.round(t0), Math.round(tris())], mb: [+(fs.statSync(input).size / 1048576).toFixed(1), +(fs.statSync(OUT).size / 1048576).toFixed(2)],
  caixaLocal: { min: mn.map((x) => +x.toFixed(3)), max: mx.map((x) => +x.toFixed(3)) }, escalaNo: node.getScale(), rotacaoNo: node.getRotation(),
  texturaCor: !!colorTex,
}));
