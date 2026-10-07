export type BaseResourceId = 'wood' | 'stone' | 'food' | 'essence';

export type BaseResources = Record<BaseResourceId, number>;

export type BuildingId =
  | 'tribe_hall'
  | 'lumber_camp'
  | 'quarry'
  | 'hunting_lodge'
  | 'war_camp'
  | 'scout_tent'
  | 'forge'
  | 'shaman_circle';

export type BaseUnitKind = 'troop' | 'tool' | 'research';

export type EraDefinition = {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
};

export type BuildingDefinition = {
  id: BuildingId;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  /** Quantas instâncias desta construção podem existir na cidade. */
  maxInstances: number;
  /** Nível mínimo do Salão da Tribo para construir. */
  unlockHallLevel: number;
  /** Custo do nível 1; níveis seguintes crescem geometricamente. */
  baseCost: BaseResources;
  /** Tempo do nível 1 em segundos (antes da escala de tempo). */
  baseBuildSeconds: number;
  /** Recurso produzido ao longo do tempo (por minuto no nível 1). */
  produces: { resource: BaseResourceId; basePerMinute: number } | null;
  /** Tipo de fila de produção que a construção oferece. */
  queueKind: BaseUnitKind | null;
};

export type ConstructionJob = {
  targetLevel: number;
  durationMs: number;
  /** Ordem de chegada na fila de construtores. */
  order: number;
  /** null enquanto aguarda um construtor livre. */
  startedAt: number | null;
  endsAt: number | null;
};

export type QueueItem = {
  id: string;
  unitId: string;
  durationMs: number;
  /** Custo pago, devolvido integralmente ao cancelar. */
  cost: BaseResources;
  /** null enquanto não é o primeiro da fila. */
  startedAt: number | null;
  endsAt: number | null;
};

export type PlacedBuilding = {
  id: string;
  defId: BuildingId;
  /** 0 = terreno em obras (primeira construção ainda não concluída). */
  level: number;
  plotIndex: number;
  construction: ConstructionJob | null;
  queue: QueueItem[];
};

export type ResearchEffectKind =
  | 'production_pct'
  | 'build_time_pct'
  | 'expedition_loot_pct'
  | 'queue_slots';

export type BaseUnitDefinition = {
  id: string;
  name: string;
  description: string;
  kind: BaseUnitKind;
  icon: string;
  building: BuildingId;
  minBuildingLevel: number;
  cost: BaseResources;
  durationSeconds: number;
  /** Ferramentas: item entregue ao inventário do jogador. */
  itemId?: string;
  /** Pesquisas: efeito permanente por nível pesquisado. */
  effect?: { kind: ResearchEffectKind; perRank: number };
  maxRank?: number;
};

export type ExpeditionDefinition = {
  id: string;
  name: string;
  durationSeconds: number;
  minTentLevel: number;
  lootPerScout: BaseResources;
  /** Pontos percentuais de mapa explorado por batedor. */
  explorePerScout: number;
};

export type Expedition = {
  id: string;
  defId: string;
  scouts: number;
  startedAt: number;
  endsAt: number;
};

export type BaseState = {
  resources: BaseResources;
  buildings: PlacedBuilding[];
  builders: number;
  /** unitId -> quantidade (inclui batedores em expedição). */
  troops: Record<string, number>;
  /** researchId -> nível pesquisado. */
  research: Record<string, number>;
  expeditions: Expedition[];
  /** 0..100 */
  explored: number;
  /** Ferramentas prontas aguardando espaço na mochila do jogador. */
  toolStash: Record<string, number>;
  /** Último instante (ms) em que a base foi resolvida. */
  lastTickAt: number;
  /** Contador para ids e ordem da fila de construção. */
  seq: number;
};

export type BaseResult = {
  state: BaseState;
  ok: boolean;
  message: string;
};
