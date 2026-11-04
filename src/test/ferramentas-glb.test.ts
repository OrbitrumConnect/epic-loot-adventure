import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AXE_FIT, DAGGER_FIT, PICKAXE_FIT, TORCH_FIT, type PropFit } from '@/components/world/weapon-models';

/* Pedro 03/11: "veja novos GLBs pra picareta, machado etc. — ajustar, e o bow, tudo otimizado no tamanho ideal, no local
   correto; é só trocar a skin das que já tem" · "o arco parece do lado contrário". */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const glb = (url: string) => {
  const b = fs.readFileSync('public' + url);
  return { size: b.length, j: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) };
};
const tris = (j: { meshes: { primitives: { indices: number }[] }[]; accessors: { count: number }[] }) =>
  j.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + j.accessors[p.indices]!.count / 3, 0);

describe('ferramentas GLB (machado, picareta, tocha, adaga = espada)', () => {
  const all: [string, PropFit, number][] = [['machado', AXE_FIT, 9_000], ['picareta', PICKAXE_FIT, 8_000], ['tocha', TORCH_FIT, 17_000], ['adaga', DAGGER_FIT, 9_000]];
  for (const [nome, f, maxTri] of all) {
    it(`${nome}: leve (KTX2, < 1 MB, sem animação) e encaixe medido (cabo ⟂ cabeça, tamanho de mão)`, () => {
      const { size, j } = glb(f.url);
      expect(tris(j)).toBeLessThan(maxTri); expect(tris(j)).toBeGreaterThan(4_000);
      expect(size).toBeLessThan(1_000_000);
      expect(j.images.every((im: { mimeType: string }) => im.mimeType === 'image/ktx2')).toBe(true);
      expect(j.animations ?? []).toHaveLength(0);
      const dot = f.z[0] * f.y[0] + f.z[1] * f.y[1] + f.z[2] * f.y[2];
      expect(Math.abs(dot)).toBeLessThan(0.02);
      expect(f.length).toBeGreaterThan(0.85); expect(f.length).toBeLessThan(1.2);
    });
  }

  it('na mão: troca a skin das que já têm (a desenhada é a reserva); tocha com a chama e a luz de sempre, apontando pra cima', () => {
    const h = read('src/components/world/held-weapon.tsx');
    expect(h).toMatch(/case 'sword': return <Suspense fallback=\{<Sword k=\{k\} \/>\}><DaggerModel \/><\/Suspense>;/);
    expect(h).toMatch(/case 'axe': return <Suspense fallback=\{<Axe k=\{k\} iron=\{false\} \/>\}><AxeModel \/><\/Suspense>;/);
    expect(h).toMatch(/case 'iron_pickaxe': return <Suspense fallback=\{<Pickaxe k=\{k\} iron \/>\}><PickaxeModel \/><\/Suspense>;/);
    expect(h).toMatch(/case 'torch': return <Torch k=\{k\} glb \/>;/);
    expect(h).toMatch(/\{glb \? <Suspense fallback=\{stick\}><TorchModel \/><\/Suspense> : stick\}/);
    expect(h).toMatch(/f\.quaternion\.copy\(f\.parent\.getWorldQuaternion\(tmpTorchQ\)\.invert\(\)\)/); // fogo sobe
    expect(h).toMatch(/flame: std\('#ff6a14', \{[^}]*transparent: true/); // laranja translúcido (não o cone creme)
  });

  it('ARCO na mão ESQUERDA, em pé, corda pro herói (as animações de arco seguram na esquerda)', () => {
    const g = read('src/components/world/glb-hero-mixamo.tsx');
    expect(g).toMatch(/const bow = rangedAttack && !!leftHandBone && heldK === 'bow';/);
    expect(g).toMatch(/if \(bow && leftHandBone && holder\) \{/);
    expect(g).toMatch(/posLocal = tmpAimPos\.copy\(palm\(leftHandBone, leftForeBone, tmpAimL\)\)/);
    const w = read('src/components/world/weapon-models.tsx');
    expect(w).toMatch(/z = new THREE\.Vector3\(\.\.\.BOW_FIT\.string\)\.normalize\(\)\.negate\(\);/); // corda → −Z (pra trás)
  });
});
