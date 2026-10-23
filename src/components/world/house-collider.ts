/**
 * Ponte entre a casa (base-house.tsx, que conhece as medidas do modelo depois de
 * carregar/escalar) e o loop de física do jogador (game-world.tsx). A casa publica
 * aqui seu footprint + altura do piso; o mundo lê a cada frame pra dar CHÃO (piso
 * caminhável) e COLISÃO (paredes sólidas) sem a casa precisar saber de física.
 *
 * Singleton mutável de propósito: é lido no useFrame (fora do ciclo React) e
 * atualizado 1x quando a casa carrega/muda de célula. null = sem casa (sem base).
 */
export type HouseCollider = {
  cx: number; // centro mundial X (centro da célula core)
  cz: number; // centro mundial Z
  halfX: number; // meia-largura do footprint (mundo)
  halfZ: number; // meia-profundidade do footprint (mundo)
  floorY: number; // Y mundial do piso caminhável (topo do assoalho)
  /**
   * Paredes REAIS do modelo na altura do peito, como segmentos 2D (XZ relativo
   * ao centro da casa): [x1,z1,x2,z2, ...]. Extraído da malha → o vão da porta
   * (sem parede) fica aberto sozinho; janelas (altas) não entram. Sem chute.
   */
  wallSegs: number[];
  /**
   * Só casa de PEDRA/METAL (2 andares + escada): Y mundial da base do modelo, fatias de parede por
   * altura e malha do piso caminhável (ver `house-levels.ts`). Ausente = colisão antiga (madeira).
   */
  baseY?: number;
  levels?: import('./house-levels').HouseLevels;
  floorMesh?: import('three').Mesh | null;
};

export const houseCollider: { current: HouseCollider | null } = { current: null };

/**
 * Paredes sólidas ligado/desligado. ON: a colisão usa as paredes REAIS do modelo
 * (`wallSegs`), então o vão da porta fica aberto sozinho — sem risco de murar o
 * player. Piso caminhável funciona independente disso.
 */
export const HOUSE_WALLS_SOLID = true;

/**
 * Player está dentro do footprint da casa? O loop do mundo escreve a cada frame;
 * a casa lê pra sumir com o teto (plano de corte) e deixar ver lá dentro — como
 * top-down 2D/3D. Fora singleton de propósito (lido/escrito fora do ciclo React).
 */
export const housePlayerInside = { current: false };

/** Y dos pés do jogador (escrito pelo loop do mundo) — o corte do teto acompanha o ANDAR dele. */
export const housePlayerFeetY = { current: -Infinity };
