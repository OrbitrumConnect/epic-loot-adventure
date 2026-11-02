import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, type Palette } from './world-kit';

/**
 * One colored geometry keeps the harvest instance/id contract and draw budget.
 * `far` (01/11 — mais farm na Zona Sul, Pedro: "falta árvore de farm"): a MESMA árvore pra DE LONGE — mesmo tronco,
 * mesmos 16 galhos (menos lados), sem galhinhos/raízes/marca de machado (somem na distância) e 1 de cada 3 folhas de
 * cada copa, nos MESMOS lugares, 1,7× maiores (cobrem a mesma área) → ~2 mil triângulos em vez de ~8,9 mil.
 * Sem `far` a árvore sai idêntica à de sempre.
 */
/** `xfar` (02/11 — mais árvores de farm e o custo de longe: além de 260 m): a MESMA árvore ainda mais leve — tronco de
 *  3 lados, só a metade dos galhos (cada uma das copas que sobra no MESMO lugar) e 1 de cada 9 folhas, 3× maiores
 *  (cobrem a mesma área) → ~400 triângulos. A essa distância a árvore tem poucos pixels. */
export function harvestTreeGeometry(c: Palette, far: boolean | 'xfar' = false): THREE.BufferGeometry {
  const xfar = far === 'xfar';
  if (xfar) far = true;
  const pieces: THREE.BufferGeometry[] = [];
  const bark = new THREE.Color(c.trunk);
  const barkLight = bark.clone().lerp(new THREE.Color(c['ground-light']), 0.24);
  const foliage = new THREE.Color(c.leaf);
  const foliageLight = new THREE.Color(c['leaf-light']);
  const color = new THREE.Color();
  const radial = xfar ? 3 : far ? 4 : 7;
  const branch = (points: THREE.Vector3[], radius: number, segments0 = 7) => {
    const segments = xfar ? Math.min(segments0, 2) : far ? Math.min(segments0, 3) : segments0;
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, segments, radius, radial, false);
    const p = tube.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / (radial + 1)) / segments;
      const center = curve.getPointAt(t);
      const taper = 1 - t * 0.84;
      p.setXYZ(i, center.x + (p.getX(i) - center.x) * taper,
        center.y + (p.getY(i) - center.y) * taper,
        center.z + (p.getZ(i) - center.z) * taper);
      color.copy(bark).lerp(barkLight, (i % (radial + 1)) % 3 === 0 ? 0.8 : 0.15);
      colors.push(color.r, color.g, color.b);
    }
    tube.computeVertexNormals();
    tube.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    tube.deleteAttribute('uv');
    pieces.push(tube.toNonIndexed());
    tube.dispose();
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  branch([v(0, 0, 0), v(0.04, 1.3, -0.03), v(-0.08, 2.7, 0.04), v(0.05, 4.4, 0)], 0.25, 12);
  for (let i = 0; i < 6 && !far; i++) {
    const a = i * Math.PI / 3;
    branch([v(Math.cos(a) * 0.42, 0.025, Math.sin(a) * 0.42),
      v(Math.cos(a) * 0.18, 0.13, Math.sin(a) * 0.18), v(0, 0.68, 0)], 0.095, 4);
  }
  // (xfar: 1/9 das folhas em metade das copas → folha 4,2× maior cobre a mesma área de folhagem)
  const LEAF_STEP = xfar ? 9 : far ? 3 : 1, LEAF_K = xfar ? 4.2 : far ? Math.sqrt(3) : 1;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < 16; i++) {
    const seed = 841 + i * 97;
    const a = i * 2.39996;
    const h = 2.75 + rand(seed) * 1.5;
    const reach = (4.9 - h) * (0.43 + rand(seed + 2) * 0.15);
    const end = v(Math.cos(a) * reach, h, Math.sin(a) * reach);
    if (xfar && i % 2 === 1) continue; // de muito longe: metade dos galhos (as copas que ficam, nos mesmos lugares)
    branch([v(0, h - 0.8, 0), v(end.x * 0.48, h - 0.25, end.z * 0.48), end], 0.07);
    for (let fork = 0; fork < 2 && !far; fork++) {
      const angle = a + (fork === 0 ? -0.6 : 0.6);
      branch([end.clone().multiplyScalar(0.78), end.clone(),
        end.clone().add(v(Math.cos(angle) * 0.3, 0.24, Math.sin(angle) * 0.3))], 0.024, 4);
    }
    for (let j = 0; j < 78; j += LEAF_STEP) {
      const k = seed + j * 7.137;
      const theta = rand(k + 3) * Math.PI * 2;
      const spread = Math.sqrt(rand(k + 4));
      const center = end.clone().add(v(Math.cos(theta) * spread * 0.56,
        (rand(k + 5) - 0.3) * 0.7, Math.sin(theta) * spread * 0.56));
      const length = (0.11 + rand(k + 6) * 0.09) * LEAF_K;
      const width = length * 0.48;
      const along = v(Math.cos(theta), (rand(k + 10) - 0.5) * 0.9, Math.sin(theta)).normalize().multiplyScalar(length);
      const across = v(-Math.sin(theta), 0.2, Math.cos(theta)).multiplyScalar(width);
      const root = center.clone().sub(along);
      const tip = center.clone().add(along);
      const left = center.clone().add(across);
      const right = center.clone().sub(across);
      const ridge = center.clone().add(v(0, width * 0.45, 0));
      color.copy(foliage).lerp(foliageLight, rand(k + 12) * 0.6);
      for (const p of [root, left, ridge, left, tip, ridge, tip, right, ridge, right, root, ridge]) {
        positions.push(p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  leaves.computeVertexNormals();
  pieces.push(leaves);
  if (far) {
    const geometry = mergeGeometries(pieces, false)!;
    pieces.forEach(piece => piece.dispose());
    return geometry;
  }
  // A pale axe scar keeps the resource legible beside decorative trees.
  const scar = new THREE.BoxGeometry(0.24, 0.13, 0.04).toNonIndexed();
  scar.translate(0, 1.2, 0.19);
  scar.deleteAttribute('uv');
  const scarColor = new THREE.Color(c['ground-light']);
  const scarColors = new Float32Array(scar.getAttribute('position').count * 3);
  for (let i = 0; i < scarColors.length; i += 3) scarColor.toArray(scarColors, i);
  scar.setAttribute('color', new THREE.BufferAttribute(scarColors, 3));
  pieces.push(scar);
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach(piece => piece.dispose());
  return geometry;
}
