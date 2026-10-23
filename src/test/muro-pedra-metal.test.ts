import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { prepareWall, WALL_TARGET_H } from '@/components/world/glb-base-walls';
import { buildPieceAssets } from '@/components/world/base-geometry';
import { palette } from '@/components/world/world-kit';

/* Pedro, 23/10 (onda 8, casa de metal): muro de pedra/metal baixo (não passava do herói) e o de metal
   "de cabeça pra baixo". Causa medida: os GLB vêm COMPACTADOS (Int16 normalizado) e o jogo esticava
   em cima disso → o inteiro estourava e o topo ia pra baixo do chão (metade dos vértices < 0, altura
   travada em 2 m). Agora descompacta antes e usa a altura EXATA do muro de madeira. */
describe('muros de pedra/metal', () => {
  it('altura alvo = muro de madeira (procedural wall1 × 1,8)', () => {
    const geo = (buildPieceAssets(palette()) as unknown as Record<string, { geo: THREE.BufferGeometry }>)['wall1']!.geo;
    geo.computeBoundingBox();
    expect(WALL_TARGET_H).toBeCloseTo((geo.boundingBox!.max.y - geo.boundingBox!.min.y) * 1.8, 1);
  });

  for (const f of ['stone-wall', 'metal-wall']) {
    it(`${f}: em pé, do chão até 4,27 m, nada abaixo do chão (modelo real compactado)`, async () => {
      await MeshoptDecoder.ready;
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
      const doc = await io.read(`public/models/base/${f}.glb`);
      const node = doc.getRoot().listNodes()[0]!;
      const prim = node.getMesh()!.listPrimitives()[0]!;
      const pa = prim.getAttribute('POSITION')!;
      // monta igual ao GLTFLoader: array cru (Int16 normalizado) + escala do nó
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pa.getArray() as Int16Array, 3, pa.getNormalized()));
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
      mesh.scale.fromArray(node.getScale());
      const scene = new THREE.Group();
      scene.add(mesh);
      const prep = prepareWall(scene)!;
      prep.geo.computeBoundingBox();
      const bb = prep.geo.boundingBox!;
      expect(bb.min.y).toBeCloseTo(0, 3);
      expect(bb.max.y).toBeCloseTo(WALL_TARGET_H, 2);
      expect(bb.max.x - bb.min.x).toBeCloseTo(2.1, 2);
      const p = prep.geo.getAttribute('position');
      expect(p.array).toBeInstanceOf(Float32Array);
      // o topo do modelo original (y alto) continua EM CIMA: centro de massa acima do meio é aceitável,
      // mas nenhum vértice "deu a volta" pra baixo do chão
      let below = 0;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.001) below++;
      expect(below).toBe(0);
    }, 60_000);
  }
});
