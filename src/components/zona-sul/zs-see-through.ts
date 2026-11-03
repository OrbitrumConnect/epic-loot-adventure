import * as THREE from 'three';

/**
 * VER ATRAVÉS das árvores na câmera DE CIMA (03/11). Na mata a copa (13–34 m) fica entre a câmera alta e o herói — de
 * cima só se via o tapete verde. Igual aos jogos de vista de cima: um CÍRCULO na tela em volta do herói onde a árvore que
 * está NA FRENTE dele some em pontilhado (bordas suaves).
 *
 * Conta no shader, sem raio nem lista: o pixel da árvore é cortado se estiver dentro do CONE câmera → peito do herói
 * (raio cresce de 0 na câmera até `R` no herói = círculo de tamanho fixo na tela) e na FRENTE do herói (o tronco ao lado
 * e o que está atrás ficam). Só nos materiais da mata e da árvore de farm da Zona Sul; desligado (`on` = 0, câmera de
 * ombro, mirando, carro…) o pixel é o mesmo de antes. Uniforme, não `#define`: ligar/desligar não recompila nada.
 */
export const ZS_SEE = {
  /** raio (m) do círculo em volta do herói; a borda suaviza a partir de `SOFT`×R */
  R: 4.5, SOFT: 0.55,
  /** só corta o que está pelo menos isto (m) na frente do peito do herói */
  FRONT: 1.2,
} as const;

export const zsSeeThrough = {
  on: { value: 0 },
  cam: { value: new THREE.Vector3() },
  hero: { value: new THREE.Vector3() },
  r: { value: ZS_SEE.R as number },
};

/** O mesmo corte do shader, em JS (testes): 1 = some inteiro, 0 = fica. Sem o pontilhado. */
export function seeCut(p: { x: number; y: number; z: number }, cam: { x: number; y: number; z: number }, hero: { x: number; y: number; z: number }, r: number = ZS_SEE.R): number {
  const abx = hero.x - cam.x, aby = hero.y - cam.y, abz = hero.z - cam.z;
  const L2 = abx * abx + aby * aby + abz * abz, L = Math.sqrt(L2);
  if (!(L > 0)) return 0;
  const t = Math.max(0, Math.min(1, ((p.x - cam.x) * abx + (p.y - cam.y) * aby + (p.z - cam.z) * abz) / L2));
  if (t > 1 - ZS_SEE.FRONT / L) return 0;
  const qx = cam.x + abx * t - p.x, qy = cam.y + aby * t - p.y, qz = cam.z + abz * t - p.z;
  const d = Math.sqrt(qx * qx + qy * qy + qz * qz), rr = Math.max(0.3, r * t);
  const e0 = rr, e1 = rr * ZS_SEE.SOFT; // smoothstep(e0, e1, d) com e0 > e1: 1 no centro, 0 na borda
  const x = Math.max(0, Math.min(1, (d - e0) / (e1 - e0)));
  return x * x * (3 - 2 * x);
}

// desligado (ombro, carro…) nem a posição no mundo é calculada: o custo no vértice também é zero (o pixel não lê vSeeW)
const VERT_HEAD = 'varying vec3 vSeeW;\nuniform float uSeeOn;';
const VERT_BODY = `
  vSeeW = vec3(0.0);
  if (uSeeOn > 0.5) {
    vec4 seeW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      seeW = instanceMatrix * seeW;
    #endif
    vSeeW = (modelMatrix * seeW).xyz;
  }`;
const FRAG_HEAD = 'varying vec3 vSeeW;\nuniform float uSeeOn;\nuniform vec3 uSeeCam;\nuniform vec3 uSeeHero;\nuniform float uSeeR;';
const FRAG_BODY = `
  if (uSeeOn > 0.5) {
    vec3 seeAB = uSeeHero - uSeeCam;
    float seeL2 = dot(seeAB, seeAB);
    float seeT = clamp(dot(vSeeW - uSeeCam, seeAB) / seeL2, 0.0, 1.0);
    if (seeT < 1.0 - ${ZS_SEE.FRONT.toFixed(2)} / sqrt(seeL2)) {
      float seeR = max(0.3, uSeeR * seeT);
      float seeK = smoothstep(seeR, seeR * ${ZS_SEE.SOFT.toFixed(2)}, length(vSeeW - (uSeeCam + seeAB * seeT)));
      float seeN = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
      if (seeK > seeN) discard;
    }
  }`;

/** Põe o corte num material (encadeia com o `onBeforeCompile` que ele já tiver — ex.: o apagar por instância). */
export function withSeeThrough<T extends THREE.Material>(mat: T): T {
  const prev = mat.onBeforeCompile;
  // chave do programa ANTES de trocar (a padrão do three é o texto do onBeforeCompile — o meu é igual em todo material,
  // então sem isto dois materiais com remendos diferentes por baixo podiam dividir o mesmo programa)
  const baseKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms['uSeeOn'] = zsSeeThrough.on;
    shader.uniforms['uSeeCam'] = zsSeeThrough.cam;
    shader.uniforms['uSeeHero'] = zsSeeThrough.hero;
    shader.uniforms['uSeeR'] = zsSeeThrough.r;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${FRAG_BODY}`);
  };
  mat.customProgramCacheKey = () => `${baseKey}|zs-see-v1`;
  return mat;
}
