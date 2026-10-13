import * as THREE from 'three';

/**
 * Colisão + teto-some da FÁBRICA, no mesmo espírito da casa (house-collider),
 * mas como LISTA (4 prédios). Cada um publica footprint + paredes reais (segmentos
 * na altura do peito, já rotacionados e relativos ao centro) + base Y. O loop do
 * mundo (game-world) lê pra parede sólida (entra pela abertura) e pra cortar o
 * teto quando o player entra NO modo câmera longe (iso). Inimigos usam o mesmo.
 */
export type FactoryCollider = {
  cx: number; cz: number;     // centro mundial do prédio
  halfX: number; halfZ: number; // footprint (mundo) pra teste "dentro"
  baseY: number;              // Y mundial da base do prédio
  wallSegs: number[];         // [x1,z1,x2,z2,...] relativo ao centro (já rotacionado)
};

export const factoryColliders: FactoryCollider[] = [];

/** Plano de corte do teto compartilhado (todas as fábricas). 1e9 = nada cortado. */
export const factoryClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e9);

/** Altura (acima da base) onde o teto é cortado ao entrar. */
export const FACTORY_ROOF_CUT = 3.6;

export const FACTORY_WALLS_SOLID = true;
