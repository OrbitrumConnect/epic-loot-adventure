/**
 * SISTEMA DE CARTAS (Pedro 25/10: "card na tela, um toque, sem ir à cidade"). Uma fila única pra tudo que é
 * conquista/aviso: nível (escolher atributo), poder novo, prédio pronto, casa liberada, acampamento limpo — e depois
 * forja, fusão, artefato, raid. Regras: UMA carta por vez; nunca no meio da luta (espera e mostra o selinho);
 * importantes (`sticky`) ficam até escolher; informativas somem sozinhas em INFO_TTL_MS.
 * Sem 3D aqui (a HUD carrega antes do mundo).
 */
import { create } from 'zustand';

export type CardAction = { label: string; hint?: string; run: () => void };
export type GameCard = {
  id: string;
  /** Agrupa/evita duplicata (ex.: 'level' — só uma carta de nível na fila por vez). */
  kind: string;
  icon: string;
  title: string;
  body?: string;
  actions?: CardAction[];
  /** Fica até o jogador escolher (nível, forja…). Sem isso, some sozinha. */
  sticky?: boolean;
};

export const INFO_TTL_MS = 5000;
/** Depois de tomar/dar golpe, espera isso antes de mostrar carta (não atrapalha a luta). */
export const COMBAT_QUIET_MS = 3500;

type CardState = { queue: GameCard[]; shownAt: number };
export const useCards = create<CardState>(() => ({ queue: [], shownAt: 0 }));

let seq = 0;
/** Põe uma carta na fila. `dedupeKind`: se já existe uma do mesmo tipo esperando, não duplica. */
export function pushCard(card: Omit<GameCard, 'id'>, dedupeKind = false): void {
  const s = useCards.getState();
  if (dedupeKind && s.queue.some((c) => c.kind === card.kind)) return;
  useCards.setState({ queue: [...s.queue, { ...card, id: `card${++seq}` }] });
}
/** Tira a carta da vez (ou uma específica). */
export function dismissCard(id?: string): void {
  const s = useCards.getState();
  const queue = id ? s.queue.filter((c) => c.id !== id) : s.queue.slice(1);
  useCards.setState({ queue, shownAt: 0 });
}
/** Troca o conteúdo de uma carta na fila (ex.: carta de nível depois de gastar um ponto). */
export function replaceCard(id: string, next: Omit<GameCard, 'id'>): void {
  useCards.setState((s) => ({ queue: s.queue.map((c) => (c.id === id ? { ...next, id } : c)) }));
}

/** Em luta agora? (golpe dado/tomado há pouco) — puro, testável. */
export function inCombat(now: number, lastDamagedAtMs: number | undefined, lastAttackAtSec: number | undefined): boolean {
  return now - (lastDamagedAtMs ?? 0) < COMBAT_QUIET_MS || now - (lastAttackAtSec ?? 0) * 1000 < COMBAT_QUIET_MS;
}
