import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { costText, VEHICLE_COST } from '@/game/data/vehicle-costs';
import { RECIPES } from '@/game/data/recipes';
import { CAR, carGone, damageCar } from '@/components/zona-sul/zs-car';
import { WARSHIP } from '@/components/zona-sul/zs-warship';
import { useGameStore } from '@/game/state/game-store';
import { addItem, getItemCount } from '@/game/systems/inventorySystem';
import { vehicleShield } from '@/game/systems/vehicleShield';

/* Pedro 01/11: "custa recurso prancha, skate, asa, carro e navio — sai da bolsa normal igual à base"; "skate, asa e
   prancha ficam no loot; o carro igual ao navio: buildo, fica no mundo com vida, explodiu builda outro"; "tem nível pra
   liberar, lembra (navio no 45)"; "recurso pode ser 2× mais, progredindo — os de nível mais alto 3×". */
describe('veículos custam recurso (com nível)', () => {
  it('tabela: 2× nos de nível baixo → 3× nos altos (fonte única)', () => {
    expect(costText(VEHICLE_COST.surfboard)).toBe('40 madeira + 4 tendão');
    expect(costText(VEHICLE_COST.hang_glider)).toBe('60 madeira + 8 pele de lobo + 8 tendão');
    expect(costText(VEHICLE_COST.hover_skate)).toBe('50 ferro + 25 pedra');
    expect(costText(VEHICLE_COST.flying_car)).toBe('180 ferro + 120 madeira + 90 pedra');
    expect(costText(VEHICLE_COST.war_ship)).toBe('600 madeira + 240 ferro + 120 pedra');
    expect(WARSHIP.BUILD_COST).toBe(VEHICLE_COST.war_ship);
    for (const id of ['surfboard', 'hang_glider', 'hover_skate'] as const) {
      expect(RECIPES[id]!.materials).toEqual(VEHICLE_COST[id].map((c) => ({ itemId: c.id, quantity: c.n })));
    }
  });

  describe('fabricar o kit (prancha, asa, skate)', () => {
    beforeEach(() => {
      const st = useGameStore.getState();
      const inv = { ...st.player.inventory, slots: st.player.inventory.slots.map(() => ({ itemId: null, quantity: 0 })) };
      useGameStore.setState({ player: { ...st.player, level: 1, inventory: inv } });
    });
    const give = (id: string, n: number) => useGameStore.setState((s) => ({ player: { ...s.player, inventory: addItem(s.player.inventory, id, n) } }));
    it('antes do nível a receita TRAVA e não gasta nada', () => {
      give('iron_ore', 50); give('stone', 25);
      useGameStore.setState((s) => ({ player: { ...s.player, level: 14 } }));
      useGameStore.getState().craftItem('hover_skate');
      expect(useGameStore.getState().ui.panelMessage).toMatch(/libera no nível 15/);
      expect(getItemCount(useGameStore.getState().player.inventory, 'iron_ore')).toBe(50);
      expect(getItemCount(useGameStore.getState().player.inventory, 'hover_skate')).toBe(0);
    });
    it('no nível e com recurso: gasta exatamente o custo e entra 1 (na hotbar); de novo = "você já tem"', () => {
      give('wood', 45); give('sinew', 4);
      useGameStore.setState((s) => ({ player: { ...s.player, level: 5 } }));
      useGameStore.getState().craftItem('surfboard');
      let inv = useGameStore.getState().player.inventory;
      expect(getItemCount(inv, 'surfboard')).toBe(1);
      expect(getItemCount(inv, 'wood')).toBe(5);
      expect(getItemCount(inv, 'sinew')).toBe(0);
      const idx = inv.slots.findIndex((s) => s.itemId === 'surfboard');
      expect(inv.hotbar.slots).toContain(idx);
      useGameStore.getState().craftItem('surfboard');
      inv = useGameStore.getState().player.inventory;
      expect(getItemCount(inv, 'surfboard')).toBe(1);
      expect(useGameStore.getState().ui.panelMessage).toMatch(/já tem/);
    });
    it('faltou recurso: avisa quanto falta e não gasta', () => {
      give('wood', 10);
      useGameStore.setState((s) => ({ player: { ...s.player, level: 50 } }));
      useGameStore.getState().craftItem('hang_glider');
      expect(useGameStore.getState().ui.panelMessage).toMatch(/Falta: 50 /);
      expect(getItemCount(useGameStore.getState().player.inventory, 'wood')).toBe(10);
    });
  });

  it('carro: 600 de vida, explode, some e constrói outro na garagem com recurso (nível do carro)', () => {
    const c = { hp: CAR.HP, wreckT: null as number | null } as Parameters<typeof damageCar>[0];
    expect(CAR.HP).toBe(600);
    expect(damageCar(c, 250)).toBe(false); expect(c.hp).toBe(350);
    expect(damageCar(c, 999)).toBe(true); expect(c.wreckT).toBe(0);
    expect(carGone(c)).toBe(false); c.wreckT = CAR.WRECK_S; expect(carGone(c)).toBe(true);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/const r = useGameStore\.getState\(\)\.spendItems\(VEHICLE_COST\.flying_car\);/);
    expect(zs).toMatch(/if \(!isUnlocked\('flying_car', lvl\)\) useGameStore\.getState\(\)\.setMessage\(lockedMessage\('O carro voador', 'flying_car'\)\);/);
  });

  it('dirigindo, o CARRO toma o dano no lugar do herói (bicho local e o que chega pela rede)', () => {
    const st = useGameStore.getState();
    useGameStore.setState({ player: { ...st.player, hp: 100, maxHp: 100, dead: false } });
    let took = 0;
    vehicleShield.absorb = (d) => { took += d; return true; };
    useGameStore.getState().takePlayerDamage(40, 'Caio', true);
    vehicleShield.absorb = null;
    expect(took).toBe(40);
    expect(useGameStore.getState().player.hp).toBe(100); // o herói não perdeu vida
    useGameStore.getState().takePlayerDamage(40, 'Caio', true);
    expect(useGameStore.getState().player.hp).toBe(60);   // a pé: como sempre
    expect(fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8')).toMatch(/const shielded = !dodged && !useGameStore\.getState\(\)\.player\.dead && !!vehicleShield\.absorb\?\.\(dmg, creature\.name\);/);
  });
});
