import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/game/state/game-store';

const reset = useGameStore.getState();
describe('runGmCommand (GM gate + comandos)', () => {
  beforeEach(() => { useGameStore.setState(reset, true); });

  it('não-GM: não executa, avisa', () => {
    useGameStore.setState(s => ({ player: { ...s.player, name: 'Kael' }, gmTeleport: null }));
    useGameStore.getState().runGmCommand('!start');
    expect(useGameStore.getState().gmTeleport).toBeNull();
    expect(useGameStore.getState().ui.message).toMatch(/só para personagens GM/i);
  });

  it('Joel é GM: !start seta gmTeleport', () => {
    useGameStore.setState(s => ({ player: { ...s.player, name: 'Joel' }, gmTeleport: null }));
    useGameStore.getState().runGmCommand('!start');
    expect(useGameStore.getState().gmTeleport).not.toBeNull();
  });

  it('!spawn Colosso dos Ancestrais cria a criatura perto', () => {
    useGameStore.setState(s => ({ player: { ...s.player, name: 'Joel' }, creatures: [] }));
    const before = useGameStore.getState().creatures.length;
    useGameStore.getState().runGmCommand('!spawn Colosso dos Ancestrais');
    const cs = useGameStore.getState().creatures;
    expect(cs.length).toBe(before + 1);
    expect(cs[cs.length - 1]!.speciesId).toBe('raider_warlord');
  });

  it('!item espada de ferro entra no inventário', () => {
    useGameStore.setState(s => ({ player: { ...s.player, name: 'Joel' } }));
    useGameStore.getState().runGmCommand('!item espada de ferro');
    const inv = useGameStore.getState().player.inventory;
    const has = inv.slots.some(sl => sl.itemId === 'iron_sword');
    expect(has).toBe(true);
  });
});
