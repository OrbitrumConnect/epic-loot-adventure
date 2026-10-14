/**
 * Cartas de EVOLUÇÃO DA BASE (Fase 5+, draft entre ondas).
 *
 * Cada onda repelida mostra 3 cartas; o jogador escolhe UMA e a base evolui
 * (torre mais dano, muro mais forte, reparo, núcleo blindado). É do lado da
 * BASE — o personagem já sobe de nível sozinho (pedido do Pedro). Dados puros:
 * o store aplica o efeito, o HUD desenha as cartas.
 */
export type UpgradeId = 'tower_damage' | 'wall_hp' | 'base_repair' | 'core_hp' | 'orbit_boomerang';

export type UpgradeCard = {
  id: UpgradeId;
  name: string;
  description: string;
  /** Nome do ícone lucide-react (o HUD resolve). */
  icon: string;
};

export const UPGRADE_CARDS: Record<UpgradeId, UpgradeCard> = {
  tower_damage: { id: 'tower_damage', name: 'Torres Afiadas', description: '+25% de dano de todas as torres', icon: 'Crosshair' },
  wall_hp: { id: 'wall_hp', name: 'Muralha Reforçada', description: '+25% de vida das estruturas + reparo total', icon: 'BrickWall' },
  base_repair: { id: 'base_repair', name: 'Reparo de Campo', description: 'Repara 100% da base agora', icon: 'Wrench' },
  core_hp: { id: 'core_hp', name: 'Núcleo Blindado', description: '+60% de vida do núcleo', icon: 'ShieldPlus' },
  orbit_boomerang: { id: 'orbit_boomerang', name: 'Bumerangues Orbitais', description: 'Lâminas giram fora do muro e empurram a horda · dura 5 ondas (renove: +1 lâmina, +2 ondas)', icon: 'Disc' },
};

const POOL: UpgradeId[] = ['tower_damage', 'wall_hp', 'base_repair', 'core_hp', 'orbit_boomerang'];

/** Sorteia 3 cartas DISTINTAS do baralho (determinístico com `rng`). */
export function rollUpgradeChoices(rng: () => number): UpgradeId[] {
  const bag = [...POOL];
  const out: UpgradeId[] = [];
  const n = Math.min(3, bag.length);
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * bag.length);
    out.push(bag.splice(j, 1)[0]!);
  }
  return out;
}

/** +25% de dano das torres por stack de `tower_damage`. */
export function towerDamageMult(stacks: number): number {
  return 1 + 0.25 * Math.max(0, stacks);
}
/** +25% de HP máx das estruturas, aplicado sobre o HP atual a cada escolha. */
export function wallHpMult(): number {
  return 1.25;
}
/** +60% de HP máx do núcleo por escolha de `core_hp`. */
export function coreHpMult(): number {
  return 1.6;
}
