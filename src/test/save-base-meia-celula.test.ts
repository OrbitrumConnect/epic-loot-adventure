import { describe, expect, it } from 'vitest';
import { createLocalSave, parseLocalSave, restoreLocalSave } from '@/game/systems/persistenceSystem';
import { useGameStore } from '@/game/state/game-store';

/* 23/10 (Pedro nv 38 → nv 1 na tela): o terreno da base tem 11 células e a reivindicação centrava
   com 11/2 = 5,5 → base em MEIA célula (-35.5). O save exigia célula inteira e recusava TUDO
   (nível, loot, base). A conta ficou protegida (nada subiu por cima). Agora aceita e carrega igual.
   Formato da base = o do save real (dados de teste, sem nada da conta). */
const baseMeiaCelula = {
  id: 'base_player_1', size: 11, owner: { id: 'player_1', kind: 'player', name: 'Teste' }, stage: 'clash',
  origin: { gx: -35.5, gz: 0.5 },
  pieces: [
    { hp: 500, id: 'base_player_1_core_-30.5_5.5', cell: { gx: -30.5, gz: 5.5 }, kind: 'core', tier: 1, maxHp: 500, rotation: 0 },
    { hp: 250, id: 'base_player_1_tower_-35.5_0.5', cell: { gx: -35.5, gz: 0.5 }, kind: 'tower', tier: 1, level: 1, maxHp: 250, rotation: 0 },
  ],
  baseType: 'fortress', enclosed: true, claimedAt: 1_792_726_308_459, lastDamagedAt: null, worldPosition: { x: -60, z: 12 },
};

describe('save com base em meia célula', () => {
  it('carrega inteiro (nível, base no MESMO lugar)', () => {
    const st = useGameStore.getState();
    const blob = createLocalSave(st) as unknown as { player: object };
    const save = { ...blob, player: { ...blob.player, level: 38 }, playerBase: baseMeiaCelula };
    const parsed = parseLocalSave(JSON.stringify(save));
    expect(parsed).not.toBeNull();
    expect(parsed!.player.level).toBe(38);
    const restored = restoreLocalSave(parsed!, st, Date.now());
    expect(restored.playerBase?.origin).toEqual({ gx: -35.5, gz: 0.5 });
    expect(restored.playerBase?.pieces).toHaveLength(2);
  });
});
