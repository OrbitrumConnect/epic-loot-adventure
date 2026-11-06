/**
 * CAVERNA DA ZONA SUL (30/10, Pedro): "a estrada que chega na base do Cristo, perto da subida do Humaitá — abrir um
 * buraco, cave, entrada EXATAMENTE onde é a entrada do Túnel Rebouças; pra dentro da pedra curvando pra baixo, abrindo
 * galerias, local com água e uma big cave pra explorar, com salão no final, no fundo, pro boss. A cave pega todo o
 * interior do maciço que envolve Jardim Botânico e Gávea e pode ter uma saída perto do Leblon, menor que a entrada do
 * Rebouças. É só uma camada do mapa embaixo do que já tem — sem pesar, só shapes."
 *
 * Como (puro e leve — sem malha de colisão, sem raio):
 *  - a caverna é UMA FUNÇÃO (`caveField`, distância com sinal): túneis em ARCO de chão reto e SALÕES em cúpula, unidos
 *    suave, rocha rugosa por ruído, pilares de pedra. Ar = valor < 0. O chão tem função própria (`caveFloorAt`), plano.
 *  - andar (herói e bichos), câmera, tiro e camada consultam a função (umas contas por quadro);
 *  - o DESENHO sai da MESMA função (marching cubes por blocos, montado aos poucos — `caveMeshJob`), então o que se vê é
 *    o que se pisa;
 *  - as BOCAS: o chão do mapa abre um buraco exato onde o túnel corta a encosta (shader do terreno, `ZS_CAVE_MOUTHS`).
 * Pontos (coordenadas do jogo, bake 1:7,4): a boca do Rebouças é a ponta sul do Túnel Rebouças no OSM (−70, −59), na
 * Rua Jardim Botânico/Humaitá; o túnel entra pro norte, curva pro oeste descendo por baixo do Corcovado, galerias,
 * águas, a grande caverna embaixo do maciço do Jardim Botânico e, no fundo (−32 m), o salão do chefe. O ramal do Leblon
 * passa por baixo dos morros da Gávea e sai no pé do Dois Irmãos, no fim do Leblon (boca menor).
 */
import type { UnderLayer } from '@/game/data/world-profile';
import { ZS_SURF } from './zona-sul-meta';
import { type ZsTerrain, zsHeightAt, zsSurfAt } from './zs-terrain-data';

/* ------------------------------------------------------------------ desenho da rede */

/** Ponto de túnel: chão `y`, meia-largura `r` e altura do arco `h` (m). */
export type CaveTunnelPt = { x: number; z: number; y: number; r: number; h: number };
/** Túnel: polilinha; `mouth` = o 1º ponto é uma BOCA (corte reto, chão = encosta); `rocks` = pedras em volta da boca. */
/** `road` = TÚNEL DE ESTRADA (Zuzu Angel, Novo, Velho — do OSM, no tamanho que o morro do jogo deixa). */
/** `open` = túnel CURTO de rua (o Novo, 34 m): de dentro se vê as duas bocas — conta como superfície o tempo todo. */
export type CaveTunnel = { id: string; name: string; pts: CaveTunnelPt[]; mouth?: boolean; rocks?: boolean; road?: boolean; open?: boolean };
/** Poça no salão (no referencial do salão: u ao longo de `yaw`): o chão afunda até `depth`, a água fica no chão. */
export type CavePool = { u: number; v: number; rx: number; rz: number; depth: number };
export type CaveRoom = {
  id: string; name: string; x: number; z: number; y: number; rx: number; rz: number; h: number; yaw: number;
  /** contorno irregular (m) */
  lobe: number; pools?: CavePool[]; pillars?: { x: number; z: number; r: number }[];
  /** tom da rocha */
  tint: readonly [number, number, number];
  /** POÇO (02/11 noite, o abismo do Pico da Tijuca): expoente do eixo vertical — paredes quase retas e teto em cúpula
   *  (2 = a cúpula de sempre). */
  shaft?: number;
  /** RAMPA EM ESPIRAL colada na parede: o anel de fora (e > `inner`, em fração do raio) desce de `yTop` até o fundo
   *  (`y` do salão) ao longo de `sweep` rad a partir do ângulo `a0` (no sentido `dir`); o miolo é o fundo do poço. */
  spiral?: { yTop: number; inner: number; a0: number; sweep: number; dir: 1 | -1; parkour?: CaveRampParkour };
  /** FENDA (05/11): um PRECIPÍCIO de lado a lado do salão — ver `CaveChasm`. */
  chasm?: CaveChasm;
};
/** FENDA (05/11, Pedro: "caminho até ele mais longe com parkour — pula; caiu no precipício volta pro checkpoint" · "o
 *  ideal seria não ali na descida — a boa seria no túnel, no caminho"): o salão tem um PRECIPÍCIO de lado a lado — no
 *  referencial do salão, de `u0` a `u1` (ao longo de `yaw`), `depth` m abaixo do chão das beiradas — e COLUNAS soltas pra
 *  atravessar pulando (centro u/v, raio, degrau `dy` em relação à beirada). */
export type CaveChasm = { u0: number; u1: number; depth: number; stones: { u: number; v: number; r: number; dy: number }[];
  /** BEIRADA no canto (05/11 noite, Pedro: "passar no canto seria legal também"): faixa de `w` m colada na parede do lado
   *  `side` (v > 0 ou < 0), de ponta a ponta do vão — com vãos (`gaps`: centro u e largura) pra pular. */
  ledge?: { side: 1 | -1; w: number; gaps: { u: number; w: number }[] } };
/** PARKOUR NA RAMPA EM ESPIRAL (05/11 noite, Pedro: "no boss, parkour na rampa ali, alguns, legal também"): trechos que
 *  DESABARAM (`gaps`: grau ao longo da volta a partir do balcão e largura no meio da rampa, m) e COLUNAS soltas num
 *  desabamento grande (`stones`: grau, fração do raio, raio). Caiu num vão = o "abismo do parkour" (volta pro checkpoint). */
export type CaveRampParkour = { gaps: { at: number; w: number }[]; stones: { at: number; e: number; r: number }[] };

const P = (x: number, z: number, y: number, r: number, h: number): CaveTunnelPt => ({ x, z, y, r, h });

// 31/10 (Pedro: "os túneis são um pouco baixos e poderiam ser mais largos"): por dentro ~+30% de largura e altura (as
// bocas quase iguais); conferido pelo teste "não fura o mapa".
export const CAVE_TUNNELS: CaveTunnel[] = [
  // BOCA DO REBOUÇAS (larga: 12 m × 6,5 m) — entra pro norte e curva pro oeste descendo por baixo do Corcovado
  { id: 'reboucas', name: 'entrada do Rebouças', mouth: true, pts: [
    P(-70, -63, 10.6, 6, 6.5), P(-71, -96, 7, 7, 8.5), P(-78, -118, 4, 7, 9), P(-98, -136, 1, 6.5, 8.5),
    P(-132, -149, -2, 6.5, 8.5), P(-180, -158, -5, 6.5, 9)] },
  { id: 'galeria-agua', name: 'galeria', pts: [P(-220, -158, -5, 6, 8.5), P(-262, -150, -7, 6, 8), P(-300, -152, -9, 6, 8), P(-338, -162, -10, 6, 8)] },
  // as duas galerias d'água: passagem entre elas (pela beira das poças)
  { id: 'agua-agua', name: "galeria d'água", pts: [P(-366, -175, -10, 5.8, 8), P(-376, -181, -10.5, 5.8, 8), P(-386, -185, -11, 5.8, 8)] },
  { id: 'agua-grande', name: 'galeria', pts: [P(-396, -178, -11, 6, 8.5), P(-418, -171, -14, 6.2, 8.5), P(-430, -168, -16, 6.5, 9)] },
  // descendo pro FUNDO: o salão do chefe
  { id: 'grande-chefe', name: 'descida pro salão do chefe', pts: [P(-482, -178, -16, 6.5, 9), P(-503, -188, -22, 7, 10), P(-526, -194, -28, 7.5, 11), P(-536, -195, -32, 8, 12)] },
  // RAMAL DO LEBLON (boca menor: 6,4 m × 4,2 m) — sai no pé do Dois Irmãos, no fim do Leblon
  { id: 'leblon', name: 'saída do Leblon', mouth: true, pts: [
    P(-446, 366, 10.45, 3.2, 4.2), P(-470, 366, 8, 3.8, 5.2), P(-500, 364, 5, 4.6, 6.2), P(-540, 360, 2, 5, 6.5),
    P(-584, 344, -1, 5.2, 6.5), P(-600, 300, -4, 5.4, 7), P(-606, 230, -6, 5.4, 7), P(-610, 205, -7.5, 5.4, 7)] },
  { id: 'gavea', name: 'passagem da Gávea', pts: [
    P(-612, 165, -7.5, 5.4, 7), P(-610, 130, -8.5, 5.4, 7), P(-596, 75, -10, 5.6, 7), P(-570, 5, -12, 5.6, 7.2),
    P(-525, -48, -14, 5.8, 7.5), P(-478, -102, -16, 6, 8), P(-458, -140, -16, 6.5, 8.5)] },
  // RAMAL DE LARANJEIRAS (31/10, Pedro: "uma saída pra quase Flamengo/Laranjeiras") — boca no pé do Morro de São Judas
  // Tadeu virada pra Rua das Laranjeiras; o túnel desce pelo vale do Cosme Velho (sob o Rebouças de verdade) até a
  // galeria do Cosme Velho e liga no túnel do Rebouças pela encruzilhada
  { id: 'laranjeiras', name: 'saída de Laranjeiras', mouth: true, pts: [
    P(84, -416, 13.4, 3.8, 5), P(68, -432, 11, 4.6, 6.5), P(32, -402, 6, 5.6, 7.5), P(2, -372, 2, 6, 8),
    P(-24, -336, -1, 6, 8), P(-42, -290, -2, 6, 8), P(-50, -245, -2, 6, 8)] },
  { id: 'cosme-encruzilhada', name: 'túnel do Cosme Velho', pts: [P(-54, -205, -2, 6, 8), P(-62, -170, 0, 6, 8), P(-70, -140, 2.5, 6.5, 8.5), P(-76, -124, 4, 6.5, 8.5)] },
  // TÚNEL ZUZU ANGEL (02/11 noite, Pedro: "faz os túneis; o da Gávea–São Conrado, Zuzu, pode ter uma entrada no meio dele
  // pra cave"): a reta do OSM (São Conrado (−690, 449) → Gávea (−537, 320)); estrada de 2 faixas (11 m × 6,5 m), piso
  // subindo ~1% de São Conrado (12,07 m) pra Gávea (13,96 m). As bocas ficam onde a encosta já cobre o arco (a de São
  // Conrado 0,2 da reta pra dentro). Passa POR CIMA do túnel do Leblon (~7 m de rocha — ANDARES). No meio (J) sai a
  // ENTRADA DA CAVERNA: rampa de ~115 m (~15%) que desce até a passagem da Gávea.
  { id: 'zuzu-sc', name: 'Túnel Zuzu Angel', mouth: true, road: true, pts: [P(-659.4, 423.2, 12.07, 5.5, 6.5), P(-641, 407.7, 12.3, 5.5, 6.5), P(-600, 373.1, 13, 5.5, 6.5)] },
  { id: 'zuzu-gavea', name: 'Túnel Zuzu Angel', mouth: true, road: true, pts: [P(-537, 320, 13.96, 5.5, 6.5), P(-569.5, 347.5, 13.5, 5.5, 6.5), P(-600, 373.1, 13, 5.5, 6.5)] },
  { id: 'zuzu-caverna', name: 'descida do Zuzu pra caverna', pts: [P(-600, 373.1, 13, 4.6, 6.5), P(-621, 348, 8, 4.6, 6.5), P(-624, 305, 2, 4.6, 6.5), P(-603, 265, -5, 5, 7)] }, // a ponta no EIXO da passagem (junção de verdade)
  // ABISMO DO PICO DA TIJUCA (02/11 noite, Pedro: "entrada de cave no Pico da Tijuca, agora que tem essa parede grande; a
  // galeria pode ser grande lá dentro, de cima vê lá embaixo, vai descendo; a boca média, com pedras rodeando; a que vem
  // descendo do Alto da Boa Vista/Pico da Tijuca vai cortando tudo, grande; mundo subterrâneo interligado"):
  // BOCA MÉDIA (8,4 m × 5,5 m) na encosta virada pro Alto da Boa Vista, a ~109 m → túnel curto até o BALCÃO no alto do poço
  { id: 'pico-tijuca', name: 'boca do Pico da Tijuca', mouth: true, rocks: true, pts: [
    P(-1114.6, -205.7, 108.6, 4.2, 5.5), P(-1130.2, -221.3, 106, 4.4, 5.8), P(-1142.9, -234, 103.8, 4.6, 6.5), P(-1170.6, -261.6, 99, 4.6, 6.5)] },
  // do FUNDO do poço sai a GALERIA GRANDE (15 m) por baixo do maciço até o salão do Alto da Boa Vista…
  { id: 'galeria-alto', name: 'galeria grande do Alto da Boa Vista', pts: [
    P(-1159.9, -271.6, 42, 6.5, 9), P(-1100, -250, 34, 7.5, 11), P(-1000, -200, 22, 7.5, 11), P(-940, -170, 14, 7.5, 11), P(-905, -153, 9, 7.5, 11)] },
  // TÚNEL NOVO (02/11 noite, Pedro: "o túnel da Princesa Isabel que pega Copa pra Botafogo ali perto da Urca"), Botafogo ↔
  // Leme/Copacabana, pela linha do OSM. No jogo o morro é uma CRISTA baixa (~18 m no eixo): bocas em rampa (o buraco do
  // chão abre a trincheira) e o meio coberto. As 2 mãos num túnel só (13 × 5,6 m), piso 4,05 → 6,53 m com o meio ~1 m
  // mais baixo (a silhueta de longe do morro é baixa).
  // TÚNEL VELHO: NÃO entrou — no jogo o morro em cima dele é uma crista de ~13 m, estreita e caindo rápido pro oeste; mesmo
  // estreito (6,8 × 4,4 m) e com o piso descendo no meio o arco sai pela encosta (41 pontos no teste). Pra ter o Velho é
  // preciso subir um pouco essa crista (mexe no mapa de antes) — esperando o OK do Pedro.
  { id: 'novo-botafogo', name: 'Túnel Novo', mouth: true, road: true, open: true, pts: [P(312.5, -55.5, 4.05, 6.5, 6), P(316.8, -47.1, 4.5, 6.5, 5.6), P(320.2, -40.4, 4.4, 6.5, 5.6)] },
  { id: 'novo-copa', name: 'Túnel Novo', mouth: true, road: true, open: true, pts: [P(328, -25.4, 6.53, 6.5, 6), P(322.4, -36.1, 4.8, 6.5, 5.6), P(320.2, -40.4, 4.4, 6.5, 5.6)] },
  // …e do salão até a passagem da Gávea (a caverna de sempre): o mundo de baixo inteiro ligado
  { id: 'galeria-gavea', name: 'galeria grande do Alto da Boa Vista', pts: [
    P(-852, -125, 6.5, 7, 10), P(-820, -110, 2, 7, 10), P(-760, -80, -2, 6.5, 9.5), P(-700, -50, -6, 6.5, 9), P(-650, -25, -9, 6.2, 8.5), P(-610, -8, -11, 6, 8), P(-570, 5, -12, 5.6, 7.2)] },
  // GARGANTA (04/11, Pedro: "o boss dentro da cave profunda — da forma que fizemos a do Pico da Tijuca, que desce
  // arredondando; precisa mais baixo, lá pro fundo onde tá o boss"): do FUNDO do abismo (42 m, a mesma saída da galeria
  // grande — vira uma bifurcação). 05/11 (Pedro: "o caminho vai ficar curto até ali?" · "o ideal: no túnel, no caminho"):
  // não sai mais do fundo do abismo direto pro balcão do covil (53 m): agora SAI DA GALERIA GRANDE (~70 m depois do fundo do
  // abismo — quem vem do Rebouças passa por ela também) e sobe ~7 m até a FENDA. Colada na borda do covil não dava: a
  // "aura" de chão do covil (ANDARES) cobria o túnel.
  { id: 'garganta', name: 'garganta do covil', pts: [P(-1092, -246, 33.04, 6, 9), P(-1080, -257, 36.5, 6, 9), P(-1067, -267, 40, 6, 9)] },
  // …e do outro lado da fenda, um túnel (~68 m) que volta pro sudoeste até o BALCÃO NOVO do covil (o começo da rampa, 38 m)
  { id: 'fenda-covil', name: 'garganta do covil', pts: [P(-1003, -267, 40, 6, 9), P(-1008, -286, 39.5, 6.2, 9), P(-1026, -301, 38.8, 6.4, 9), P(-1045.5, -308.8, 38, 6.5, 9)] },
];

export const CAVE_ROOMS: CaveRoom[] = [
  { id: 'encruzilhada', name: 'encruzilhada', x: -80, z: -120, y: 4, rx: 13, rz: 11, h: 11, yaw: 0.6, lobe: 1.8, tint: [0.45, 0.42, 0.38] },
  { id: 'corcovado', name: 'galeria do Corcovado', x: -200, z: -160, y: -5, rx: 26, rz: 17, h: 13, yaw: 0.15, lobe: 2.2,
    pillars: [{ x: -207, z: -154, r: 2.6 }], tint: [0.46, 0.43, 0.39] },
  { id: 'agua', name: "galeria d'água", x: -357, z: -166, y: -10, rx: 21, rz: 14, h: 10, yaw: 0.25, lobe: 2,
    pools: [{ u: 0, v: 0, rx: 12, rz: 7, depth: 0.85 }], tint: [0.36, 0.42, 0.42] },
  { id: 'agua2', name: "galeria d'água", x: -386, z: -185, y: -11, rx: 15, rz: 13, h: 9, yaw: -0.4, lobe: 1.8,
    pools: [{ u: 2, v: -1, rx: 9, rz: 8, depth: 0.9 }], tint: [0.34, 0.41, 0.42] },
  { id: 'grande', name: 'grande caverna', x: -452, z: -165, y: -16, rx: 34, rz: 25, h: 22, yaw: -0.25, lobe: 3,
    pillars: [{ x: -462, z: -158, r: 3.4 }, { x: -440, z: -177, r: 2.6 }], pools: [{ u: 14, v: 10, rx: 8, rz: 6, depth: 0.7 }],
    tint: [0.44, 0.41, 0.37] },
  { id: 'chefe', name: 'salão do chefe', x: -556, z: -196, y: -32, rx: 24, rz: 21, h: 19, yaw: 0.1, lobe: 2.4, tint: [0.47, 0.36, 0.32] },
  { id: 'cristais', name: 'galeria dos cristais', x: -610, z: 185, y: -7.5, rx: 15, rz: 22, h: 12, yaw: 0.05, lobe: 2, tint: [0.4, 0.37, 0.46] },
  { id: 'poco', name: 'poço da Gávea', x: -596, z: 70, y: -10, rx: 11, rz: 11, h: 8, yaw: 0, lobe: 1.5,
    pools: [{ u: 0, v: 0, rx: 7, rz: 6, depth: 0.8 }], tint: [0.35, 0.41, 0.41] },
  { id: 'cosme', name: 'galeria do Cosme Velho', x: -52, z: -225, y: -2, rx: 16, rz: 20, h: 12, yaw: 0.15, lobe: 2.2,
    pools: [{ u: -4, v: 6, rx: 7, rz: 9, depth: 0.8 }], tint: [0.38, 0.41, 0.4] },
  // ABISMO (02/11 noite): POÇO de ~85 m de diâmetro debaixo do Pico da Tijuca — fundo a 42 m, cúpula a 130 m (o pico lá em
  // cima tem ~190). A RAMPA EM ESPIRAL sai do balcão (100 m, onde chega o túnel da boca) e desce 330° colada na parede
  // até o fundo (~29%); o miolo é o fundo do poço, ~58 m abaixo do balcão. Da volta que falta (30°) sai a galeria grande.
  { id: 'abismo', name: 'abismo do Pico da Tijuca', x: -1195, z: -290, y: 42, rx: 44, rz: 40, h: 88, yaw: 0, lobe: 2.5, shaft: 6,
    spiral: { yTop: 100, inner: 0.72, a0: Math.PI / 4, sweep: (330 * Math.PI) / 180, dir: 1 }, tint: [0.4, 0.4, 0.45] },
  // SALÃO do Alto da Boa Vista, no meio da galeria grande (embaixo do vale — 7 m de piso, ~10 m de rocha por cima)
  { id: 'salao-alto', name: 'salão do Alto da Boa Vista', x: -878, z: -139, y: 7, rx: 30, rz: 22, h: 14, yaw: 0.45, lobe: 2.2, tint: [0.42, 0.4, 0.38] },
  // COVIL DO CANIBAL (04/11): o 2º poço, ao lado do abismo e bem mais fundo — ~130 m de largura, o chão a −55 m (abaixo
  // do mar), teto quase reto (shaft 16). A RAMPA EM ESPIRAL sai do balcão (38 m, onde chega a garganta) e desce 345°
  // colada na parede até o fundo (~25%); o miolo é a ARENA do chefe gigante (o corpo sai do meio do chão).
  // 05/11 (a FENDA): o balcão — onde a rampa começa — virou pro NORDESTE (a0 2,271 → 0,848 rad), onde chega o túnel que
  // vem da fenda; a rampa é a MESMA (345°, ~25%, sem vão nenhum), só girada. A garganta curta (fundo do abismo → balcão,
  // 53 m, o "caminho curto e fácil") saiu: agora sai da galeria grande e passa pela fenda (~220 m e o precipício).
  { id: 'covil', name: 'covil do Canibal', x: -1087, z: -353, y: -55, rx: 66, rz: 62, h: 125, yaw: 0, lobe: 2.5, shaft: 16,
    // 05/11 noite (Pedro: "parkour na rampa ali, alguns"): 4 vãos (3,2 → 4 m — correndo SEM pular a queda não alcança o outro
    // lado, pulando sobra ~1 m) e um desabamento de 27 m com 3 colunas. Longe do pedaço da malha que desenha com a superfície
    // (≈ 70–150° da volta, o lado oeste) — perto da boca do Pico a malha não muda.
    spiral: { yTop: 38, inner: 0.84, a0: 0.848, sweep: (345 * Math.PI) / 180, dir: 1, parkour: {
      gaps: [{ at: 30, w: 3.2 }, { at: 52, w: 3.5 }, { at: 180, w: 27 }, { at: 230, w: 3.8 }, { at: 262, w: 4 }],
      stones: [{ at: 172.4, e: 0.92, r: 2 }, { at: 180, e: 0.92, r: 2 }, { at: 187.6, e: 0.92, r: 2 }],
    } }, tint: [0.43, 0.33, 0.3] },
  // FENDA DO COVIL (05/11, Pedro: "o ideal seria no túnel, no caminho"): no meio do caminho entre o fundo do abismo e o
  // covil, uma rachadura alta (~68 m) e estreita na rocha, na faixa livre entre a galeria grande e a borda do covil — no
  // LESTE, onde a faixa é larga (mais perto, a "aura" de chão do covil invadia o vão e fazia chão invisível) e a 5 m da
  // divisa dos pedaços da malha (fica inteira nos pedaços do fundo: perto da boca do Pico a malha não cresce); ~40 m de
  // morro em cima. No meio, o PRECIPÍCIO (36 m de vão, 28 m de fundo) — atravessa pulando de coluna em coluna (5
  // colunas, 3–3,4 m entre elas: correndo SEM pular a queda não alcança; pulando sobra ~1,5 m). Caiu = volta pro
  // checkpoint da beirada (zs-chasm.ts) com 25% de dano.
  { id: 'fenda', name: 'fenda do covil', x: -1035, z: -267, y: 40, rx: 30, rz: 10, h: 34, yaw: 0, lobe: 0.8, shaft: 6,
    // 05/11 noite: + a BEIRADA no canto (lado +v, 2,4 m da parede) com 2 vãos de 2,8 m — o outro jeito de atravessar
    chasm: { u0: -18, u1: 18, depth: 28, ledge: { side: 1, w: 2.4, gaps: [{ u: -6, w: 2.8 }, { u: 7, w: 2.8 }] }, stones: [
      { u: -13.2, v: 0, r: 1.8, dy: 0 }, { u: -6.6, v: 1.2, r: 1.8, dy: 0.5 }, { u: 0, v: -1, r: 1.8, dy: 0 },
      { u: 6.6, v: 1, r: 1.8, dy: -0.4 }, { u: 13.2, v: -1.2, r: 1.8, dy: 0.3 }] },
    tint: [0.41, 0.34, 0.31] },
];

/** INIMIGOS DA CAVERNA];

/** INIMIGOS DA CAVERNA (31/10, Pedro: "falta os inimigos dentro da cave"): Fauce de Sílex e Aberração (os bichos da mata
 *  alta) espalhados nos salões — [salão, espécie, u, v] (u/v = fração do raio do salão). Nascem como FAUNA
 *  (`wild_cave_*`): força pela região (a caverna fica embaixo da Tijuca), renascem em casa, no chão da caverna. */
export const CAVE_ENEMIES: readonly (readonly [string, string, number, number])[] = [
  ['encruzilhada', 'flintmaw', 0.3, -0.3],
  ['corcovado', 'flintmaw', 0.35, 0.3], ['corcovado', 'flintmaw', -0.4, -0.2],
  ['agua', 'monster', 0.55, -0.4], ['agua2', 'flintmaw', -0.3, 0.45],
  ['grande', 'monster', 0.3, 0.35], ['grande', 'monster', -0.35, -0.3], ['grande', 'flintmaw', 0.55, -0.25],
  ['poco', 'monster', 0.5, 0.3],
  ['cristais', 'flintmaw', 0.3, 0.4], ['cristais', 'flintmaw', -0.35, -0.45],
  ['cosme', 'monster', 0.35, -0.3], ['cosme', 'flintmaw', -0.4, 0.2],
  // 02/11 (Pedro: "um pouco mais de inimigo na cave"): +8 — só NO FIM da lista (os ids de cima não mudam); 2–4 por salão,
  // sem bolo (o que pesa é muitos juntos perto de você, 31/10)
  ['encruzilhada', 'monster', -0.35, 0.35],
  ['corcovado', 'monster', 0.05, 0.5],
  ['agua2', 'monster', 0.45, -0.35],
  ['grande', 'flintmaw', -0.55, 0.35], ['grande', 'monster', 0.1, -0.55],
  ['poco', 'flintmaw', -0.45, -0.35],
  ['cristais', 'monster', 0.05, -0.1],
  ['cosme', 'flintmaw', 0.1, 0.5],
  // 02/11 noite: o abismo do Pico da Tijuca (no fundo do poço) e o salão do Alto da Boa Vista — no FIM (ids de cima iguais)
  ['abismo', 'monster', 0.2, 0.1], ['abismo', 'flintmaw', -0.3, -0.2], ['abismo', 'monster', -0.1, 0.35],
  ['salao-alto', 'flintmaw', 0.3, 0.3], ['salao-alto', 'monster', -0.4, -0.2], ['salao-alto', 'monster', 0.1, -0.5],
  // 03/11 (Pedro: "cave pode por mais uns 15–20% de inimigos VARIADOS"; e antes: "canibal dentro da cave, espalhado"):
  // +11 (62 → 73, +17,7%) com espécies NOVAS na caverna — no FIM (ids de cima iguais). Canibal só nos salões grandes (3,4 m,
  // versão comum: CAVE_TUNE), brutamontes, e o Puglin (minion rápido) pelos salões menores.
  ['grande', 'raider_cannibal', -0.1, 0.15], ['abismo', 'raider_cannibal', 0.35, -0.35], ['salao-alto', 'raider_cannibal', -0.15, 0.4],
  ['corcovado', 'raider_brute', -0.15, -0.45], ['cristais', 'raider_brute', 0.45, -0.2], ['cosme', 'raider_brute', -0.2, -0.45],
  ['encruzilhada', 'raider_puglin', 0.1, 0.45], ['agua', 'raider_puglin', -0.3, 0.3], ['poco', 'raider_puglin', 0.05, -0.5],
  ['agua2', 'raider_puglin', 0.1, -0.1], ['grande', 'raider_puglin', 0.45, 0.05],
];
/** Força na CAVERNA por espécie: `game/data/cave-tune` (vale também depois da força pela região). */
export { CAVE_TUNE } from '@/game/data/cave-tune';

/** MINÉRIO DE FERRO NA CAVERNA (02/11, Pedro: "minério dentro da cave — exato e um pouco mais"; e a Zona Sul não tinha
 *  veio de ferro: o skate/carro/navio custam ferro). Igual ARK (metal na caverna): veios no chão dos salões, perto da
 *  parede — [salão, ângulo (graus, no referencial do salão), fração do raio]. Mais no fundo = mais veio (o salão do
 *  chefe tem 3). Veio do jogo (12 de ferro, picareta, renasce em 3 min) → 18 × 12 = 216 por volta. */
export const CAVE_ORE: readonly (readonly [string, number, number])[] = [
  ['encruzilhada', 200, 0.6],
  ['corcovado', 20, 0.72], ['corcovado', 150, 0.7], ['corcovado', 260, 0.68],
  ['agua', 100, 0.72],
  ['agua2', 300, 0.65],
  ['grande', 40, 0.72], ['grande', 130, 0.7], ['grande', 220, 0.72], ['grande', 310, 0.68],
  ['chefe', 60, 0.7], ['chefe', 180, 0.72], ['chefe', 290, 0.7],
  ['cristais', 80, 0.66], ['cristais', 250, 0.66],
  ['poco', 160, 0.6],
  ['cosme', 30, 0.68], ['cosme', 210, 0.66],
  // 02/11 noite (no FIM — ids de cima iguais): fundo do abismo e salão do Alto da Boa Vista
  ['abismo', 120, 0.6], ['abismo', 250, 0.55],
  ['salao-alto', 30, 0.7], ['salao-alto', 160, 0.7], ['salao-alto', 280, 0.7],
];

/** O CHEFE mora no salão do fundo: a Aberração Fúngica (o chefão das hordas), com 1,5× a vida — é o fim da caverna. */
export const CAVE_BOSS = { id: 'zs_cave_boss', speciesId: 'raider_mushroom', x: -560, z: -196, hpK: 1.5 } as const;
/** Os primeiros metros de cada boca contam como SUPERFÍCIE (bicho de fora entra atrás de você; ninguém briga através
 *  da rocha mais pra dentro). */
export const CAVE_MOUTH_ZONE = 14;
/** Caixas dos túneis curtos de rua (`open`, 03/11): o meio do Novo fica a ~17 m das bocas — passaria da zona da boca e
 *  quem está lá fora (bicho, amigo, luz da rua) sumiria por uns metros. Dentro da caixa é SUPERFÍCIE. */
const OPEN_BOXES = CAVE_TUNNELS.filter((t) => t.open).map((t) => {
  const pad = Math.max(...t.pts.map((p) => p.r)) + 2;
  return { x0: Math.min(...t.pts.map((p) => p.x)) - pad, x1: Math.max(...t.pts.map((p) => p.x)) + pad, z0: Math.min(...t.pts.map((p) => p.z)) - pad, z1: Math.max(...t.pts.map((p) => p.z)) + pad, y1: Math.max(...t.pts.map((p) => p.y + p.h)) + 2 };
});
/** Mais pra dentro que a zona da boca (= camada da caverna)? `md` = caveMouthDist já calculado. Túnel curto de rua: não. */
export function caveDeep(x: number, y: number, z: number, md = caveMouthDist(x, y, z)): boolean {
  if (md <= CAVE_MOUTH_ZONE) return false;
  for (const b of OPEN_BOXES) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.y1) return false;
  return true;
}
/** Água das poças: a lâmina fica 4 cm abaixo do chão do salão. */
const POOL_Y = -0.04;
/** O buraco do chão do mapa começa este tanto (m) DEPOIS do plano da boca: o chão do mapa cobre o cantinho arredondado
 *  da malha (voxel de 1,6 m) — sem fresta pro céu. */
export const CAVE_HOLE_IN = 0.3;

/* ------------------------------------------------------------------ peças (pré-calculadas) */

type Seg = { ax: number; az: number; ay: number; bx: number; bz: number; by: number; ra: number; rb: number; ha: number; hb: number; abx: number; abz: number; l2: number; cap: boolean; tunnel: number };
type Room = CaveRoom & { c: number; s: number; m: number; seed: number };
type Pillar = { x: number; z: number; r: number };

const SEGS: Seg[] = [];
CAVE_TUNNELS.forEach((tn, ti) => {
  for (let i = 0; i + 1 < tn.pts.length; i++) {
    const a = tn.pts[i]!, b = tn.pts[i + 1]!, abx = b.x - a.x, abz = b.z - a.z;
    SEGS.push({ ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, ra: a.r, rb: b.r, ha: a.h, hb: b.h, abx, abz, l2: abx * abx + abz * abz, cap: !!tn.mouth && i === 0, tunnel: ti });
  }
});
const ROOMS: Room[] = CAVE_ROOMS.map((r, i) => ({ ...r, c: Math.cos(r.yaw), s: Math.sin(r.yaw), m: Math.min(r.rx, r.rz, r.h), seed: i * 31.7 }));
const PILLARS: Pillar[] = CAVE_ROOMS.flatMap((r) => r.pillars ?? []);
/** Salões com FENDA (05/11 — o precipício no caminho do Canibal). */
const CH_ROOMS = ROOMS.filter((r) => r.chasm);
/** Salões com rampa de PARKOUR (05/11 noite — o covil). */
const PK_ROOMS = ROOMS.filter((r) => r.spiral?.parkour);

/** As BOCAS: o 1º trecho de cada túnel com boca (o shader do chão abre o buraco nele). */
export type CaveMouth = { id: string; name: string; ax: number; az: number; ay: number; bx: number; bz: number; by: number; ra: number; rb: number; ha: number; hb: number };
export const ZS_CAVE_MOUTHS: CaveMouth[] = CAVE_TUNNELS.filter((t) => t.mouth).map((t) => {
  const a = t.pts[0]!, b = t.pts[1]!;
  return { id: t.id, name: t.name, ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, ra: a.r, rb: b.r, ha: a.h, hb: b.h };
});

/* ------------------------------------------------------------------ grade 2D (só as peças perto de cada ponto) */

const CELL = 16, PAD = 9;
let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
const boxes2: { x0: number; z0: number; x1: number; z1: number; kind: 0 | 1 | 2; i: number }[] = [];
SEGS.forEach((s, i) => boxes2.push({ x0: Math.min(s.ax, s.bx) - Math.max(s.ra, s.rb) * 1.5 - PAD, x1: Math.max(s.ax, s.bx) + Math.max(s.ra, s.rb) * 1.5 + PAD, z0: Math.min(s.az, s.bz) - Math.max(s.ra, s.rb) * 1.5 - PAD, z1: Math.max(s.az, s.bz) + Math.max(s.ra, s.rb) * 1.5 + PAD, kind: 0, i }));
ROOMS.forEach((r, i) => { const R = Math.max(r.rx, r.rz) * 1.35 + r.lobe + PAD; boxes2.push({ x0: r.x - R, x1: r.x + R, z0: r.z - R, z1: r.z + R, kind: 1, i }); });
PILLARS.forEach((p, i) => boxes2.push({ x0: p.x - p.r - 3, x1: p.x + p.r + 3, z0: p.z - p.r - 3, z1: p.z + p.r + 3, kind: 2, i }));
for (const b of boxes2) { gx0 = Math.min(gx0, b.x0); gz0 = Math.min(gz0, b.z0); gx1 = Math.max(gx1, b.x1); gz1 = Math.max(gz1, b.z1); }
gx0 = Math.floor(gx0 / CELL) * CELL; gz0 = Math.floor(gz0 / CELL) * CELL;
const GW = Math.ceil((gx1 - gx0) / CELL) + 1, GH = Math.ceil((gz1 - gz0) / CELL) + 1;
type GCell = { segs: number[]; rooms: number[]; pillars: number[] };
const GRID: (GCell | null)[] = new Array(GW * GH).fill(null);
for (const b of boxes2) {
  for (let j = Math.floor((b.z0 - gz0) / CELL); j <= Math.floor((b.z1 - gz0) / CELL); j++) {
    for (let i = Math.floor((b.x0 - gx0) / CELL); i <= Math.floor((b.x1 - gx0) / CELL); i++) {
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const c = GRID[j * GW + i] ?? (GRID[j * GW + i] = { segs: [], rooms: [], pillars: [] });
      (b.kind === 0 ? c.segs : b.kind === 1 ? c.rooms : c.pillars).push(b.i);
    }
  }
}
function cellOf(x: number, z: number): GCell | null {
  const i = Math.floor((x - gx0) / CELL), j = Math.floor((z - gz0) / CELL);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return null;
  return GRID[j * GW + i]!;
}
/** Tem caverna perto de (x, z)? (conta de grade — barato pra quem está longe) */
export function caveNearXZ(x: number, z: number): boolean { return cellOf(x, z) !== null; }

/* ------------------------------------------------------------------ chão do mapa (pra boca) */

let groundAt: (x: number, z: number) => number = () => Infinity;
/** Liga a caverna ao chão do mapa (a boca nunca fica com o chão acima da encosta). */
export function setCaveTerrain(t: ZsTerrain | null): void { groundAt = t ? (x, z) => zsHeightAt(t, x, z) : () => Infinity; }

/* ------------------------------------------------------------------ ruído + contas */

export const CAVE_BIG = 1e3;
function hash3(i: number, j: number, k: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Ruído de valor 3D, 0..1 (suave). */
export function caveNoise(x: number, y: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
  const e = hash3(i, j, k + 1), f = hash3(i + 1, j, k + 1), g = hash3(i, j + 1, k + 1), h = hash3(i + 1, j + 1, k + 1);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}
const smooth01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
/** União suave (raio K m): emendas de túnel e salão sem quina. */
const K = 3;
function smin(a: number, b: number): number {
  const h = Math.max(K - Math.abs(a - b), 0) / K;
  return Math.min(a, b) - h * h * K * 0.25;
}
/** Distância até a boca mais perto (3D). */
export function caveMouthDist(x: number, y: number, z: number): number {
  let best = Infinity;
  for (const m of ZS_CAVE_MOUTHS) best = Math.min(best, Math.hypot(x - m.ax, y - m.ay, z - m.az));
  return best;
}
/** Rugosidade da rocha: lisa nas bocas (o buraco do chão casa certinho com o túnel), cheia a 32 m pra dentro. */
function roughAt(x: number, y: number, z: number): number { return 0.85 * smooth01((caveMouthDist(x, y, z) - 16) / 16); }

function segVal(s: Seg, x: number, y: number, z: number): number {
  let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2;
  // boca: corte RETO no plano da boca (fora dela é a encosta) — como distância (contínua), pra malha fechar certinho
  const cut = s.cap && t < 0 ? -t * Math.sqrt(s.l2) : -Infinity;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - (s.ax + s.abx * t), dz = z - (s.az + s.abz * t);
  const r = s.ra + (s.rb - s.ra) * t, h = s.ha + (s.hb - s.ha) * t, yf = s.ay + (s.by - s.ay) * t;
  const q = (dx * dx + dz * dz) / (r * r) + ((y - yf) / h) ** 2;
  return Math.max((Math.sqrt(q) - 1) * Math.min(r, h), cut);
}
function roomUV(r: Room, x: number, z: number): [number, number] {
  const dx = x - r.x, dz = z - r.z;
  return [dx * r.c + dz * r.s, -dx * r.s + dz * r.c];
}
function roomVal(r: Room, x: number, y: number, z: number): number {
  const [u, v] = roomUV(r, x, z);
  // poço (abismo): eixo vertical com expoente alto = parede quase reta; o resto, a cúpula de sempre (conta igual)
  const q = (u / r.rx) ** 2 + (v / r.rz) ** 2 + (r.shaft ? Math.abs((y - r.y) / r.h) ** r.shaft : ((y - r.y) / r.h) ** 2);
  const lobe = (caveNoise(x * 0.05 + r.seed, y * 0.07, z * 0.05) - 0.5) * 2 * r.lobe;
  return (Math.sqrt(q) - 1) * r.m - lobe;
}
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
type RampGeo = Pick<CaveRoom, 'rx' | 'rz' | 'y' | 'spiral'>;
type Spiral = NonNullable<CaveRoom['spiral']>;
/** Ângulo ao longo da volta (0..2π a partir do balcão, no sentido da descida). */
function rampA(sp: Spiral, r: RampGeo, u: number, v: number): number { return ((sp.dir * (Math.atan2(v / r.rz, u / r.rx) - sp.a0)) % TAU + TAU) % TAU; }
/** Parkour da rampa pré-calculado: as 2 bordas de cada vão (direção no plano), o centro/topo de cada coluna e as faixas de
 *  graus perto de cada peça (só ali a conta muda — no resto a rampa é a de sempre, bit por bit). */
type RampPre = { gaps: { n1u: number; n1v: number; n2u: number; n2v: number; mu: number; mv: number }[]; stones: { u: number; v: number; r: number; top: number }[]; spans: [number, number][] };
const RP = new WeakMap<object, RampPre>();
function rampPre(r: RampGeo): RampPre | null {
  const sp = r.spiral, pk = sp?.parkour;
  if (!sp || !pk) return null;
  const hit = RP.get(sp); if (hit) return hit;
  const rm = ((sp.inner + 1) / 2) * ((r.rx + r.rz) / 2); // raio do meio da rampa (m): largura do vão → graus
  const dirAt = (a: number): [number, number] => { const th = sp.a0 + sp.dir * a, x = r.rx * Math.cos(th), z = r.rz * Math.sin(th), l = Math.hypot(x, z); return [x / l, z / l]; };
  const spans: [number, number][] = [];
  const pre: RampPre = {
    gaps: pk.gaps.map((g) => { const ha = g.w / 2 / rm, ac = g.at * DEG; spans.push([ac - ha - 8 * DEG, ac + ha + 8 * DEG]); const [n1u, n1v] = dirAt(ac - ha), [n2u, n2v] = dirAt(ac + ha), [mu, mv] = dirAt(ac); return { n1u, n1v, n2u, n2v, mu, mv }; }),
    stones: pk.stones.map((s) => { const a = s.at * DEG, th = sp.a0 + sp.dir * a; return { u: s.e * r.rx * Math.cos(th), v: s.e * r.rz * Math.sin(th), r: s.r, top: sp.yTop - (a / sp.sweep) * (sp.yTop - r.y) }; }),
    spans,
  };
  RP.set(sp, pre);
  return pre;
}
const rampNear = (pre: RampPre, a: number) => pre.spans.some(([lo, hi]) => a >= lo && a <= hi);
/** O vão da rampa é um POÇO de RAMP_PIT_D m (o "abismo preto do parkour"): quem cai é pego aos 9 m (3 m antes do fundo) e volta pro checkpoint —
 *  nunca chega no fundo dele. Não abre até o chão da arena (85 m de parede a menos na malha). */
export const RAMP_PIT_D = 12;
/** Distância (m, > 0 = dentro) do anel da rampa (fora do miolo). */
function ringD(sp: Spiral, r: RampGeo, u: number, v: number): number { const th = Math.atan2(v / r.rz, u / r.rx); return (Math.hypot(u / r.rx, v / r.rz) - sp.inner) * Math.hypot(r.rx * Math.cos(th), r.rz * Math.sin(th)); }
/** Distância (m, > 0 = em cima) até a borda da COLUNA da rampa. */
function rampStoneD(s: RampPre['stones'][number], u: number, v: number): number { const d = s.r - Math.hypot(u - s.u, v - s.v), k = smooth01((d + 1) / 0.6); return k > 0 ? d + edgeNoise(u, v, 71) * 0.4 * k : d; }
/** Distância (m, > 0 = rampa) até a borda do que dá pra pisar: a borda de dentro e os vãos. */
function rampLedgeD(sp: Spiral, pre: RampPre, r: RampGeo, u: number, v: number): number {
  const th = Math.atan2(v / r.rz, u / r.rx);
  let d = (Math.hypot(u / r.rx, v / r.rz) - sp.inner) * Math.hypot(r.rx * Math.cos(th), r.rz * Math.sin(th));
  for (const g of pre.gaps) {
    if (g.mu * u + g.mv * v <= 0) continue; // o vão é só deste lado do centro
    const raw = Math.min(sp.dir * (g.n1u * v - g.n1v * u), -sp.dir * (g.n2u * v - g.n2v * u)), k = smooth01((raw + 1) / 0.6);
    d = Math.min(d, -(raw + (k > 0 ? edgeNoise(u, v, 31) * 0.5 * k : 0)));
  }
  return d;
}
/** Altura da RAMPA EM ESPIRAL no ponto (u, v) do salão; null = miolo (fundo do poço), fora da volta ou — com parkour — o
 *  vão (cai). Coluna do parkour: o topo dela. */
export function spiralY(r: RampGeo, u: number, v: number): number | null {
  const sp = r.spiral;
  if (!sp || Math.hypot(u / r.rx, v / r.rz) <= sp.inner) return null;
  const a = rampA(sp, r, u, v); // 0..2π a partir do começo
  if (a > sp.sweep) return null;
  const pre = rampPre(r);
  if (pre && rampNear(pre, a)) {
    let top = -Infinity;
    for (const s of pre.stones) if (rampStoneD(s, u, v) > 0) top = Math.max(top, s.top);
    if (top > -Infinity) return top;
    if (rampLedgeD(sp, pre, r, u, v) <= 0) return sp.yTop - (a / sp.sweep) * (sp.yTop - r.y) - RAMP_PIT_D; // o fundo do poço do vão
  }
  return sp.yTop - (a / sp.sweep) * (sp.yTop - r.y);
}
/** No vão da rampa (o poço do parkour)? (no anel, fora da coluna, entre as bordas) */
function rampGapAt(r: RampGeo, u: number, v: number): boolean {
  const sp = r.spiral, pre = rampPre(r);
  if (!sp || !pre || Math.hypot(u / r.rx, v / r.rz) <= sp.inner) return false;
  const a = rampA(sp, r, u, v);
  if (a > sp.sweep || !rampNear(pre, a)) return false;
  if (pre.stones.some((s) => rampStoneD(s, u, v) > 0)) return false;
  return rampLedgeD(sp, pre, r, u, v) <= 0;
}
/** Rocha da RAMPA COM PARKOUR em (u, y, v) — a MESMA borda do `spiralY`, como distância (a malha corta o vão exato). */
function rampRock(r: Room, u: number, v: number, y: number, a: number): number {
  const sp = r.spiral!, pre = rampPre(r)!, h = sp.yTop - (a / sp.sweep) * (sp.yTop - r.y);
  let rock = Math.max(r.y - y, Math.min(h - y, rampLedgeD(sp, pre, r, u, v)), Math.min(h - RAMP_PIT_D - y, ringD(sp, r, u, v)));
  for (const s of pre.stones) rock = Math.max(rock, Math.min(s.top - y, rampStoneD(s, u, v)));
  return rock;
}
/** Borda irregular da FENDA (rocha quebrada, poucos cm — o pulo fica previsível) — só no plano: o que se vê é o que se pisa. */
const edgeNoise = (u: number, v: number, s: number) => (caveNoise(u * 0.4 + s, 5.5, v * 0.4 + s) - 0.5) * 0.6;
/** Distância (m, > 0 = beirada) até a borda do PRECIPÍCIO da fenda (o vão vai de u0 a u1). */
function chasmLedgeD(ch: CaveChasm, u: number, v: number): number {
  const raw = Math.max(ch.u0 - u, u - ch.u1), k = smooth01((1 - Math.abs(raw)) / 0.6); // ruído só perto da borda
  return k > 0 ? raw + edgeNoise(u, v, 31) * 0.5 * k : raw;
}
/** Distância (m, > 0 = em cima) até a borda da COLUNA. */
function chasmStoneD(s: CaveChasm['stones'][number], u: number, v: number): number {
  const d = s.r - Math.hypot(u - s.u, v - s.v), k = smooth01((d + 1) / 0.6);
  return k > 0 ? d + edgeNoise(u, v, 71) * 0.4 * k : d;
}
/** Distância (m, > 0 = em cima) até a borda da BEIRADA do canto (colada na parede, com os vãos dela). */
function sideLedgeD(r: Pick<CaveRoom, 'rx' | 'rz'>, ch: CaveChasm, u: number, v: number): number {
  const L = ch.ledge; if (!L) return -Infinity;
  const edge = r.rz * Math.sqrt(Math.max(0, 1 - (u / r.rx) ** 2));
  let d = v * L.side - (edge - L.w);
  for (const g of L.gaps) d = Math.min(d, Math.abs(u - g.u) - g.w / 2);
  return d;
}
/** Chão da FENDA em (u, v): a beirada (o chão do salão), a coluna (o topo dela), a beirada do canto ou o fundo do precipício. */
function chasmFloor(r: Pick<CaveRoom, 'y' | 'rx' | 'rz'>, ch: CaveChasm, u: number, v: number): number {
  let top = -Infinity;
  for (const s of ch.stones) if (chasmStoneD(s, u, v) > 0) top = Math.max(top, r.y + s.dy);
  if (top > -Infinity) return top;
  return chasmLedgeD(ch, u, v) > 0 || sideLedgeD(r, ch, u, v) > 0 ? r.y : r.y - ch.depth;
}
/** Rocha da FENDA em (u, y, v) como DISTÂNCIA (m) — a mesma borda do `chasmFloor`: a malha corta a beirada e a coluna
 *  exatamente onde o pé cai (sem a escada de 1,6 m do voxel). */
function chasmRock(r: Room, ch: CaveChasm, u: number, v: number, y: number): number {
  let rock = Math.max(r.y - ch.depth - y, Math.min(r.y - y, Math.max(chasmLedgeD(ch, u, v), sideLedgeD(r, ch, u, v))));
  for (const s of ch.stones) rock = Math.max(rock, Math.min(r.y + s.dy - y, chasmStoneD(s, u, v)));
  return rock;
}
function roomFloor(r: Room, u: number, v: number): number {
  let y = r.chasm ? chasmFloor(r, r.chasm, u, v) : r.y;
  if (r.spiral) { const s = spiralY(r, u, v); if (s !== null) y = Math.max(y, s); }
  for (const p of r.pools ?? []) {
    const e = Math.hypot((u - p.u) / p.rx, (v - p.v) / p.rz);
    if (e < 1) y -= p.depth * smooth01((1 - e) / 0.6);
  }
  return y;
}

/** ANDARES (02/11 noite, Pedro: o Zuzu Angel passa POR CIMA do túnel do Leblon; galerias em andares no abismo do Pico
 *  da Tijuca): onde os chãos das peças em volta de um ponto diferem mais que CAVE_STACK m, cada grupo de chãos parecidos
 *  é um ANDAR — com o seu chão e o seu teto — e os andares se somam (laje de rocha entre eles). Onde não (toda a caverna
 *  de 30–31/10), a conta é EXATAMENTE a de antes (um chão por ponto, emendado suave). */
export const CAVE_STACK = 4;
// peças em volta do ponto (reaproveitado — nada criado por chamada): chão, peso, código (seg ≥ 0 · salão = −1 − i), andar
const PN_MAX = 96;
const PF = new Float64Array(PN_MAX), PW = new Float64Array(PN_MAX), PK = new Int32Array(PN_MAX), PL = new Int32Array(PN_MAX);
let PN = 0;
const LV_F = new Float64Array(16), LV_W = new Float64Array(16), LV_LO = new Float64Array(16);
let LVN = 0;
/** Junta as peças da célula com o chão (projeção) e o peso de cada uma em (x, z). */
function gather(c: GCell, x: number, z: number): void {
  PN = 0;
  for (const i of c.segs) {
    const s = SEGS[i]!;
    let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2;
    const out = s.cap && t < -0.12; // boca: o chão vai só um pouquinho além do plano (o corte fica contínuo)
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const r = s.ra + (s.rb - s.ra) * t;
    const d = Math.hypot(x - (s.ax + s.abx * t), z - (s.az + s.abz * t));
    if (PN >= PN_MAX) break;
    PF[PN] = s.ay + (s.by - s.ay) * t; PW[PN] = out ? 0 : smooth01((1.4 * r - d) / (0.85 * r)); PK[PN] = i; PN++;
  }
  for (const i of c.rooms) {
    const r = ROOMS[i]!;
    const [u, v] = roomUV(r, x, z);
    const e = Math.hypot(u / r.rx, v / r.rz);
    if (PN >= PN_MAX) break;
    PF[PN] = roomFloor(r, u, v); PW[PN] = smooth01((1.3 - e) / 0.5); PK[PN] = -1 - i; PN++;
  }
}
/** Andares do ponto (depois de `gather`): agrupa os chãos (peças com peso) com folga ≤ CAVE_STACK; cada peça (até as sem
 *  peso) vai pro andar de chão mais perto. false = um andar só (a conta de antes). */
function levels(): boolean {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < PN; k++) if (PW[k]! > 0) { lo = Math.min(lo, PF[k]!); hi = Math.max(hi, PF[k]!); }
  if (!(hi - lo > CAVE_STACK)) return false;
  // chãos com peso, em ordem; corta onde o salto passa de CAVE_STACK
  const ord: number[] = [];
  for (let k = 0; k < PN; k++) if (PW[k]! > 0) ord.push(k);
  ord.sort((a, b) => PF[a]! - PF[b]!);
  LVN = 0;
  let prev = -Infinity;
  for (const k of ord) {
    if (PF[k]! - prev > CAVE_STACK && LVN < 16) { LV_F[LVN] = 0; LV_W[LVN] = 0; LV_LO[LVN] = PF[k]!; LVN++; }
    prev = PF[k]!;
    const L = LVN - 1; LV_F[L] = LV_F[L]! + PW[k]! * PF[k]!; LV_W[L] = LV_W[L]! + PW[k]!; PL[k] = L;
  }
  if (LVN <= 1) return false; // descida contínua (sem salto > CAVE_STACK): um andar só — a conta de antes, idêntica
  for (let L = 0; L < LVN; L++) LV_F[L] = LV_F[L]! / LV_W[L]!;
  for (let k = 0; k < PN; k++) if (!(PW[k]! > 0)) { let b = 0; for (let L = 1; L < LVN; L++) if (Math.abs(PF[k]! - LV_F[L]!) < Math.abs(PF[k]! - LV_F[b]!)) b = L; PL[k] = b; }
  return true;
}
/** Andar de quem está com os pés em `yRef`: o de chão mais ALTO até `tol` acima do pé; abaixo de todos, o mais baixo. */
function levelAt(yRef: number, tol: number): number {
  let best = -1;
  for (let L = 0; L < LVN; L++) if (LV_F[L]! <= yRef + tol && (best < 0 || LV_F[L]! > LV_F[best]!)) best = L;
  return best < 0 ? 0 : best;
}

/** Chão da caverna em (x, z) (null = rocha: não tem caverna ali). Plano por trecho, emendado suave; nas bocas nunca
 *  passa da encosta (o chão do túnel encontra o chão do mapa). Com ANDARES, `yRef` (o pé) escolhe o andar; sem ele, o
 *  de baixo. */
export function caveFloorAt(x: number, z: number, yRef?: number, tol = 0.9): number | null {
  const c = cellOf(x, z);
  if (!c) return null;
  return floorIn(c, x, z, yRef, tol);
}
function floorIn(c: GCell, x: number, z: number, yRef?: number, tol = 0.9): number | null {
  gather(c, x, z);
  let sw = 0, sf = 0;
  if (levels()) {
    const L = yRef === undefined ? 0 : levelAt(yRef, tol);
    sw = LV_W[L]!; sf = LV_F[L]! * sw;
  } else {
    for (let k = 0; k < PN; k++) { const w = PW[k]!; if (w <= 0) continue; sw += w; sf += w * PF[k]!; }
  }
  if (sw <= 1e-6) return null;
  // 5 cm abaixo do chão do mapa quando o segue (beira baixa da boca): o chão do mapa cobre, sem piscar
  return Math.min(sf / sw, groundAt(x, z) - 0.05);
}
/** Rugosidade + pilares em cima do valor das peças, e o chão (igual pra cada andar). */
function finish(c: GCell, f: number, fl: number, x: number, y: number, z: number): number {
  const amp = roughAt(x, y, z);
  if (amp > 0) f += ((caveNoise(x * 0.16, y * 0.16, z * 0.16) - 0.5) * 2 + (caveNoise(x * 0.42 + 17, y * 0.42, z * 0.42) - 0.5) * 0.7) * amp;
  for (const i of c.pillars) {
    const p = PILLARS[i]!;
    const d = Math.hypot(x - p.x, z - p.z) - p.r * (1 + 0.22 * (caveNoise(x * 0.3, y * 0.25, z * 0.3) - 0.5));
    f = Math.max(f, -d);
  }
  // RAMPA COM PARKOUR (o covil): só no anel da rampa e PERTO dos vãos/colunas (o resto: a conta de sempre)
  for (const r of PK_ROOMS) {
    if (Math.abs(x - r.x) > r.rx * 1.1 || Math.abs(z - r.z) > r.rz * 1.1) continue;
    const [u, v] = roomUV(r, x, z), sp = r.spiral!, pre = rampPre(r)!;
    const e = Math.hypot(u / r.rx, v / r.rz);
    if (e < sp.inner - 0.04 || e > 1.15) continue;
    const a = rampA(sp, r, u, v);
    if (a > sp.sweep || !rampNear(pre, a)) continue;
    if (Math.abs(fl - roomFloor(r, u, v)) > 1e-6) continue; // outra peça emendando ali
    return Math.max(f, rampRock(r, u, v, y, a));
  }
  // FENDA (o precipício no caminho do Canibal): onde o chão é só dela, a beirada/coluna vem como distância (malha exata)
  for (const r of CH_ROOMS) {
    const R = Math.max(r.rx, r.rz) * 1.35;
    if (Math.abs(x - r.x) > R || Math.abs(z - r.z) > R) continue;
    const [u, v] = roomUV(r, x, z), ch = r.chasm!;
    if (u < ch.u0 - 4 || u > ch.u1 + 4) continue; // longe do precipício: a conta de sempre
    if (Math.abs(fl - roomFloor(r, u, v)) > 1e-6) continue; // outra peça emendando ali: a conta de sempre
    return Math.max(f, chasmRock(r, ch, u, v, y));
  }
  return Math.max(f, fl - y);
}

/**
 * A CAVERNA: valor < 0 = ar da caverna; > 0 = rocha (ou fora dela). Aproximadamente a distância em metros até a parede.
 * Fora da área da caverna: CAVE_BIG (uma conta de grade).
 */
export function caveField(x: number, y: number, z: number): number {
  const c = cellOf(x, z);
  if (!c) return CAVE_BIG;
  gather(c, x, z);
  if (!levels()) {
    // um andar só: a conta de sempre (o mesmo chão de `floorIn`, sem juntar as peças de novo)
    let sw = 0, sf = 0;
    for (let k = 0; k < PN; k++) { const w = PW[k]!; if (w <= 0) continue; sw += w; sf += w * PF[k]!; }
    if (sw <= 1e-6) return CAVE_BIG;
    const fl = Math.min(sf / sw, groundAt(x, z) - 0.05);
    let f = CAVE_BIG;
    for (const i of c.segs) f = smin(f, segVal(SEGS[i]!, x, y, z));
    for (const i of c.rooms) f = smin(f, roomVal(ROOMS[i]!, x, y, z));
    if (f >= CAVE_BIG * 0.5) return CAVE_BIG;
    return finish(c, f, fl, x, y, z);
  }
  // ANDARES: cada um é uma caverna com o seu chão; o ar é a soma deles
  const g = groundAt(x, z) - 0.05;
  let best = CAVE_BIG;
  // (segVal/roomVal/finish não juntam peças: PK/PL/LV_F seguem valendo no laço)
  for (let L = 0; L < LVN; L++) {
    let f = CAVE_BIG;
    for (let k = 0; k < PN; k++) if (PL[k] === L) f = smin(f, PK[k]! >= 0 ? segVal(SEGS[PK[k]!]!, x, y, z) : roomVal(ROOMS[-1 - PK[k]!]!, x, y, z));
    if (f >= CAVE_BIG * 0.5) continue;
    best = Math.min(best, finish(c, f, Math.min(LV_F[L]!, g), x, y, z));
  }
  return best;
}

/** O "ABISMO DO PARKOUR" em (x, z)? (05/11 noite, Pedro: "o checkpoint da queda é só quando cai no abismo preto do
 *  parkour; quando cai em local que anda do mapa normal não precisa") — o vão da FENDA (fora das colunas e da beirada) ou um
 *  VÃO da rampa do covil (no anel, entre as bordas). Cair da beira da rampa pro chão da arena NÃO é (lá se anda). */
export function caveChasmAt(x: number, z: number): string | null {
  for (const r of CH_ROOMS) {
    const [u, v] = roomUV(r, x, z), ch = r.chasm!;
    if (u <= ch.u0 || u >= ch.u1 || Math.hypot(u / r.rx, v / r.rz) > 1.05) continue;
    if (chasmFloor(r, ch, u, v) < r.y - 1) return r.id;
  }
  for (const r of PK_ROOMS) {
    const [u, v] = roomUV(r, x, z);
    if (rampGapAt(r, u, v)) return r.id;
  }
  return null;
}
/** Ar da caverna em (x, y, z)? */
export function caveAir(x: number, y: number, z: number): boolean { return caveField(x, y, z) < 0; }
/** Quem tem os pés em `feetY` está DENTRO da caverna? (conta meio metro acima do pé) */
export function caveInside(x: number, feetY: number, z: number): boolean { return caveField(x, feetY + 0.5, z) < 0; }
/** Camada: 1 = caverna (mais de CAVE_MOUTH_ZONE m pra dentro), 0 = superfície (inclui a boca). */
export function caveLayer(x: number, y: number, z: number): number {
  if (!caveInside(x, y, z)) return 0;
  return caveDeep(x, y, z) ? 1 : 0;
}
/** Rocha MESMO (pra tiro/visão de dentro da caverna): fora do ar da caverna e abaixo do chão do mapa. */
export function caveSolid(x: number, y: number, z: number): boolean { return caveField(x, y, z) > 0 && y < groundAt(x, z); }
/** Lâmina d'água da poça em (x, z) (null = seco). */
export function cavePoolY(x: number, z: number): number | null {
  const c = cellOf(x, z);
  if (!c) return null;
  for (const i of c.rooms) {
    const r = ROOMS[i]!;
    if (!r.pools) continue;
    const [u, v] = roomUV(r, x, z);
    for (const p of r.pools) if (Math.hypot((u - p.u) / p.rx, (v - p.v) / p.rz) < 1) return r.y + POOL_Y;
  }
  return null;
}
/** Onde estou (pro status): o salão mais perto, senão o túnel. */
export function caveRoomName(x: number, z: number): string {
  let best = '', bd = Infinity;
  for (const r of ROOMS) { const [u, v] = roomUV(r, x, z); const e = Math.hypot(u / r.rx, v / r.rz); if (e < 1.25 && e < bd) { bd = e; best = r.name; } }
  if (best) return best;
  let ds = Infinity;
  for (const s of SEGS) {
    let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.ax + s.abx * t), z - (s.az + s.abz * t));
    if (d < ds) { ds = d; best = CAVE_TUNNELS[s.tunnel]!.name; }
  }
  return best;
}
/** Árvore/bicho/acampamento NÃO nasce na boca (o buraco fica limpo). */
export function caveMouthClear(x: number, z: number, pad = 4): boolean {
  for (const m of ZS_CAVE_MOUTHS) {
    const abx = m.bx - m.ax, abz = m.bz - m.az, l2 = abx * abx + abz * abz;
    let t = ((x - m.ax) * abx + (z - m.az) * abz) / l2;
    if (t < -0.35 || t > 1.05) continue;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(x - (m.ax + abx * t), z - (m.az + abz * t)) < m.ra + (m.rb - m.ra) * t + pad) return false;
  }
  return true;
}

/** A caverna como CAMADA DE BAIXO do mapa (perfil do mundo): o jogo (bichos, tiro, luz, efeitos) pergunta por aqui. */
export function zsCaveUnder(t: ZsTerrain): UnderLayer {
  setCaveTerrain(t);
  return {
    floor: (x, z, feetY) => (caveInside(x, feetY, z) ? caveFloorAt(x, z, feetY) : null),
    floorAt: caveFloorAt,
    step: caveCreatureStep,
    layer: caveLayer,
    solid: caveSolid,
    inside: caveAir,
    homeY: (id, x, z) => (id.startsWith('zs_cave_') || id.startsWith('wild_cave_') ? caveFloorAt(x, z) : null),
  };
}

/* ------------------------------------------------------------------ andar */

export type CaveMove = { x: number; z: number; ground: number; inCave: boolean; wading: boolean };
const BODY_Y = 1.0, BODY_R = 0.3, HEAD_Y = 1.75, STEP_UP = 0.9;
/** Cabe um corpo em pé em (x, z) com o chão `fl`? (cintura com folga + cabeça) */
function bodyFits(x: number, fl: number, z: number): boolean {
  return caveField(x, fl + BODY_Y, z) < -BODY_R && caveField(x, fl + HEAD_Y, z) < -0.05;
}
/** Onde nasce cada inimigo da caverna (`CAVE_ENEMIES`): no salão, num chão onde cabe em pé (se a posição pedida cair na
 *  parede, puxa pro meio do salão). Puro. */
export function caveEnemySpots(): { id: string; speciesId: string; x: number; z: number }[] {
  const rooms = CAVE_ENEMIES.map(([room, speciesId, fu, fv], i) => {
    const r = ROOMS.find((q) => q.id === room)!;
    for (let k = 1; k >= 0; k -= 0.1) {
      const u = fu * r.rx * k, v = fv * r.rz * k, x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
      if (caveStandAt(x, z) !== null) return { id: `wild_cave_${room}_${i}`, speciesId, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
    }
    return { id: `wild_cave_${room}_${i}`, speciesId, x: r.x, z: r.z };
  });
  return [...rooms, ...caveTunnelEnemySpots()]; // os dos salões primeiro (ids de sempre), os dos túneis no fim
}

/**
 * INIMIGOS NOS TÚNEIS (03/11, Pedro: "boa parte da cave nos caminhos retos não vejo nenhum inimigo, bicho, nada pra matar —
 * fica tudo reto, sem perigo nenhum, fácil demais"). Os de `CAVE_ENEMIES` ficam só nos SALÕES; os túneis compridos
 * (Leblon ~280 m, passagem da Gávea ~330 m, Laranjeiras ~250 m, galerias grandes ~300 m) não tinham nada. Agora: um ponto a
 * cada CAVE_TUNNEL_STEP m ao longo de cada túnel de CAVERNA (os de rua — Zuzu, Novo — não), a ≥ CAVE_TUNNEL_MOUTH_CLEAR m
 * de qualquer boca e fora dos salões (eles já têm os deles); Aberração e Fauce de Sílex alternando e, a cada 3º ponto, uma
 * DUPLA lado a lado. Sempre no ANDAR do túnel (onde um túnel passa por cima de outro, o ponto fica de fora — o
 * renascer acha o chão sem saber o andar). Ids `wild_cave_tn_<túnel>_<n>` (fauna da caverna: força pela região, renasce em
 * casa). Puro.
 */
export const CAVE_TUNNEL_STEP = 60, CAVE_TUNNEL_MOUTH_CLEAR = 35;
export function caveTunnelEnemySpots(): { id: string; speciesId: string; x: number; z: number }[] {
  const out: { id: string; speciesId: string; x: number; z: number }[] = [];
  let alt = 0;
  for (const tn of CAVE_TUNNELS) {
    if (tn.road) continue;
    const segs: { a: CaveTunnelPt; b: CaveTunnelPt; l: number }[] = [];
    for (let i = 1; i < tn.pts.length; i++) { const a = tn.pts[i - 1]!, b = tn.pts[i]!; segs.push({ a, b, l: Math.hypot(b.x - a.x, b.z - a.z) }); }
    const L = segs.reduce((s, q) => s + q.l, 0);
    let n = 0, k = 0;
    for (let s = CAVE_TUNNEL_STEP / 2; s < L; s += CAVE_TUNNEL_STEP) {
      let rest = s, sg = segs[0]!;
      for (const q of segs) { sg = q; if (rest <= q.l) break; rest -= q.l; }
      const f = Math.min(1, rest / sg.l), x = sg.a.x + (sg.b.x - sg.a.x) * f, z = sg.a.z + (sg.b.z - sg.a.z) * f, y = sg.a.y + (sg.b.y - sg.a.y) * f;
      const r = sg.a.r + (sg.b.r - sg.a.r) * f, nx = -(sg.b.z - sg.a.z) / sg.l, nz = (sg.b.x - sg.a.x) / sg.l;
      if (ZS_CAVE_MOUTHS.some((m) => Math.hypot(x - m.ax, y - m.ay, z - m.az) < CAVE_TUNNEL_MOUTH_CLEAR)) continue;
      if (ROOMS.some((q) => Math.hypot(x - q.x, z - q.z) < Math.max(q.rx, q.rz) + 8 && Math.abs(y - q.y) < q.h)) continue;
      const pair = k++ % 3 === 2;
      for (const side of pair ? [-0.3, 0.3] : [0]) {
        const px = Math.round((x + nx * side * r) * 10) / 10, pz = Math.round((z + nz * side * r) * 10) / 10;
        const fl = caveStandAt(px, pz, y);
        if (fl === null || Math.abs(fl - y) > 2.5) continue;          // em pé no chão DESTE túnel
        const top = caveFloorAt(px, pz);
        if (top === null || Math.abs(top - fl) > 0.5) continue;       // túnel por cima/por baixo: fica de fora
        out.push({ id: `wild_cave_tn_${tn.id}_${n++}`, speciesId: alt++ % 2 ? 'flintmaw' : 'monster', x: px, z: pz });
      }
    }
  }
  return out;
}
/** Raios tentados (fração do pedido): o pedido; um pouco pra fora (salão com POÇA no meio — o seco é a beira); depois
 *  pro meio. Em cada um, o ângulo pedido e ±25°/±50°. */
const ORE_K = [1, 1.1, 1.2, 1.3, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
const ORE_DA = [0, 25, -25, 50, -50];
/** Onde fica cada veio de ferro (`CAVE_ORE`): no chão do salão, seco (fora da poça), com corpo em pé do lado (dá pra
 *  chegar e bater); se o ponto pedido cair na parede/poça, procura em volta (ORE_K × ORE_DA). Puro. */
export function caveOreSpots(): { id: string; x: number; z: number; y: number }[] {
  const out: { id: string; x: number; z: number; y: number }[] = [];
  CAVE_ORE.forEach(([room, deg, e], i) => {
    const r = ROOMS.find((q) => q.id === room)!;
    for (const k of ORE_K) for (const da of ORE_DA) {
      const a = ((deg + da) * Math.PI) / 180, u = Math.cos(a) * e * k * r.rx, v = Math.sin(a) * e * k * r.rz;
      const x = Math.round((r.x + u * r.c - v * r.s) * 10) / 10, z = Math.round((r.z + u * r.s + v * r.c) * 10) / 10;
      const fl = caveStandAt(x, z);
      if (fl === null || cavePoolY(x, z) !== null) continue;
      out.push({ id: `zs_cave_ore_${i}`, x, z, y: fl });
      return;
    }
  });
  return out;
}
/** Chão onde cabe um corpo EM PÉ em (x, z) (null = rocha/parede). */
export function caveStandAt(x: number, z: number, yRef?: number): number | null {
  const fl = caveFloorAt(x, z, yRef);
  return fl !== null && bodyFits(x, fl, z) ? fl : null;
}
/**
 * Passo de quem anda na CAVERNA (herói; puro). null = não está na caverna nem entrando nela (anda no mapa como sempre).
 * Parede = desliza no eixo livre (igual muro); pela BOCA sai pro chão do mapa (degrau até STEP_UP).
 */
export function caveMove(t: ZsTerrain, x: number, z: number, feetY: number, dx: number, dz: number): CaveMove | null {
  const here = caveInside(x, feetY, z);
  const nx0 = x + dx, nz0 = z + dz;
  if (!here && !caveInside(nx0, feetY, nz0)) return null;
  const at = (px: number, pz: number): CaveMove | null => {
    const fl = caveFloorAt(px, pz, feetY);
    // o corpo tem que caber onde ELE está: chão sumindo embaixo (beira do vão/poço — 05/11) = confere na altura do pé, não lá
    // no fundo (no fundo de um vão estreito a parede fica perto). Chão até 1 m abaixo (o andar de sempre): igual a antes.
    if (fl !== null && fl - feetY < STEP_UP && caveInside(px, Math.max(fl, feetY - 2), pz) && bodyFits(px, fl >= feetY - 1 ? fl : feetY, pz)) {
      const w = cavePoolY(px, pz);
      return { x: px, z: pz, ground: fl, inCave: true, wading: w !== null && fl < w - 0.15 };
    }
    // não cabe na caverna: só passa se for o céu aberto da boca — o chão do mapa ali na altura do pé (lá no fundo o
    // chão do mapa está dezenas de metros acima: é parede)
    const g = zsHeightAt(t, px, pz);
    if (g - feetY < STEP_UP && zsSurfAt(t, px, pz) !== ZS_SURF.out) return { x: px, z: pz, ground: g, inCave: false, wading: false };
    return null;
  };
  if (Math.abs(dx) + Math.abs(dz) < 1e-9) {
    const fl = caveFloorAt(x, z, feetY) ?? feetY, w = cavePoolY(x, z);
    return { x, z, ground: fl, inCave: true, wading: w !== null && fl < w - 0.15 };
  }
  const r = at(nx0, nz0) ?? at(nx0, z) ?? at(x, nz0);
  if (r) return r;
  const fl = caveFloorAt(x, z, feetY) ?? feetY, w = cavePoolY(x, z);
  return { x, z, ground: fl, inCave: here, wading: w !== null && fl < w - 0.15 };
}
/** Passo de BICHO na caverna (x, z; o chão sai de `caveFloorAt`). Fora dela: o passo como veio. */
export function caveCreatureStep(ox: number, oz: number, nx: number, nz: number, feetY: number): [number, number] {
  if (!caveInside(ox, feetY, oz) && !caveInside(nx, feetY, nz)) return [nx, nz];
  const ok = (px: number, pz: number) => {
    const fl = caveFloorAt(px, pz, feetY);
    if (fl !== null && fl - feetY < STEP_UP && bodyFits(px, fl, pz)) return true;
    return groundAt(px, pz) - feetY < STEP_UP; // sai pela boca (o chão do mapa na altura do pé)
  };
  if (ok(nx, nz)) return [nx, nz];
  if (ok(nx, oz)) return [nx, oz];
  if (ok(ox, nz)) return [ox, nz];
  return [ox, oz];
}

/** Câmera: quanto (0..1) do caminho alvo→câmera cabe sem entrar na rocha (dentro da caverna ou no céu aberto). */
export function caveCamFit(t: ZsTerrain, tx: number, ty: number, tz: number, cx: number, cy: number, cz: number): number {
  const N = 14;
  let ok = 0;
  for (let i = 1; i <= N; i++) {
    const k = i / N, x = tx + (cx - tx) * k, y = ty + (cy - ty) * k, z = tz + (cz - tz) * k;
    if (caveField(x, y, z) < -0.35 || y > zsHeightAt(t, x, z) + 0.6) ok = k; else break;
  }
  return ok;
}

/* ------------------------------------------------------------------ desenho: marching cubes por blocos */

/** `deep` (04/11): pedaço do COVIL do Canibal — só desenha com o herói no fundo da caverna (ver `lairBlock`). */
export type CaveTile = { key: string; cx: number; cz: number; deep?: boolean; pos: Float32Array; nor: Float32Array; col: Float32Array; top: Float32Array; out: Float32Array; idx: Uint32Array };

/** Plano de cada boca (normal pra DENTRO, no chão): pra malha cortar exatamente nele. */
const MOUTH_PLANES = ZS_CAVE_MOUTHS.map((m) => {
  const L = Math.hypot(m.bx - m.ax, m.bz - m.az);
  return { ax: m.ax, az: m.az, dx: (m.bx - m.ax) / L, dz: (m.bz - m.az) / L, r: m.ra };
});
/** Tamanho do voxel (m), voxels por bloco, blocos por pedaço desenhado. */
export const CAVE_VOXEL = 1.6, CAVE_BLOCK = 16, CAVE_TILE_BLOCKS = 2;
// 02/11 noite: Y_MAX 30 → 140 (o abismo do Pico da Tijuca vai até ~133 m; os blocos só existem onde há peça — a caverna
// de antes sai igual)
// 04/11: Y_MIN −46 → −71,6 (o COVIL do Canibal tem o chão a −55 m). Desce EXATAMENTE 1 bloco (16 voxels × 1,6 m): a grade
// dos voxels e as divisas dos blocos ficam onde estavam — a caverna de antes sai igual, triângulo por triângulo.
const Y_MIN = -46 - CAVE_BLOCK * CAVE_VOXEL, Y_MAX = 140;

/** Caixas 3D das peças (onde vale a pena calcular). */
function shapeBoxes(): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[] {
  const out: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[] = [];
  for (const s of SEGS) {
    const R = Math.max(s.ra, s.rb) * 1.5 + 3;
    out.push({ x0: Math.min(s.ax, s.bx) - R, x1: Math.max(s.ax, s.bx) + R, z0: Math.min(s.az, s.bz) - R, z1: Math.max(s.az, s.bz) + R, y0: Math.min(s.ay, s.by) - 2, y1: Math.max(s.ay + s.ha, s.by + s.hb) + 3 });
  }
  for (const r of ROOMS) {
    const R = Math.max(r.rx, r.rz) * 1.3 + r.lobe + 3;
    out.push({ x0: r.x - R, x1: r.x + R, z0: r.z - R, z1: r.z + R, y0: r.y - 3, y1: r.y + r.h + r.lobe + 3 });
  }
  return out;
}

// arestas do cubo (Paul Bourke — mesma ordem das tabelas do three): [canto a, canto b, eixo, dx, dy, dz do início]
const CORNER: readonly (readonly [number, number, number])[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGE: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, 1, 0, 0, 0, 0], [1, 2, 1, 1, 0, 0], [3, 2, 0, 0, 1, 0], [0, 3, 1, 0, 0, 0],
  [4, 5, 0, 0, 0, 1], [5, 6, 1, 1, 0, 1], [7, 6, 0, 0, 1, 1], [4, 7, 1, 0, 0, 1],
  [0, 4, 2, 0, 0, 0], [1, 5, 2, 1, 0, 0], [2, 6, 2, 1, 1, 0], [3, 7, 2, 0, 1, 0],
];

/** COVIL DO CANIBAL (04/11): blocos do covil (o centro até 1,6× o contorno) SEM nada de outra peça dentro (o abismo a
 *  mais de 1,25× do contorno dele; outros túneis a mais de 1,5 raio + 4 m — a garganta conta como covil) viram pedaços à
 *  parte (`deep`): da superfície o covil nunca aparece (fica atrás da rocha, longe das bocas) e lá no fundo a superfície
 *  some — então nunca se desenha os dois juntos. Conferido em 5×5 pontos do bloco. */
const LAIR_ROOM = CAVE_ROOMS.find((r) => r.id === 'covil')!;
// 05/11: a FENDA e os túneis do caminho (garganta, fenda → covil) contam como covil (só desenham lá no fundo)
const LAIR_ROOMS = new Set([LAIR_ROOM.id, 'fenda']);
const LAIR_TUNNELS = new Set(['garganta', 'fenda-covil'].map((id) => CAVE_TUNNELS.findIndex((t) => t.id === id)));
function lairBlock(bx: number, bz: number, bs: number): boolean {
  const cx = bx + bs / 2, cz = bz + bs / 2;
  const fd = ROOMS.find((q) => q.id === 'fenda')!;
  if (Math.hypot((cx - LAIR_ROOM.x) / LAIR_ROOM.rx, (cz - LAIR_ROOM.z) / LAIR_ROOM.rz) > 1.6 && Math.hypot((cx - fd.x) / fd.rx, (cz - fd.z) / fd.rz) > 1.5) return false;
  for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) {
    const x = bx + (bs * i) / 4, z = bz + (bs * k) / 4;
    for (const r of ROOMS) {
      if (LAIR_ROOMS.has(r.id)) continue;
      const [u, v] = roomUV(r, x, z);
      if (Math.hypot(u / r.rx, v / r.rz) < 1.25 + r.lobe / Math.min(r.rx, r.rz)) return false;
    }
    for (const s of SEGS) {
      if (LAIR_TUNNELS.has(s.tunnel)) continue;
      let t = ((x - s.ax) * s.abx + (z - s.az) * s.abz) / s.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(x - (s.ax + s.abx * t), z - (s.az + s.abz * t)) < Math.max(s.ra, s.rb) * 1.5 + 4) return false;
    }
  }
  return true;
}

/** Tom da rocha num ponto (salão mais perto, senão o padrão). */
function tintAt(x: number, z: number): readonly [number, number, number] {
  let best: readonly [number, number, number] = [0.43, 0.4, 0.36], bd = 1.35;
  for (const r of ROOMS) { const [u, v] = roomUV(r, x, z); const e = Math.hypot(u / r.rx, v / r.rz); if (e < bd) { bd = e; best = r.tint; } }
  return best;
}

/**
 * Monta a malha da caverna AOS POUCOS (gerador: 1 bloco por `next()`) — quem chama decide quantos blocos por quadro.
 * `triTable` vem das tabelas do three (marching cubes). Devolve os pedaços (cada um vira 1 malha).
 */
export function* caveMeshJob(triTable: ArrayLike<number>): Generator<number, CaveTile[], void> {
  const V = CAVE_VOXEL, B = CAVE_BLOCK, BS = V * B;
  const boxes = shapeBoxes();
  let X0 = Infinity, Z0 = Infinity;
  for (const b of boxes) { X0 = Math.min(X0, b.x0); Z0 = Math.min(Z0, b.z0); }
  X0 = Math.floor(X0 / BS) * BS; Z0 = Math.floor(Z0 / BS) * BS;
  const Y0 = Y_MIN;
  // blocos que encostam em alguma peça
  const active = new Set<string>();
  for (const b of boxes) {
    for (let bi = Math.floor((b.x0 - X0) / BS); bi <= Math.floor((b.x1 - X0) / BS); bi++)
      for (let bk = Math.floor((b.z0 - Z0) / BS); bk <= Math.floor((b.z1 - Z0) / BS); bk++)
        for (let bj = Math.max(0, Math.floor((b.y0 - Y0) / BS)); bj <= Math.min(Math.floor((Y_MAX - Y0) / BS), Math.floor((b.y1 - Y0) / BS)); bj++) active.add(`${bi},${bj},${bk}`);
  }
  const list = [...active].map((k) => k.split(',').map(Number) as [number, number, number]).sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const NY = Math.ceil((Y_MAX - Y0) / V) + 2, NZ = 100000;
  type Acc = { pos: number[]; nor: number[]; col: number[]; top: number[]; out: number[]; idx: number[]; map: Map<number, number> };
  const tiles = new Map<string, Acc & { cx: number; cz: number; deep: boolean }>();
  const vals = new Float32Array((B + 1) ** 3);
  const at3 = (i: number, j: number, k: number) => (i * (B + 1) + j) * (B + 1) + k;
  const e = 0.3;
  let done = 0;
  for (const [bi, bj, bk] of list) {
    const bx = X0 + bi * BS, by = Y0 + bj * BS, bz = Z0 + bk * BS;
    let neg = false, pos = false;
    for (let i = 0; i <= B; i++) for (let j = 0; j <= B; j++) for (let k = 0; k <= B; k++) {
      const v = caveField(bx + i * V, by + j * V, bz + k * V);
      vals[at3(i, j, k)] = v;
      if (v < 0) neg = true; else pos = true;
    }
    done++;
    if (!(neg && pos)) { yield done / list.length; continue; }
    // covil: pedaços maiores (4×4 blocos) e à parte — o resto, os pedaços de sempre (mesmas chaves, mesmo conteúdo)
    const lair = lairBlock(bx, bz, BS), TB = lair ? 4 : CAVE_TILE_BLOCKS;
    const tcx = Math.floor(bi / TB), tcz = Math.floor(bk / TB), tkey = lair ? `covil:${tcx},${tcz}` : `${tcx},${tcz}`;
    let acc = tiles.get(tkey);
    if (!acc) { acc = { pos: [], nor: [], col: [], top: [], out: [], idx: [], map: new Map(), cx: X0 + (tcx + 0.5) * BS * TB, cz: Z0 + (tcz + 0.5) * BS * TB, deep: lair }; tiles.set(tkey, acc); }
    const A = acc;
    const vert = (gi: number, gj: number, gk: number, axis: number, va: number, vb: number): number => {
      const key = ((gi * NY + gj) * NZ + gk) * 3 + axis;
      const got = A.map.get(key);
      if (got !== undefined) return got;
      let f = va / (va - vb);
      // aresta que atravessa o PLANO DA BOCA: o vértice vai exatamente no plano (o canto chão×corte não arredonda — o
      // chão do túnel encosta certinho no buraco do chão do mapa)
      if (axis !== 1) {
        const xa = X0 + gi * V, za = Z0 + gk * V, xb = xa + (axis === 0 ? V : 0), zb = za + (axis === 2 ? V : 0);
        for (const m of MOUTH_PLANES) {
          const ta = (xa - m.ax) * m.dx + (za - m.az) * m.dz, tb = (xb - m.ax) * m.dx + (zb - m.az) * m.dz;
          if ((ta < 0) === (tb < 0) || Math.abs((xa - m.ax) * m.dz - (za - m.az) * m.dx) > m.r * 1.4) continue;
          if ((va < 0 && ta >= 0) || (vb < 0 && tb >= 0)) f = ta / (ta - tb);
        }
      }
      const x = X0 + gi * V + (axis === 0 ? f * V : 0), y = Y0 + gj * V + (axis === 1 ? f * V : 0), z = Z0 + gk * V + (axis === 2 ? f * V : 0);
      // normal = −gradiente (aponta pro AR, de dentro da caverna)
      let nx = caveField(x - e, y, z) - caveField(x + e, y, z), ny = caveField(x, y - e, z) - caveField(x, y + e, z), nz = caveField(x, y, z - e) - caveField(x, y, z + e);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const tn = tintAt(x, z), n1 = caveNoise(x * 0.35, y * 0.35, z * 0.35), n2 = caveNoise(x * 0.07 + 5, y * 0.09, z * 0.07);
      let k = 0.78 + n1 * 0.32 + (n2 - 0.5) * 0.25;
      let cr = tn[0], cg = tn[1], cb = tn[2];
      if (ny > 0.62) { cr *= 1.12; cg *= 1.02; cb *= 0.86; }        // chão: terra/cascalho
      else if (ny < -0.45) k *= 0.82;                              // teto mais escuro
      const pool = cavePoolY(x, z);
      if (pool !== null && y < pool + 0.6) { k *= 0.72; cb *= 1.12; } // pedra molhada na poça
      A.col.push(cr * k, cg * k, cb * k);
      A.pos.push(x, y, z); A.nor.push(nx, ny, nz);
      const dm = caveMouthDist(x, y, z);
      A.top.push(dm < 60 ? groundAt(x, z) : 1e4);
      A.out.push(1 - smooth01((dm - 4) / 22));
      const id = A.pos.length / 3 - 1;
      A.map.set(key, id);
      return id;
    };
    for (let i = 0; i < B; i++) for (let j = 0; j < B; j++) for (let k = 0; k < B; k++) {
      let ci = 0;
      for (let c = 0; c < 8; c++) { const o = CORNER[c]!; if (vals[at3(i + o[0], j + o[1], k + o[2])]! < 0) ci |= 1 << c; }
      if (ci === 0 || ci === 255) continue;
      const gi = bi * B + i, gj = bj * B + j, gk = bk * B + k;
      const ids: number[] = [];
      for (let n = 0; n < 16; n++) {
        const ed = triTable[ci * 16 + n]!;
        if (ed < 0) break;
        const E = EDGE[ed]!, ca = CORNER[E[0]]!, cb = CORNER[E[1]]!;
        ids.push(vert(gi + E[3], gj + E[4], gk + E[5], E[2], vals[at3(i + ca[0], j + ca[1], k + ca[2])]!, vals[at3(i + cb[0], j + cb[1], k + cb[2])]!));
      }
      for (let n = 0; n + 2 < ids.length; n += 3) A.idx.push(ids[n]!, ids[n + 1]!, ids[n + 2]!);
    }
    yield done / list.length;
  }
  // a face da frente aponta pro ar (o lado de dentro): confere com a normal e vira se preciso
  const out: CaveTile[] = [];
  let flip: boolean | null = null;
  for (const [key, a] of tiles) {
    if (a.idx.length === 0) continue;
    if (flip === null) {
      let agree = 0;
      for (let n = 0; n < Math.min(a.idx.length, 600); n += 3) {
        const i0 = a.idx[n]! * 3, i1 = a.idx[n + 1]! * 3, i2 = a.idx[n + 2]! * 3, p = a.pos;
        const ux = p[i1]! - p[i0]!, uy = p[i1 + 1]! - p[i0 + 1]!, uz = p[i1 + 2]! - p[i0 + 2]!;
        const vx = p[i2]! - p[i0]!, vy = p[i2 + 1]! - p[i0 + 1]!, vz = p[i2 + 2]! - p[i0 + 2]!;
        const gxn = uy * vz - uz * vy, gyn = uz * vx - ux * vz, gzn = ux * vy - uy * vx;
        agree += Math.sign(gxn * a.nor[i0]! + gyn * a.nor[i0 + 1]! + gzn * a.nor[i0 + 2]!);
      }
      flip = agree < 0;
    }
    if (flip) for (let n = 0; n < a.idx.length; n += 3) { const tmp = a.idx[n + 1]!; a.idx[n + 1] = a.idx[n + 2]!; a.idx[n + 2] = tmp; }
    out.push({ key, cx: a.cx, cz: a.cz, ...(a.deep ? { deep: true } : {}), pos: new Float32Array(a.pos), nor: new Float32Array(a.nor), col: new Float32Array(a.col), top: new Float32Array(a.top), out: new Float32Array(a.out), idx: new Uint32Array(a.idx) });
  }
  return out;
}

/* ------------------------------------------------------------------ enfeites (estalactites, cristais, cogumelos) */

export type CaveDecor = { kind: 'stalactite' | 'stalagmite' | 'crystal' | 'mushroom'; x: number; y: number; z: number; s: number; yaw: number; tilt: number };
/** Enfeites determinísticos: estalactites no teto dos salões, estalagmites rente às paredes, cristais (galeria dos
 *  cristais + uns soltos), cogumelos brilhando no salão do chefe. Puro. */
export function caveDecor(): CaveDecor[] {
  const out: CaveDecor[] = [];
  ROOMS.forEach((r, ri) => {
    const n = Math.round((r.rx * r.rz) / 28);
    for (let k = 0; k < n; k++) {
      const a = hash3(ri, k, 1) * Math.PI * 2, e = Math.sqrt(hash3(ri, k, 2)) * 0.85;
      const u = Math.cos(a) * e * r.rx, v = Math.sin(a) * e * r.rz;
      const x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
      const fl = caveFloorAt(x, z);
      if (fl === null || cavePoolY(x, z) !== null) continue;
      // teto: sobe do chão até a rocha
      let y = fl + 1;
      while (y < fl + r.h + r.lobe + 4 && caveField(x, y, z) < 0) y += 0.5;
      if (y - fl < 4) continue;
      const pick = hash3(ri, k, 3);
      if (pick < 0.62) out.push({ kind: 'stalactite', x, y: y + 0.3, z, s: 0.8 + hash3(ri, k, 4) * 1.8, yaw: a, tilt: 0 });
      else if (e > 0.55) out.push({ kind: 'stalagmite', x, y: fl - 0.1, z, s: 0.6 + hash3(ri, k, 5) * 1.3, yaw: a, tilt: 0 });
    }
    // 02/11 noite: o ABISMO tem muitos (no fundo e na rampa — de cima se vê o fundo brilhando) e o salão do Alto, 10
    const crystals = r.id === 'cristais' ? 26 : r.id === 'abismo' ? 34 : r.id === 'salao-alto' ? 10 : r.id === 'grande' || r.id === 'corcovado' ? 6 : r.id === 'chefe' ? 0 : 3;
    for (let k = 0; k < crystals; k++) {
      const a = hash3(ri, k, 11) * Math.PI * 2, e = 0.6 + hash3(ri, k, 12) * 0.3;
      const u = Math.cos(a) * e * r.rx, v = Math.sin(a) * e * r.rz;
      const x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
      const fl = caveFloorAt(x, z);
      if (fl === null || cavePoolY(x, z) !== null || !caveAir(x, fl + 1, z)) continue;
      // 1 cacho por ponto (o cristal GLB já é um cacho — 31/10)
      out.push({ kind: 'crystal', x, y: fl - 0.12, z, s: 0.8 + hash3(ri, k, 15) * 0.9, yaw: hash3(ri, k, 16) * 6.28, tilt: (hash3(ri, k, 17) - 0.5) * 0.3 });
    }
    if (r.id === 'chefe') {
      for (let k = 0; k < 22; k++) {
        const a = hash3(ri, k, 21) * Math.PI * 2, e = 0.7 + hash3(ri, k, 22) * 0.22;
        const u = Math.cos(a) * e * r.rx, v = Math.sin(a) * e * r.rz;
        const x = r.x + u * r.c - v * r.s, z = r.z + u * r.s + v * r.c;
        const fl = caveFloorAt(x, z);
        if (fl === null || !caveAir(x, fl + 1, z)) continue;
        out.push({ kind: 'mushroom', x, y: fl - 0.05, z, s: 0.7 + hash3(ri, k, 23) * 1.2, yaw: a, tilt: (hash3(ri, k, 24) - 0.5) * 0.4 });
      }
    }
  });
  return out;
}

/** LUZ DO ABISMO (02/11 noite, "de cima vê lá embaixo"): uma luz grande no fundo do poço (pedida quando o herói está na
 *  caverna a até `near` m do centro) + a névoa da caverna fica mais longa ali (`fogFar`). */
export const CAVE_ABYSS = (() => {
  const r = CAVE_ROOMS.find((q) => q.id === 'abismo')!;
  return { x: r.x, z: r.z, floor: r.y, top: r.spiral!.yTop, near: 95, light: { x: r.x, y: r.y + 9, z: r.z, i: 24, d: 100 }, fogFar: 190 };
})();

/** LUZ DO COVIL DO CANIBAL (04/11): igual ao abismo, mais forte e QUENTE (brasa/fogueira lá embaixo) — do balcão se vê
 *  a arena inteira (130 m) e o fundo 93 m abaixo: a névoa vai mais longe. */
export const CAVE_LAIR = (() => {
  const r = CAVE_ROOMS.find((q) => q.id === 'covil')!;
  return { x: r.x, z: r.z, floor: r.y, top: r.spiral!.yTop, near: 120, light: { x: r.x, y: r.y + 14, z: r.z, i: 40, d: 150 }, fogFar: 240 };
})();

/**
 * CLARABOIA DO COVIL (06/11, Pedro: "a cena é um pouco escura — pode ter algo que ilumine ali, uma claraboia, algo
 * assim"): uma fresta no meio do teto do covil por onde entra luz do dia — uma luz fria lá do alto (do POOL de luzes,
 * sem luz nova: anti-lag) que clareia a arena inteira e as paredes, a boca clara no teto e o facho até o chão. Só aparece
 * com o herói no fundo do covil (os pedaços `deep`). `r` = raio da fresta, `beamR` = raio do facho no chão.
 */
export const LAIR_SKY = { r: 7, beamR: 15, color: '#dfe9ff', light: { i: 60, d: 190, decay: 0.8, below: 6 }, beam: 0.3 } as const;
/** Altura (m) do teto do covil no MEIO — onde fica a fresta (sobe do chão até achar a rocha). */
export function lairCeilingY(): number {
  const r = CAVE_ROOMS.find((q) => q.id === 'covil')!;
  let y = r.y + 5;
  while (y < r.y + r.h + r.lobe + 8 && caveField(r.x, y, r.z) < 0) y += 0.25;
  return y;
}

/** PEDRAS EM VOLTA DA BOCA (02/11 noite, "a boca média, pedras rodeando — fica legal"): bocas com `rocks` ganham um
 *  meio anel de pedras na encosta, dos lados e na frente (nunca dentro do buraco). Determinístico. [x, y, z, tamanho,
 *  giro]. */
export function caveMouthRocks(t: ZsTerrain): { x: number; y: number; z: number; s: number; yaw: number }[] {
  const out: { x: number; y: number; z: number; s: number; yaw: number }[] = [];
  CAVE_TUNNELS.forEach((tn, ti) => {
    if (!tn.mouth || !tn.rocks) return;
    const a = tn.pts[0]!, b = tn.pts[1]!, L = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    for (let k = 0; k < 16; k++) {
      // de −110° a +110° em volta da direção pra FORA da boca, a 1,3–2,6 raios do centro
      const ang = (-110 + (220 * k) / 15 + (hash3(ti, k, 41) - 0.5) * 10) * (Math.PI / 180), rr = a.r * (1.3 + hash3(ti, k, 42) * 1.3);
      const ox = -dx, oz = -dz, c = Math.cos(ang), s = Math.sin(ang);
      const x = a.x + (ox * c - oz * s) * rr, z = a.z + (ox * s + oz * c) * rr;
      if (!caveMouthClear(x, z, 0.8)) continue;
      const sz = 1.1 + hash3(ti, k, 43) * 2.2;
      out.push({ x, y: zsHeightAt(t, x, z) - sz * 0.25, z, s: sz, yaw: hash3(ti, k, 44) * Math.PI * 2 });
    }
  });
  return out;
}

/** As poças (pra desenhar a água): centro, raios, giro e a altura da lâmina. */
export function cavePools(): { x: number; z: number; rx: number; rz: number; yaw: number; y: number }[] {
  return ROOMS.flatMap((r) => (r.pools ?? []).map((p) => ({ x: r.x + p.u * r.c - p.v * r.s, z: r.z + p.u * r.s + p.v * r.c, rx: p.rx, rz: p.rz, yaw: r.yaw, y: r.y + POOL_Y })));
}
