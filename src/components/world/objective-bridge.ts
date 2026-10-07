/**
 * Ponte entre a camada visual (mundo 3D + HUD) e a fatia de acampamentos /
 * objetivos da store.
 *
 * Centraliza em um só lugar: leitura da fila, ações de fila, seleção de alvo,
 * definição de acampamento e a decisão do piloto (`decideIntent`). Assim nem o
 * laço de quadro nem o HUD precisam saber de onde cada coisa vem.
 */
import { useGameStore } from '@/game/state/game-store';
import { getCampDefinition } from '@/game/data/camps';
import { decideIntent as decide } from '@/game/systems/objectiveSystem';
import type {
  AutoIntent, AutoMode, AutoSnapshot, CampDefinition, CampState, ObjectiveKind,
  ObjectiveQueueState,
} from '@/game/types';

export function getCamps(): CampState[] {
  return useGameStore.getState().camps;
}

export function getObjectives(): ObjectiveQueueState {
  return useGameStore.getState().objectives;
}

export function getTargetId(): string | null {
  return useGameStore.getState().targetId;
}

export function setTarget(creatureId: string | null) {
  useGameStore.getState().setTarget(creatureId);
}

export function addObjective(kind: ObjectiveKind, targetId: string | null) {
  useGameStore.getState().addObjective(kind, targetId);
}

export function removeObjective(id: string) {
  useGameStore.getState().removeObjective(id);
}

export function clearObjectives() {
  useGameStore.getState().clearObjectives();
}

export function reorderObjective(id: string, direction: -1 | 1) {
  useGameStore.getState().reorderObjective(id, direction);
}

export function setAutoMode(mode: AutoMode) {
  useGameStore.getState().setAutoMode(mode);
}

export function toggleAutoMode() {
  setAutoMode(getObjectives().mode === 'idle' ? 'manual' : 'idle');
}

export function toggleRepeat() {
  useGameStore.getState().toggleRepeat();
}

export function tickWorld() {
  useGameStore.getState().tickWorld();
}

export function buildAutoSnapshot(): AutoSnapshot {
  return useGameStore.getState().buildAutoSnapshot();
}

export function decideIntent(snapshot: AutoSnapshot, now: number): AutoIntent {
  return decide(snapshot, now);
}

export function campDefinition(defId: string): CampDefinition | undefined {
  return getCampDefinition(defId) ?? undefined;
}

/* ------------------------------------------------------------------ *
 * Hooks para o HUD
 * ------------------------------------------------------------------ */
export function useObjectivesState(): ObjectiveQueueState {
  return useGameStore(s => s.objectives);
}

export function useCampsState(): CampState[] {
  return useGameStore(s => s.camps);
}

export function useTargetIdState(): string | null {
  return useGameStore(s => s.targetId);
}

/** Shift+clique num recurso: enfileira o nó mais próximo do ponto clicado. */
export function queueNearestNode(x: number, z: number) {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const node of useGameStore.getState().resources) {
    const dx = node.position.x - x;
    const dz = node.position.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestDist) { bestDist = d; best = node.id; }
  }
  if (best && bestDist <= 8) addObjective('gather_node', best);
  else useGameStore.getState().setMessage('Nenhum recurso reconhecido aqui.');
}
