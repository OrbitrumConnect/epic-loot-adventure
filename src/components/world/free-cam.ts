/**
 * Câmera livre de depuração (modo `free`) — estado compartilhado fora do React.
 *
 * O laço de quadro NÃO pode chamar setState a 60 Hz. Então ele escreve neste
 * objeto mutável (sem alocação por quadro) e o HUD lê por polling leve (~4x/s),
 * no mesmo padrão de `pilot-status.ts`.
 *
 * É ferramenta de dev: o Caio e o Pedro voam pela cena com a simulação rodando,
 * caçando lag e estados de IA errados. Nada aqui altera regra de jogo.
 */

/** O que o retículo (centro da tela) está mirando. */
export type FreeCamInspect = {
  kind: 'creature' | 'node' | 'base' | null;
  name: string;
  /** "218 / 300" ou '' quando não há vida. */
  hp: string;
  /** behavior da criatura / estágio da base / estado do nó. */
  state: string;
  id: string;
};

/** Métricas de render do quadro (atualizadas ~4x/s, nunca por quadro). */
export type FreeCamMetrics = {
  fps: number;
  ms: number;
  calls: number;
  triangles: number;
};

export type FreeCamState = {
  /** Velocidade-base em m/s (roda do mouse ajusta). */
  speed: number;
  /** Plano distante da câmera (controle de alcance de visão). */
  far: number;
  /** Modo livre ligado. */
  active: boolean;
  metrics: FreeCamMetrics;
  inspect: FreeCamInspect;
  /** Incrementa a cada mutação relevante, para o HUD decidir re-render. */
  version: number;
};

export const FREE_SPEED_MIN = 1;
export const FREE_SPEED_MAX = 60;
export const FREE_FAR_MIN = 40;
export const FREE_FAR_MAX = 300;
/** `far` padrão da câmera perspectiva do jogo (ver game-world.tsx). */
export const FREE_FAR_DEFAULT = 160;

const state: FreeCamState = {
  speed: 10,
  far: FREE_FAR_DEFAULT,
  active: false,
  metrics: { fps: 0, ms: 0, calls: 0, triangles: 0 },
  inspect: { kind: null, name: '', hp: '', state: '', id: '' },
  version: 0,
};

/** Objeto mutável — o laço de quadro escreve direto nos campos, sem alocar. */
export function getFreeCam(): FreeCamState {
  return state;
}

export function setFreeCamActive(active: boolean) {
  if (state.active === active) return;
  state.active = active;
  state.version++;
}

export function adjustFreeCamSpeed(deltaMul: number) {
  const next = Math.max(FREE_SPEED_MIN, Math.min(FREE_SPEED_MAX, state.speed * deltaMul));
  if (next === state.speed) return;
  state.speed = next;
  state.version++;
}

export function adjustFreeCamFar(delta: number) {
  const next = Math.max(FREE_FAR_MIN, Math.min(FREE_FAR_MAX, state.far + delta));
  if (next === state.far) return;
  state.far = next;
  state.version++;
}
