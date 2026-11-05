/**
 * Modo de SELEÇÃO do builder de rotina (HUD).
 *
 * O painel "Objetivos" monta um passo DE PROPÓSITO: o jogador escolhe o tipo
 * (farmar/caçar zona, ir até ponto, limpar acampamento) e o critério de término,
 * depois clica "Escolher no mapa". Isso arma um `RoutePick` aqui; o PRÓXIMO clique
 * no mapa (Vale: world-map.tsx; Zona Sul: zs-map.tsx) lê este estado, enfileira o
 * passo com o tipo/until escolhidos e limpa o pick — em vez do comportamento
 * hardcoded (que sempre cria hunt_area e liga o idle na hora).
 *
 * Store próprio (fora do game-store) de propósito: é estado de UI puro, muda só
 * por ação do jogador e não deve sacudir os seletores do mundo 3D. Sem dependência
 * nova: `useSyncExternalStore` do React.
 */
import { useSyncExternalStore } from 'react';
import type { ObjectiveUntil } from '@/game/types';

/** Tipos de passo que o builder sabe criar. */
export type RoutePickKind = 'farm_area' | 'hunt_area' | 'travel' | 'clear_camp';

export type RoutePick = {
  kind: RoutePickKind;
  /** Critério de término (só farm_area/hunt_area). */
  until?: ObjectiveUntil;
};

let current: RoutePick | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Arma o modo de seleção: o próximo clique no mapa vira este passo. */
export function setRoutePick(pick: RoutePick | null) {
  current = pick;
  emit();
}

/** Lê o pick atual (uso imperativo nos handlers de clique do mapa). */
export function getRoutePick(): RoutePick | null {
  return current;
}

/** Limpa o modo de seleção (depois de enfileirar, ou ao cancelar). */
export function clearRoutePick() {
  if (current == null) return;
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Hook do HUD: re-renderiza só quando o pick muda (raríssimo). */
export function useRoutePick(): RoutePick | null {
  return useSyncExternalStore(subscribe, getRoutePick, getRoutePick);
}
