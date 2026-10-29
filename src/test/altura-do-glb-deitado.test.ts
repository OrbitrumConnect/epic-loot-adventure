import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { medirAlturaGeometria } from '@/components/world/glb-hero-mixamo';

describe('altura de GLB deitado', () => {
  it('mede eixo Z depois do giro e preserva eixo Y sem giro', () => {
    const root = new THREE.Object3D();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.43, 1.65)));

    const alturaLocal = medirAlturaGeometria(root);
    const alturaEmPe = medirAlturaGeometria(root, Math.PI / 2);
    const escala = 3.32 / alturaEmPe;

    expect(alturaLocal).toBeCloseTo(0.43, 2);
    expect(alturaEmPe).toBeCloseTo(1.65, 2);
    expect(escala).toBeCloseTo(2.01, 2);
    expect(escala).not.toBeCloseTo(7.67, 1);
  });

  /* Teste de FIAÇÃO: o de cima mede a função isolada e passaria mesmo se ninguém a chamasse
     com o giro. O risco real não é a conta errada, é a conta certa desligada — então aqui se
     confere que o cálculo da escala passa `standFixX` para as DUAS caixas. */
  it('ligado: a escala mede as duas caixas já giradas por standFixX', () => {
    const src = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(src).toMatch(/const bindBox = measureGeoBox\(c, standFixX\);/);
    expect(src).toMatch(/const skBox = measureSkinnedBox\(c, standFixX\);/);
    // o reassentamento continua SEM giro: c.position vive no espaço local, antes do wrapper
    expect(src).toMatch(/const b2 = fooled \? measureSkinnedBox\(c\) : measureGeoBox\(c\);/);
  });
});
