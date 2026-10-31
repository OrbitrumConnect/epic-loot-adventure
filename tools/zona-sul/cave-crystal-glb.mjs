// CRISTAL DA CAVERNA (31/10, Pedro: "temos o nosso cristal azulado já resolvido em GLB, talvez seja útil… sem perder
// performance"). O `models/crystal/crystal.glb` tem 92 mil triângulos e 2,2 MB de textura KTX2 — pesado demais pras ~80
// pedras da caverna. Daqui sai SÓ A FORMA dele: tira textura/UV/tangente, simplifica (meshoptimizer) até ~alvo
// triângulos e grava um GLB minúsculo; a cor azul que brilha vem do material da caverna (zs-cave-view.tsx).
// Uso: node tools/zona-sul/cave-crystal-glb.mjs [entrada=public/models/crystal/crystal.glb] [saida=public/models/crystal/crystal-cave.glb] [alvo=800]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [input = 'public/models/crystal/crystal.glb', saida = 'public/models/crystal/crystal-cave.glb', alvo = '800'] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
for (const ext of root.listExtensionsUsed()) ext.dispose(); // sem meshopt/basisu na saída (arquivo simples)
const plain = doc.createMaterial('cristal').setBaseColorFactor([0.5, 0.75, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.3);
let t0 = 0, t1 = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') prim.setAttribute(sem, null);
  prim.setMaterial(plain);
}
for (const t of root.listTextures()) t.dispose();
await doc.transform(weld());
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const posA = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = posA.getCount();
  const pos = new Float32Array(n * 3), v = [0, 0, 0];
  for (let i = 0; i < n; i++) { posA.getElement(i, v); pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; }
  const ind = idx ? new Uint32Array(idx.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
  t0 += ind.length / 3;
  const want = Math.max(3, Math.floor((Number(alvo) * 3) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(ind, pos, 3, want, 0.05, ['Permissive']);
  t1 += out.length / 3;
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(out).setBuffer(idx?.getBuffer() ?? root.listBuffers()[0]));
  compactPrimitive(prim);
}
await doc.transform(dedup(), prune());
await io.write(saida, doc);
console.log(JSON.stringify({ triangulos: [t0, t1], kb: [Math.round(fs.statSync(input).size / 1024), Math.round(fs.statSync(saida).size / 1024)] }));
