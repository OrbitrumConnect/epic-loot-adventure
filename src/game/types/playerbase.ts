import type { Position } from './player';

/**
 * Base persistente do jogador no mundo (Fase 3).
 *
 * É UMA entidade só, com duas vistas: o jogador anda dentro dela no mundo 3D e
 * a administra na tela de cidade. A vista de cidade (`BaseState`, em `base.ts`)
 * só destrava quando o perímetro fecha — a direção do Pedro é
 * "bed → foundation → walls → towers → perímetro fechado → Clash desbloqueia".
 *
 * Nada aqui decide regra: as regras vivem em `systems/playerBaseSystem.ts`.
 */

/** Lado da quadrícula do mundo, em metros. Tudo encaixa nesta grade. */
export const BASE_GRID = 2;

export type BasePieceKind = 'core' | 'wall' | 'door' | 'tower' | 'roof';

/** Coordenada em quadrículas, não em metros. Converter sempre pelos helpers do sistema. */
export type GridCell = { gx: number; gz: number };

export type BasePiece = {
  id: string;
  kind: BasePieceKind;
  cell: GridCell;
  /** 0, 90, 180 ou 270 graus. Muro e porta usam; núcleo e torre ignoram. */
  rotation: 0 | 90 | 180 | 270;
  hp: number;
  maxHp: number;
  /** Nível da peça: sobe o material (madeira → pedra → ferro) e o HP. */
  tier: 1 | 2 | 3;
};

/**
 * Estágio da base. Cada um destrava o seguinte; nunca pula.
 * `clash` é o último: a vista de cidade com filas de produção.
 */
export type BaseStage = 'none' | 'bed' | 'foundation' | 'walls' | 'towers' | 'enclosed' | 'clash';

export type ClaimIssue =
  | 'fora-do-mapa'
  | 'perto-do-nascedouro'
  | 'sobre-ruinas'
  | 'sobre-acampamento'
  | 'sobre-agua'
  | 'perto-de-outra-base'
  | 'terreno-ingreme';

/** O que o jogador vê antes de confirmar o claim. */
export type ClaimCheck = {
  ok: boolean;
  issues: ClaimIssue[];
  /** Mensagem pronta em português para o primeiro problema. */
  message: string;
  /** Canto inferior-esquerdo do quadrado, em quadrículas. */
  origin: GridCell;
  /** Lado do quadrado, em quadrículas. */
  size: number;
};

export type PlayerBaseState = {
  id: string;
  /** Jogador sozinho ou tribo — a mesma entidade nos dois casos. */
  owner: { kind: 'player' | 'tribe'; id: string; name: string };
  /** Centro do claim, em metros, para o mundo 3D e o mapa. */
  worldPosition: Position;
  /** Canto inferior-esquerdo, em quadrículas. */
  origin: GridCell;
  /** Lado do quadrado do claim, em quadrículas. */
  size: number;
  stage: BaseStage;
  pieces: BasePiece[];
  /** Vira true quando os muros cercam o núcleo sem brecha (o teste de preenchimento). */
  enclosed: boolean;
  claimedAt: number;
  /** Última vez que a base sofreu dano, para a UI mostrar "sob ataque". */
  lastDamagedAt: number | null;
};

/** O que o modo de construção devolve ao arrastar um muro, antes de confirmar. */
export type BuildPreview = {
  cells: GridCell[];
  kind: BasePieceKind;
  /** Custo somado de tudo que seria construído. */
  cost: { itemId: string; quantity: number }[];
  /** Células recusadas, com o motivo, para pintar de vermelho. */
  blocked: { cell: GridCell; reason: string }[];
  affordable: boolean;
};
