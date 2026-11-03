import { create } from 'zustand';

/**
 * CÂMERA da Zona Sul a pé (03/11, Pedro: "no mobile mudar câmera MOBA de cima saiu?! ver os tipos de câmera web e mobile
 * pra ficar pro, elite, pra jogar direito"). O botão Câmera ficou escondido no mapa novo desde 29/10 (lá só havia o
 * ombro) e o V levava pra vista do MAPA (solta do herói, não dá pra jogar). Agora são 2 câmeras de JOGO, iguais ao Vale:
 *  - `ombro`: 3ª pessoa de sempre (arrasta gira e inclina, mira no centro);
 *  - `cima`: de cima, estilo MOBA / "quarter view" dos MMOs de celular (MIR4, Lineage 2M): ângulo FIXO, segue o herói,
 *    arrastar só GIRA 360°, roda/pinça aproxima, ATACAR pega o inimigo mais perto. Mirar (botão direito / Mirar) desce
 *    pro ombro enquanto segura e volta.
 * Botão Câmera (PC e celular) e tecla V trocam; o aparelho lembra a escolha. Na caverna a de cima vira ombro sozinha
 * (rocha em cima) e volta ao sair; no carro/navio/skate valem as câmeras deles. K segue sendo a vista do mapa.
 * Arquivo pequeno de propósito: a casa do jogo (botões) importa sem carregar o mundo 3D.
 */
export type ZsCamMode = 'ombro' | 'cima';

/** De cima: inclinação fixa (rad, ~53°), campo de visão FECHADO (lente longa = quase sem distorção, como a ortográfica
 *  do Vale) e distância (m) — padrão mostra ~15 m de altura de tela em volta do herói (perto da câmera de cima do Vale:
 *  ~12 m no celular, ~14 m no PC); faixa da roda/pinça. `BLEND` = velocidade da troca (1/s). */
export const ZS_MOBA = { PITCH: 0.92, FOV: 38, DIST: 22, MIN: 12, MAX: 50, BLEND: 4 } as const;
/** Ombro: faixa da distância (roda/pinça), igual à roda de antes. */
export const ZS_SHOULDER_DIST = { MIN: 3, MAX: 40 } as const;

export const ZS_CAM_KEY = 'tribos.zsCam';
function readMode(): ZsCamMode {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(ZS_CAM_KEY) === 'cima' ? 'cima' : 'ombro'; } catch { return 'ombro'; }
}
export const useZsCam = create<{ mode: ZsCamMode }>(() => ({ mode: readMode() }));
export function setZsCamMode(mode: ZsCamMode): void {
  useZsCam.setState({ mode });
  try { localStorage.setItem(ZS_CAM_KEY, mode); } catch { /* sem storage: vale só nesta sessão */ }
}
export function toggleZsCam(): ZsCamMode {
  const next: ZsCamMode = useZsCam.getState().mode === 'cima' ? 'ombro' : 'cima';
  setZsCamMode(next);
  return next;
}

/** PINÇA (2 dedos): afastou os dedos = aproxima. Distância nova, presa na faixa. */
export function pinchDist(dist: number, prevSpan: number, span: number, min: number, max: number): number {
  if (!(prevSpan > 0) || !(span > 0)) return dist;
  return Math.max(min, Math.min(max, dist * (prevSpan / span)));
}
