import { create } from 'zustand';

/**
 * O que o herói da Zona Sul está fazendo AGORA, pra casa do jogo decidir teclas de duplo sentido sem carregar o mundo
 * 3D (este arquivo é minúsculo). Ex.: C = mergulhar (na água) / descer o carro (dirigindo) — senão é o Raio do jogo.
 */
export const zsCtx = { inWater: false, driving: false };
/** CELULAR (31/10): o momento que muda os botões do arco (dirigindo / perto do carro / nadando). O herói escreve só
 *  quando MUDA — a tela não re-renderiza por quadro. */
/** `shipAct` (01/11): o que o E/botão faz no navio de guerra agora — subir a bordo, pilotar (no timão) ou descer. */
export const useZsTouch = create<{ driving: boolean; nearCar: boolean; inWater: boolean; sailing: boolean; nearShip: boolean; shipAct: 'pilotar' | 'descer' | 'subir' | 'construir' | 'construir_carro' | null;
  /** agachado agora (02/11 — o botão do arco vira "Levantar") */ crouched: boolean;
  /** de CARONA no carro de outro jogador (02/11 — o botão do arco vira "Sair da carona") */ riding: boolean }>(() => ({ driving: false, nearCar: false, inWater: false, sailing: false, nearShip: false, shipAct: null, crouched: false, riding: false }));
/** AGACHAR (02/11, PvP — Pedro: "agachar… pro PvP fluido"): `on` = agachado (Ctrl alterna; celular: botão no arco);
 *  `k` = 0..1 suave (a câmera desce junto). Velocidade, câmera e o alvo menor na mira dos outros saem daqui. */
export const zsCrouch = { on: false, k: 0 };
/** Agachado: anda a 0,9 m/s (metade do andar, sem correr); a câmera desce 0,55 m. */
export const ZS_CROUCH_SPEED = 0.9, ZS_CROUCH_CAM_DROP = 0.55;
/** CAVERNA (30/10): o herói escreve todo quadro. `dark` 0..1 = quão fundo (escurece o mundo, liga a lanterna);
 *  `near` = perto de uma boca ou dentro (a caverna desenha); `deep` = tão fundo que a superfície nem desenha. */
export const zsCave = { inCave: false, dark: 0, near: false, deep: false,
  /** a mais de 20 m de uma boca: o MAR some na hora (o plano da água em y = 0 cortava o túnel abaixo do nível do mar) */
  seaOff: false };
/** BARRA DO CHEFE NA TELA (04/11, Pedro: "o Kraken tem barra de vida? vi no tentáculo, mas quando ele solta não vi"): a barra
 *  em cima do corpo fica a ~70 m de altura (fora do quadro do navio). O chefe escreve (só quando MUDA); a tela lê. */
export type ZsBossBar = { name: string; frac: number; sub: string };
export const useZsBossBar = create<{ bar: ZsBossBar | null }>(() => ({ bar: null }));
/** Mesma barra (nome, sub e vida a cada 0,5%)? — pra não redesenhar à toa. */
export function sameBossBar(a: ZsBossBar | null, b: ZsBossBar | null): boolean {
  if (!a || !b) return a === b;
  return a.name === b.name && a.sub === b.sub && Math.round(a.frac * 200) === Math.round(b.frac * 200);
}
/** Escreve a barra do chefe `name`: mostra a dele, e só APAGA se a que está na tela é a dele (04/11: Kraken × Canibal). */
export function setBossBarFor(name: string, bar: ZsBossBar | null): void {
  const cur = useZsBossBar.getState().bar;
  if (bar === null && cur && cur.name !== name) return;
  if (!sameBossBar(bar, cur)) useZsBossBar.setState({ bar });
}
/** Ataque da casa do jogo (`hitNearest`) — o clique esquerdo do mundo chama. */
export const zsAttack: { fn: (() => void) | null } = { fn: null };

/**
 * CARRO e NAVIO no card da base e no mapa (03/11, Pedro: "fabricar o carro e o navio não estão disponíveis no card Minha
 * base igual skate e prancha; ambos sumiram — queria poder construir; no mapa deveria aparecer pra mim pra eu saber").
 * O mundo escreve (~2×/s, só quando MUDA: estado ou > 3 m); o card e o mapa (M) leem. `ok` = no mapa em (x, z);
 * `gone` = explodiu/afundou — (x, z) = onde se constrói outro (garagem / âncora). null = não existe nesta sessão.
 */
export type ZsVehInfo = { state: 'ok' | 'gone'; x: number; z: number };
export const useZsVehicles = create<{ car: ZsVehInfo | null; ship: ZsVehInfo | null }>(() => ({ car: null, ship: null }));
/** Construir pelo card (o mundo registra; fora da Zona Sul = null). Devolve a mensagem pro jogador. */
export const zsVehicleApi: { build: ((kind: 'car' | 'ship') => string) | null } = { build: null };
/** Mesmo lugar (estado igual e < 3 m)? — pra não redesenhar o card/mapa à toa. */
export function sameVeh(a: ZsVehInfo | null, b: ZsVehInfo | null): boolean {
  if (!a || !b) return a === b;
  return a.state === b.state && Math.hypot(a.x - b.x, a.z - b.z) < 3;
}
