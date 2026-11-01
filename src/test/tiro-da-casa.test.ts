import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFloorMesh, floorBelow, sliceLevels, type HouseLevels } from '@/components/world/house-levels';
import { shotCrossesHouseLevels } from '@/components/world/base-collision';

/* Pedro 01/11: "no manual, atirando, a bala vai lá e mal pega — nem tá tão longe" (atirando da varanda/2º andar do
   Salão da Tribo). A linha de tiro testava só no CHÃO (2D) com a parede do TÉRREO: de cima, todo tiro pra fora "batia"
   e virava tiro no vazio. Agora vale a parede DA ALTURA por onde a bala passa. Conferido na malha REAL (escala do jogo). */
const TARGET_H = 8.3, VSTRETCH = 1.05;

async function houseTris(file: string) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(`public/models/house/${file}.glb`);
  const raw: number[] = [];
  const v = new THREE.Vector3();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const M = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION')!, ind = prim.getIndices();
      const el: number[] = [];
      const n = ind ? ind.getCount() : pa.getCount();
      for (let i = 0; i < n; i++) { pa.getElement(ind ? ind.getScalar(i) : i, el); v.set(el[0]!, el[1]!, el[2]!).applyMatrix4(M); raw.push(v.x, v.y, v.z); }
    }
  }
  const box = new THREE.Box3();
  for (let i = 0; i < raw.length; i += 3) box.expandByPoint(v.set(raw[i]!, raw[i + 1]!, raw[i + 2]!));
  const s = TARGET_H / (box.max.y - box.min.y), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const tris = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) { tris[i] = (raw[i]! - cx) * s; tris[i + 1] = (raw[i + 1]! - box.min.y) * s * VSTRETCH; tris[i + 2] = (raw[i + 2]! - cz) * s; }
  return { tris, halfX: ((box.max.x - box.min.x) * s) / 2, halfZ: ((box.max.z - box.min.z) * s) / 2 };
}

describe('tiro com a casa de 2 andares no caminho (malha real da casa de pedra)', () => {
  let levels: HouseLevels, halfX = 0, halfZ = 0, mesh: THREE.Mesh;
  beforeAll(async () => {
    const d = await houseTris('stone-house');
    levels = sliceLevels(d.tris, TARGET_H * VSTRETCH); halfX = d.halfX; halfZ = d.halfZ; mesh = buildFloorMesh(d.tris)!;
  }, 60_000);
  const cross = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => shotCrossesHouseLevels(levels, 0, 0, 0, halfX, halfZ, ax, ay, az, bx, by, bz);

  it('na altura do peito, atravessando a casa de fora a fora: a parede segura (igual antes)', () => {
    let blocked = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = Math.max(halfX, halfZ) + 6;
      if (cross(Math.cos(a) * r, 1.5, Math.sin(a) * r, -Math.cos(a) * r, 1.5, -Math.sin(a) * r)) blocked++;
    }
    expect(blocked).toBeGreaterThanOrEqual(14); // (a porta/vão da frente pode deixar passar 1–2 linhas)
  });

  it('por cima do telhado passa', () => {
    const r = Math.max(halfX, halfZ) + 6;
    expect(cross(-r, 10, 0, r, 10, 0)).toBe(false);
    expect(cross(0, 10, -r, 0, 9.5, r)).toBe(false);
  });

  it('do 2º ANDAR atirando pra fora num bicho a 30 m: abre pelas aberturas de cima (antes: TODA linha bloqueada)', () => {
    // um ponto do 2º andar (piso ≥ 3 m) perto do meio
    let sx = 0, sz = 0, floor = -1;
    for (let i = -8; i <= 8 && floor < 3; i++) for (let j = -8; j <= 8 && floor < 3; j++) {
      const f = floorBelow(mesh, i * 0.5, j * 0.5, 7); if (f !== null && f >= 3 && f < 6) { sx = i * 0.5; sz = j * 0.5; floor = f; }
    }
    expect(floor).toBeGreaterThanOrEqual(3);
    let open = 0;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      if (!cross(sx, floor + 1.6, sz, sx + Math.cos(a) * 30, 1, sz + Math.sin(a) * 30)) open++;
    }
    console.log(`2º andar (piso ${floor.toFixed(2)} m em ${sx},${sz}): ${open}/64 direções abertas`);
    expect(open).toBeGreaterThan(0);
  });
});
