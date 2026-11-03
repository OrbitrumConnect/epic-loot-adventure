import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { inflateBounds, sampledSkinSphere, SKIN_SAMPLES } from '@/components/world/skinned-bounds';

/* Pedro 03/11: "o lag aumentou um pouco, dá umas travadas às vezes". Trace no build de produção: 17% do tempo dos quadros
   que travaram era o three calculando a bolha de cada corpo com esqueleto montado (todos os vértices pelos ossos). */
function bicho(n = 6000) {
  // corpo: n vértices numa caixa 1 × 2 × 0,6, metade presa no osso de baixo e metade no de cima (braço que gira)
  const pos = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = (i / n) * 2;
    pos.set([Math.sin(i * 1.7) * 0.5, y, Math.cos(i * 2.3) * 0.3], i * 3);
    si.set([y > 1 ? 1 : 0, 0, 0, 0], i * 4); sw.set([1, 0, 0, 0], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const b0 = new THREE.Bone(), b1 = new THREE.Bone(); b1.position.y = 1; b0.add(b1);
  const m = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
  m.add(b0); m.bind(new THREE.Skeleton([b0, b1]));
  b1.rotation.z = 1.2; // pose animada: a parte de cima dobra pro lado
  m.scale.setScalar(0.01); // escala no corpo (como os modelos que vêm com a escala assada)
  m.updateMatrixWorld(true);
  return m;
}
const contains = (big: THREE.Sphere, small: THREE.Sphere) => big.center.distanceTo(small.center) + small.radius <= big.radius + 1e-6;

describe('bolha do corpo com esqueleto pela amostra', () => {
  it('contém a bolha completa do three na mesma pose (com a folga), olhando ~400 vértices em vez de 6 mil', () => {
    const m = bicho();
    THREE.SkinnedMesh.prototype.computeBoundingSphere.call(m);
    const full = m.boundingSphere!.clone();
    const spy = vi.spyOn(m, 'getVertexPosition');
    const s = sampledSkinSphere(m);
    expect(contains(s, full)).toBe(true);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(SKIN_SAMPLES + 1);
    expect(s.radius).toBeLessThan(full.radius * 1.6); // folga, não exagero
  });
  it('inflateBounds: o corpo com esqueleto passa a calcular pela amostra (quando o three pedir); malha comum igual', () => {
    const m = bicho();
    inflateBounds(m);
    expect(m.boundingSphere).toBeNull(); // nada calculado na hora: só quando o culling pedir (igual a antes)
    m.computeBoundingSphere();           // o que o three chama na 1ª vez que o corpo passa pelo culling
    const ours = m.boundingSphere!.clone();
    THREE.SkinnedMesh.prototype.computeBoundingSphere.call(m);
    expect(contains(ours, m.boundingSphere!)).toBe(true);
    const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    inflateBounds(plain);
    expect(Object.prototype.hasOwnProperty.call(plain, 'computeBoundingSphere')).toBe(false);
    expect(plain.geometry.boundingSphere!.radius).toBeGreaterThan(Math.sqrt(3) / 2 * 1.7); // a de sempre (1,8×)
  });
  it('os 4 lugares que montam corpo usam a função (bichos, herói, herói antigo, chefe parado)', async () => {
    const fs = await import('node:fs');
    for (const f of ['glb-creature.tsx', 'glb-hero-mixamo.tsx', 'glb-hero.tsx', 'glb-static-boss.tsx']) {
      const src = fs.readFileSync(`src/components/world/${f}`, 'utf8');
      expect(src, f).toMatch(/inflateBounds\(m\)/);
      expect(src, f).not.toMatch(/boundingSphere\.radius \*= 1\.8/);
    }
  });
});
