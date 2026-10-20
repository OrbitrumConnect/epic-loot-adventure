/**
 * Vegetação e props do mundo como BILLBOARDS de sprite (fase 3 — arte no mundo).
 *
 * Troca as árvores/pedras/grama/detritos construídos com primitivas pelos
 * sprites cel-shaded de `public/assets/style/{flora,terrain}`. Cada espécie de
 * sprite vira UM `instancedMesh` (uma chamada de desenho) com geometria própria
 * (quad) e material compartilhado — centenas de itens continuam baratos.
 *
 * Billboard preso ao eixo Y (o quad gira em torno do próprio eixo vertical pra
 * encarar a câmera, mas fica SEMPRE em pé): na câmera isométrica um quad
 * totalmente voltado pra câmera deitaria e leria errado. A rotação é feita no
 * VERTEX SHADER (zero CPU por quadro): lê a posição/escala da instância do
 * `instanceMatrix` e monta o quad orientado pela `cameraPosition`. O corte do
 * alfa é por `alphaTest` (não blending), então os sprites ordenam certo entre
 * si e contra o terreno e ESCREVEM profundidade — o contorno por profundidade
 * do filtro cel pega a silhueta de graça.
 *
 * Material `MeshBasicMaterial` (não iluminado): os sprites já vêm cel-shaded, e
 * um quad plano iluminado pela luz direcional ficaria escuro (normal horizontal).
 * O ciclo dia/noite entra como um tint uniforme no `color` do material, uma
 * escrita por quadro em um punhado de materiais (sem re-render).
 *
 * Oclusão: árvores e pedras altas podem esconder o jogador na vista isométrica.
 * O mesmo `registerInstancedFade` dos nós de colheita alimenta um atributo
 * `aFade` por instância; aqui ele vira um descarte "tela de porta" (dither) no
 * shader em vez de blending, pra não quebrar a ordenação opaca.
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { nightFactor } from '@/game/systems/dayNightSystem';
import { registerInstancedFade, type FadeSphere } from './occlusion';
import { LAKE_CENTERS, MAP_HALF, rand, terrainHeight, type Palette } from './world-kit';
import { glbSurfaceY, surfaceColorAt, useTerrainVersion } from './terrain-collision';
import { ForestRocks, ForestTrees } from './forest-models';
import { LivingTrees } from './living-trees';
import { GroundCover } from './ground-cover';

/* ------------------------------------------------------------------ *
 * Vento seco e discreto — ajuste amplitude e speed (radianos/segundo)
 * aqui. Base fixa; deslocamento cresce até o topo.
 * Perfis viram constantes GLSL, sem uniforms/atributos por instância.
 *
 * `amplitude` é FRAÇÃO DA ALTURA da instância, não unidade de mundo: as
 * alturas variam de 0.45 (tufo de grama) a 6.2 (pinheiro), então um valor
 * absoluto que lê bem na grama some na árvore. Com 0.025 absoluto o topo
 * de um pinheiro de 6.2 andava 0.4% da própria altura — sub-pixel na tela.
 * ------------------------------------------------------------------ */
const WIND = {
  grass: { amplitude: 0.1, speed: 1.6 },
  bush: { amplitude: 0.045, speed: 1.2 },
  tree: { amplitude: 0.018, speed: 0.65 },
} as const;
type WindProfile = keyof typeof WIND;

/* ------------------------------------------------------------------ *
 * Texturas (cache por url; carrega assíncrono, o objeto existe já)
 * ------------------------------------------------------------------ */
const _loader = new THREE.TextureLoader();
const _texCache = new Map<string, THREE.Texture>();

function spriteTex(url: string): THREE.Texture {
  let t = _texCache.get(url);
  if (!t) {
    t = _loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    _texCache.set(url, t);
  }
  return t;
}

const FLORA = {
  pine: 'tree-pine',
  broad: 'tree-broad',
  dead: 'tree-dead',
  bush: 'bush',
} as const;
const TERRAIN = {
  rockLarge: 'rock-large',
  rockSmall: 'rock-small',
  grass: 'grass-tuft',
  debris: 'debris',
} as const;

const floraUrl = (name: string) => `/assets/style/flora/${name}.webp`;
const terrainUrl = (name: string) => `/assets/style/terrain/${name}.webp`;

/**
 * Textura de chão: tileável (`RepeatWrapping`), sRGB, com `repeat` em
 * espaço de UV. Cache por url+repeat. Usada pelo terreno e pela estrada.
 */
export function groundTexture(url: string, repeat: number): THREE.Texture {
  const key = `g:${url}:${repeat}`;
  let t = _texCache.get(key);
  if (!t) {
    t = _loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    _texCache.set(key, t);
  }
  return t;
}

/* ------------------------------------------------------------------ *
 * Geometria do quad: ancorada na base (y ∈ [0,1], x ∈ [-0.5,0.5]).
 * Cada campo tem a sua (o atributo `aFade` vive na geometria).
 * ------------------------------------------------------------------ */
function baseQuad(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/* ------------------------------------------------------------------ *
 * Material billboard: Y-lock no vertex shader + dither-fade opcional.
 * ------------------------------------------------------------------ */
function makeBillboardMat(
  tex: THREE.Texture,
  withFade: boolean,
  wind: WindProfile | null,
  windTime: { value: number },
): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = shader => {
    if (wind) shader.uniforms['uWindTime'] = windTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>'
          + (wind ? '\nuniform float uWindTime;' : '')
          + (withFade ? '\nattribute float aFade;\nvarying float vFade;' : ''),
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
          vec3 bbInst = instanceMatrix[3].xyz;
          float bbW = length(instanceMatrix[0].xyz);
          float bbH = length(instanceMatrix[1].xyz);
          vec3 bbCenter = (modelMatrix * vec4(bbInst, 1.0)).xyz;
          vec3 bbToCam = cameraPosition - bbCenter;
          bbToCam.y = 0.0;
          float bbLen = length(bbToCam);
          vec3 bbFwd = bbLen > 1e-4 ? bbToCam / bbLen : vec3(0.0, 0.0, 1.0);
          vec3 bbRight = normalize(cross(vec3(0.0, 1.0, 0.0), bbFwd));
          vec3 bbWorld = bbCenter
            + (position.x * bbW) * bbRight
            + (position.y * bbH) * vec3(0.0, 1.0, 0.0);
          ${wind ? /* glsl */ `
            float bbPhase = fract(sin(dot(bbInst.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.283185;
            float bbSway = sin(uWindTime * ${WIND[wind].speed.toFixed(4)} + bbPhase);
            bbWorld += bbRight * (position.y * bbH * ${WIND[wind].amplitude.toFixed(4)} * bbSway);
          ` : ''}
          vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        ` + (withFade ? '\nvFade = aFade;' : ''),
      );
    if (withFade) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace(
          '#include <alphatest_fragment>',
          /* glsl */ `#include <alphatest_fragment>
          {
            float _fd = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
            if (vFade < 0.999 && _fd > vFade) discard;
          }`,
        );
    }
  };
  m.customProgramCacheKey = () => `billboard-v2-${wind ? JSON.stringify(WIND[wind]) : 'static'}`
    + (withFade ? '-fade' : '');
  return m;
}

/* ------------------------------------------------------------------ *
 * Um campo = um instancedMesh de um sprite.
 * ------------------------------------------------------------------ */
type Placement = { x: number; z: number; w: number; h: number; yaw: number };

const dummy = new THREE.Object3D();

function BillboardField({
  tex, placements, fadeSpheres, registerMat, wind = null, windTime,
}: {
  tex: THREE.Texture;
  placements: Placement[];
  fadeSpheres: FadeSphere[] | null;
  registerMat: (m: THREE.MeshBasicMaterial) => void;
  wind?: WindProfile | null;
  windTime: { value: number };
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => baseQuad(), []);
  const mat = useMemo(
    () => makeBillboardMat(tex, !!fadeSpheres, wind, windTime),
    [tex, !!fadeSpheres, wind, windTime],
  );
  const cap = Math.max(1, placements.length);

  useLayoutEffect(() => {
    registerMat(mat);
  }, [mat, registerMat]);

  const tv = useTerrainVersion();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      dummy.position.set(p.x, glbSurfaceY(p.x, p.z, terrainHeight(p.x, p.z)), p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(p.w, p.h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements, tv]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !fadeSpheres) return;
    return registerInstancedFade(mesh, fadeSpheres);
  }, [cap, fadeSpheres]);

  return <instancedMesh ref={ref} args={[geo, mat, cap]} frustumCulled />;
}

/* ------------------------------------------------------------------ *
 * Geração de posições (mesmas sementes dos lotes de primitiva antigos,
 * pra o mundo cair nos mesmos lugares).
 * ------------------------------------------------------------------ */
export type TreePlacement = { x: number; z: number; size: number; seed: number };

/** Variante de flora por semente (mantém variedade do mundo antigo). */
function floraVariant(seed: number): keyof typeof FLORA {
  const r = rand(seed + 555);
  if (r < 0.42) return 'pine';
  if (r < 0.80) return 'broad';
  if (r < 0.90) return 'dead';
  return 'bush';
}

const FLORA_BASE: Record<keyof typeof FLORA, { h: number; wf: number }> = {
  pine: { h: 6.2, wf: 0.95 },
  broad: { h: 5.4, wf: 1.15 },
  dead: { h: 5.0, wf: 1.05 },
  bush: { h: 2.0, wf: 1.35 },
};

const FLORA_FADE: Record<keyof typeof FLORA, FadeSphere[]> = {
  pine: [[0, 0.5, 0, 0.26]],
  broad: [[0, 0.55, 0, 0.3]],
  dead: [[0, 0.55, 0, 0.22]],
  bush: [[0, 0.45, 0, 0.3]],
};

function inLake(x: number, z: number, pad = 0): boolean {
  return LAKE_CENTERS.some(l => (x - l.x) ** 2 + (z - l.z) ** 2 < (l.r + pad) ** 2);
}

/* ------------------------------------------------------------------ *
 * GRAMA nas áreas VERDES do mapa (Pedro): grade jitterada densa sobre o
 * mapa; em cada ponto amostra a cor real da malha do GLB (surfaceColorAt)
 * e só fica onde é verde. Tufo = GroundCover (lâminas finas animadas), tom
 * casando com a média do verde amostrado (tint). Determinístico → Vercel.
 * ------------------------------------------------------------------ */
const GRASS_STEP = 2.4;        // espaçamento da grade (m) — densidade
const GRASS_CAP = 2200;        // teto de tufos (instanced, barato)
/** Verde "de grama": canal G domina R e B (em espaço linear). */
function isGreen(c: THREE.Color): boolean {
  return c.g > c.r * 1.06 && c.g > c.b * 1.12 && c.g > 0.02;
}
function buildGreenGrass(): { placements: Placement[]; tint?: THREE.Color } {
  const out: Placement[] = [];
  const sum = new THREE.Color(0, 0, 0);
  let n = 0, i = 0;
  for (let x = -MAP_HALF; x <= MAP_HALF; x += GRASS_STEP) {
    for (let z = -MAP_HALF; z <= MAP_HALF; z += GRASS_STEP, i++) {
      if (inLake(x, z, 1)) continue;
      const jx = x + (rand(i + 7) - 0.5) * GRASS_STEP;
      const jz = z + (rand(i + 99) - 0.5) * GRASS_STEP;
      const col = surfaceColorAt(jx, jz);
      if (!col || !isGreen(col)) continue;
      sum.add(col); n++;
      if (out.length < GRASS_CAP) {
        const h = 0.7 + rand(i + 50) * 0.5;
        out.push({ x: jx, z: jz, w: h * 1.1, h, yaw: rand(i + 3) * Math.PI * 2 });
      }
    }
  }
  if (n === 0) return { placements: [] };
  const tint = sum.multiplyScalar(1 / n); // média do verde da malha (já em linear)
  return { placements: out, tint };
}
/** Gera a grama verde quando o GLB+textura carregam (retry curto até a imagem
 *  decodificar — o registro do terreno não espera a textura). */
function useGreenGrass(): { placements: Placement[]; tint?: THREE.Color } {
  const tv = useTerrainVersion();
  const [res, setRes] = useState<{ placements: Placement[]; tint?: THREE.Color }>({ placements: [] });
  useEffect(() => {
    let cancelled = false, tries = 0;
    const attempt = () => {
      if (cancelled) return;
      const r = buildGreenGrass();
      // Só PUBLICA quando achou grama; NUNCA limpa (um tv-bump posterior com amostra
      // momentaneamente vazia não pode apagar a grama já encontrada). Se esgotar as
      // tentativas sem achar, desiste em silêncio e mantém o que havia.
      if (r.placements.length > 40) { setRes(r); return; }
      if (tries >= 20) return;
      tries++; setTimeout(attempt, 250); // textura ainda decodificando → tenta de novo
    };
    attempt();
    return () => { cancelled = true; };
  }, [tv]);
  return res;
}

/* ------------------------------------------------------------------ *
 * Componente público — substitui Tree/RockInstances/GrassPatches.
 * ------------------------------------------------------------------ */
export function Billboards({ trees, c }: { trees: TreePlacement[]; c: Palette }) {
  // Um único relógio compartilhado por todos os materiais de vegetação.
  const windTime = useMemo(() => ({ value: 0 }), []);
  // Materiais vivos pra o tint dia/noite (sem re-render).
  const matList = useMemo<THREE.MeshBasicMaterial[]>(() => [], []);
  const registerMat = useMemo(
    () => (m: THREE.MeshBasicMaterial) => { if (!matList.includes(m)) matList.push(m); },
    [matList],
  );

  // Flora: agrupa as árvores já filtradas por variante de sprite.
  const flora = useMemo(() => {
    const buckets: Record<keyof typeof FLORA, Placement[]> = { pine: [], broad: [], dead: [], bush: [] };
    for (const t of trees) {
      const v = floraVariant(t.seed);
      const base = FLORA_BASE[v];
      const h = base.h * t.size;
      buckets[v].push({ x: t.x, z: t.z, w: h * base.wf, h, yaw: 0 });
    }
    return buckets;
  }, [trees]);


  // Pedras decorativas: 60 posições.
  const rocks = useMemo(() => {
    const large: Placement[] = [];
    const small: Placement[] = [];
    for (let i = 0; i < 60; i++) {
      const x = (rand(i + 911) - 0.5) * MAP_HALF * 1.8;
      const z = (rand(i + 1200) - 0.5) * MAP_HALF * 1.8;
      if (inLake(x, z, 1)) continue;
      const size = 0.25 + rand(i + 90) * 0.9;
      const h = (0.55 + size * 1.0);
      const p: Placement = { x, z, w: h * 1.15, h, yaw: 0 };
      (rand(i + 44) < 0.5 ? large : small).push(p);
    }
    return { large, small };
  }, []);

  // Grama: densa e SÓ nas áreas verdes do GLB (amostra a cor da malha), com tom
  // casando com a média do verde do mapa. Substitui o espalhamento aleatório antigo.
  const { placements: grass, tint: grassTint } = useGreenGrass();

  useFrame(({ clock }) => {
    windTime.value = clock.elapsedTime;
    const b = 1 - 0.52 * nightFactor();
    for (let i = 0; i < matList.length; i++) matList[i]!.color.setRGB(b, b, b);
  });

  return (
    <>
      <Suspense fallback={(['pine', 'broad', 'dead'] as const).map(v => (
        <BillboardField
          key={`flora-${v}`}
          tex={spriteTex(floraUrl(FLORA[v]))}
          placements={flora[v]}
          fadeSpheres={FLORA_FADE[v]}
          registerMat={registerMat}
          wind="tree"
          windTime={windTime}
        />
      ))}>
        <LivingTrees placements={flora.pine} species="pine" c={c} />
        <LivingTrees placements={flora.broad} species="oak" c={c} />
        <ForestTrees placements={flora.dead} c={c} />
      </Suspense>
      {/* Arbusto de outono (billboard branco/vermelho) REMOVIDO — não ficou bom. */}
      <ForestRocks placements={rocks.large} c={c} />
      <ForestRocks placements={rocks.small} c={c} />
      <GroundCover placements={grass} c={c} tint={grassTint} />
      {/* Entulho/debris (billboard 2D) REMOVIDO — chapado e girava (Pedro).
          Substituído por containers 3D (glb-containers) no game-world. */}
    </>
  );
}
