/**
 * CÉU DO KRAKEN (04/11, Pedro: "quando ele nasce o dia vira fim de tarde meio avermelhado escuro — o dia normal que já
 * temos, só fim de tarde pra noite! … e o que mais dá pra deixar mais cinematográfico sem perder FPS: ventos? raios? nuvem?").
 *
 * O Kraken ACORDADO (subindo, lutando ou caçando) puxa o céu de QUEM ESTÁ PERTO pro fim de tarde: o sol do céu desce
 * pro horizonte (o laranja/vermelho do pôr do sol que o relógio já faz às ~18h), a luz fica avermelhada e baixa, o mar e
 * a névoa escurecem. Quando ele afunda/morre, o dia volta sozinho.
 *  - SÓ VISUAL e de CADA jogador (online: cada um pela própria distância até ele). O relógio do jogo, a noite dos bichos
 *    (pombos, mortos-vivos), os postes e a tocha NÃO mudam — `nightFactor()` continua o de verdade.
 *  - De noite não faz nada (a noite já é mais escura que o fim de tarde — não clareia).
 *  - Custo: zero de desenho novo — são as MESMAS luzes/cores/névoa que o dia/noite já muda (só outro alvo).
 * Este arquivo é puro (sem three) — testável.
 */
export const OMEN = {
  /** até aqui do Kraken (m) o céu fica inteiro no fim de tarde */
  FULL_M: 900,
  /** daqui pra fora (m), dia normal — é até onde ele é desenhado (KRAKEN_DRAW_M) */
  FADE_M: 1600,
  /** escurece em ~5 s (ele leva 6 pra subir) e o dia volta em ~8 s quando ele afunda/morre */
  IN_S: 5,
  OUT_S: 8,
  /** sol do CÉU (shader): direção pela hora do relógio. 04/11 (noite, Pedro: "ficou muito escuro — o dia uns 30% mais
   *  claro; o sol mais aparente, menos pôr do sol"): 17,95 h (rente ao horizonte) → 17 h (o sol à vista, ~14° de altura) */
  SKY_HOUR: 17,
  /** luz principal: baixa (~33°) vinda do oeste, quente — 04/11 noite: ~30% mais forte e menos vermelha (0,95 → 1,25) */
  SUN: 1.25,
  SUN_COLOR: '#ff9a5a',
  /** céu (hemisfério) e ambiente: abaixo do dia (1,5 / 0,35), acima da noite de lua (0,65 / 0,23) — 04/11 noite: +30%
   *  (1,1 → 1,43; 0,28 → 0,34) */
  HEMI: 1.43,
  HEMI_COLOR: '#c4b0cc',
  GROUND_COLOR: '#4a3e4c',
  AMB: 0.34,
  AMB_COLOR: '#9a7078',
  /** névoa/fundo: rosado-arroxeado de fim de tarde (04/11 noite: ~30% mais claro que o vinho escuro de antes) */
  FOG: '#8a6470',
  /** o céu um pouco mais "sujo" que o de sempre (turbidez e espalhamento do shader do céu) */
  TURBIDITY: 5.5,
  RAYLEIGH: 1.6,
} as const;

/** Estado compartilhado: o Kraken escreve `target` todo quadro; o dia/noite anda `k` até ele (suave).
 *  `flash` 0..1 = o clarão do raio AGORA (a tempestade escreve; o dia/noite soma na luz do céu). */
export const zsOmen = { target: 0, k: 0, flash: 0 };

/** Alvo 0..1 pela distância até o Kraken: inteiro até FULL_M, some (suave) até FADE_M; dormindo/afundando/morto = 0. */
export function omenTarget(awake: boolean, dist: number): number {
  if (!awake || !Number.isFinite(dist)) return 0;
  if (dist <= OMEN.FULL_M) return 1;
  if (dist >= OMEN.FADE_M) return 0;
  const t = (dist - OMEN.FULL_M) / (OMEN.FADE_M - OMEN.FULL_M);
  return 1 - t * t * (3 - 2 * t);
}

/** Anda `k` até o alvo: sobe em IN_S, desce em OUT_S (linear — a curva vem do `omenWeight`). */
export function omenEase(k: number, target: number, dt: number): number {
  if (target > k) return Math.min(target, k + dt / OMEN.IN_S);
  if (target < k) return Math.max(target, k - dt / OMEN.OUT_S);
  return k;
}

/** Quanto do fim de tarde entra agora (0..1): curva suave do `k`, e nada de noite (`nightReal` = nightFactor de verdade). */
export function omenWeight(k: number, nightReal: number): number {
  const c = Math.max(0, Math.min(1, k)), s = c * c * (3 - 2 * c);
  return s * (1 - Math.max(0, Math.min(1, nightReal)));
}

/* ───────────────────────── TEMPESTADE em cima do Kraken: nuvem + raios (04/11, Pedro: "raios? nuvem?") ─────────────────────────
 * NUVEM: um teto escuro em espiral (o "olho" bem em cima dele, girando como o redemoinho lá embaixo) — 2 discos
 * transparentes com a mesma textura (feita 1× no carregamento), sem shader novo. Segue o Kraken quando ele caça.
 * RAIOS: a cada 3–8 s cai um no mar em volta da briga (60–380 m dele) — zigue-zague com um galho, 0,45 s, e o CLARÃO
 * acende o céu/ambiente e a nuvem. Só VISUAL (não dá dano) e de cada jogador (online cada um vê os seus — é enfeite).
 * Custo: 2 desenhos (nuvem) + 1 (raio, ~40 vértices, só quando cai). */
export const STORM = {
  /** nuvem: altura e raio do teto (m), giro (rad/s) */
  CLOUD_Y: 280,
  CLOUD_R: 950,
  CLOUD_SPIN: 0.03,
  /** quanto a borda da nuvem desce (m) — cúpula: de longe vira uma massa de nuvem, de baixo um teto que cai pro horizonte */
  CLOUD_DROP: 130,
  /** intervalo entre raios (s) e onde caem (m do Kraken) */
  BOLT_MIN_S: 3,
  BOLT_MAX_S: 8,
  BOLT_R_MIN: 60,
  BOLT_R_MAX: 380,
  /** o raio: pedaços do zigue-zague, largura (m — com a borda suave; o miolo branco é ~1/6 disso), desvio lateral (fração da altura de cada pedaço) */
  BOLT_SEGS: 14,
  BOLT_W: 7,
  BOLT_JIT: 0.9,
  /** quanto dura o clarão (s) */
  FLASH_S: 0.45,
  /** quanto o clarão SOMA na luz do céu (hemisfério) e no ambiente */
  FLASH_HEMI: 2.2,
  FLASH_AMB: 0.6,
  /** os raios só começam com o céu já quase todo escuro (k) */
  MIN_K: 0.6,
} as const;

/** Clarão do raio pela idade (s): pisca forte, apaga, pisca de novo e some — 0 fora de [0, FLASH_S). */
export function flashAt(age: number): number {
  if (!(age >= 0) || age >= STORM.FLASH_S) return 0;
  if (age < 0.05) return 1;
  if (age < 0.1) return 0.3;
  if (age < 0.16) return 0.85;
  return 0.85 * (1 - (age - 0.16) / (STORM.FLASH_S - 0.16));
}

/** Segundos até o próximo raio (r = sorteio 0..1). */
export const nextBoltIn = (r: number) => STORM.BOLT_MIN_S + Math.max(0, Math.min(1, r)) * (STORM.BOLT_MAX_S - STORM.BOLT_MIN_S);

/** Onde o raio cai: anel em volta do Kraken (r1 = ângulo, r2 = distância, sorteios 0..1). */
export function boltSpot(kx: number, kz: number, r1: number, r2: number): { x: number; z: number } {
  const a = r1 * Math.PI * 2, d = STORM.BOLT_R_MIN + r2 * (STORM.BOLT_R_MAX - STORM.BOLT_R_MIN);
  return { x: kx + Math.sin(a) * d, z: kz + Math.cos(a) * d };
}

/** Zigue-zague do raio: segs + 1 pontos de (x, yTop, z) até EXATAMENTE (x, yBot, z), desviando pros lados no meio. */
export function boltPath(rand: () => number, x: number, z: number, yTop: number, yBot: number, segs: number = STORM.BOLT_SEGS): [number, number, number][] {
  const step = (yTop - yBot) / segs, jit = step * STORM.BOLT_JIT;
  const ox: number[] = [0], oz: number[] = [0];
  for (let i = 1; i <= segs; i++) { ox.push(ox[i - 1]! + (rand() - 0.5) * 2 * jit); oz.push(oz[i - 1]! + (rand() - 0.5) * 2 * jit); }
  // o passeio desvia; corrige em linha pra terminar em cima do ponto (o pé do raio cai onde foi sorteado)
  const ex = ox[segs]!, ez = oz[segs]!;
  const out: [number, number, number][] = [];
  for (let i = 0; i <= segs; i++) out.push([x + ox[i]! - ex * (i / segs), yTop - step * i, z + oz[i]! - ez * (i / segs)]);
  return out;
}
