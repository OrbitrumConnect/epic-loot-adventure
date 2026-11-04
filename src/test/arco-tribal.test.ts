import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOW_FIT, BOW_URL } from '@/components/world/weapon-models';

/* Pedro 03/11: "o arco está poly estranho, por quê?!" — era o arco DE CAIXINHAS desenhado no código. O pack do Meshy trouxe
   o arco tribal (747 mil triângulos, 31 MB): simplificado com meshopt pra 14,9 mil, só a cor 1024 KTX2, fosco → 0,73 MB.
   Na mão: a MESMA pega do arco antigo (comprido em pé no eixo da mão, corda pra +X, empunhadura na origem). */
const glb = (url: string) => {
  const b = fs.readFileSync('public' + url);
  return { size: b.length, j: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) };
};

describe('arco tribal (GLB) no lugar do arco de caixinhas', () => {
  it('leve: ~15 mil triângulos, textura KTX2, < 1 MB, sem animação', () => {
    const { size, j } = glb(BOW_URL);
    const tris = j.meshes.flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
      .reduce((s: number, p: { indices: number }) => s + j.accessors[p.indices].count / 3, 0);
    expect(tris).toBeLessThan(16_000);
    expect(tris).toBeGreaterThan(10_000); // não virou um borrão
    expect(size).toBeLessThan(1_000_000);
    expect(j.images.every((im: { mimeType: string }) => im.mimeType === 'image/ktx2')).toBe(true);
    expect(j.animations ?? []).toHaveLength(0);
  });

  it('encaixe medido (eixo comprido e corda perpendiculares; ~1,15 m na mão) e ligado na mão (o antigo é a reserva)', () => {
    const [ax, ay, az] = BOW_FIT.axis, [sx, sy, sz] = BOW_FIT.string;
    expect(Math.abs(ax * sx + ay * sy + az * sz)).toBeLessThan(0.01);
    expect(Math.hypot(ax, ay, az)).toBeCloseTo(1, 2); expect(Math.hypot(sx, sy, sz)).toBeCloseTo(1, 2);
    expect(BOW_FIT.length).toBeGreaterThan(1); expect(BOW_FIT.length).toBeLessThan(1.3);
    const held = fs.readFileSync('src/components/world/held-weapon.tsx', 'utf8');
    expect(held).toMatch(/case 'bow': return <Suspense fallback=\{<Bow k=\{k\} \/>\}><group position=\{\[0, 0, 0\.1\]\}><BowModel \/><\/group><\/Suspense>;/);
    const wm = fs.readFileSync('src/components/world/weapon-models.tsx', 'utf8');
    expect(wm).toMatch(/useGLTF\(BOW_URL, true, true, extendKTX2\)/);
    expect(wm).toMatch(/primeKTX2\(gl\);/);
  });
});
