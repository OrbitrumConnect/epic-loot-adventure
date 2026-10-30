/**
 * ZONA SUL — MOTOR DE SURF, fase B (onda A-frame com 2 tubos). Matemática ÚNICA da onda (CPU); o shader da malha repete
 * EXATAMENTE estas contas (surf-break.tsx) — os testes conferem a forma aqui.
 *
 * Coordenadas locais da zona: q = mar → praia (cresce indo pra areia; q = 0 no PICO), s = ao longo da praia, y = altura.
 * CONVENÇÃO (testada): o eixo +s aponta pra DIREITA do surfista de frente pra praia (+q). Logo, quebra pra DIREITA = s > 0.
 *
 * Uma onda: nasce longe (q = Q_MIN), vem pra praia a C m/s crescendo (empinamento), no PICO (q = BREAK_Q) QUEBRA: a
 * abertura corre pros dois lados (peeling, V_PEEL com variação por lado); onde abriu, o lip se projeta pra frente e curva
 * por cima da cavidade (TUBO OCO); CLOSE_LAG metros atrás da frente de abertura o tubo fecha e vira ESPUMA, que segue até
 * perto da areia e some. Vida ~60 s. A seção do tubo é uma CURVA (face → teto → lip → lado de fora → costas), não um
 * mapa de altura — a malha DOBRA (cada vértice tem um parâmetro de repouso (s, q0)).
 */
export const SURF = {
  ZONE_S: 160,            // até onde a onda pode ir de CADA lado (m) — cada lado para antes de pedra/areia (frame.lim).
                          // 70 → 90 ("quebra meio curta") → 160 (Pedro 29/10: "a extensão pro lado do Leblon pode
                          // aumentar, de acordo com ela indo quebrando até a beirada" — pro lado do Leblon é mar aberto)
  CORE_S: 90,             // miolo da zona (m pra cada lado) que precisa ser mar aberto pra escolher o pico
  // Pedro 28/10: "durar mais, quebrar mais atrás e vir até mais a beira da areia". No Arpoador a areia fica a 45–100 m
  // à frente do pico (medido no terreno): a espuma corre até +70 m (onde já é raso/areia, ela sobe um pouco = espraiado;
  // a areia opaca cobre o resto). Só o trecho onde o TUBO existe (até Q_OPEN) precisa ser água aberta.
  // 2ª (Pedro: "aumentar uns 10 s, quebrando mais atrás e indo mais pra beirada — quebra muito à frente"):
  Q_MIN: -175, Q_MAX: 80, // nasce longe, morre na beira da areia
  Q_OPEN: 15,             // até aqui a zona tem que ser água aberta (o tubo fecha antes: quebra − 55 + ~66 m)
  C: 3.2,                 // m/s rumo à praia → (80 + 6 + 175) / 3,2 ≈ 82 s de vida (era ~71)
  BREAK_Q: -55,           // quebra 55 m antes do pico (era 25: "quebra muito à frente")
  H_START: 0.35, H_MAX: 6.3,             // Pedro: "um pouco mais alta" (4,2 → 4,8) e 29/10 "+1,5 m" (4,8 → 6,3)
  V_PEEL: 6.5,            // abertura pros lados (m/s)
  CLOSE_LAG: 30,          // a quantos metros atrás da frente de abertura o tubo fecha (22 → 30: parede curva mais extensa, 29/10)
  OPEN_EDGE: 9, CLOSE_EDGE: 7,  // a forma de tubo entra ao longo de 9 m na boca (5 era curto = degrau)
  EDGE_S: 22, EDGE_Q0: 18, EDGE_Q1: 10, // apagar nas bordas da zona (sem degrau com o mar em volta; nas laterais, suave)
} as const;

/**
 * Crista em C NA PLANTA (Pedro 28/10: "a onda não vem 100% reta numa bancada, faz uma curva leve nas pontas"): a onda
 * "abraça" a bancada — as pontas adiantam BEND metros rumo à praia (parábola em s).
 */
export const BEND = 8;
export const BEND_S = 90; // a curva da crista se completa até 90 m do pico (depois segue reta, 8 m adiantada)

/**
 * PERFIL DE ONDA (30/10, Pedro: o SORRISO no meio de Copacabana, "só quando tem ressaca"). Cada pico tem o seu: o do
 * Arpoador é EXATAMENTE as constantes acima (SURF/BEND) — toda função recebe o perfil por último com o Arpoador de padrão,
 * então nada muda nele. O Sorriso tem TRÊS SEÇÕES (Pedro 30/10, desenho: "são 3 seções e olha o fundo que ela vem"):
 * a de fora quebra e vira espuma; mais perto (INNER[k].Q) a espuma se desfaz em INNER[k].REFORM m, a onda se refaz e
 * quebra de novo abrindo pros lados — e assim até a última, na beira, que morre na areia.
 */
export type SurfProfile = {
  readonly id: string;
  readonly ZONE_S: number; readonly CORE_S: number; readonly Q_MIN: number; readonly Q_MAX: number; readonly Q_OPEN: number;
  readonly C: number; readonly BREAK_Q: number; readonly H_START: number; readonly H_MAX: number; readonly V_PEEL: number;
  readonly CLOSE_LAG: number; readonly OPEN_EDGE: number; readonly CLOSE_EDGE: number;
  readonly EDGE_S: number; readonly EDGE_Q0: number; readonly EDGE_Q1: number;
  readonly BEND: number; readonly BEND_S: number;
  /** quanto o lip arremessa na quebra de FORA (1 = tubo completo; menos = quebra "cheia") */
  readonly CURL_OUT: number;
  /** quanto da forma de TUBO existe na quebra de fora (1 = Arpoador; 0 = parede cheia que vira espuma, sem cavidade) */
  readonly BARREL_OUT: number;
  /** atrás da abertura, em quantos m a quebra de FORA fecha em espuma (o Arpoador: CLOSE_LAG) */
  readonly CLOSE_LAG_OUT: number;
  /** em pé dá pra SURFAR A ESPUMA (segura e emenda na próxima seção) em vez de tomar vaca — Sorriso sim, Arpoador não */
  readonly FOAM_RIDE: boolean;
  /** largura (m) das COSTAS da onda (rampa descendo pro mar) — Arpoador 7 */
  readonly BACK_W: number;
  /** quanto a onda baixa depois de fechar em espuma (0..1) — Arpoador 0,65; menos = espuma com mais volume */
  readonly CLOSED_DROP: number;
  /** quanto a onda perde de altura da quebra de fora até a areia (0..1) — Arpoador 0,75; menos = chega mais "gorda" */
  readonly DECAY: number;
  /** seções de DENTRO, de fora pra dentro (vazio = uma quebra só): cada uma se refaz da espuma da anterior e quebra de novo */
  readonly INNER: readonly InnerBreak[];
};
/** Uma seção de dentro: onde quebra (q), em quantos m a espuma da anterior se desfaz antes, e a abertura pros lados. */
export type InnerBreak = { readonly Q: number; readonly REFORM: number; readonly V_PEEL: number };
export const ARPOADOR: SurfProfile = { id: 'arpoador', ...SURF, BEND, BEND_S, CURL_OUT: 1, BARREL_OUT: 1, CLOSE_LAG_OUT: SURF.CLOSE_LAG, FOAM_RIDE: false, BACK_W: 7, CLOSED_DROP: 0.65, DECAY: 0.75, INNER: [] };

export function crestQ(w: WaveState, s: number, pf: SurfProfile = ARPOADOR): number { const k = Math.min(1, Math.abs(s) / pf.BEND_S); return w.qc + pf.BEND * k * k; }

/** Lado da quebra pro surfista de frente pra praia: +s = direita. */
export function branchOf(s: number): 'direita' | 'esquerda' { return s >= 0 ? 'direita' : 'esquerda'; }

/** Estado de UMA onda num instante (o shader recebe exatamente isto, por onda). Perfis com SEÇÕES (Sorriso): peelR/L = a
 *  seção de base, `peel2*` = a próxima (se refazendo, `reform` 0..1), `stA`/`stB` = quanto cada uma já empinou (pela
 *  posição), `lagA` = em quantos m a de base fecha em espuma, `outer` = 1 se a de base é a de fora. Arpoador: ausentes. */
export type WaveState = { qc: number; h: number; peelR: number; peelL: number; active: boolean; peel2R?: number; peel2L?: number; reform?: number;
  stA?: number; stB?: number; lagA?: number; outer?: number };
/** Variação por onda (semente): altura e velocidade de abertura levemente diferentes por lado (nada espelhado perfeito). */
export type WaveVar = { hR: number; hL: number; vR: number; vL: number };

export function smooth(a: number, b: number, x: number): number { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export function waveStateAt(age: number, v: WaveVar, pf: SurfProfile = ARPOADOR): WaveState {
  const qc = pf.Q_MIN + pf.C * age;
  if (age < 0 || qc > pf.Q_MAX + 6) return { qc, h: 0, peelR: 0, peelL: 0, active: false, peel2R: 0, peel2L: 0, reform: 0 };
  const grow = smooth(pf.Q_MIN, pf.BREAK_Q - 4, qc);
  const after = qc > pf.BREAK_Q ? smooth(pf.BREAK_Q + 4, pf.Q_MAX, qc) : 0;
  const h = (pf.H_START + (pf.H_MAX - pf.H_START) * grow) * (1 - pf.DECAY * after);
  if (pf.INNER.length === 0) {
    const tb = age - (pf.BREAK_Q - pf.Q_MIN) / pf.C;
    const peel = Math.max(0, tb) * pf.V_PEEL;
    return { qc, h, peelR: peel * v.vR, peelL: peel * v.vL, active: true, peel2R: 0, peel2L: 0, reform: 0 };
  }
  // SEÇÕES (Sorriso): 0 = a de fora, 1.. = as de dentro. Vale a de BASE e a PRÓXIMA (se refazendo da espuma da de base)
  const secQ = [pf.BREAK_Q, ...pf.INNER.map((x) => x.Q)], secV = [pf.V_PEEL, ...pf.INNER.map((x) => x.V_PEEL)];
  const secR = [0, ...pf.INNER.map((x) => x.REFORM)];
  let j = 0;
  for (let k = 1; k < secQ.length; k++) if (qc >= secQ[k]! - secR[k]!) j = k;
  const base = Math.max(0, j - 1), next = j;
  const peelOf = (k: number) => Math.max(0, age - (secQ[k]! - pf.Q_MIN) / pf.C) * secV[k]!;
  const stOf = (k: number) => smooth(secQ[k]! - 40, secQ[k]! - 5, qc);
  const pA = peelOf(j === 0 ? 0 : base), pB = peelOf(next);
  return {
    qc, h, active: true, peelR: pA * v.vR, peelL: pA * v.vL, peel2R: pB * v.vR, peel2L: pB * v.vL,
    reform: j === 0 ? 0 : smooth(secQ[j]! - secR[j]!, secQ[j]!, qc),
    stA: stOf(j === 0 ? 0 : base), stB: stOf(next), lagA: j <= 1 ? pf.CLOSE_LAG_OUT : pf.CLOSE_LAG, outer: j <= 1 ? 1 : 0,
  };
}

/** Corpo da onda sem dobra: costas longas (mar), face mais íngreme (praia); `steep` 0..1 empina a face. */
export function bump(x: number, h: number, steep: number, backW = 7): number {
  const w = x > 0 ? 3.4 - 1.4 * steep : backW;
  const g = h * Math.exp(-(x / w) * (x / w));
  if (x <= 0 || steep <= 0) return g;
  // PAREDE SURFÁVEL (Pedro 29/10: "a parte que começa a ter parede quebrando, mais curva, deve se estender mais, dando
  // mais parede côncava"): perto de quebrar a face vira CÔNCAVA — sobe curvando do cavado até a crista (half-pipe)
  const u = Math.min(1, x / FACE_W), cc = h * (1 - u) * (1 - u);
  return g + (cc - g) * steep;
}

/** Meia-largura (m) da transição entre o lado esquerdo e o direito no pico. */
export const PEAK_BLEND = 6;
/** Nesta coluna s: quanto o tubo abriu, quanto já fechou, quanto o ombro empinou e a altura do lado. */
/** MENOS CILÍNDRICO (Pedro 29/10: "ainda meio cilíndrico demais"): (1) a BOCA é um funil — atrás da frente de abertura o
 *  lip vai lançando e o tubo crescendo ao longo de CURL_RAMP m (era tudo igual depois de 5 m); (2) a crista não é uma
 *  régua — a altura ondula de leve ao longo da onda (±RIPPLE_A, fase por onda). */
export const CURL_RAMP = 16, RIPPLE_A = 0.06, RIPPLE_K = 0.085;
/** OMBRO (Pedro 29/10, desenho sobre a foto): à frente de onde está quebrando a onda vai BAIXANDO em rampa lisa (o pico é
 *  o mais alto) — antes era um bloco da mesma altura até a ponta. Cai SHOULDER_DROP ao longo de SHOULDER_LEN m. */
export const SHOULDER_DROP = 0.55, SHOULDER_LEN = 70;
/** a parede cheia (côncava) segue por SHOULDER_HOLD m à frente da quebra antes de o ombro começar a baixar; a face
 *  empina a partir de STEEP_AHEAD m antes de a abertura chegar; FACE_W = largura da face côncava (m) */
export const SHOULDER_HOLD = 35, STEEP_AHEAD = 45, FACE_W = 5.4; // 29/10: "a parede pode ser mais curva antes de quebrar"
export function barrelAt(s: number, st: WaveState, v: WaveVar, pf: SurfProfile = ARPOADOR): { open: number; closed: number; steep: number; hSide: number; ramp: number; behind: number; shape: number } {
  // lado direito/esquerdo levemente diferentes (sem espelho), mas a troca no pico é SUAVE (±PEAK_BLEND m): o degrau
  // seco em s = 0 abria uma fenda vertical bem onde a onda começa a quebrar
  const k = smooth(-PEAK_BLEND, PEAK_BLEND, s), d0 = st.peelL + (st.peelR - st.peelL) * k, a = Math.abs(s);
  const multi = pf.INNER.length > 0, lagA = multi ? (st.lagA ?? pf.CLOSE_LAG_OUT) : pf.CLOSE_LAG_OUT;
  let open = smooth(0, pf.OPEN_EDGE, d0 - a);
  let closed = smooth(0, pf.CLOSE_EDGE, d0 - lagA - a);
  // empina só quando a onda está CHEGANDO no ponto de quebra (a ondulação lá fora segue redonda)
  let steep = smooth(-STEEP_AHEAD, 0, d0 - a) * (multi ? (st.stA ?? 0) : smooth(pf.BREAK_Q - 40, pf.BREAK_Q - 5, st.qc));
  let ramp = smooth(0, CURL_RAMP, d0 - a), behind = d0 - lagA - a, d = d0;
  const rf = st.reform ?? 0;
  if (multi && rf > 0) {
    // próxima SEÇÃO (Sorriso): a espuma da de base se desfaz (reform) e vale a abertura da próxima
    const d2 = (st.peel2L ?? 0) + ((st.peel2R ?? 0) - (st.peel2L ?? 0)) * k;
    open += (smooth(0, pf.OPEN_EDGE, d2 - a) - open) * rf;
    closed += (smooth(0, pf.CLOSE_EDGE, d2 - pf.CLOSE_LAG - a) - closed) * rf;
    steep += (smooth(-STEEP_AHEAD, 0, d2 - a) * (st.stB ?? 0) - steep) * rf;
    ramp += (smooth(0, CURL_RAMP, d2 - a) - ramp) * rf;
    behind += (d2 - pf.CLOSE_LAG - a - behind) * rf;
    d += (d2 - d) * rf;
  }
  // quebra "cheia" na de fora (o lip arremessa só CURL_OUT, forma de tubo BARREL_OUT); nas de dentro, completo
  const outer = multi ? (st.outer ?? 1) : 1, capA = outer ? pf.CURL_OUT : 1, shpA = outer ? pf.BARREL_OUT : 1;
  ramp *= capA + (1 - capA) * rf;
  return {
    open, closed, steep,
    /** quanto da forma de tubo existe aqui (quebra de fora "cheia" = 0; Arpoador = 1) */
    shape: shpA + (1 - shpA) * rf,
    hSide: st.h * (v.hL + (v.hR - v.hL) * k) * (1 + RIPPLE_A * Math.sin(RIPPLE_K * s + 7 * v.vR)) * (1 - SHOULDER_DROP * smooth(SHOULDER_HOLD, SHOULDER_HOLD + SHOULDER_LEN, a - d)),
    ramp,
    /** quanto falta (m) pro fechamento chegar nesta coluna (negativo = ainda não fechou; 0 = fechando agora) */
    behind,
  };
}

/**
 * Proporção do tubo (o shader lê ESTAS constantes). Referência real (Mead & Black, "vortex ratio"): tubo surfável é
 * AMENDOADO — mais largo que alto (~1,5–2 : 1); redondo (1 : 1) é o tubo "pesado". E o lip é uma lâmina FINA.
 * Pedro 28/10: "o tubo está meio gordo… quebra cheia, fez parede… cai gorda fechando embolado" → cavidade mais larga
 * que alta, lip com 0,14R (era 0,32R, redondo). E "onda mais alta → o lip joga mais pra frente, o tubo ganha espaço
 * proporcional à jogada": a largura (AX, em alturas) cresce com o raio — AX = AX0 + AXK·R. 2ª (Pedro: "o C que quebra, a
 * área do tubo, é um pouco pequena; dá pra quebrar mais pra frente"): R 1 m → 1,8; R 2,4 m → 2,15 (~10 m de boca).
 * O tubo CABE na onda: topo = R·(CY + 1 + LIP) ≈ 2,09R ≈ h. Onda de 4,2 m → R = 2,1 m: vão de ~4 m de altura por
 * ~7 m de largura. Costas longas (WB) como as do corpo da onda.
 */
export const TUBE = { K: 0.5, MIN: 0.5, MAX: 4.4, WF: 3.0, WB: 6.0, AX0: 1.5, AXK: 0.15, LIP: 0.09, CQ: 0.2, CY: 0.95 } as const;
/** Largura da cavidade em alturas (o lip arremessa mais longe na onda maior). */
export function tubeAx(R: number): number { return TUBE.AX0 + TUBE.AXK * R; }
/** Largura com o funil: na boca (curl 0) o lip ainda joga pouco (65%), lá dentro joga tudo. */
export function tubeAxAt(R: number, curl: number): number { return tubeAx(R) * (0.65 + 0.35 * curl); }
/** Raio do tubo pra esta altura e a faixa da dobra (frente wf, costas wb). */
export function tubeR(h: number): number { return Math.max(TUBE.MIN, Math.min(TUBE.MAX, h * TUBE.K)); }
export function barrelBand(h: number): { wf: number; wb: number; r: number } { const r = tubeR(h); return { wf: TUBE.WF * r, wb: TUBE.WB * r, r }; }

/**
 * Como o tubo está nesta coluna (a partir de open/closed): `curl` 0..1 = quanto o lip já se projetou (face → crista →
 * lança → cai na água: ENROLA aos poucos, não "vira bolo"); `blend` = quanto a forma é a do tubo (entra rápido ao abrir,
 * sai no fim do fechamento); `rs` = a cavidade DESABA ao fechar (encolhe) em vez de o lip cair cheio embolando.
 */
export function curlOf(open: number, closed: number, ramp = open, shape = 1): { curl: number; blend: number; rs: number } {
  // curl = quanto o lip já lançou (funil: cresce ao longo de CURL_RAMP). A ALTURA do tubo não encolhe na boca (era o
  // degrau entre o tubo e o ombro — Pedro 29/10); o que cresce é a LARGURA (a jogada do lip): ver tubeAxAt
  return { curl: ramp, blend: smooth(0, 1, open) * (1 - smooth(0.5, 1, closed)) * shape, rs: 1 - 0.5 * closed };
}

/**
 * Seção do TUBO em torno da crista (x = q − qc) pelo parâmetro t ∈ [0, 1] da PRAIA (t = 0) até o MAR (t = 1):
 * água da frente → fundo do tubo → face → teto → LIP fino caindo na água → volta por fora → costas.
 * A ponta do lip vai de 150° (crista ainda não lançou) a −60° (caiu na água da frente); fechando, afunda mais.
 * As pontas batem com o corpo sem dobra (y0, y1): sem rachadura.
 */
export function barrelCurve(t: number, R: number, curl: number, close: number, rs: number, y0: number, y1: number): [number, number] {
  const wf = TUBE.WF * R, wb = TUBE.WB * R, Re = R * rs, T = Re * TUBE.LIP;
  const cq = TUBE.CQ * R, cy = TUBE.CY * Re, AX = tubeAxAt(R, curl);
  const end = (150 + (-60 - 25 * close - 150) * curl) * Math.PI / 180, start = 260 * Math.PI / 180;
  // elipse com pontos espalhados POR IGUAL na curva (sem isso a boca larga esticava a malha nas laterais): ângulo corrigido
  const ce = (AX - 1) / (2 * (AX + 1));
  const P = (ang: number, r: number): [number, number] => { const a = ang + ce * Math.sin(2 * ang); return [cq + AX * r * Math.cos(a), cy + r * Math.sin(a)]; };
  // trechos proporcionais ao comprimento de cada parte (frente ~2,6R, arco ~6,8R, volta por fora ~3,4R, costas ~6,1R):
  // a malha estica POR IGUAL (~2,3×) — sem trecho esticado demais abrindo espaço entre vértices
  const A = BARREL_T[0], B = BARREL_T[1], Cc = BARREL_T[2];
  if (t <= A) { const k = t / A, [bq, by] = P(start, Re); return [wf + (bq - wf) * k, y0 + (by - y0) * smooth(0, 1, k)]; }
  if (t <= B) return P(start + (end - start) * ((t - A) / (B - A)), Re);
  if (t <= Cc) { const k = (t - B) / (Cc - B); return P(end + (Math.PI / 2 - end) * k, Re + T * smooth(0, 1, Math.min(1, k * 3))); }
  const k = (t - Cc) / (1 - Cc), [tq, ty] = P(Math.PI / 2, Re + T);
  return [tq + (-wb - tq) * k, ty + (y1 - ty) * smooth(0, 1, k)];
}

/** Onde cada trecho da seção começa/termina no parâmetro t (o shader usa os mesmos). */
// (com AX ≈ 2,15: frente ~3,2R, arco ~9,4R, volta por fora ~4,6R, costas ~6,6R → total ~23,7R sobre 9,0R de repouso)
export const BARREL_T = [0.134, 0.528, 0.721] as const;
/** Espuma da ponta do lip: centro e largura (em raios) no x de repouso (ponta do lip ≈ t 0,513 → x ≈ −1,56R). */
export const LIP_FOAM_X = 1.75, LIP_FOAM_W = 0.25;

/** Até onde a onda vai de cada lado (m em s): [direita, esquerda]. */
export type Lim = readonly [number, number];
export const FULL: Lim = [SURF.ZONE_S, SURF.ZONE_S];
/**
 * Apagar nas bordas da zona (sem degrau com o mar em volta). De cada lado a onda vai até `lim` (a zona acha onde tem
 * pedra — Pedra do Arpoador — e a onda MORRE ali, em vez de passar por dentro dela).
 */
export function zoneFade(s: number, q: number, lim: Lim = FULL, pf: SurfProfile = ARPOADOR): number {
  const L = s >= 0 ? lim[0] : lim[1];
  return smooth(L, L - pf.EDGE_S, Math.abs(s)) * smooth(pf.Q_MIN, pf.Q_MIN + pf.EDGE_Q0, q) * smooth(pf.Q_MAX, pf.Q_MAX - pf.EDGE_Q1, q);
}

/**
 * Ponto da SUPERFÍCIE (local) pro vértice em repouso (s, q0), com todas as ondas: out = [s, y, q, espuma].
 * Igual ao shader. As faixas de dobra de ondas diferentes não se encostam (ondas a 10+ m uma da outra).
 */
export function surfPoint(s: number, q0: number, waves: WaveState[], vars: WaveVar[], out: number[] = [0, 0, 0, 0], lim: Lim = FULL, pf: SurfProfile = ARPOADOR): number[] {
  const fade = zoneFade(s, q0, lim, pf);
  let y = 0, q = q0, foam = 0, fi = -1, fx = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]!; if (!w.active || w.h <= 0) continue;
    const b = barrelAt(s, w, vars[i]!, pf), x = q0 - crestQ(w, s, pf), band = barrelBand(b.hSide);
    y += bump(x, b.hSide * (1 - pf.CLOSED_DROP * b.closed), b.steep, pf.BACK_W);
    if (curlOf(b.open, b.closed, b.ramp, b.shape).blend > 0.001 && x <= band.wf && x >= -band.wb) { fi = i; fx = x; }
    // espuma: branco depois de fechar (na crista) + ponta do lip enquanto o tubo está aberto
    foam = Math.max(foam, b.closed * Math.exp(-(((x + 1) / 5) ** 2)), b.open * (1 - b.closed) * b.shape * Math.exp(-(((x + LIP_FOAM_X * band.r) / (LIP_FOAM_W * band.r)) ** 2)) * 0.7);
  }
  if (fi >= 0) {
    const w = waves[fi]!, b = barrelAt(s, w, vars[fi]!, pf), band = barrelBand(b.hSide), c = curlOf(b.open, b.closed, b.ramp, b.shape);
    const hh = b.hSide * (1 - pf.CLOSED_DROP * b.closed);
    const t = (band.wf - fx) / (band.wf + band.wb);
    const [cq, cy] = barrelCurve(t, band.r, c.curl, b.closed, c.rs, bump(band.wf, hh, b.steep, pf.BACK_W), bump(-band.wb, hh, b.steep, pf.BACK_W));
    q = crestQ(w, s, pf) + fx + (cq - fx) * c.blend;
    y = y + (cy - y) * c.blend;
  }
  out[0] = s; out[1] = y * fade; out[2] = q0 + (q - q0) * fade; out[3] = foam * fade;
  return out;
}

/**
 * Quem está na altura `yRef` está DENTRO do tubo aberto nesta coluna? Vale da face até a cortina do lip (inclusive um
 * pouco à frente dela: a cortina é FINA — dá pra entrar e sair atravessando, como o "roll through the lip" de verdade),
 * enquanto estiver abaixo do meio da cavidade. Uma regra só, larga, sem borda que vira "fora" no meio (Pedro 28/10:
 * "parece que tem leve colisão dentro do tubo" — a regra antiga trocava pra "topo" perto da parede e dava tranco).
 */
export function tubeInside(c: { curl: number; blend: number; rs: number }, x: number, R: number, yRef: number): boolean {
  if (c.curl < 0.6 || c.blend < 0.5) return false;
  const Re = R * c.rs, cq = TUBE.CQ * R, cy = TUBE.CY * Re, ax = tubeAxAt(R, c.curl) * Re;
  return yRef < cy + 0.5 * Re && x > cq - ax && x < cq + ax * (1 + TUBE.LIP) + 1.5;
}

/**
 * Altura da água (y local) num ponto (s, q). Por padrão o TOPO (por cima do tubo). Com `yRef` (altura de quem está ali):
 * DENTRO do tubo vale o chão dele — água quase lisa, só subindo de leve junto da face — e dá pra entrar e sair.
 */
export function surfHeightAt(s: number, q: number, waves: WaveState[], vars: WaveVar[], yRef = Infinity, lim: Lim = FULL, pf: SurfProfile = ARPOADOR): number {
  let y = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]!; if (!w.active || w.h <= 0) continue;
    const b = barrelAt(s, w, vars[i]!, pf), x = q - crestQ(w, s, pf), band = barrelBand(b.hSide), c = curlOf(b.open, b.closed, b.ramp, b.shape);
    const hb = b.hSide * (1 - pf.CLOSED_DROP * b.closed);
    let hh = bump(x, hb, b.steep, pf.BACK_W);
    if (c.blend > 0 && x <= band.wf && x >= -band.wb) {
      const R = band.r, Re = R * c.rs, cq = TUBE.CQ * R, cy = TUBE.CY * Re, AX = tubeAxAt(R, c.curl), ax = AX * Re, u = (x - cq) / ax;
      let shape: number;
      if (tubeInside(c, x, R, yRef)) {
        // DENTRO: chão do tubo — liso; junto da face (lado do mar) vira RAMPA subindo pela parede (contínua)
        shape = u < -0.6 ? cy - Re * Math.sqrt(Math.max(0, 1 - u * u)) - (cy - 0.8 * Re) : 0;
      } else {
        // POR FORA: casca do lip (até onde ele já se projetou) e, atrás do topo, as costas descendo
        const ro = Re * (1 + TUBE.LIP), axo = AX * ro * (0.3 + 0.7 * c.curl), uo = (x - cq) / axo;
        shape = x >= cq ? (uo < 1 ? cy + ro * Math.sqrt(1 - uo * uo) : 0) : cy + ro + (bump(-band.wb, hb, b.steep, pf.BACK_W) - cy - ro) * smooth(0, 1, (cq - x) / (cq + band.wb));
      }
      hh += (shape - hh) * c.blend;
    }
    y += hh;
  }
  return y * zoneFade(s, q, lim, pf);
}

/**
 * Correnteza da onda em (s, q): velocidade (m/s, ao longo de +q = rumo à praia) que a água impõe a quem está boiando.
 * Pedro 28/10: "a onda ainda não leva nem eu nem o carro, só passou por mim" — o empurrão antigo era mais lento que a
 * onda (ela passava por baixo). Agora é um BOLSO: quem está na frente da crista de uma onda quebrando/espuma vai NA
 * velocidade dela; ficou pra trás → empurra mais, adiantou → empurra menos (equilíbrio ~1R à frente da crista). Assim
 * ela LEVA até perto da areia. Ondulação sem quebrar: só um leve embalo.
 */
export function surfPushAt(s: number, q: number, waves: WaveState[], vars: WaveVar[], lim: Lim = FULL, yRef = Infinity, pf: SurfProfile = ARPOADOR): number {
  let p = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]!; if (!w.active || w.h <= 0) continue;
    const b = barrelAt(s, w, vars[i]!, pf), x = q - crestQ(w, s, pf), R = barrelBand(b.hSide).r;
    const win = smooth(-2.5 * R, -R, x) * smooth(5 * R, 3 * R, x);            // bolso: da crista até ~4R à frente
    if (win <= 0) continue;
    // DENTRO do tubo aberto: a água anda JUNTO com a onda, sem empurrão a mais — você fica no lugar em relação ao tubo e
    // nada livre pra entrar/sair (pelo lado ou atravessando a cortina). O empurrão forte é da parede de fora e da espuma.
    if (tubeInside(curlOf(b.open, b.closed, b.ramp, b.shape), x, R, yRef)) { p = Math.max(p, pf.C * win); continue; }
    // segura: espuma/quebrando (forte — Pedro: "pode me levar mais, ainda tô pesado"), face empinada prestes a quebrar
    // (médio), ondulação (leve). A espuma pequena perto da areia ainda leva bem (mínimo de 60% pela altura).
    // (2ª — "ainda tô pesado"): onda grande chegando na quebra já segura forte ao longo da crista inteira, não só onde a
    // abertura passou (quem estava na crista ficava pra trás no 1–2 s antes de quebrar ali)
    const grip = (0.6 + 0.4 * Math.sqrt(Math.min(1, b.hSide / pf.H_MAX))) * (0.15 + 0.85 * Math.max(b.closed, b.open, 0.85 * smooth(-40, -8, w.qc - pf.BREAK_Q)));
    const hold = 1 + 0.6 * Math.max(-1, Math.min(1, (R - x) / (2 * R)));      // pra trás empurra mais, adiantado menos
    p = Math.max(p, pf.C * hold * grip * win);
  }
  // A FACE É UMA RAMPA QUE ANDA (Pedro 28/10): quem boia nela escorrega rampa abaixo (gravidade ∝ inclinação) enquanto
  // ela avança — na face da frente isso leva pra praia (é o que segura surfista/carro no bolso); nas costas da onda não
  // empurra (ela passa por baixo); dentro do tubo a água é lisa (inclinação 0) e só anda junto.
  const d = 0.5, slope = (surfHeightAt(s, q + d, waves, vars, yRef, lim, pf) - surfHeightAt(s, q - d, waves, vars, yRef, lim, pf)) / (2 * d);
  if (slope < 0) p += FACE_SLIDE * Math.min(1.5, -slope);
  return p * zoneFade(s, q, lim, pf);
}
/** Quanto a face da onda (rampa) acelera quem boia nela, em m/s por unidade de inclinação (face a 45° → +2 m/s). */
export const FACE_SLIDE = 2;

/** Quem está em (s, q) na altura `yRef` está DENTRO do tubo aberto? (a câmera chega no ombro — quase 1ª pessoa) */
export function surfInTubeAt(s: number, q: number, waves: WaveState[], vars: WaveVar[], yRef: number, lim: Lim = FULL, pf: SurfProfile = ARPOADOR): boolean {
  if (zoneFade(s, q, lim, pf) < 0.5) return false;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]!; if (!w.active || w.h <= 0) continue;
    const b = barrelAt(s, w, vars[i]!, pf);
    if (tubeInside(curlOf(b.open, b.closed, b.ramp, b.shape), q - crestQ(w, s, pf), barrelBand(b.hSide).r, yRef)) return true;
  }
  return false;
}

/**
 * BAFORADA (spit) — Pedro 29/10: "no tubo, lá no foam ball, deveria cuspir pra fora". O lip fechando atrás comprime o ar
 * e a espuma dentro do tubo e sai tudo pela boca aberta; a espuma que vem fechando empurra quem está lá dentro pra fora.
 * Devolve a aceleração (m/s²) AO LONGO da onda (+s ou −s = rumo à boca, pra longe do pico), crescendo quando o
 * fechamento chega a menos de SPIT_NEAR m atrás de você. Fora do tubo: 0.
 */
export const SPIT_ACC = 4.5, SPIT_NEAR = 14;
export function surfSpitAt(s: number, q: number, waves: WaveState[], vars: WaveVar[], yRef: number, lim: Lim = FULL, pf: SurfProfile = ARPOADOR): number {
  let best = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]!; if (!w.active || w.h <= 0) continue;
    const b = barrelAt(s, w, vars[i]!, pf);
    if (!tubeInside(curlOf(b.open, b.closed, b.ramp, b.shape), q - crestQ(w, s, pf), barrelBand(b.hSide).r, yRef)) continue;
    const prox = smooth(-SPIT_NEAR, 0, b.behind) * (1 - b.closed);
    if (prox > Math.abs(best) / SPIT_ACC) best = (s >= 0 ? 1 : -1) * SPIT_ACC * prox;
  }
  return best * zoneFade(s, q, lim, pf);
}

/**
 * ESPUMA BATENDO em (s, q) — 0..1: a onda já FECHOU ali e a massa de espuma está em cima (da crista até ~2,5R à frente).
 * Quem está ali "toma a vaca": gira junto e é levado (surf-ride). Na frente da abertura (tubo aberto) é 0.
 */
export function surfChurnAt(s: number, q: number, waves: WaveState[], vars: WaveVar[], lim: Lim = FULL, pf: SurfProfile = ARPOADOR): number {
  let c = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i]!; if (!w.active || w.h <= 0) continue;
    const b = barrelAt(s, w, vars[i]!, pf), x = q - crestQ(w, s, pf), R = barrelBand(b.hSide).r;
    const win = smooth(-1.5 * R, -0.5 * R, x) * smooth(3 * R, 1.5 * R, x);
    c = Math.max(c, b.closed * win * smooth(0.25, 0.6, b.hSide / pf.H_MAX)); // espuma pequena perto da areia não derruba
  }
  return c * zoneFade(s, q, lim, pf);
}
