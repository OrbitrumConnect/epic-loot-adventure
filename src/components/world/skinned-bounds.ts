import * as THREE from 'three';

/**
 * BOLHA DO CORPO COM ESQUELETO (03/11, Pedro: "o lag aumentou um pouco, dá umas travadas às vezes").
 * O culling (não desenhar o que está fora da tela) usa uma bolha em volta de cada malha. O three ≥ r151 dá ao SkinnedMesh
 * uma bolha PRÓPRIA e, na 1ª vez que cada corpo vai pra tela, a calcula passando TODOS os vértices pelos ossos
 * (`computeBoundingSphere` → `applyBoneTransform`) — a cada corpo montado (bicho chegando perto, inimigo, jogador online).
 * Medido no build de produção (trace andando 27 s): 17% do tempo dos quadros que travaram.
 * Conferido no jogo antes de escolher: a bolha da GEOMETRIA (que o código inflava 1,8×) não serve no lugar (vários modelos
 * têm a escala no esqueleto: sai 14–100× menor que o corpo), e reaproveitar a bolha de outro corpo do mesmo modelo também
 * não (o exemplar do pré-aquecimento fica noutra pose: até 4× fora). Então: CADA corpo segue calculando a SUA bolha, no
 * mesmo momento que o three calcularia — só que por uma AMOSTRA de até SKIN_SAMPLES vértices por malha, com folga
 * SKIN_SAMPLE_PAD pelo que a amostra pula. Mesmo culling de antes, ~10× menos conta.
 */
export const SKIN_BOUNDS_K = 1.8;
export const SKIN_SAMPLES = 400;
// 1,25: medido no jogo (25 malhas, 8 lugares), a amostra +10% chegou a ficar 12% menor que a completa na mesma pose
export const SKIN_SAMPLE_PAD = 1.25;
const tmp = new THREE.Vector3();
/** A bolha do corpo pela amostra de vértices (mesma conta do three: pose atual, vértice pelos ossos). Puro sobre a malha. */
export function sampledSkinSphere(sk: THREE.SkinnedMesh, samples = SKIN_SAMPLES, out = new THREE.Sphere()): THREE.Sphere {
  const pos = sk.geometry.getAttribute('position');
  out.makeEmpty();
  if (!pos) return out;
  const step = Math.max(1, Math.floor(pos.count / samples));
  for (let i = 0; i < pos.count; i += step) { sk.getVertexPosition(i, tmp); out.expandByPoint(tmp); }
  out.radius *= SKIN_SAMPLE_PAD;
  return out;
}
export function inflateBounds(m: THREE.Mesh): void {
  if (m.geometry && !m.geometry.userData['_inflated']) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius *= SKIN_BOUNDS_K;
    m.geometry.userData['_inflated'] = true;
  }
  const sk = m as THREE.SkinnedMesh;
  if (sk.isSkinnedMesh && m.geometry) {
    // o three chama isto na 1ª vez que o corpo passa pelo culling (bolha null) — igual a antes, só que pela amostra
    sk.computeBoundingSphere = function (this: THREE.SkinnedMesh) { this.boundingSphere = sampledSkinSphere(this, SKIN_SAMPLES, this.boundingSphere ?? new THREE.Sphere()); };
  }
}
