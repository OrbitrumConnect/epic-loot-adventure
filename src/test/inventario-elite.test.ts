import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { ITEMS } from '@/game/data/items';
import { addItem } from '@/game/systems/inventorySystem';
import { bagTabOf, sheetAttack, sheetStats } from '@/game/systems/characterSheetSystem';
import { playerBaseAttack } from '@/game/systems/progressionSystem';
import { damageMultiplier, mitigateDamage } from '@/game/systems/attributesSystem';
import { effectiveMaxHp, equipmentStats } from '@/game/systems/equipmentStatsSystem';

const clean = () => useGameStore.setState(s => ({
  player: { ...s.player, inventory: { ...s.player.inventory,
    equipment: { primary: null, secondary: null, armor: null, accessory: null, head: null, gloves: null, legs: null, boots: null, amulet: null, ring1: null, ring2: null },
    slots: s.player.inventory.slots.map(() => ({ itemId: null, quantity: 0 })) } },
}));
const count = (id: string) => useGameStore.getState().player.inventory.slots.filter(x => x.itemId === id).reduce((a, b) => a + b.quantity, 0);
const give = (id: string) => useGameStore.setState(s => ({ player: { ...s.player, inventory: addItem(s.player.inventory, id, 1) } }));

describe('equipar/tirar não duplica (bug 29/10: 1→2→3 a cada volta)', () => {
  beforeEach(clean);
  it('armadura: 3 voltas de equipar/tirar mantêm 1 peça', () => {
    give('chest_rare');
    for (let k = 0; k < 3; k++) {
      useGameStore.getState().equipItem('chest_rare');
      expect(useGameStore.getState().player.inventory.equipment.armor).toBe('chest_rare');
      useGameStore.getState().unequipSlot('armor');
      expect(useGameStore.getState().player.inventory.equipment.armor).toBeNull();
    }
    expect(count('chest_rare')).toBe(1);
  });
  it('trocar a peça equipada por outra não cria cópia da antiga', () => {
    give('head_common'); give('chest_rare');
    const headIds = Object.values(ITEMS).filter(i => i.equipSlot === 'head').map(i => i.id);
    const other = headIds.find(id => id !== 'head_common')!;
    give(other);
    useGameStore.getState().equipItem('head_common');
    useGameStore.getState().equipItem(other);
    expect(count('head_common')).toBe(1);
    expect(count(other)).toBe(1);
  });
  it('save antigo (equipado FORA da mochila): tirar devolve 1', () => {
    useGameStore.getState().equipItem('head_common'); // não está na mochila
    useGameStore.getState().unequipSlot('head');
    expect(count('head_common')).toBe(1);
  });
});

describe('ficha do personagem usa as contas do combate', () => {
  beforeEach(clean);
  it('ataque = base do nível + arma na mão + dano do equipamento, × atributo', () => {
    const p = useGameStore.getState().player;
    expect(sheetAttack(p, null)).toBe(Math.round((playerBaseAttack(p.level) + equipmentStats(p).damage) * damageMultiplier(p)));
    expect(sheetAttack(p, 'iron_sword')).toBe(Math.round((playerBaseAttack(p.level) + ITEMS['iron_sword']!.attackPower! + equipmentStats(p).damage) * damageMultiplier(p)));
  });
  it('vida, dano recebido e poder sobem/descem com a armadura', () => {
    const before = sheetStats(useGameStore.getState().player, null);
    give('chest_rare');
    useGameStore.getState().equipItem('chest_rare');
    const p = useGameStore.getState().player;
    const after = sheetStats(p, null);
    expect(after.maxHp).toBe(effectiveMaxHp(p));
    expect(after.takenOf100).toBe(mitigateDamage(100, p));
    expect(after.takenOf100).toBeLessThanOrEqual(before.takenOf100);
    expect(after.power).toBeGreaterThan(before.power);
  });
  it('abas da mochila separam equipamento, uso e material', () => {
    expect(bagTabOf('iron_sword')).toBe('gear');
    expect(bagTabOf('chest_rare')).toBe('gear');
    expect(bagTabOf('health_potion')).toBe('use');
    expect(bagTabOf('wood')).toBe('mat');
  });
});

describe('pôr item numa tecla da hotbar (bug 29/10: soltar na hotbar só SELECIONAVA)', () => {
  beforeEach(clean);
  it('coloca, tira da tecla antiga (sem duplicar), ignora espaço vazio, e arrastar usa isso', () => {
    give('surfboard');
    const inv = useGameStore.getState().player.inventory;
    const idx = inv.slots.findIndex(s => s.itemId === 'surfboard');
    useGameStore.getState().assignHotbar(2, idx);
    expect(useGameStore.getState().player.inventory.hotbar.slots[2]).toBe(idx);
    expect(useGameStore.getState().ui.message).toMatch(/tecla 3/);
    useGameStore.getState().assignHotbar(9, idx);
    const hb = useGameStore.getState().player.inventory.hotbar.slots;
    expect(hb[9]).toBe(idx);
    expect(hb.filter(v => v === idx)).toHaveLength(1);
    const empty = inv.slots.findIndex(s => s.itemId === null);
    useGameStore.getState().assignHotbar(4, empty);
    expect(useGameStore.getState().player.inventory.hotbar.slots[4]).not.toBe(empty);
    // tecla selecionada com a prancha: vai pra mão (nível ≥ 5)
    useGameStore.setState(s => ({ player: { ...s.player, level: 11 } }));
    useGameStore.getState().useHotbarSlot(9);
    expect(useGameStore.getState().ui.selectedHotbar).toBe(9);
    const idxSrc = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idxSrc).toContain('useGameStore.getState().assignHotbar(i, n)');
  });
});

describe('prancha = item FIXO (Pedro 29/10: "estou nível 13, era pra ter a prancha")', () => {
  beforeEach(clean);
  it('não dá pra descartar; a casa do jogo devolve sempre que faltar (sem janela de tempo); ficha esconde "Descartar"', () => {
    give('surfboard');
    const idx = useGameStore.getState().player.inventory.slots.findIndex(s => s.itemId === 'surfboard');
    useGameStore.getState().dropItem(idx);
    expect(useGameStore.getState().player.inventory.slots[idx]?.itemId).toBe('surfboard');
    expect(useGameStore.getState().ui.message).toMatch(/não dá pra descartar/);
    const idxSrc = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idxSrc).toContain("if (!s.player.inventory.slots.some(sl => sl.itemId === 'surfboard')) s.grantSurfboard();");
    expect(idxSrc).not.toMatch(/until = Date\.now\(\) \+ 45_000/);
    expect(fs.readFileSync('src/components/hud/character-sheet.tsx', 'utf8')).toContain("picked.id !== 'surfboard'");
  });
});
