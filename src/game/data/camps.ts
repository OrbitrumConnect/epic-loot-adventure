import type { CampDefinition, CampStructure, Position } from '../types';

// ---------------------------------------------------------------------------
// Regras de ocupação do mapa
//
// O mundo é um quadrado de lado 2 * WORLD_HALF (espelha MAP_HALF do mundo 3D).
// Nenhum acampamento pode:
//   - sair do mapa (centro + raio precisa caber em WORLD_HALF);
//   - ficar a menos de SPAWN_SAFE_RADIUS da borda do nascedouro do jogador;
//   - encostar nas ruínas (centro + raio das ruínas + CAMP_MIN_GAP);
//   - encostar em outro acampamento (soma dos raios + CAMP_MIN_GAP).
// `findPlacementIssues()` verifica isso em código; o teste só checa que a lista
// voltou vazia, então mudar uma posição no olhômetro falha o build.
// ---------------------------------------------------------------------------

export const WORLD_HALF = 90;
export const PLAYER_SPAWN: Position = { x: 0, z: 0 };

export const LAKE_CENTERS: { x: number; z: number; r: number }[] = [
  { x: 55, z: 55, r: 16 },
  { x: -60, z: -15, r: 12 },
];

/**
 * Córrego: polilinha (coord. de mundo) que nasce nas colinas a nordeste,
 * cruza a estrada UMA vez na frente do nascedouro (onde fica a ponte) e
 * desemboca no laginho a sudoeste. Dado puro aqui para o terreno (world-kit),
 * a água (game-world) e a exclusão de árvores/nós usarem a MESMA linha.
 */
export const RIVER_POINTS: Position[] = [
  { x: 40, z: 38 },
  { x: 22, z: 22 },
  { x: 8,  z: 10 },
  { x: -2, z: 2.5 },
  { x: -18, z: -6 },
  { x: -38, z: -12 },
  { x: -55, z: -15 },
];

/** Metade da largura da água do córrego (para exclusões de spawn). */
export const RIVER_HALF_WIDTH = 2.4;

/** Distância (planar) de um ponto ao eixo do córrego. */
export function riverDistance(x: number, z: number): number {
  let min = Infinity;
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const a = RIVER_POINTS[i]!, b = RIVER_POINTS[i + 1]!;
    const vx = b.x - a.x, vz = b.z - a.z;
    const wx = x - a.x, wz = z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2));
    const cx = a.x + t * vx, cz = a.z + t * vz;
    const d = Math.hypot(x - cx, z - cz);
    if (d < min) min = d;
  }
  return min;
}
/** Nenhum acampamento começa a menos disto do nascedouro. */
export const SPAWN_SAFE_RADIUS = 14;
/** Folga mínima entre as bordas de dois acampamentos (ou de um acampamento e as ruínas). */
export const CAMP_MIN_GAP = 6;
export const RUINS_POSITION: Position = { x: 7, z: -8 };
export const RUINS_RADIUS = 8;

export type CampPlacement = {
  /** Id do acampamento no mundo; igual ao da definição (um acampamento por definição). */
  id: string;
  defId: string;
  position: Position;
};

// ---------------------------------------------------------------------------
// Helpers de estrutura
// ---------------------------------------------------------------------------

function structure(
  kind: CampStructure['kind'],
  x: number,
  z: number,
  rotation = 0,
  scale = 1,
): CampStructure {
  return { kind, offset: { x, z }, rotation, scale };
}

/** Anel de paliçadas determinístico: `count` postes distribuídos no raio pedido. */
function palisadeRing(count: number, radius: number): CampStructure[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return structure(
      'palisade',
      Number((Math.cos(angle) * radius).toFixed(2)),
      Number((Math.sin(angle) * radius).toFixed(2)),
      Number((-angle).toFixed(3)),
      1,
    );
  });
}

// ---------------------------------------------------------------------------
// Definições
// ---------------------------------------------------------------------------

export const CAMPS: Record<string, CampDefinition> = {
  raider_outpost: {
    id: 'raider_outpost',
    name: 'Posto dos Saqueadores',
    tier: 1,
    radius: 7,
    structures: [
      structure('bonfire', 0, 0, 0, 0.9),
      structure('tent', -2.5, 1.8, 0.4),
      structure('tent', 2.6, 1.4, -0.3),
      structure('totem', 0, -3.2, 0, 0.9),
      ...palisadeRing(6, 5.6),
    ],
    spawns: [
      { speciesId: 'raider_scout', offset: { x: -1.6, z: -4.4 }, guard: true },
      { speciesId: 'raider_scout', offset: { x: 1.8, z: -4.2 }, guard: true },
      { speciesId: 'raider_warrior', offset: { x: 0.4, z: 2.6 }, guard: false },
    ],
    reward: {
      gold: 80,
      items: [
        { itemId: 'wood', quantity: 10 },
        { itemId: 'cooked_meat', quantity: 3 },
      ],
    },
    respawnMs: 240_000,
  },

  blackclaw_camp: {
    id: 'blackclaw_camp',
    name: 'Acampamento da Garra Negra',
    tier: 2,
    radius: 9,
    structures: [
      structure('bonfire', 0, 0),
      structure('tent', -3.4, 2.4, 0.5),
      structure('tent', 3.2, 2.8, -0.5),
      structure('tent', 0.2, 4.6, 0),
      structure('totem', -0.6, -4.2, 0, 1.1),
      structure('watchtower', 5.2, -3.6, -0.7),
      structure('cage', -5.4, -1.2, 0.3, 0.9),
      ...palisadeRing(8, 7.4),
    ],
    spawns: [
      { speciesId: 'raider_scout', offset: { x: -2.2, z: -6.2 }, guard: true },
      { speciesId: 'raider_scout', offset: { x: 2.4, z: -6.0 }, guard: true },
      { speciesId: 'raider_warrior', offset: { x: -3.6, z: 1.2 }, guard: false },
      { speciesId: 'raider_warrior', offset: { x: 3.8, z: 1.4 }, guard: false },
      { speciesId: 'raider_shaman', offset: { x: 0.2, z: 5.4 }, guard: false },
    ],
    reward: {
      gold: 190,
      items: [
        { itemId: 'iron_ore', quantity: 6 },
        { itemId: 'health_potion', quantity: 2 },
        { itemId: 'wolf_pelt', quantity: 2 },
      ],
    },
    respawnMs: 360_000,
  },

  crackedbone_warband: {
    id: 'crackedbone_warband',
    name: 'Bando do Osso Rachado',
    tier: 3,
    radius: 11,
    structures: [
      structure('bonfire', 0, 0, 0, 1.2),
      structure('tent', -4.2, 3.0, 0.5),
      structure('tent', 4.0, 3.2, -0.5),
      structure('tent', -1.0, 5.8, 0.1),
      structure('tent', 3.0, 6.0, -0.2),
      structure('totem', -0.8, -5.0, 0, 1.3),
      structure('watchtower', 6.8, -4.2, -0.8),
      structure('watchtower', -6.6, -4.4, 0.8),
      structure('cage', -7.0, 1.6, 0.4),
      ...palisadeRing(10, 9.4),
    ],
    spawns: [
      { speciesId: 'raider_scout', offset: { x: -2.8, z: -8.0 }, guard: true },
      { speciesId: 'raider_scout', offset: { x: 2.8, z: -8.2 }, guard: true },
      { speciesId: 'raider_warrior', offset: { x: -5.0, z: -1.0 }, guard: false },
      { speciesId: 'raider_warrior', offset: { x: 5.2, z: -0.8 }, guard: false },
      { speciesId: 'raider_warrior', offset: { x: 0.4, z: 3.0 }, guard: false },
      { speciesId: 'raider_brute', offset: { x: -1.2, z: -2.6 }, guard: false },
      { speciesId: 'raider_shaman', offset: { x: 1.6, z: 7.0 }, guard: false },
    ],
    reward: {
      gold: 420,
      items: [
        { itemId: 'arcane_essence', quantity: 6 },
        { itemId: 'iron_ore', quantity: 10 },
        { itemId: 'health_potion', quantity: 3 },
      ],
    },
    respawnMs: 480_000,
  },

  stonefist_stronghold: {
    id: 'stonefist_stronghold',
    name: 'Fortim do Punho de Pedra',
    tier: 4,
    radius: 12,
    structures: [
      structure('bonfire', 0, 0, 0, 1.4),
      structure('tent', -4.8, 3.4, 0.5),
      structure('tent', 4.6, 3.6, -0.5),
      structure('tent', -1.4, 6.4, 0.1),
      structure('tent', 3.4, 6.6, -0.2),
      structure('tent', 0.6, -3.4, 0.3),
      structure('totem', -1.0, -5.8, 0, 1.5),
      structure('totem', 2.2, -5.6, 0, 1.2),
      structure('watchtower', 7.6, -4.8, -0.9),
      structure('watchtower', -7.4, -5.0, 0.9),
      structure('watchtower', 0.2, 8.4, 0),
      structure('cage', -7.8, 2.0, 0.4, 1.1),
      ...palisadeRing(12, 10.4),
    ],
    spawns: [
      { speciesId: 'raider_warrior', offset: { x: -3.0, z: -9.0 }, guard: true },
      { speciesId: 'raider_warrior', offset: { x: 3.0, z: -9.2 }, guard: true },
      { speciesId: 'raider_warrior', offset: { x: -5.8, z: -1.4 }, guard: false },
      { speciesId: 'raider_warrior', offset: { x: 5.8, z: -1.2 }, guard: false },
      { speciesId: 'raider_warrior', offset: { x: 0.6, z: 4.0 }, guard: false },
      { speciesId: 'raider_brute', offset: { x: -2.4, z: -3.0 }, guard: false },
      { speciesId: 'raider_brute', offset: { x: 2.6, z: -2.8 }, guard: false },
      { speciesId: 'raider_shaman', offset: { x: -1.8, z: 7.8 }, guard: false },
      { speciesId: 'raider_shaman', offset: { x: 2.2, z: 8.0 }, guard: false },
    ],
    reward: {
      gold: 900,
      items: [
        { itemId: 'leather_armor', quantity: 1 },
        { itemId: 'arcane_essence', quantity: 12 },
        { itemId: 'iron_ore', quantity: 16 },
        { itemId: 'health_potion', quantity: 4 },
      ],
    },
    respawnMs: 600_000,
  },
};

export const CAMP_IDS = Object.keys(CAMPS);

/** Onde cada acampamento fica no mundo. O tier 1 é o mais perto do nascedouro. */
export const CAMP_PLACEMENTS: CampPlacement[] = [
  { id: 'raider_outpost', defId: 'raider_outpost', position: { x: 23, z: 7 } },
  { id: 'blackclaw_camp', defId: 'blackclaw_camp', position: { x: -45, z: 35 } },
  { id: 'crackedbone_warband', defId: 'crackedbone_warband', position: { x: 55, z: -50 } },
  { id: 'stonefist_stronghold', defId: 'stonefist_stronghold', position: { x: -60, z: -58 } },
];

// ---------------------------------------------------------------------------
// Validação das posições (regra em código, não no olhômetro)
// ---------------------------------------------------------------------------

function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function getCampDefinition(defId: string): CampDefinition | null {
  return CAMPS[defId] ?? null;
}

/** Lista de problemas das posições atuais. Vazia = tudo certo. */
export function findPlacementIssues(placements: CampPlacement[] = CAMP_PLACEMENTS): string[] {
  const issues: string[] = [];

  for (const placement of placements) {
    const def = CAMPS[placement.defId];
    if (!def) {
      issues.push(`${placement.id}: definição "${placement.defId}" não existe.`);
      continue;
    }

    const { position } = placement;
    if (
      Math.abs(position.x) + def.radius > WORLD_HALF
      || Math.abs(position.z) + def.radius > WORLD_HALF
    ) {
      issues.push(`${placement.id}: sai do mapa (raio ${def.radius}).`);
    }

    const fromSpawn = distance(position, PLAYER_SPAWN) - def.radius;
    if (fromSpawn < SPAWN_SAFE_RADIUS) {
      issues.push(`${placement.id}: perto demais do nascedouro (${fromSpawn.toFixed(1)}m livres).`);
    }

    const fromRuins = distance(position, RUINS_POSITION) - def.radius - RUINS_RADIUS;
    if (fromRuins < CAMP_MIN_GAP) {
      issues.push(`${placement.id}: sobrepõe as ruínas (${fromRuins.toFixed(1)}m livres).`);
    }

    for (const spawn of def.spawns) {
      if (distance(spawn.offset, { x: 0, z: 0 }) > def.radius) {
        issues.push(`${placement.id}: posto de ${spawn.speciesId} fora do raio do acampamento.`);
      }
    }
  }

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]!;
      const b = placements[j]!;
      const defA = CAMPS[a.defId];
      const defB = CAMPS[b.defId];
      if (!defA || !defB) continue;
      const gap = distance(a.position, b.position) - defA.radius - defB.radius;
      if (gap < CAMP_MIN_GAP) {
        issues.push(`${a.id} e ${b.id}: folga de apenas ${gap.toFixed(1)}m.`);
      }
    }
  }

  return issues;
}
