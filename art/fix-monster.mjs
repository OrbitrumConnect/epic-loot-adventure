// Usage: node art/fix-monster.mjs <original.glb> <output.glb> <gltf-transform node_modules>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';

const [input, output, modules] = process.argv.slice(2);
assert(input && output && modules, 'Expected input, output and tool node_modules path');
const load = (path) => import(pathToFileURL(resolve(modules, path)).href);
const { NodeIO } = await load('@gltf-transform/core/dist/index.js');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions/dist/index.js');
const { metalRough, textureCompress } = await load('@gltf-transform/functions/dist/index.js');
const sharp = createRequire(resolve(modules, '../package.json'))('sharp');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
assert.equal(root.listSkins().length, 1);
assert.equal(root.listAnimations().length, 1);
const skin = root.listSkins()[0];
const joints = skin.listJoints();
assert.equal(joints[0].getName(), '_rootJoint');
assert.deepEqual(joints[0].getWorldMatrix(), new Matrix4().toArray());
const ibm = skin.getInverseBindMatrices();
const beforeIBM = ibm.getArray().slice();
const decode = new Matrix4().fromArray(beforeIBM);
const s = decode.elements[0];
assert(s > 100 && s < 200, 'Input must be original quantized monster');
assert.deepEqual(decode.elements.slice(0, 12), [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0]);
const inverse = decode.clone().invert();
const primitive = root.listMeshes()[0].listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
assert(position.getNormalized(), 'Input POSITION must be normalized');
const oldPositions = [];
const positions = new Float32Array(position.getCount() * 3);
for (let i = 0; i < position.getCount(); i++) {
  const p = position.getElement(i, []);
  oldPositions.push(p);
  new Vector3(...p).applyMatrix4(decode).toArray(positions, i * 3);
}
position.setArray(positions).setNormalized(false);
// Quantization decode lives in the inverse bind matrices for this skinned mesh.
// Move it into POSITION so geometry bounds and animated bounds use the same units.
const matrices = new Float32Array(beforeIBM.length);
for (let i = 0; i < joints.length; i++) {
  new Matrix4().fromArray(beforeIBM, i * 16).multiply(inverse).toArray(matrices, i * 16);
}
ibm.setArray(matrices);
// Verify B' * p' == B * p for every joint and vertex: any animated joint world
// matrix therefore produces the same skin deformation (within float32 precision).
let maxError = 0;
for (let j = 0; j < joints.length; j++) {
  const a = new Matrix4().fromArray(beforeIBM, j * 16);
  const b = new Matrix4().fromArray(matrices, j * 16);
  for (let i = 0; i < oldPositions.length; i++) {
    const p = new Vector3(...oldPositions[i]).applyMatrix4(a);
    const q = new Vector3().fromArray(positions, i * 3).applyMatrix4(b);
    maxError = Math.max(maxError, p.distanceTo(q));
  }
}
assert(maxError < 0.0001, `Skin drift: ${maxError}`);
const animation = root.listAnimations()[0];
const animationData = animation.listSamplers().map(s => [Array.from(s.getInput().getArray()), Array.from(s.getOutput().getArray()), s.getInterpolation()]);
await doc.transform(metalRough(), textureCompress({ encoder: sharp, targetFormat: 'webp', formats: /png/, quality: 85, effort: 100 }));
assert.deepEqual(animation.listSamplers().map(s => [Array.from(s.getInput().getArray()), Array.from(s.getOutput().getArray()), s.getInterpolation()]), animationData);
await io.write(output, doc);
const saved = await io.read(output);
assert.equal(saved.getRoot().listSkins().length, 1);
assert.equal(saved.getRoot().listAnimations()[0].listChannels().length, animation.listChannels().length);
assert(saved.getRoot().listMaterials()[0].getBaseColorTexture());
assert(!saved.getRoot().listMaterials()[0].getExtension('KHR_materials_pbrSpecularGlossiness'));
console.log(JSON.stringify({ before: (await stat(input)).size, after: (await stat(output)).size, joints: joints.length, animationChannels: animation.listChannels().length, maxSkinError: maxError, geometryHeight: position.getMax([])[1] - position.getMin([])[1] }, null, 2));
