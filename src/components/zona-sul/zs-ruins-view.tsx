import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { useNet } from '@/net/multiplayer';
import { SAFE_ZONE } from '@/game/data/camps';
import { type ZsTerrain, zsHeightAt } from './zs-terrain-data';
import { caveMouthClear } from './zs-cave';
import { zsRampFloor } from './zs-ramp';
import { baseBoxes } from './zs-vegetation';
import { parseRuins, placeRuins, RUINS, ruinChunks, type RuinMesh, type RuinRaw, setRuinsWorld } from './zs-ruins';

/**
 * RUÍNAS POR BAIRRO — o desenho (regras em zs-ruins.ts; a escolha dos prédios em tools/zona-sul/ruins-bake.mjs).
 * Um material só pra todas: a FACHADA sai do shader (janela por andar — umas quebradas/pretas, outras com tábua —,
 * sujeira escorrida, trepadeira subindo do pé; térreo de prédio com portas de loja); a cor de cada uma vem do vértice
 * (concreto/bege/pastel desbotado no asfalto, tijolo cru ou pintura velha na favela, caixa d'água azul). Junta por pedaço
 * do mapa (cada pedaço 1 desenho, corta fora da câmera); sem luz nova. Some lá no fundo da caverna junto com a superfície.
 */
let rawCache: RuinRaw[] | null = null;

function ruinMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.02 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aFac;\nvarying vec3 vFac;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFac = aFac;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFac;\nfloat rh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float kind = vFac.z;
        if (kind < 1.5) {
          bool predio = kind < 0.5;
          float fl = predio ? 3.0 : 2.8, cw = predio ? 2.6 : 3.4;
          float row = floor(vFac.y / fl), col = floor(vFac.x / cw);
          vec2 c = vec2(fract(vFac.x / cw), fract(vFac.y / fl));
          float h = rh(vec2(row, col));
          float win = step(0.22, c.x) * step(c.x, 0.72) * step(0.32, c.y) * step(c.y, 0.82);
          if (predio && row < 0.5) win = step(0.08, c.x) * step(c.x, 0.92) * step(0.04, c.y) * step(c.y, 0.8) * step(0.45, h); // portas de loja
          if (!predio) win *= step(0.3, h);
          vec3 wc = h < 0.3 ? vec3(0.015) : h < 0.42 ? vec3(0.3, 0.21, 0.12) : vec3(0.05, 0.06, 0.07);
          diffuseColor.rgb = mix(diffuseColor.rgb, wc, win);
          float n = rh(floor(vec2(vFac.x * 0.7, vFac.y * 0.22)));
          diffuseColor.rgb *= 0.8 + 0.2 * n;                                      // manchas / sujeira escorrida
          float vine = smoothstep(4.5, 0.0, vFac.y + n * 2.5) * step(0.45, fract(vFac.x * 0.37 + n));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.29, 0.11), vine * 0.75); // trepadeira no pé
        } else if (kind < 2.5) {
          diffuseColor.rgb *= 0.72 + 0.12 * rh(floor(vFac.xy));                 // laje velha
        }
      }`);
  };
  m.customProgramCacheKey = () => 'zs-ruins-v1';
  return m;
}

function toGeometry(r: RuinMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
  g.setAttribute('aFac', new THREE.BufferAttribute(r.fac, 3));
  g.setIndex(new THREE.BufferAttribute(r.idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** O que já é do jogo e não pode ficar debaixo de ruína (acampamento, farm, boca da caverna, rampa, zona segura, bases). */
function blockers(t: ZsTerrain) {
  const st = useGameStore.getState();
  const camps = st.camps.map((c) => c.position);
  const nodes = [...st.harvestNodes.map((n) => n.position), ...st.resources.map((n) => n.position)];
  const boxes = baseBoxes(st.playerBase, useNet.getState().bases);
  const NG = 16, ng = new Map<string, { x: number; z: number }[]>();
  for (const p of nodes) { const k = `${Math.floor(p.x / NG)},${Math.floor(p.z / NG)}`; (ng.get(k) ?? ng.set(k, []).get(k)!).push(p); }
  return {
    ground: (x: number, z: number) => zsHeightAt(t, x, z),
    blocked: (x: number, z: number, r: number, dist: (px: number, pz: number) => number) => {
      if (Math.hypot(x - SAFE_ZONE.x, z - SAFE_ZONE.z) < SAFE_ZONE.radius + r + 4) return true;
      if (camps.some((c) => Math.hypot(c.x - x, c.z - z) < RUINS.CLEAR_CAMP + r)) return true;
      if (!caveMouthClear(x, z, r + RUINS.CLEAR_MOUTH)) return true;
      if (zsRampFloor(x, z, 1e6) > -Infinity) return true;
      if (boxes.some((b) => x + r + RUINS.CLEAR_BASE > b[0]! && x - r - RUINS.CLEAR_BASE < b[2]! && z + r + RUINS.CLEAR_BASE > b[1]! && z - r - RUINS.CLEAR_BASE < b[3]!)) return true;
      const ci = Math.floor(x / NG), cj = Math.floor(z / NG), k = Math.ceil((r + RUINS.CLEAR_NODE) / NG);
      // farm (árvore/pedra de colher): só se cair DENTRO da planta ou a menos de CLEAR_NODE m da parede (o círculo em volta tirava demais)
      for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) for (const p of ng.get(`${i},${j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < r + RUINS.CLEAR_NODE && dist(p.x, p.z) < RUINS.CLEAR_NODE) return true;
      return false;
    },
  };
}

export function ZsRuins({ t }: { t: ZsTerrain }) {
  const [meshes, setMeshes] = useState<RuinMesh[]>([]);
  // base nova/mudou (minha ou de outro jogador): refaz sem ruína em cima dela
  const pb = useGameStore((s) => s.playerBase), nb = useNet((s) => s.bases);
  useEffect(() => {
    let on = true;
    (async () => {
      const raw = rawCache ?? (rawCache = parseRuins(await (await fetch(RUINS.URL)).json()));
      if (!on) return;
      const placed = placeRuins(raw, blockers(t));
      setRuinsWorld(placed);
      setMeshes(ruinChunks(placed));
    })().catch(() => { /* sem o arquivo: sem ruínas (o resto do mapa segue igual) */ });
    return () => { on = false; };
  }, [t, pb, nb]);
  useEffect(() => () => setRuinsWorld([]), []);
  const material = useMemo(() => ruinMaterial(), []);
  const geos = useMemo(() => meshes.map(toGeometry), [meshes]);
  useEffect(() => () => { for (const g of geos) g.dispose(); }, [geos]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __zsRuins?: unknown }).__zsRuins = { chunks: geos.length, tris: meshes.reduce((s, m) => s + m.tris, 0) }; }, [geos, meshes]);
  return <group>{geos.map((g, i) => <mesh key={i} geometry={g} material={material} castShadow receiveShadow />)}</group>;
}
