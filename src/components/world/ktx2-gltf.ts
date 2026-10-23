import { useGLTF } from '@react-three/drei';
import { GLTFLoader, KTX2Loader } from 'three-stdlib';
import type * as THREE from 'three';

/**
 * Suporte a GLB com texturas KTX2/Basis (KHR_texture_basisu) no useGLTF do drei, de forma
 * ADITIVA e por-call-site — só os GLB passados por `extendKTX2`/`preloadKTX2GLTF` ganham o
 * KTX2Loader; todos os outros useGLTF continuam idênticos (nenhum setKTX2Loader neles).
 *
 * Fase 2 (piloto). O transcoder Basis é servido de /basis/ (copiado de
 * three/examples/jsm/libs/basis/). Três fatos do three que moldam este arquivo:
 *   1. KTX2Loader.parse() lança "Missing initialization with .detectSupport(renderer)" se o
 *      renderer (gl) não foi informado ANTES do parse — por isso `primeKTX2(gl)` tem que rodar
 *      antes de qualquer load. O gl só existe em tempo de render (useThree), nunca no topo do
 *      módulo.
 *   2. useGLTF/useLoader do drei cacheia por [Loader, path] — o `extendLoader` NÃO entra na
 *      chave. Logo um preload sem KTX2Loader cachearia uma falha que o componente herdaria.
 *      Daí o preload ser ADIADO (fila) até o gl primer o singleton.
 *   3. setKTX2Loader só afeta texturas com KHR_texture_basisu; GLB comuns ignoram o loader.
 */

let ktx2: KTX2Loader | null = null;
let primed = false;
const pendingPreloads = new Set<string>();

function getKTX2(): KTX2Loader {
  if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath('/basis/');
  return ktx2;
}

/** Passar ao 4º argumento de useGLTF(path, useDraco, useMeshopt, extendLoader). */
export const extendKTX2 = (loader: GLTFLoader): void => {
  loader.setKTX2Loader(getKTX2());
};

/**
 * Informa o renderer ao KTX2Loader (detectSupport) uma única vez e libera os preloads que
 * ficaram na fila. DEVE ser chamado no corpo do componente ANTES do useGLTF do GLB KTX2.
 */
export function primeKTX2(gl: THREE.WebGLRenderer): void {
  if (primed) return;
  getKTX2().detectSupport(gl);
  primed = true;
  for (const url of pendingPreloads) useGLTF.preload(url, true, true, extendKTX2);
  pendingPreloads.clear();
}

/**
 * Preload seguro de um GLB KTX2: só dispara depois que primeKTX2(gl) rodou (senão o parse
 * lançaria por falta de detectSupport e poluiria o cache do useGLTF para o componente).
 */
export function preloadKTX2GLTF(url: string): void {
  if (primed) useGLTF.preload(url, true, true, extendKTX2);
  else pendingPreloads.add(url);
}
