// SIMPLIFICA SÓ A MALHA de um GLB (30/10, lag): solda vértices → meshoptimizer até ~alvo triângulos → limpa. Texturas e
// materiais ficam IGUAIS (diferente do optimize-car, que também recomprime textura). Usado na pedra de mineração
// (75,6 mil tri × 6 no pool + sombra) e no acampamento (99 mil tri × 8).
// `--permissive`: deixa colapsar ATRAVÉS das costuras de UV (modelos do Meshy têm tantas ilhas de textura que o modo
// normal para no meio) — a textura pode esticar um pouco nas costuras; bom pra pedra/cenário visto de longe.
// Uso: node tools/zona-sul/simplify-glb.mjs <entrada.glb> <alvoTriangulos> [saida=entrada] [erroMax=0.01] [--permissive]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [input, alvo, saida = input, erroMax = '0.01'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!input || !alvo) { console.error('uso: simplify-glb.mjs <entrada.glb> <alvoTriangulos> [saida] [erroMax] [--permissive]'); process.exit(1); }
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const prims = () => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
const tris = () => prims().reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const t0 = tris(), mb0 = fs.statSync(input).size, ratio = Math.min(1, Number(alvo) / t0);
await doc.transform(weld());
if (flags.includes('--permissive')) {
  for (const prim of prims()) {
    const posA = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = posA.getCount();
    const pos = new Float32Array(n * 3), v = [0, 0, 0];
    for (let i = 0; i < n; i++) { posA.getElement(i, v); pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; }
    const ind = idx ? new Uint32Array(idx.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
    const want = Math.max(3, Math.floor((ind.length * ratio) / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(ind, pos, 3, want, Number(erroMax), ['Permissive']);
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(out).setBuffer(idx?.getBuffer() ?? doc.getRoot().listBuffers()[0]));
    compactPrimitive(prim);
  }
  await doc.transform(dedup(), prune());
} else {
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: Number(erroMax), lockBorder: false }), dedup(), prune());
}
await io.write(saida, doc);
console.log(JSON.stringify({ triangulos: [Math.round(t0), Math.round(tris())], mb: [+(mb0 / 1048576).toFixed(2), +(fs.statSync(saida).size / 1048576).toFixed(2)] }));
