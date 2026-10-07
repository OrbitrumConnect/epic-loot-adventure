import type { Position } from './player';

/** Quanto mais alto o tier, mais inimigos e melhor a recompensa. */
export type CampTier = 1 | 2 | 3 | 4;

export type CampStructureKind = 'tent' | 'watchtower' | 'palisade' | 'bonfire' | 'totem' | 'cage';

export type CampStructure = {
  kind: CampStructureKind;
  /** Deslocamento em relação ao centro do acampamento, em metros. */
  offset: Position;
  rotation: number;
  scale: number;
};

export type CampSpawn = {
  speciesId: string;
  /** Posto de guarda do inimigo, relativo ao centro do acampamento. */
  offset: Position;
  /** Guardas da entrada atacam quem chega; os demais só reagem ao serem atacados. */
  guard: boolean;
};

export type CampDefinition = {
  id: string;
  name: string;
  tier: CampTier;
  /** Raio em metros: o acampamento é considerado limpo quando não há inimigo vivo dentro dele. */
  radius: number;
  structures: CampStructure[];
  spawns: CampSpawn[];
  /** Recompensa entregue uma vez por limpeza. */
  reward: { gold: number; items: { itemId: string; quantity: number }[] };
  respawnMs: number;
};

export type CampState = {
  id: string;
  defId: string;
  name: string;
  tier: CampTier;
  position: Position;
  /** Ids das criaturas que pertencem a este acampamento, na ordem dos spawns da definição. */
  creatureIds: string[];
  cleared: boolean;
  clearedAt: number | null;
  respawnAt: number | null;
  /** Vira true quando o jogador chega perto o bastante pela primeira vez. */
  discovered: boolean;
};
