import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ForestBatch, type ForestPlacement } from './forest-models';
import { rand, type Palette } from './world-kit';
import type { FadeSphere } from './occlusion';

const spheres: FadeSphere[] = [];

/** Folded, curved blades form real silhouettes in both game cameras.
 *  `tint` (opcional) = tom de verde base (ex.: média amostrada do GLB do mapa) pra a
 *  grama casar com o chão. Sem tint usa o token c.grass. Gradiente CLARO (Pedro: a
 *  grama antiga estava escura) — raiz um tom abaixo, ponta puxada pro branco. */
export function GroundCover({ placements, c, tint }: { placements: ForestPlacement[]; c: Palette; tint?: THREE.Color | undefined }) {
  const tintKey = tint ? tint.getHexString() : '';
  const assets = useMemo(() => {
    const positions: number[] = [], colors: number[] = [];
    const base = tint ? tint.clone() : new THREE.Color(c.grass);
    // Puxa um pouco pro VERDE: a amostra do chão é oliva/amarronzada; Pedro quer o tom
    // "um pouco mais verde". Reduz vermelho/azul, reforça o verde (sem exagerar).
    base.setRGB(base.r * 0.80, Math.min(1, base.g * 1.15), base.b * 0.85);
    const low = base.clone().lerp(new THREE.Color('#000000'), 0.22);    // raiz um tom mais escura
    const high = base.clone().lerp(new THREE.Color('#ffffff'), 0.16);   // ponta levemente clara (NÃO branca)
    const color = new THREE.Color();
    for (let blade = 0; blade < 16; blade++) { // tufo mais leve (perf) — compensa + tufos
      const a = blade * 2.39996;
      const rootRadius = rand(blade + 51) * 0.2;
      const rootX = Math.cos(a) * rootRadius, rootZ = Math.sin(a) * rootRadius;
      const height = 0.33 + rand(blade + 17) * 0.64;
      const lean = 0.1 + rand(blade + 31) * 0.34;
      const point = (t: number, side: number) => {
        const width = (1 - t) * (0.015 + rand(blade + 8) * 0.022);
        return [rootX + Math.cos(a) * t * t * lean - Math.sin(a) * side * width,
          t * height - Math.abs(side) * width * 0.25,
          rootZ + Math.sin(a) * t * t * lean + Math.cos(a) * side * width];
      };
      for (let segment = 0; segment < 5; segment++) {
        const t = segment / 5, next = (segment + 1) / 5;
        const a0 = point(t, -1), b = point(t, 1), d = point(next, -1), e = point(next, 1);
        color.copy(low).lerp(high, 0.2 + t * 0.8);
        for (const v of [a0, b, d, b, e, d]) {
          positions.push(...v);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    // A grama NÃO entra no sistema de oclusão (perf A1: 62k tufos não varrem por frame).
    // Por isso NÃO pode usar `fadeMaterial`: sem `registerInstancedFade`, o atributo
    // `aFade` nunca é criado → o shader de fade multiplica o alfa por 0 → as lâminas
    // SOMEM (só a sombra fica, que não passa pelo fade). Material SIMPLES + vento = visível.
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, side: THREE.DoubleSide });
    const time = { value: 0 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uCoverTime'] = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCoverTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float phase = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4;
          transformed.x += sin(uCoverTime * 1.4 + phase + position.y) * position.y * position.y * 0.07;`);
    };
    material.customProgramCacheKey = () => 'ground-cover-wind-v2';
    return { geometry, material, time };
  }, [c, tintKey]);
  useFrame(({ clock }) => { assets.time.value = clock.elapsedTime; });
  useEffect(() => () => { assets.geometry.dispose(); assets.material.dispose(); }, [assets]);
  // Fatiamento espacial: um InstancedMesh ÚNICO de 62k tufos tem culling tudo-ou-nada —
  // a câmera vendo ~1/4 do mapa renderiza os 62k mesmo assim. Partiçiona em tiles de ~16 m;
  // cada tile vira um ForestBatch com sua própria boundingSphere (frustumCulled já ligado no
  // InstancedMesh), então o three descarta os tiles fora do frustum. Geometria/material são os
  // MESMOS objetos em todos os tiles (construídos uma vez acima) — só o agrupamento muda.
  const tiles = useMemo(() => {
    const TILE = 16;
    const groups = new Map<string, ForestPlacement[]>();
    for (const p of placements) {
      const key = `${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`;
      const list = groups.get(key);
      if (list) list.push(p); else groups.set(key, [p]);
    }
    return [...groups].map(([key, list]) => ({ key, list }));
  }, [placements]);
  return <>{tiles.map(({ key, list }) => (
    <ForestBatch key={key} geometry={assets.geometry} material={assets.material} placements={list} spheres={spheres} castShadow={false} />
  ))}</>;
}
