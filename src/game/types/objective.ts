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
  /** `canCollect` false = o próximo golpe não cabe na mochila (ou falta a ferramenta) → o piloto
   *  não vai até ele. Ausente = sem informação (comportamento antigo). */
  resources: { id: string; position: Position; depleted: boolean; kind?: string; range?: number; canCollect?: boolean }[];
  objectives: ObjectiveQueueState;
  homePosition: Position;
  /** Zona segura do spawn: nenhum hostil entra nela (`pushOutSafeZone`). Dentro
   *  dela fugir é inútil — o inimigo não alcança — e travava o piloto pra sempre. */
  safeZone?: { x: number; z: number; radius: number };
  /** Onda em COMBATE (cerco à base) → o piloto prioriza DEFENDER: ataca o hostil
   *  mais próximo dentro do raio de defesa e não persegue além dele. */
  baseUnderSiege?: boolean;
  /** Cura automática ligada. Ausente = ligada. */
  autoPotion?: boolean;
  /** Raio (m) pra caçar o bicho mais próximo quando ocioso. 0/ausente = não caça sozinho. */
  autoHuntRadius?: number;
  /** Alcance de ataque EFETIVO (m): o maior entre as armas usáveis da hotbar, pra
   *  o piloto atirar de longe com arco/pistola/rifle. Ausente = melee. */
  attackRange?: number;
  /** Armas da hotbar que o piloto pode empunhar (melee + ranged com munição).
   *  Estruturalmente igual a `AutoWeapon` de `systems/weaponChoiceSystem`. */
  weapons?: {
    hotbarIndex: number;
    itemId: string;
    type: 'melee' | 'bow' | 'pistol' | 'rifle';
    range: number;
    cooldown: number;
    attackPower: number;
    hasAmmo: boolean;
  }[];
  /** Preferência de arma do piloto escolhida pelo jogador. Ausente = 'auto'
   *  (comportamento por distância de hoje). 'ranged' força arma à distância
   *  sempre que houver munição; 'melee' força corpo a corpo. */
  pilotWeaponStyle?: 'auto' | 'melee' | 'ranged';
  /** Instante (ms) do último dano sofrido pelo jogador. O piloto prioriza
   *  combate sobre farm por uma janela curta depois de ser atingido. */
  playerLastDamagedAt?: number;
  /** Intenção decidida no tique ANTERIOR, realimentada pelo executor. Dá
   *  histerese ao piloto (banda morta de combate, alvo pegajoso). Ausente = sem
   *  memória (primeiro tique ou executor que não realimenta). */
  previousIntent?: AutoIntent;
  /** Índice da hotbar da arma na MÃO agora (`ui.selectedHotbar`). */
  heldHotbarIndex?: number;
  /** Alcance (m) da arma na mão — o valor antigo de `attackRange`. */
  heldRange?: number;
  /** Nós de colheita do mundo novo (legado fica em `resources`). */
  harvestNodes?: { id: string; kind: string; position: Position; depleted: boolean }[];
  gatherCapacity?: boolean;
};
