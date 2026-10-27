// Chão do mapa GLB em coordenadas de MUNDO (mesmo transform do map-floor.tsx), com BVH pra raio.
// Compartilhado pelas ferramentas de medição/encaixe — todas medem o MESMO chão que o jogo pisa.
import fs from 'node:fs';
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const MAP_GLB = 'public/models/map/rio-wasteland-iconic.glb';
const POS = [2.2, 9.6, 22.5], SCALE = [80.3, 78.3, 71.2], YAW = -1.3;

export function loadMapGround(file = MAP_GLB) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8);
  const acc = (i) => json.accessors[i];
  const view = (a) => { const bv = json.bufferViews[a.bufferView]; return { off: (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), bv }; };
  const prim = json.meshes[0].primitives[0];
  const pa = acc(prim.attributes.POSITION), ia = acc(prim.indices);
  const pv = view(pa), iv = view(ia);
  const stride = pv.bv.byteStride ?? 6;
  const pos = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = Math.max(-1, bin.readInt16LE(pv.off + i * stride + c * 2) / 32767);
  const idx = new Uint32Array(ia.count);
  for (let i = 0; i < ia.count; i++) idx[i] = bin.readUInt32LE(iv.off + i * 4);

  const node = json.nodes[0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.fromArray(node.translation ?? [0, 0, 0]); mesh.scale.fromArray(node.scale ?? [1, 1, 1]);
  const clone = new THREE.Group(); clone.add(mesh); clone.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(clone);
  const span = Math.max(box0.max.x - box0.min.x, box0.max.y - box0.min.y, box0.max.z - box0.min.z) || 1;
  clone.scale.setScalar(4 / span); clone.updateMatrixWorld(true);
  const pivot = new THREE.Box3().setFromObject(clone).getCenter(new THREE.Vector3());
  const outer = new THREE.Group();
  outer.position.set(POS[0] + pivot.x * SCALE[0], POS[1] + pivot.y * SCALE[1], POS[2] + pivot.z * SCALE[2]);
  outer.rotation.y = YAW; outer.scale.fromArray(SCALE);
  const inner = new THREE.Group(); inner.position.set(-pivot.x, -pivot.y, -pivot.z);
  outer.add(inner); inner.add(clone); outer.updateMatrixWorld(true);

  const wgeo = geo.clone().applyMatrix4(mesh.matrixWorld);
  wgeo.computeBoundsTree();
  const wmesh = new THREE.Mesh(wgeo, mesh.material);
  const box = new THREE.Box3().setFromBufferAttribute(wgeo.getAttribute('position'));
  const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  /** Altura do TOPO do chão em (x,z); null = fora da ilha (vazio). */
  const heightAt = (x, z) => {
    o.set(x, box.max.y + 5, z); ray.set(o, down);
    const hit = ray.intersectObject(wmesh, false)[0];
    return hit ? hit.point.y : null;
  };
  return { box, heightAt };
}
