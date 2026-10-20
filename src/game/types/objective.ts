import type { Position } from './player';

export type ObjectiveKind = 'clear_camp' | 'hunt_creature' | 'gather_node' | 'travel' | 'hunt_area';

export type ObjectiveStatus = 'queued' | 'active' | 'done' | 'failed' | 'cancelled';

export type Objective = {
  id: string;
  kind: ObjectiveKind;
  /** Id do acampamento, da criatura ou do recurso. `travel` não tem alvo. */
  targetId: string | null;
  /** Para onde o jogador precisa ir. Para alvos móveis é só o ponto inicial. */
  position: Position;
  label: string;
  /** `hunt_area`: raio em metros em torno de `position`. */
  radius?: number;
  status: ObjectiveStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  failedReason: string | null;
};

/** `manual` = o jogador dirige; `idle` = o piloto automático executa a fila. */
export type AutoMode = 'manual' | 'idle';

export type ObjectiveQueueState = {
  items: Objective[];
  mode: AutoMode;
  /** No fim da fila, recomeça do topo em vez de parar. */
  repeat: boolean;
  seq: number;
};

/**
 * O que o piloto automático quer fazer AGORA.
 * Decidido por função pura; quem executa é o laço de quadro do mundo 3D.
 */
export type AutoIntent =
  | { kind: 'idle'; reason: string }
  | { kind: 'move'; to: Position; reason: string }
  | { kind: 'attack'; creatureId: string; to: Position }
  | { kind: 'gather'; nodeId: string; to: Position }
  | { kind: 'heal'; hotbarIndex: number }
  | { kind: 'retreat'; to: Position; reason: string };

/** Tudo que a decisão precisa ler. Mantém `decideIntent` puro e testável. */
export type AutoSnapshot = {
  playerPosition: Position;
  playerHp: number;
  playerMaxHp: number;
  playerDead: boolean;
  /** Índice da hotbar com uma cura utilizável, ou null. */
  healSlot: number | null;
  /** Nível do jogador (filtro de alvo da caça autônoma). Ausente = 1. */
  playerLevel?: number;
  /** `level` ausente = 1 (retrocompatível com snapshots de teste). */
  creatures: { id: string; position: Position; behavior: string; hp: number; hostile?: boolean; level?: number }[];
  camps: { id: string; position: Position; radius: number; creatureIds: string[]; cleared: boolean }[];
  /** `kind`/`range` opcionais: nó de colheita novo carrega o alcance da definição. */
  resources: { id: string; position: Position; depleted: boolean; kind?: string; range?: number }[];
  objectives: ObjectiveQueueState;
  homePosition: Position;
  /** Onda em COMBATE (cerco à base) → o piloto prioriza DEFENDER: ataca o hostil
   *  mais próximo dentro do raio de defesa e não persegue além dele. */
  baseUnderSiege?: boolean;
  /** Cura automática ligada. Ausente = ligada. */
  autoPotion?: boolean;
  /** Raio (m) pra caçar o bicho mais próximo quando ocioso. 0/ausente = não caça sozinho. */
  autoHuntRadius?: number;
  /** Alcance de ataque da arma na mão (m). Ranged atira de longe. Ausente = melee. */
  attackRange?: number;
  /** Nós de colheita do mundo novo (legado fica em `resources`). */
  harvestNodes?: { id: string; kind: string; position: Position; depleted: boolean }[];
  gatherCapacity?: boolean;
};
