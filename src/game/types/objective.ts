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
  creatures: { id: string; position: Position; behavior: string; hp: number }[];
  camps: { id: string; position: Position; radius: number; creatureIds: string[]; cleared: boolean }[];
  resources: { id: string; position: Position; depleted: boolean }[];
  objectives: ObjectiveQueueState;
  homePosition: Position;
  /** Cura automática ligada. Ausente = ligada. */
  autoPotion?: boolean;
  /** Raio (m) pra caçar o bicho mais próximo quando ocioso. 0/ausente = não caça sozinho. */
  autoHuntRadius?: number;
  /** Nós de colheita do mundo novo (legado fica em `resources`). */
  harvestNodes?: { id: string; kind: string; position: Position; depleted: boolean }[];
};
