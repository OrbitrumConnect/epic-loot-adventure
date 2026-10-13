/**
 * Monta o look cel-shaded dentro do `<Canvas>` (ver `cel-style.ts` pros
 * ajustes). Faz duas coisas, as duas aditivas e reversíveis por `CEL.enabled`:
 *
 *  - Percorre a cena e injeta a rampa toon nos materiais iluminados (barato e
 *    idempotente: só toca material novo, via marcador). Como a injeção é
 *    IN-PLACE, pega também criaturas, nós de colheita e peças de base que
 *    nascem depois, sem quebrar o fade/oclusão (a identidade do material não
 *    muda) nem o `vertexColors`/`flatShading`.
 *  - Assume o render (useFrame prioridade 1 desliga o render automático do
 *    R3F) e passa a cena por um pipeline próprio de 2 passos: a cena vai pra um
 *    render-target sRGB já tonemapeado + um DepthTexture; depois um quad de
 *    tela cheia lê cor+profundidade e aplica contorno / gradação / névoa de
 *    cobre / grão / vinheta, escrevendo direto na tela.
 *
 * Por que contorno por profundidade (e não casco invertido por malha): o mundo
 * se apoia em `instancedMesh`; um casco invertido exigiria uma segunda malha
 * instanciada por lote e dobraria desenho/geometria. O edge por profundidade é
 * uma passada de tela cheia, custo fixo, e captura silhueta contra o céu e
 * sobreposição entre objetos — exatamente os contornos fortes da referência.
 *
 * Por que pipeline próprio (e não EffectComposer): o contorno precisa ler a
 * profundidade da cena no MESMO passo em que escreve. Compartilhar um
 * DepthTexture entre os buffers que o EffectComposer alterna cria laço de
 * feedback (ler a textura de profundidade anexada ao alvo que se desenha) e o
 * quadro sai vazio. Com um alvo dedicado pra cena e escrita direta na tela,
 * não há sobreposição entre textura lida e alvo escrito.
 */
import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CEL, celFilterShader, celShadeMaterial, bloomBlurShader } from './cel-style';
import { dayNight, nightFactor } from '@/game/systems/dayNightSystem';

/**
 * Estatística lida pelo console (`window.__celStats`).
 *  - `composerMs`: quadro inteiro assumido (render da cena + bloom + filtro).
 *  - `postMs`: SÓ o pós (bloom + quad de filtro), que é o custo desta fase.
 *  - `sunU`/`sunV`: posição de tela do disco (0..1 = dentro do quadro).
 *  - `glowU`/`glowV`: âncora do halo já clampada à borda; `glowFall`: peso dela.
 */
export const celStats = {
  composerMs: 0, postMs: 0, converted: 0,
  sceneDrawCalls: 0, sceneTriangles: 0,
  sunU: 0, sunV: 0, sunVis: 0, glowU: 0, glowV: 0, glowFall: 0, day: 1,
};

function makeSceneRT(w: number, h: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    samples: 4,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace; // cena já tonemapeada + sRGB
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  const depth = new THREE.DepthTexture(w, h);
  depth.format = THREE.DepthFormat;
  depth.type = THREE.UnsignedIntType;
  rt.depthTexture = depth;
  return rt;
}

/** Alvo do bloom (1/4 de res): linear, sem depth, filtro linear p/ blur suave. */
function makeBloomRT(w: number, h: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace; // guardamos exibição, lemos cru
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  return rt;
}

const BLOOM_DIV = 4;

export function CelShade() {
  const { gl, scene, camera, size } = useThree();

  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const quadRef = useRef<FullScreenQuad | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const convertAcc = useRef(0);

  // Bloom: dois alvos 1/4 de res (ping H → A, pong V → B) + 1 quad/material.
  const bloomARef = useRef<THREE.WebGLRenderTarget | null>(null);
  const bloomBRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const bloomQuadRef = useRef<FullScreenQuad | null>(null);
  const bloomMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const sunNdc = useRef(new THREE.Vector3());
  const sunWorld = useRef(new THREE.Vector3());

  const active = CEL.enabled;

  // Monta alvo da cena + quad de filtro (uma vez).
  useMemo(() => {
    if (!active) return null;
    const dpr = gl.getPixelRatio();
    const w = Math.max(1, Math.floor(size.width * dpr));
    const h = Math.max(1, Math.floor(size.height * dpr));

    rtRef.current = makeSceneRT(w, h);

    const shader = celFilterShader();
    const mat = new THREE.ShaderMaterial({
      uniforms: shader.uniforms as any,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    mat.uniforms['tDiffuse']!.value = rtRef.current.texture;
    mat.uniforms['tDepth']!.value = rtRef.current.depthTexture;
    (mat.uniforms['uResolution']!.value as THREE.Vector2).set(w, h);
    matRef.current = mat;
    quadRef.current = new FullScreenQuad(mat);

    if (CEL.bloom.enabled) {
      bloomARef.current = makeBloomRT(Math.floor(w / BLOOM_DIV), Math.floor(h / BLOOM_DIV));
      bloomBRef.current = makeBloomRT(Math.floor(w / BLOOM_DIV), Math.floor(h / BLOOM_DIV));
      const bshader = bloomBlurShader();
      const bmat = new THREE.ShaderMaterial({
        uniforms: bshader.uniforms as any,
        vertexShader: bshader.vertexShader,
        fragmentShader: bshader.fragmentShader,
        depthTest: false,
        depthWrite: false,
      });
      bloomMatRef.current = bmat;
      bloomQuadRef.current = new FullScreenQuad(bmat);
      mat.uniforms['uBloomTex']!.value = bloomBRef.current.texture;
    }
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Resize: recria o alvo (cor + profundidade) no novo tamanho.
  useEffect(() => {
    if (!active || !rtRef.current || !matRef.current) return;
    const dpr = gl.getPixelRatio();
    const w = Math.max(1, Math.floor(size.width * dpr));
    const h = Math.max(1, Math.floor(size.height * dpr));
    rtRef.current.dispose();
    rtRef.current.depthTexture?.dispose();
    rtRef.current = makeSceneRT(w, h);
    matRef.current.uniforms['tDiffuse']!.value = rtRef.current.texture;
    matRef.current.uniforms['tDepth']!.value = rtRef.current.depthTexture;
    (matRef.current.uniforms['uResolution']!.value as THREE.Vector2).set(w, h);

    if (CEL.bloom.enabled && bloomARef.current && bloomBRef.current) {
      bloomARef.current.dispose();
      bloomBRef.current.dispose();
      bloomARef.current = makeBloomRT(Math.floor(w / BLOOM_DIV), Math.floor(h / BLOOM_DIV));
      bloomBRef.current = makeBloomRT(Math.floor(w / BLOOM_DIV), Math.floor(h / BLOOM_DIV));
      matRef.current.uniforms['uBloomTex']!.value = bloomBRef.current.texture;
    }
  }, [gl, active, size.width, size.height]);

  useEffect(() => () => {
    rtRef.current?.dispose();
    rtRef.current?.depthTexture?.dispose();
    quadRef.current?.dispose();
    bloomARef.current?.dispose();
    bloomBRef.current?.dispose();
    bloomQuadRef.current?.dispose();
    rtRef.current = null;
    quadRef.current = null;
    bloomARef.current = null;
    bloomBRef.current = null;
    bloomQuadRef.current = null;
  }, []);

  // Handles de depuração: estatística + o material do filtro, pra conseguir
  // ligar/desligar um efeito NO MESMO QUADRO pelo console (A/B honesto, sem a
  // hora do jogo mudar entre as duas leituras). Só leitura/ajuste manual.
  useEffect(() => {
    (window as any).__celStats = celStats;
  }, []);

  // Render assumido: prioridade > 0 desliga o render automático do R3F.
  useFrame((state, delta) => {
    // Converte materiais novos pra rampa toon (barato, idempotente).
    convertAcc.current += delta;
    if (CEL.toon.enabled && convertAcc.current > 0.25) {
      convertAcc.current = 0;
      let n = 0;
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!(mesh as any).isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) { celShadeMaterial(m); n++; }
      });
      celStats.converted = n;
    }

    const rt = rtRef.current;
    const quad = quadRef.current;
    const mat = matRef.current;
    if (!active || !rt || !quad || !mat) {
      gl.render(scene, camera);
      return;
    }

    // Publica o material do filtro no quadro (e não num efeito de montagem:
    // com StrictMode o efeito podia pegar a ref antes de ela existir e o
    // handle saía nulo). Permite A/B de um efeito no MESMO quadro pelo console.
    // Só em dev: é um handle MUTÁVEL do shader, não é superfície pra produção.
    if (import.meta.env.DEV && (window as any).__celMat !== mat) (window as any).__celMat = mat;

    const t0 = performance.now();

    // 1) Cena -> alvo sRGB (tonemap + codificação feitos pelo renderer) + depth.
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.render(scene, camera);

    const cam = state.camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    celStats.sceneDrawCalls = gl.info.render.calls;
    celStats.sceneTriangles = gl.info.render.triangles;

    // 1b) Sol/céu. Mesma fonte (`dayNight`) que a malha do Sol usa, então o
    // recorte do disco e o halo concordam sempre com o que está desenhado.
    //
    // Três saídas:
    //  - `uSunScreen`/`uSunScreenR`: onde o disco está e o raio dele em tela,
    //    pro filtro poupar aqueles pixels (preservação por geometria; a de
    //    luminância da volta anterior nunca disparava — ver cel-style.ts).
    //  - `uSunVisible`: 1 só quando o disco cai DENTRO do quadro.
    //  - `uGlowScreen`/`uGlowFalloff`: a mesma direção CLAMPADA à borda da tela
    //    e o quanto ela ainda vale. MEDIDO: em 3ª pessoa o sol passa boa parte
    //    do tempo fora do enquadramento (v entre 1.06 e 5.4 conforme pitch/yaw),
    //    então sem o clamp a atmosfera não teria âncora nenhuma na tela.
    if (CEL.sky.enabled) {
      const s = dayNight();
      const day = 1 - nightFactor();
      const len = Math.hypot(s.sunPos[0], s.sunPos[1], s.sunPos[2]) || 1;
      const R = CEL.sky.sunDistance;
      sunWorld.current.set((s.sunPos[0] / len) * R, (s.sunPos[1] / len) * R, (s.sunPos[2] / len) * R);

      // Atrás da câmera: `project()` espelha (divide por w negativo). Detecta
      // pelo z de vista e desespelha, senão o halo iria parar no lado errado.
      const vz = sunNdc.current.copy(sunWorld.current).applyMatrix4(cam.matrixWorldInverse).z;
      const behind = vz > 0;
      sunNdc.current.copy(sunWorld.current).project(cam);
      let u = sunNdc.current.x * 0.5 + 0.5;
      let v = sunNdc.current.y * 0.5 + 0.5;
      if (behind) { u = 1 - u; v = 1 - v; }

      const inFrame = !behind && u >= 0 && u <= 1 && v >= 0 && v <= 1;
      (mat.uniforms['uSunScreen']!.value as THREE.Vector2).set(u, v);

      // Raio do disco em alturas de tela: meio-ângulo do disco dividido pela
      // meia-altura do frustum. Ortográfica (iso) não mostra o sol: raio 0.
      const persp = (cam as any).isPerspectiveCamera === true;
      const halfH = persp ? Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) : 1;
      const rScreen = persp
        ? (Math.atan(CEL.sky.sunRadius / R) / halfH) * 0.5 + CEL.sky.sunMaskPad
        : 0;
      mat.uniforms['uSunScreenR']!.value = rScreen;
      mat.uniforms['uSunVisible']!.value = inFrame && day > 0.02 ? 1 : 0;

      // Âncora do halo: encosta na borda e perde força conforme o sol se afasta.
      const gu = Math.min(Math.max(u, 0.02), 0.98);
      const gv = Math.min(Math.max(v, 0.0), 0.98);
      const dOut = Math.hypot(u - gu, v - gv);
      const fall = behind || day <= 0.02 ? 0 : Math.exp(-CEL.sky.glowFalloffK * dOut);
      (mat.uniforms['uGlowScreen']!.value as THREE.Vector2).set(gu, gv);
      mat.uniforms['uGlowFalloff']!.value = fall;

      mat.uniforms['uDayFactor']!.value = day;
      mat.uniforms['uAspect']!.value = rt.width / Math.max(1, rt.height);
      celStats.sunU = u;
      celStats.sunV = v;
      celStats.sunVis = mat.uniforms['uSunVisible']!.value as number;
      celStats.glowU = gu;
      celStats.glowV = gv;
      celStats.glowFall = fall;
      celStats.day = day;
    }

    // A partir daqui é SÓ pós (bloom + quad de filtro) — o custo desta fase,
    // medido à parte do render da cena pra poder comparar com o baseline.
    const tPost = performance.now();

    // 1c) Bloom: bright-pass + blur separável (H -> A, V -> B), 1/4 de res.
    const bA = bloomARef.current, bB = bloomBRef.current, bq = bloomQuadRef.current, bm = bloomMatRef.current;
    if (CEL.bloom.enabled && bA && bB && bq && bm) {
      const bw = bA.width, bh = bA.height;
      // Passe H: lê a cena, bright-pass + desfoca no eixo X.
      bm.uniforms['tInput']!.value = rt.texture;
      bm.uniforms['uBright']!.value = 1;
      (bm.uniforms['uDir']!.value as THREE.Vector2).set(1, 0);
      (bm.uniforms['uTexel']!.value as THREE.Vector2).set(1 / bw, 1 / bh);
      gl.setRenderTarget(bA);
      bq.render(gl);
      // Passe V: lê A, só desfoca no eixo Y.
      bm.uniforms['tInput']!.value = bA.texture;
      bm.uniforms['uBright']!.value = 0;
      (bm.uniforms['uDir']!.value as THREE.Vector2).set(0, 1);
      gl.setRenderTarget(bB);
      bq.render(gl);
    }

    // 2) Quad de filtro -> tela.
    mat.uniforms['uNear']!.value = cam.near;
    mat.uniforms['uFar']!.value = cam.far;
    mat.uniforms['uOrtho']!.value = (cam as any).isOrthographicCamera ? 1 : 0;
    mat.uniforms['uTime']!.value = state.clock.elapsedTime;
    gl.setRenderTarget(null);
    quad.render(gl);
    gl.setRenderTarget(prevTarget);

    const tEnd = performance.now();
    celStats.composerMs = celStats.composerMs * 0.9 + (tEnd - t0) * 0.1;
    celStats.postMs = celStats.postMs * 0.9 + (tEnd - tPost) * 0.1;
  }, 1);

  return null;
}
