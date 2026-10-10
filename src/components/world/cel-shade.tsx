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
import { CEL, celFilterShader, celShadeMaterial } from './cel-style';

/** Estatística de custo lida pelo console (window.__celStats). */
export const celStats = { composerMs: 0, converted: 0 };

function makeSceneRT(w: number, h: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace; // cena já tonemapeada + sRGB
  rt.texture.minFilter = THREE.NearestFilter;
  rt.texture.magFilter = THREE.NearestFilter;
  const depth = new THREE.DepthTexture(w, h);
  depth.format = THREE.DepthFormat;
  depth.type = THREE.UnsignedIntType;
  rt.depthTexture = depth;
  return rt;
}

export function CelShade() {
  const { gl, scene, camera, size } = useThree();

  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const quadRef = useRef<FullScreenQuad | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const convertAcc = useRef(0);

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
  }, [gl, active, size.width, size.height]);

  useEffect(() => () => {
    rtRef.current?.dispose();
    rtRef.current?.depthTexture?.dispose();
    quadRef.current?.dispose();
    rtRef.current = null;
    quadRef.current = null;
  }, []);

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

    const t0 = performance.now();

    // 1) Cena -> alvo sRGB (tonemap + codificação feitos pelo renderer) + depth.
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.render(scene, camera);

    // 2) Quad de filtro -> tela.
    const cam = state.camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    mat.uniforms['uNear']!.value = cam.near;
    mat.uniforms['uFar']!.value = cam.far;
    mat.uniforms['uOrtho']!.value = (cam as any).isOrthographicCamera ? 1 : 0;
    mat.uniforms['uTime']!.value = state.clock.elapsedTime;
    gl.setRenderTarget(null);
    quad.render(gl);
    gl.setRenderTarget(prevTarget);

    celStats.composerMs = celStats.composerMs * 0.9 + (performance.now() - t0) * 0.1;
  }, 1);

  return null;
}
