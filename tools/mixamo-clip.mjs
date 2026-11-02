// Clip do Mixamo "SÓ animação" (como public/models/red/move_*.glb): tira malha, pele, material e textura do GLB
// convertido do FBX (FBX2glTF) e deixa só o esqueleto + a 1ª animação. Uso: node tools/mixamo-clip.mjs <entrada.glb> <saida.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const [inp, out] = process.argv.slice(2);
if (!inp || !out) throw new Error('uso: node tools/mixamo-clip.mjs <entrada.glb> <saida.glb>');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp), root = doc.getRoot();
for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const m of root.listMeshes()) m.dispose();
for (const s of root.listSkins()) s.dispose();
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
root.listAnimations().slice(1).forEach((a) => a.dispose());
const a = root.listAnimations()[0];
if (a) a.setName('mixamo.com');
await doc.transform(prune({ keepLeaves: true })); // esqueleto INTEIRO (pontas dos dedos também): o retargetTwist mede nele
await io.write(out, doc);
console.log(`${out}: ${root.listNodes().length} nós, ${root.listAnimations().length} animação`);
