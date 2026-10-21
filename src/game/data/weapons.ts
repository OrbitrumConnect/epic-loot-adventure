/**
 * Weapon System (data-driven). Cada arma é um DADO — tipo, alcance, cadência e
 * projétil. O dano continua vindo de `attackPower` do item (balanço antigo
 * intacto). Melee sem entrada aqui usa o perfil padrão (alcance 4 m). Ranged
 * acerta de longe (não cola no bicho) e dispara um projétil visual.
 *
 * Ver `docs/tribos/tribos-weapon-combat-system.md`.
 */
export type WeaponType = 'melee' | 'bow' | 'pistol' | 'rifle';

export type WeaponProfile = {
  type: WeaponType;
  ranged: boolean;
  /** Alcance de ataque em metros. */
  range: number;
  /** Segundos entre golpes/tiros. */
  cooldown: number;
  /** Projétil visual do tiro (ranged). */
  projectile?: 'arrow' | 'bullet';
};

export const DEFAULT_MELEE: WeaponProfile = { type: 'melee', ranged: false, range: 4, cooldown: 0.8 };

export const WEAPONS: Record<string, WeaponProfile> = {
  // Alcances BASE (nível 1) que Pedro definiu: arco 12 m, pistola 15 m, rifle 20 m.
  bow:    { type: 'bow',    ranged: true, range: 12, cooldown: 0.9, projectile: 'arrow' },
  pistol: { type: 'pistol', ranged: true, range: 15, cooldown: 0.5, projectile: 'bullet' },
  rifle:  { type: 'rifle',  ranged: true, range: 20, cooldown: 0.8, projectile: 'bullet' },
  // Arco de drop: um pouco melhor que o `bow` básico (base 13 m, cadência 0,85 s).
  hunter_bow: { type: 'bow', ranged: true, range: 13, cooldown: 0.85, projectile: 'arrow' },
};

/** Ganho de alcance por nível das armas de longe (Pedro: "pelo menos 0,23 m por nível"). */
export const RANGE_PER_LEVEL = 0.23;
/** Teto de alcance (Pedro: "250 níveis → uns 50 m"). */
export const MAX_WEAPON_RANGE = 50;

/**
 * Alcance efetivo. RANGED cresce LINEAR: +0,23 m por nível a partir da base, até o teto 50 m
 * (arco base 12 chega a 50 por volta do nível 166; rifle base 20, por volta do 131). MELEE é
 * CORPO A CORPO: NÃO escala (fica em ~4 m) — o que cresce no melee é o AoE/cleave (mais bichos
 * no raio do corpo), não a distância. Pedro: "a espada não dá dano a 8 m".
 */
export function weaponRangeFor(itemId: string | null | undefined, level = 1): number {
  const prof = weaponFor(itemId);
  if (!prof.ranged) return prof.range;
  const lvl = Math.max(1, Math.floor(level));
  const scaled = prof.range + RANGE_PER_LEVEL * (lvl - 1);
  return Math.round(Math.min(MAX_WEAPON_RANGE, scaled) * 10) / 10;
}

/** Perfil da arma de um item (ou o melee padrão). */
export function weaponFor(itemId: string | null | undefined): WeaponProfile {
  return (itemId ? WEAPONS[itemId] : undefined) ?? DEFAULT_MELEE;
}
