import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HOUSE_STEP_UP, buildFloorMesh, floorBelow, levelSegs, sliceLevels, type HouseLevels,
} from '@/components/world/house-levels';

/* Pedro, 22/10: escada/2º andar das casas de PEDRA e METAL não funcionavam (colisão de 1 andar só).
   Prova nas malhas REAIS, com a MESMA escala do jogo (base-house: altura 8,3 × 1,05, centrada):
   andando pela planta (grade de 25 cm, degrau ≤ 45 cm, parede na altura do joelho, corpo 0,3 m),
   partindo do térreo, o herói tem que chegar no 2º andar — e as paredes externas seguem fechando. */
const TARGET_H = 8.3, VSTRETCH = 1.05;
const BODY = 0.3;

async function houseTris(file: string): Promise<{ tris: Float32Array; halfX: number; halfZ: number }> {
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
      for (let i = 0; i < n; i++) {
        pa.getElement(ind ? ind.getScalar(i) : i, el);
        v.set(el[0]!, el[1]!, el[2]!).applyMatrix4(M);
        raw.push(v.x, v.y, v.z);
      }
    }
  }
  const box = new THREE.Box3();
  for (let i = 0; i < raw.length; i += 3) box.expandByPoint(v.set(raw[i]!, raw[i + 1]!, raw[i + 2]!));
  const s = TARGET_H / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const tris = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    tris[i] = (raw[i]! - cx) * s;
    tris[i + 1] = (raw[i + 1]! - box.min.y) * s * VSTRETCH;
    tris[i + 2] = (raw[i + 2]! - cz) * s;
  }
  return { tris, halfX: ((box.max.x - box.min.x) * s) / 2, halfZ: ((box.max.z - box.min.z) * s) / 2 };
}

function crosses(ax: number, az: number, bx: number, bz: number, s: number[]): boolean {
  const rx = bx - ax, rz = bz - az;
  for (let i = 0; i < s.length; i += 4) {
    const px = s[i]!, pz = s[i + 1]!, sx = s[i + 2]! - px, sz = s[i + 3]! - pz;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((px - ax) * sz - (pz - az) * sx) / den, u = ((px - ax) * rz - (pz - az) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
function clearance(x: number, z: number, s: number[]): number {
  let best = Infinity;
  for (let i = 0; i < s.length; i += 4) {
    const ax = s[i]!, az = s[i + 1]!, ex = s[i + 2]! - ax, ez = s[i + 3]! - az;
    const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
}

/** Busca na planta: até que altura dá pra chegar andando a partir do térreo, sem sair da casa. */
function maxReach(mesh: THREE.Mesh, levels: HouseLevels, halfX: number, halfZ: number, start: [number, number], legacy: number[]) {
  const G = 0.25;
  const seen = new Set<string>();
  const queue: [number, number, number][] = [];
  const nx = Math.floor((halfX - 0.4) / G), nz = Math.floor((halfZ - 0.4) / G);
  for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
    const f = floorBelow(mesh, i * G, j * G, start[1] - 0.1);
    if (f !== null && f >= start[0] && f <= start[1] && clearance(i * G, j * G, levelSegs(levels, f, legacy)) >= BODY) queue.push([i, j, f]);
  }
  let best = 0;
  const segCache = new Map<number, number[]>();
  const segsAt = (f: number) => {
    const k = Math.round(f / levels.step);
    if (!segCache.has(k)) segCache.set(k, levelSegs(levels, f, legacy));
    return segCache.get(k)!;
  };
  while (queue.length) {
    const [i, j, f] = queue.pop()!;
    const key = `${i},${j},${Math.round(f * 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    best = Math.max(best, f);
    const segs = segsAt(f);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di, b = j + dj;
      if (Math.abs(a) > nx || Math.abs(b) > nz) continue;
      const f2 = floorBelow(mesh, a * G, b * G, f);
      if (f2 === null || f2 - f > HOUSE_STEP_UP + 1e-3) continue;
      if (crosses(i * G, j * G, a * G, b * G, segs) || clearance(a * G, b * G, segsAt(f2)) < BODY) continue;
      queue.push([a, b, f2]);
    }
  }
  return best;
}

describe.each(['stone-house', 'metal-house'])('casa %s: escada e 2º andar (malha real)', (file) => {
  let data: Awaited<ReturnType<typeof houseTris>>;
  let levels: HouseLevels;
  let mesh: THREE.Mesh;
  let legacy: number[]; // fatia antiga do térreo (1,54 m) — a mesma `wallSegs` que o jogo publica
  beforeAll(async () => {
    data = await houseTris(file);
    levels = sliceLevels(data.tris, TARGET_H * VSTRETCH);
    mesh = buildFloorMesh(data.tris)!;
    legacy = sliceLevels(data.tris, 1.544, 1.544).segs[1]!;
  }, 60_000);

  it('PEDRA: andando pelo térreo, sobe a escada e chega no 2º andar (≥ 3,4 m)', () => {
    if (file !== 'stone-house') return;
    expect(maxReach(mesh, levels, data.halfX, data.halfZ, [0, 0.7], legacy)).toBeGreaterThan(3.4);
  }, 120_000);

  it('METAL: a escada (fundos) leva ao 2º andar — mas o 1º degrau do MODELO está a 1,6 m do chão', () => {
    if (file !== 'metal-house') return;
    expect(maxReach(mesh, levels, data.halfX, data.halfZ, [0, 0.7], legacy)).toBeLessThan(1); // do chão não alcança (asset)
    expect(maxReach(mesh, levels, data.halfX, data.halfZ, [1.4, 2.0], legacy)).toBeGreaterThan(3.4); // em cima do 1º degrau, sobe
  }, 120_000);

  it('térreo: NENHUMA passagem nova nas paredes vs a colisão antiga (fatia única 1,54 m)', () => {
    const feet = floorBelow(mesh, 0, -2, 0.3) ?? 0.3;
    const old = legacy;
    const now = levelSegs(levels, feet, legacy);
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const bx = Math.cos(a) * data.halfX * 1.2, bz = Math.sin(a) * data.halfZ * 1.2;
      if (crosses(0, -2, bx, bz - 2, old)) expect(crosses(0, -2, bx, bz - 2, now), `${Math.round((a * 180) / Math.PI)}°`).toBe(true);
    }
  });

  it('2º andar: paredes fecham (só a saída da escada/porta abre)', () => {
    const segs = levelSegs(levels, 3.9, legacy);
    let open = 0;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      if (!crosses(0, 0, Math.cos(a) * data.halfX * 1.2, Math.sin(a) * data.halfZ * 1.2, segs)) open++;
    }
    expect(open / 32).toBeLessThanOrEqual(0.15);
  });
});
