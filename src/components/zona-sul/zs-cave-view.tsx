/**
 * DESENHO DA CAVERNA (30/10). A malha sai da mesma função que o herói pisa (`zs-cave.ts`), montada num Worker (fora da
 * thread do jogo; sem Worker, aos poucos entre quadros). Leve:
 *  - ~40 pedaços (cada um no seu quadro de visão), 1 material; longe das bocas não desenha nada (contagem 0 — o shader
 *    continua compilado, entrar não trava);
 *  - a rocha de dentro só recebe a luz de fora perto da boca (`aOut`): de fora o túnel é um buraco escuro; dentro, a
 *    lanterna do herói e os cristais acendem as paredes;
 *  - em cima da encosta (bocas) a rocha some acima do chão do mapa (`aTop`) — o buraco fica limpo;
 *  - poças d'água, estalactites/estalagmites, cristais e cogumelos (salão do chefe): instâncias, 1 desenho cada.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { requestLight } from '@/components/world/light-pool';
import type { ZsTerrain } from './zs-terrain-data';
import { CAVE_ROOMS, type CaveTile, caveDecor, caveField, caveFloorAt, caveMeshJob, cavePools } from './zs-cave';
import { zsCave } from './zs-context';

const caveUniforms = { uInside: { value: 0 }, uGlow: { value: 0.06 } };

function caveMaterial(): THREE.MeshStandardMaterial {
  // polygonOffset: onde a caverna encosta no chão do mapa (borda da boca), o chão do mapa ganha (sem piscar)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, caveUniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTop;\nattribute float aOut;\nvarying float vCaveY;\nvarying float vTop;\nvarying float vOut;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCaveY = (modelMatrix * vec4(position, 1.0)).y;\nvTop = aTop;\nvOut = aOut;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCaveY;\nvarying float vTop;\nvarying float vOut;\nuniform float uInside;\nuniform float uGlow;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vCaveY > vTop + 0.05) discard; // acima da encosta: céu aberto da boca')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(vOut, 1.0, uInside); // de fora: fundo escuro')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uGlow * uInside;');
  };
  m.customProgramCacheKey = () => 'zs-cave-v1';
  return m;
}

function tileGeometry(t: CaveTile): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(t.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(t.col, 3));
  g.setAttribute('aTop', new THREE.BufferAttribute(t.top, 1));
  g.setAttribute('aOut', new THREE.BufferAttribute(t.out, 1));
  g.setIndex(new THREE.BufferAttribute(t.idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Monta os pedaços: Worker; sem ele, aos poucos (≤ 6 ms por fatia). */
function useCaveTiles(t: ZsTerrain): CaveTile[] | null {
  const [tiles, setTiles] = useState<CaveTile[] | null>(null);
  useEffect(() => {
    let alive = true, worker: Worker | null = null, timer = 0;
    const fallback = () => {
      void import('three/addons/objects/MarchingCubes.js').then(({ triTable }) => {
        if (!alive) return;
        const job = caveMeshJob(triTable);
        const slice = () => {
          if (!alive) return;
          const t0 = performance.now();
          let r = job.next();
          while (!r.done && performance.now() - t0 < 6) r = job.next();
          if (r.done) setTiles(r.value); else timer = window.setTimeout(slice, 16);
        };
        slice();
      });
    };
    try {
      worker = new Worker(new URL('./zs-cave-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<CaveTile[]>) => { if (alive) setTiles(e.data); worker?.terminate(); worker = null; };
      worker.onerror = () => { worker?.terminate(); worker = null; if (alive) fallback(); };
      worker.postMessage({ heights: t.heights.slice(), w: t.w, h: t.h, cell: t.cell, x0: t.x0, z0: t.z0 });
    } catch { fallback(); }
    return () => { alive = false; worker?.terminate(); window.clearTimeout(timer); };
  }, [t]);
  return tiles;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
const CRYSTAL_A = new THREE.Color('#7fe8ff'), CRYSTAL_B = new THREE.Color('#c79bff'), tmpC = new THREE.Color();
const LANTERN = new THREE.Color('#ffcf9a'), CRYSTAL_LIGHT = new THREE.Color('#8fd8ff'), FUNGUS_LIGHT = new THREE.Color('#ff9a4a');
/** Distância (m) da boca em que a caverna começa a desenhar. */
const DRAW_NEAR = 170;

export function ZsCave({ t, heroRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const tiles = useCaveTiles(t);
  // só em desenvolvimento: os testes de tela leem a caverna (o jogo publicado não expõe nada)
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __zsCave?: unknown }).__zsCave = { tiles: tiles?.length ?? 0, state: zsCave, floor: caveFloorAt, field: caveField, rooms: CAVE_ROOMS }; }, [tiles]);
  const material = useMemo(() => caveMaterial(), []);
  const geos = useMemo(() => tiles?.map(tileGeometry) ?? [], [tiles]);
  useEffect(() => () => { for (const g of geos) g.dispose(); }, [geos]);
  useEffect(() => () => material.dispose(), [material]);
  const group = useRef<THREE.Group>(null);
  const { gl, camera, scene } = useThree();
  // compila o material assim que os pedaços chegam (entrar na caverna não trava)
  useEffect(() => { if (geos.length && group.current) void gl.compileAsync(group.current, camera, scene).catch(() => {}); }, [geos, gl, camera, scene]);

  // enfeites (instâncias)
  const decor = useMemo(() => caveDecor(), []);
  const kinds = useMemo(() => ({
    stalactite: decor.filter((d) => d.kind === 'stalactite'), stalagmite: decor.filter((d) => d.kind === 'stalagmite'),
    crystal: decor.filter((d) => d.kind === 'crystal'), mushroom: decor.filter((d) => d.kind === 'mushroom'),
  }), [decor]);
  const geo = useMemo(() => {
    const down = new THREE.ConeGeometry(0.5, 1, 7, 1, true); down.rotateX(Math.PI); down.translate(0, -0.5, 0);
    const up = new THREE.ConeGeometry(0.5, 1, 7, 1, true); up.translate(0, 0.5, 0);
    const crystal = new THREE.OctahedronGeometry(0.5, 0); crystal.translate(0, 0.45, 0);
    const stem = new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6); stem.translate(0, 0.35, 0);
    const cap = new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 0.66, 0);
    const paint = (g: THREE.BufferGeometry, c: THREE.Color) => { const n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const mush = mergeGeometries([paint(stem.toNonIndexed(), new THREE.Color('#6b5d4a')), paint(cap.toNonIndexed(), new THREE.Color('#ff8a3a'))])!;
    // poças: discos (elipse) na altura da lâmina
    const pools = mergeGeometries(cavePools().map((p) => { const d = new THREE.CircleGeometry(1, 28); d.rotateX(-Math.PI / 2); d.scale(p.rx, 1, p.rz); d.rotateY(-p.yaw); d.translate(p.x, p.y, p.z); return d; }))!;
    return { down, up, crystal, mush, pools };
  }, []);
  useEffect(() => () => { for (const g of Object.values(geo)) g.dispose(); }, [geo]);
  const mats = useMemo(() => ({
    // mesmo tom (linear) da rocha das paredes + um fio de brilho próprio (não vira silhueta preta longe da lanterna)
    rock: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.42, 0.39, 0.35), roughness: 0.95, emissive: new THREE.Color().setRGB(0.03, 0.028, 0.025) }),
    crystal: new THREE.MeshBasicMaterial({ toneMapped: false }),
    mush: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: '#1d5662', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.84, emissive: new THREE.Color('#0b2d34'), emissiveIntensity: 0.7 }),
  }), []);
  useEffect(() => () => { for (const m of Object.values(mats)) m.dispose(); }, [mats]);
  const refs = { stalactite: useRef<THREE.InstancedMesh>(null), stalagmite: useRef<THREE.InstancedMesh>(null), crystal: useRef<THREE.InstancedMesh>(null), mushroom: useRef<THREE.InstancedMesh>(null) };
  useEffect(() => {
    const put = (m: THREE.InstancedMesh | null, list: typeof decor, scale: (d: (typeof decor)[number]) => [number, number, number], color?: (i: number) => THREE.Color) => {
      if (!m) return;
      list.forEach((d, i) => {
        tmpQ.setFromEuler(tmpE.set(d.tilt, d.yaw, d.tilt * 0.6));
        const [sx, sy, sz] = scale(d);
        m.setMatrixAt(i, tmpM.compose(tmpP.set(d.x, d.y, d.z), tmpQ, tmpS.set(sx, sy, sz)));
        if (color) m.setColorAt(i, color(i));
      });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    };
    put(refs.stalactite.current, kinds.stalactite, (d) => [d.s * 0.7, d.s * 2.6, d.s * 0.7]);
    put(refs.stalagmite.current, kinds.stalagmite, (d) => [d.s * 0.8, d.s * 2, d.s * 0.8]);
    put(refs.crystal.current, kinds.crystal, (d) => [d.s * 0.36, d.s * 1.7, d.s * 0.36], (i) => tmpC.copy(CRYSTAL_A).lerp(CRYSTAL_B, (i * 0.37) % 1));
    put(refs.mushroom.current, kinds.mushroom, (d) => [d.s, d.s * 1.2, d.s]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds]);

  // luzes dos cristais (centro de cada grupinho) e do salão do chefe
  const glowSpots = useMemo(() => {
    const out: { x: number; y: number; z: number; c: THREE.Color; i: number; d: number }[] = [];
    for (let k = 0; k < kinds.crystal.length; k += 3) { const d = kinds.crystal[k]!; out.push({ x: d.x, y: d.y + 1.2, z: d.z, c: CRYSTAL_LIGHT, i: 3.2, d: 11 }); }
    const boss = CAVE_ROOMS.find((r) => r.id === 'chefe')!;
    out.push({ x: boss.x, y: boss.y + 6, z: boss.z, c: FUNGUS_LIGHT, i: 9, d: 34 });
    return out;
  }, [kinds]);
  const water = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const near = zsCave.near;
    caveUniforms.uInside.value = zsCave.dark;
    for (const g of geos) g.setDrawRange(0, near ? Infinity : 0);
    water.current?.geometry.setDrawRange(0, near ? Infinity : 0);
    for (const k of ['stalactite', 'stalagmite', 'crystal', 'mushroom'] as const) { const m = refs[k].current; if (m) m.count = near ? kinds[k].length : 0; }
    if (!near) return;
    // lanterna do herói (fundo) + os 3 cristais mais perto + o fogo-fátuo do salão do chefe — o POOL escolhe os mais perto
    const h = heroRef.current;
    if (zsCave.dark > 0.12) requestLight(h.x, h.y + 1.6, h.z, LANTERN, 7.5 * zsCave.dark, 21, 1.4);
    if (zsCave.inCave) {
      let n = 0;
      for (const s of glowSpots) { s.d = (s.x - h.x) ** 2 + (s.z - h.z) ** 2; }
      const sorted = glowSpots.filter((s) => s.d < 45 * 45).sort((a, b) => a.d - b.d);
      for (const s of sorted) { if (n++ >= 3) break; requestLight(s.x, s.y, s.z, s.c, s.i, s.c === FUNGUS_LIGHT ? 34 : 11, 1.6); }
    }
  });

  return (
    <group ref={group}>
      {geos.map((g, i) => <mesh key={tiles![i]!.key} geometry={g} material={material} />)}
      <mesh ref={water} geometry={geo.pools} material={mats.water} renderOrder={1} />
      <instancedMesh ref={refs.stalactite} args={[geo.down, mats.rock, Math.max(1, kinds.stalactite.length)]} />
      <instancedMesh ref={refs.stalagmite} args={[geo.up, mats.rock, Math.max(1, kinds.stalagmite.length)]} />
      <instancedMesh ref={refs.crystal} args={[geo.crystal, mats.crystal, Math.max(1, kinds.crystal.length)]} />
      <instancedMesh ref={refs.mushroom} args={[geo.mush, mats.mush, Math.max(1, kinds.mushroom.length)]} />
    </group>
  );
}
