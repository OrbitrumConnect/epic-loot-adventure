/**
 * ZONA SUL — GRAMA LEVE (02/11, Pedro: "grama leve nas áreas verdes — só perto do herói, sem perder FPS"). O mesmo tufo
 * do Vale (`ground-cover.tsx`: lâminas curvas, raiz escura → ponta clara, vento no shader, material SIMPLES — o de
 * "fade" fazia a grama sumir, 21/10), em versão leve (8 lâminas, 48 triângulos) e só num raio em volta do herói:
 *  - no VERDE aberto (campo/baixada) cheio; na MATA bem mais ralo (sombra); nada na pista, areia, água, paredão
 *    (> 32°), boca da caverna nem dentro de base;
 *  - posição fixa por célula do mundo (sempre o mesmo tufo no mesmo lugar) — refaz só quando o herói muda de célula;
 *  - cor = a do CHÃO daquela célula (a mesma conta que pinta o terreno), um pouco mais viva;
 *  - na borda do raio o tufo encolhe até sumir (sem "anel");
 *  - celular: raio menor.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ZS_SURF } from './zona-sul-meta';
import { type ZsTerrain, zsHash, zsHeightAt, zsSlopeDeg, zsSurfAt, ZS_WATER_Y } from './zs-terrain-data';
import { zsGroundColor } from './zs-terrain-mesh';
import { caveMouthClear } from './zs-cave';
import { baseBoxes } from './zs-vegetation';
import { useGameStore } from '@/game/state/game-store';
import { useNet } from '@/net/multiplayer';

export const ZS_GRASS = {
  /** raio (m) em volta do herói; celular menor */
  R: 40, R_MOBILE: 26,
  /** célula (m) do sorteio fixo; candidatos por célula: verde aberto / mata */
  CELL: 6, PER_CELL: 9, PER_CELL_MATA: 3,
  /** tamanho do tufo (escala do modelo de ~0,35–0,95 m) */
  SCALE: [1.1, 1.8] as const,
  /** teto de tufos */
  CAP: 2600,
} as const;

export type ZsGrassTuft = { x: number; y: number; z: number; s: number; yaw: number; i: number; j: number };

/** Tufos em volta de (hx, hz). Puro (testável): mesma célula + mesmo terreno = mesmos tufos. */
export function zsGrassAround(t: ZsTerrain, hx: number, hz: number, R: number = ZS_GRASS.R, boxes: number[][] = []): ZsGrassTuft[] {
  const out: ZsGrassTuft[] = [];
  const C = ZS_GRASS.CELL, c0x = Math.floor((hx - R) / C), c1x = Math.floor((hx + R) / C), c0z = Math.floor((hz - R) / C), c1z = Math.floor((hz + R) / C);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    for (let k = 0; k < ZS_GRASS.PER_CELL && out.length < ZS_GRASS.CAP; k++) {
      const x = (cx + zsHash(cx, cz, 200 + k * 3)) * C, z = (cz + zsHash(cx, cz, 201 + k * 3)) * C;
      const d = Math.hypot(x - hx, z - hz);
      if (d > R) continue;
      const s = zsSurfAt(t, x, z);
      if (s !== ZS_SURF.land && s !== ZS_SURF.forest) continue;                 // pista, areia, água: nada
      if (s === ZS_SURF.forest && k >= ZS_GRASS.PER_CELL_MATA) continue;          // mata: ralo
      const y = zsHeightAt(t, x, z);
      if (y < ZS_WATER_Y + 0.2 || zsSlopeDeg(t, x, z) > 32 || !caveMouthClear(x, z)) continue;
      if (boxes.length && boxes.some((b) => x > b[0]! && x < b[2]! && z > b[1]! && z < b[3]!)) continue;
      const edge = Math.min(1, Math.max(0, (R - d) / (R * 0.3)));                 // encolhe na borda do raio
      const sz = (ZS_GRASS.SCALE[0] + (ZS_GRASS.SCALE[1] - ZS_GRASS.SCALE[0]) * zsHash(cx, cz, 202 + k * 3)) * (0.25 + 0.75 * edge * edge * (3 - 2 * edge));
      out.push({ x, y, z, s: sz, yaw: zsHash(cx, cz, 230 + k) * Math.PI * 2, i: Math.round((x - t.x0) / t.cell), j: Math.round((z - t.z0) / t.cell) });
    }
  }
  return out;
}

/** O tufo leve: 8 lâminas curvas de 3 trechos (48 triângulos), cinza de raiz escura → ponta clara (a cor vem do chão). */
export function zsGrassTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], shade: number[] = [];
  const r = (n: number) => zsHash(n, 7, 13);
  for (let blade = 0; blade < 8; blade++) {
    const a = blade * 2.39996, rootR = r(blade + 51) * 0.18, rx = Math.cos(a) * rootR, rz = Math.sin(a) * rootR;
    const height = 0.35 + r(blade + 17) * 0.6, lean = 0.12 + r(blade + 31) * 0.32, w0 = 0.028 + r(blade + 8) * 0.026;
    const point = (t: number, side: number) => {
      const width = (1 - t) * w0;
      return [rx + Math.cos(a) * t * t * lean - Math.sin(a) * side * width, t * height - Math.abs(side) * width * 0.25, rz + Math.sin(a) * t * t * lean + Math.cos(a) * side * width];
    };
    for (let seg = 0; seg < 3; seg++) {
      const t0 = seg / 3, t1 = (seg + 1) / 3, a0 = point(t0, -1), b0 = point(t0, 1), a1 = point(t1, -1), b1 = point(t1, 1);
      const g0 = 0.72 + t0 * 0.5, g1 = 0.72 + t1 * 0.5;
      for (const [v, g] of [[a0, g0], [b0, g0], [a1, g1], [b0, g0], [b1, g1], [a1, g1]] as const) { positions.push(...v); shade.push(g, g, g); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3));
  g.computeVertexNormals();
  return g;
}

export function ZsGrass({ t, heroRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const mobile = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const R = mobile ? ZS_GRASS.R_MOBILE : ZS_GRASS.R;
  const { mesh, time } = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, side: THREE.DoubleSide });
    const time = { value: 0 };
    material.onBeforeCompile = (shader) => { // vento (o mesmo do Vale)
      shader.uniforms['uCoverTime'] = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCoverTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float phase = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4;
          transformed.x += sin(uCoverTime * 1.4 + phase + position.y) * position.y * position.y * 0.07;`);
    };
    material.customProgramCacheKey = () => 'zs-grass-wind-v1';
    const mesh = new THREE.InstancedMesh(zsGrassTuftGeometry(), material, ZS_GRASS.CAP);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // cria a cor por instância
    return { mesh, time };
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }, [mesh]);
  const last = useRef(''), dummy = useMemo(() => new THREE.Object3D(), []), col = useMemo(() => new THREE.Color(), []);
  const bases = useRef<{ pb: unknown; nb: unknown; boxes: number[][] }>({ pb: undefined, nb: undefined, boxes: [] });
  useFrame(({ clock }) => {
    time.value = clock.elapsedTime;
    const hx = heroRef.current.x, hz = heroRef.current.z;
    const pb = useGameStore.getState().playerBase, nb = useNet.getState().bases;
    if (pb !== bases.current.pb || nb !== bases.current.nb) { bases.current = { pb, nb, boxes: baseBoxes(pb, nb) }; last.current = ''; }
    const key = `${Math.floor(hx / ZS_GRASS.CELL)}_${Math.floor(hz / ZS_GRASS.CELL)}`;
    if (key === last.current) return;
    last.current = key;
    const tufts = zsGrassAround(t, hx, hz, R, bases.current.boxes);
    for (let n = 0; n < tufts.length; n++) {
      const g = tufts[n]!;
      dummy.position.set(g.x, g.y - 0.04, g.z); dummy.rotation.set(0, g.yaw, 0); dummy.scale.setScalar(g.s);
      dummy.updateMatrix(); mesh.setMatrixAt(n, dummy.matrix);
      zsGroundColor(t, g.i, g.j, col);
      col.setRGB(col.r * 1.02, Math.min(1, col.g * 1.16), col.b * 0.92); // um pouco mais viva/verde que o chão
      mesh.setColorAt(n, col);
    }
    mesh.count = tufts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}
