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
  // Ranged — abaixo dos 25 m do auto-farm, então ainda exige aproximar um pouco.
  bow:    { type: 'bow',    ranged: true, range: 8,  cooldown: 0.9, projectile: 'arrow' },
  pistol: { type: 'pistol', ranged: true, range: 10, cooldown: 0.5, projectile: 'bullet' },
  rifle:  { type: 'rifle',  ranged: true, range: 12, cooldown: 0.8, projectile: 'bullet' },
};

/** Perfil da arma de um item (ou o melee padrão). */
export function weaponFor(itemId: string | null | undefined): WeaponProfile {
  return (itemId ? WEAPONS[itemId] : undefined) ?? DEFAULT_MELEE;
}
