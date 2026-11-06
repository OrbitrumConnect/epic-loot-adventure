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
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { requestLight } from '@/components/world/light-pool';
import type { ZsTerrain } from './zs-terrain-data';
import { CAVE_ABYSS, CAVE_LAIR, CAVE_ROOMS, type CaveDecor, type CaveTile, LAIR_SKY, caveDecor, caveField, caveFloorAt, caveMeshJob, caveMouthRocks, cavePools, lairCeilingY } from './zs-cave';
/** Até onde (m) da câmera um pedaço da caverna desenha (02/11 noite: a caverna cresceu — abismo + galeria grande). */
export const CAVE_TILE_DRAW_M = 260;
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
/** a brasa do covil do Canibal (04/11) */
const LAIR_LIGHT = new THREE.Color('#ff7a3a');
/** a luz do dia da CLARABOIA do covil (06/11) */
const SKY_LIGHT = new THREE.Color(LAIR_SKY.color);
/** degradê pra boca da claraboia (radial: claro no meio, some na borda) */
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** CLARABOIA DO COVIL (06/11, ver LAIR_SKY): a boca clara no teto + o facho de luz até o chão (2 malhas, ~100 triângulos) */
function makeLairSky(): { g: THREE.Group; ceil: number; dispose: () => void } {
  const lr = CAVE_LAIR, ceil = lairCeilingY(), H = ceil - lr.floor;
  const discTex = skyTexture();
  const discGeo = new THREE.CircleGeometry(LAIR_SKY.r * 1.6, 40);
  discGeo.rotateX(Math.PI / 2); // virada pra BAIXO (quem vê é quem está no chão)
  const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ map: discTex, color: LAIR_SKY.color, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  disc.position.set(lr.x, ceil - 1.2, lr.z);
  const beamGeo = new THREE.CylinderGeometry(LAIR_SKY.r, LAIR_SKY.beamR, H, 28, 1, true);
  // facho: some nas BORDAS (de lado o cilindro vira só a luz do meio — sem a linha reta) e embaixo (chega fraco no chão)
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(LAIR_SKY.color) }, uOpacity: { value: LAIR_SKY.beam } },
    vertexShader: 'varying float vF; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); vY = uv.y; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vF; varying float vY; void main() { float a = uOpacity * vF * vF * vY * (0.4 + 0.6 * vY); gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(lr.x, lr.floor + H / 2, lr.z);
  beam.renderOrder = 3;
  const g = new THREE.Group(); g.add(disc, beam); g.visible = false;
  return { g, ceil, dispose: () => { discGeo.dispose(); beamGeo.dispose(); (disc.material as THREE.Material).dispose(); beamMat.dispose(); discTex.dispose(); } };
}
/** CRISTAIS (31/10, Pedro: "temos o nosso cristal azulado já resolvido em GLB… sem perder performance"): a FORMA do
 *  cristal do jogo (models/crystal/crystal.glb, 92 mil tri) numa versão de 798 tri / 12 KB (tools/zona-sul/cave-crystal-glb.mjs),
 *  facetada, brilhando na cor de cada um (azul/violeta). Só os a até CRYSTAL_DRAW_M do herói desenham (lista refeita 4×/s). */
const CRYSTAL_URL = '/models/crystal/crystal-cave.glb', CRYSTAL_DRAW_M = 55;
function crystalMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#d6ecff', roughness: 0.22, metalness: 0.15, emissive: '#ffffff', emissiveIntensity: 0.55, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'zs-cave-crystal-v1';
  return m;
}
function CaveCrystals({ list, heroRef }: { list: CaveDecor[]; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const { scene } = useGLTF(CRYSTAL_URL);
  const geo = useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      parts.push(g);
    });
    const g = parts.length > 1 ? mergeGeometries(parts)! : parts[0] ?? new THREE.OctahedronGeometry(0.5, 0);
    g.computeBoundingBox();
    const b = g.boundingBox!, h = b.max.y - b.min.y || 1;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.scale(1 / h, 1 / h, 1 / h);
    return g;
  }, [scene]);
  const mat = useMemo(() => crystalMaterial(), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const mesh = useRef<THREE.InstancedMesh>(null), acc = useRef(1);
  const { gl, camera, scene: world } = useThree();
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    for (let i = 0; i < list.length; i++) m.setColorAt(i, tmpC.copy(CRYSTAL_A).lerp(CRYSTAL_B, (i * 0.37) % 1)); // a cor existe antes de compilar
    m.count = 0;
    void gl.compileAsync(m, camera, world).catch(() => {});
  }, [list, gl, camera, world]);
  useFrame((_, dt) => {
    const m = mesh.current; if (!m) return;
    if (!zsCave.near) { m.count = 0; return; }
    acc.current += dt; if (acc.current < 0.25) return; acc.current = 0;
    const h = heroRef.current, r2 = CRYSTAL_DRAW_M * CRYSTAL_DRAW_M;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i]!;
      if ((d.x - h.x) ** 2 + (d.z - h.z) ** 2 > r2) continue;
      tmpQ.setFromEuler(tmpE.set(d.tilt, d.yaw, d.tilt * 0.6));
      m.setMatrixAt(n, tmpM.compose(tmpP.set(d.x, d.y, d.z), tmpQ, tmpS.setScalar(d.s * 1.25)));
      m.setColorAt(n, tmpC.copy(CRYSTAL_A).lerp(CRYSTAL_B, (i * 0.37) % 1));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, Math.max(1, list.length)]} frustumCulled={false} />;
}
useGLTF.preload(CRYSTAL_URL);

/** PEDRAS EM VOLTA DA BOCA (02/11 noite, Pedro: "a boca média, pedras rodeando — fica legal"): um desenho só (instâncias),
 *  rocha facetada no tom da encosta, meio enterradas. Na superfície (some no fundo da caverna junto com ela). */
export function ZsCaveMouthRocks({ t }: { t: ZsTerrain }) {
  const list = useMemo(() => caveMouthRocks(t), [t]);
  const geo = useMemo(() => new THREE.DodecahedronGeometry(0.5, 0), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.36, 0.34, 0.31), roughness: 0.95, flatShading: true }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = mesh.current; if (!m) return;
    list.forEach((r, i) => {
      tmpQ.setFromEuler(tmpE.set(0.25 * Math.sin(r.yaw * 3), r.yaw, 0.2 * Math.cos(r.yaw * 2)));
      m.setMatrixAt(i, tmpM.compose(tmpP.set(r.x, r.y, r.z), tmpQ, tmpS.set(r.s * 1.25, r.s * 0.85, r.s)));
    });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return <instancedMesh ref={mesh} args={[geo, mat, list.length]} castShadow receiveShadow />;
}

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
    const stem = new THREE.CylinderGeometry(0.09, 0.13, 0.7, 6); stem.translate(0, 0.35, 0);
    const cap = new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 0.66, 0);
    const paint = (g: THREE.BufferGeometry, c: THREE.Color) => { const n = g.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const mush = mergeGeometries([paint(stem.toNonIndexed(), new THREE.Color('#6b5d4a')), paint(cap.toNonIndexed(), new THREE.Color('#ff8a3a'))])!;
    // poças: discos (elipse) na altura da lâmina
    const pools = mergeGeometries(cavePools().map((p) => { const d = new THREE.CircleGeometry(1, 28); d.rotateX(-Math.PI / 2); d.scale(p.rx, 1, p.rz); d.rotateY(-p.yaw); d.translate(p.x, p.y, p.z); return d; }))!;
    return { down, up, mush, pools };
  }, []);
  useEffect(() => () => { for (const g of Object.values(geo)) g.dispose(); }, [geo]);
  const mats = useMemo(() => ({
    // mesmo tom (linear) da rocha das paredes + um fio de brilho próprio (não vira silhueta preta longe da lanterna)
    rock: new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.42, 0.39, 0.35), roughness: 0.95, emissive: new THREE.Color().setRGB(0.03, 0.028, 0.025) }),
    mush: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: '#1d5662', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.84, emissive: new THREE.Color('#0b2d34'), emissiveIntensity: 0.7 }),
  }), []);
  useEffect(() => () => { for (const m of Object.values(mats)) m.dispose(); }, [mats]);
  const refs = { stalactite: useRef<THREE.InstancedMesh>(null), stalagmite: useRef<THREE.InstancedMesh>(null), mushroom: useRef<THREE.InstancedMesh>(null) };
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
    put(refs.mushroom.current, kinds.mushroom, (d) => [d.s, d.s * 1.2, d.s]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds]);

  // luzes dos cristais (centro de cada grupinho) e do salão do chefe
  const glowSpots = useMemo(() => {
    const out: { x: number; y: number; z: number; c: THREE.Color; i: number; d: number }[] = [];
    for (const d of kinds.crystal) out.push({ x: d.x, y: d.y + 1.2, z: d.z, c: CRYSTAL_LIGHT, i: 3.2, d: 11 });
    const boss = CAVE_ROOMS.find((r) => r.id === 'chefe')!;
    out.push({ x: boss.x, y: boss.y + 6, z: boss.z, c: FUNGUS_LIGHT, i: 9, d: 34 });
    return out;
  }, [kinds]);
  const water = useRef<THREE.Mesh>(null);
  // CLARABOIA do covil (06/11): a boca clara + o facho — só com o herói no fundo do covil
  const sky = useMemo(() => makeLairSky(), []);
  useEffect(() => () => sky.dispose(), [sky]);

  useFrame((state) => {
    const near = zsCave.near;
    caveUniforms.uInside.value = zsCave.dark;
    // 02/11 noite (abismo + galeria grande: a malha foi de 80 → 143 mil triângulos): só os pedaços a até CAVE_TILE_DRAW_M
    // da câmera desenham (de mais longe a rocha esconde) — o desenhado fica MENOR que antes (máx. ~49 mil × 80 mil)
    const cam = state.camera.position;
    for (let i = 0; i < geos.length; i++) {
      const tl = tiles![i]!;
      // 04/11: os pedaços do COVIL do Canibal (`deep`) só com o herói no fundo (a superfície some) — de fora nunca aparecem
      geos[i]!.setDrawRange(0, near && Math.hypot(tl.cx - cam.x, tl.cz - cam.z) < CAVE_TILE_DRAW_M && (!tl.deep || zsCave.deep) ? Infinity : 0);
    }
    water.current?.geometry.setDrawRange(0, near ? Infinity : 0);
    for (const k of ['stalactite', 'stalagmite', 'mushroom'] as const) { const m = refs[k].current; if (m) m.count = near ? kinds[k].length : 0; }
    sky.g.visible = false;
    if (!near) return;
    // lanterna do herói (fundo) + os 3 cristais mais perto + o fogo-fátuo do salão do chefe — o POOL escolhe os mais perto
    const h = heroRef.current;
    if (zsCave.dark > 0.12) requestLight(h.x, h.y + 1.6, h.z, LANTERN, 7.5 * zsCave.dark, 21, 1.4);
    if (zsCave.inCave) {
      // ABISMO (02/11 noite): a luz grande do fundo do poço (de cima se vê o fundo) — e só 1 cristal, pra ela ter a vaga
      const ab = CAVE_ABYSS, inAbyss = Math.hypot(h.x - ab.x, h.z - ab.z) < ab.near;
      if (inAbyss) requestLight(ab.light.x, ab.light.y, ab.light.z, CRYSTAL_LIGHT, ab.light.i, ab.light.d, 1.2);
      // COVIL DO CANIBAL (04/11): a brasa grande da arena (do balcão se vê o fundo) — também tira vagas de cristal
      const lr = CAVE_LAIR, inLair = Math.hypot(h.x - lr.x, h.z - lr.z) < lr.near;
      if (inLair) requestLight(lr.light.x, lr.light.y, lr.light.z, LAIR_LIGHT, lr.light.i, lr.light.d, 1.2);
      // CLARABOIA (06/11): a luz do dia lá do alto (fica no pool como as outras — sem luz nova) + a boca e o facho
      if (inLair && zsCave.deep) {
        requestLight(lr.x, sky.ceil - LAIR_SKY.light.below, lr.z, SKY_LIGHT, LAIR_SKY.light.i, LAIR_SKY.light.d, LAIR_SKY.light.decay);
        sky.g.visible = true;
      }
      let n = 0;
      for (const s of glowSpots) { s.d = (s.x - h.x) ** 2 + (s.z - h.z) ** 2; }
      const sorted = glowSpots.filter((s) => s.d < 45 * 45).sort((a, b) => a.d - b.d);
      for (const s of sorted) { if (n++ >= (inAbyss || inLair ? 1 : 3)) break; requestLight(s.x, s.y, s.z, s.c, s.i, s.c === FUNGUS_LIGHT ? 34 : 11, 1.6); }
    }
  });

  return (
    <group ref={group}>
      {geos.map((g, i) => <mesh key={tiles![i]!.key} geometry={g} material={material} />)}
      <mesh ref={water} geometry={geo.pools} material={mats.water} renderOrder={1} />
      <primitive object={sky.g} />
      <instancedMesh ref={refs.stalactite} args={[geo.down, mats.rock, Math.max(1, kinds.stalactite.length)]} />
      <instancedMesh ref={refs.stalagmite} args={[geo.up, mats.rock, Math.max(1, kinds.stalagmite.length)]} />
      {/* o NOSSO cristal azulado (forma do models/crystal, versão leve) — só os perto desenham */}
      <Suspense fallback={null}><CaveCrystals list={kinds.crystal} heroRef={heroRef} /></Suspense>
      <instancedMesh ref={refs.mushroom} args={[geo.mush, mats.mush, Math.max(1, kinds.mushroom.length)]} />
    </group>
  );
}
