import { describe, expect, it } from 'vitest';
import { spawnWaveRaiders } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import { towerLevelStats } from '@/game/systems/towerLevelSystem';
import { hordeAmmoScale, scaleHordeAmmo } from '@/game/systems/waveSystem';

/* Pedro, 23/10: "meio a meio — a bala dura até a onda 18–20; depois o pack". Modelo só-torre (nv 20):
   tiros pra matar a horda inteira × bala que dropa em média. */
function balance(wave: number) {
  const tower = towerLevelStats(3 as never, 20);
  let shots = 0, ammo = 0;
  for (const r of spawnWaveRaiders(wave, { x: 0, z: 0 }, 1)) {
    shots += Math.ceil(r.maxHp / Math.max(1, tower.damage - (r.armor ?? 0)));
    for (const l of CREATURES[r.speciesId]?.lootTable ?? []) if (l.itemId === 'ammo') ammo += l.chance * l.quantity * hordeAmmoScale(r.id);
  }
  return ammo - shots;
}

describe('bala da horda: dura até ~onda 18–20', () => {
  it('sobra até a onda 17; falta a partir da 21 (aí entra o pack)', () => {
    for (const w of [1, 4, 8, 10, 15, 17]) expect(balance(w), `onda ${w}`).toBeGreaterThan(0);
    for (const w of [21, 25, 30]) expect(balance(w), `onda ${w}`).toBeLessThan(0);
  });

  it('só BALA e só bicho de HORDA', () => {
    const loot = [{ itemId: 'ammo', quantity: 50 }, { itemId: 'arrow', quantity: 50 }];
    expect(scaleHordeAmmo(loot, 'wave11_x_1')).toEqual([{ itemId: 'ammo', quantity: 68 }, { itemId: 'arrow', quantity: 50 }]);
    expect(scaleHordeAmmo(loot, 'wild_boar_3')).toBe(loot); // bicho do mapa: igual
    expect(hordeAmmoScale('wave3_ohost99_0_5')).toBeCloseTo(1.07, 5); // horda online (com dono)
  });
});
