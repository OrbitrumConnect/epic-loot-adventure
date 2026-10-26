// Mede e simplifica SÓ o cenário de fora da área jogável (26/10). Uso: node tools/simplify-map-outside.mjs <in.glb> <out.glb> 0.0003
import fs from 'node:fs';
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const [inF, outF, errS] = process.argv.slice(2);
const b = fs.readFileSync(inF);
const jl = b.readUInt32LE(12);
const json = JSON.parse(b.subarray(20, 20 + jl).toString());
const binStart = 20 + jl + 8;
const bin = b.subarray(binStart);
const acc = (i) => json.accessors[i];
const view = (a) => { const bv = json.bufferViews[a.bufferView]; return { off: (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), bv }; };
const prim = json.meshes[0].primitives[0];
const pa = acc(prim.attributes.POSITION), ia = acc(prim.indices);
const pv = view(pa), iv = view(ia);
const stride = pv.bv.byteStride ?? 6;
const nV = pa.count;
const pos = new Float32Array(nV * 3);
for (let i = 0; i < nV; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = Math.max(-1, bin.readInt16LE(pv.off + i * stride + c * 2) / 32767);
const idx = new Uint32Array(ia.count);
for (let i = 0; i < ia.count; i++) idx[i] = bin.readUInt32LE(iv.off + i * 4);

// Mesmo transform do jogo (map-floor.tsx): nó (t,s) → clone.scale = 4/span → grupo(pos+pivot*S, yaw, S) → (-pivot)
const node = json.nodes[0];
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setIndex(new THREE.BufferAttribute(idx, 1));
const mk = (g) => { const m = new THREE.Mesh(g); m.position.fromArray(node.translation ?? [0, 0, 0]); m.scale.fromArray(node.scale ?? [1, 1, 1]); const clone = new THREE.Group(); clone.add(m); return clone; };
const POS = [2.2, 9.6, 22.5], SCALE = [80.3, 78.3, 71.2], YAW = -1.3;
function world(g) {
  const clone = mk(g); clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
  clone.scale.setScalar(4 / span); clone.updateMatrixWorld(true);
  const pivot = new THREE.Box3().setFromObject(clone).getCenter(new THREE.Vector3());
  const outer = new THREE.Group(); outer.position.set(POS[0] + pivot.x * SCALE[0], POS[1] + pivot.y * SCALE[1], POS[2] + pivot.z * SCALE[2]); outer.rotation.y = YAW; outer.scale.fromArray(SCALE);
  const inner = new THREE.Group(); inner.position.set(-pivot.x, -pivot.y, -pivot.z);
  outer.add(inner); inner.add(clone); outer.updateMatrixWorld(true);
  return { root: outer, mesh: clone.children[0] };
}
const W = world(geo);
const M = W.mesh.matrixWorld;
const wp = new Float32Array(nV * 3); const v = new THREE.Vector3();
for (let i = 0; i < nV; i++) { v.fromArray(pos, i * 3).applyMatrix4(M); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z; }
let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
for (let i = 0; i < nV; i++) { mnx = Math.min(mnx, wp[i * 3]); mxx = Math.max(mxx, wp[i * 3]); mnz = Math.min(mnz, wp[i * 3 + 2]); mxz = Math.max(mxz, wp[i * 3 + 2]); }
console.log(`bloco no mundo: x ${mnx.toFixed(0)}..${mxx.toFixed(0)} z ${mnz.toFixed(0)}..${mxz.toFixed(0)} | tri ${idx.length / 3}`);

const LIM = 95;
const LOW_Y = -2.5; // valas/ravinas/fundo (≤ −2,5 m) ficam INTACTOS
const EDGE = 6; // beirada do bloco (saia lateral) intacta — mesma regra do corte de 24/10
const outV = (i) => Math.max(Math.abs(wp[i * 3]), Math.abs(wp[i * 3 + 2])) > LIM && wp[i * 3 + 1] > LOW_Y
  && wp[i * 3] > mnx + EDGE && wp[i * 3] < mxx - EDGE && wp[i * 3 + 2] > mnz + EDGE && wp[i * 3 + 2] < mxz - EDGE;
const inside = [], outside = [];
for (let t = 0; t < idx.length; t += 3) {
  const a = idx[t], b2 = idx[t + 1], c = idx[t + 2];
  (outV(a) && outV(b2) && outV(c) ? outside : inside).push(a, b2, c);
}
console.log(`dentro (intocado) ${inside.length / 3} tri | fora ${outside.length / 3} tri`);
if (!errS) process.exit(0);

await MeshoptSimplifier.ready;
const err = Number(errS);
const outIdx = new Uint32Array(outside);
const [simp, gotErr] = MeshoptSimplifier.simplify(outIdx, pos, 3, 0, err, ['LockBorder']);
console.log(`fora simplificado: ${outside.length / 3} → ${simp.length / 3} tri (erro relativo ${gotErr.toFixed(4)})`);
const newIdx = new Uint32Array(inside.length + simp.length);
newIdx.set(inside, 0); newIdx.set(simp, inside.length);

// MEDIÇÃO: altura do chão (raio de cima, 1º acerto) antes × depois em grade de 2 m (dentro) e 3 m (fora).
const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g2.setIndex(new THREE.BufferAttribute(newIdx, 1));
const W2 = world(g2);
geo.computeBoundsTree(); g2.computeBoundsTree();
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
const top = (w, x, z) => { ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0)); ray.far = 700; const h = ray.intersectObject(w.root, true); return h.length ? h[0].point.y : NaN; };
const stats = (label, step, pred) => {
  let n = 0, max = 0, sum = 0, holes = 0;
  for (let x = Math.ceil(mnx); x <= mxx; x += step) for (let z = Math.ceil(mnz); z <= mxz; z += step) {
    if (!pred(x, z)) continue;
    const a = top(W, x, z), c = top(W2, x, z);
    if (Number.isNaN(a)) continue;
    if (Number.isNaN(c)) { holes++; if (process.env.SHOW) console.log(`  buraco em (${x}, ${z}) altura original ${a.toFixed(2)}`); continue; }
    const d = Math.abs(a - c); n++; sum += d; max = Math.max(max, d);
  }
  console.log(`${label}: ${n} pontos | dif média ${(sum / Math.max(1, n)).toFixed(3)} m | máx ${max.toFixed(3)} m | BURACOS ${holes}`);
};
stats('DENTRO (|x|,|z| ≤ 90)', 2, (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= 90);
stats('FAIXA 90–110', 2, (x, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m > 90 && m <= 110; });
stats('FORA > 110', 3, (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 110);

// Grava: SÓ o bloco de índices muda (vértices/imagens/JSON iguais, só tamanho do índice).
const oldLen = iv.bv.byteLength;
const newBytes = Buffer.from(newIdx.buffer);
const parts = [bin.subarray(0, iv.off), newBytes, bin.subarray(iv.off + oldLen)];
const delta = newBytes.length - oldLen;
iv.bv.byteLength = newBytes.length; ia.count = newIdx.length;
for (const bv of json.bufferViews) if ((bv.byteOffset ?? 0) > iv.off) bv.byteOffset += delta;
let newBin = Buffer.concat(parts); const pad = (4 - (newBin.length % 4)) % 4; if (pad) newBin = Buffer.concat([newBin, Buffer.alloc(pad)]);
json.buffers[0].byteLength = newBin.length;
let js = Buffer.from(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; if (jp) js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + newBin.length, 8);
const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.write(type, 4); return h; };
fs.writeFileSync(outF, Buffer.concat([head, ch(js.length, 'JSON'), js, ch(newBin.length, 'BIN\0'), newBin]));
console.log(`gravado ${outF}: ${(fs.statSync(inF).size / 1048576).toFixed(1)} → ${(fs.statSync(outF).size / 1048576).toFixed(1)} MB`);

// OLHARES de câmera: da beirada da área jogável (|x| ou |z| = 86), 2,5 m acima do chão, pra FORA, 16 direções × 5 inclinações.
{
  const eyes = [];
  for (let s = -84; s <= 84; s += 12) eyes.push([86, s], [-86, s], [s, 86], [s, -86]);
  let n = 0, changed = 0, bigDiff = 0, missMismatch = 0, sumd = 0;
  const r = new THREE.Raycaster(); r.firstHitOnly = true; r.far = 200;
  const dir = new THREE.Vector3();
  for (const [ex, ez] of eyes) {
    const gy = top(W, ex, ez); if (Number.isNaN(gy)) continue;
    const o = new THREE.Vector3(ex, gy + 2.5, ez);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const tilt of [0.0, -0.05, -0.12, -0.25, 0.08]) {
        dir.set(Math.cos(a), tilt, Math.sin(a)).normalize();
        if (dir.x * ex + dir.z * ez < 0) continue; // só olhando pra FORA
        r.set(o, dir);
        const h1 = r.intersectObject(W.root, true), h2 = r.intersectObject(W2.root, true);
        n++;
        if (!!h1.length !== !!h2.length) { missMismatch++; continue; }
        if (!h1.length) continue;
        const d = Math.abs(h1[0].distance - h2[0].distance); sumd += d;
        if (d > 0.5) changed++;
        if (d > 3) bigDiff++;
      }
    }
  }
  console.log(`OLHARES da beirada pra fora: ${n} | horizonte mudou (acerta×erra) ${missMismatch} | dist. muda >0,5 m: ${changed} (${(100 * changed / n).toFixed(1)}%) | >3 m: ${bigDiff} | média ${(sumd / n).toFixed(3)} m`);
}
