import { describe, expect, it } from 'vitest';

import {
  MELEE_PREF_RANGE, maxAttackRange, pickWeaponFor, type AutoWeapon,
} from '@/game/systems/weaponChoiceSystem';
import { weaponFor } from '@/game/data/weapons';
import { decideIntent } from '@/game/systems/objectiveSystem';
import { useGameStore } from '@/game/state/game-store';
import type { AutoSnapshot, Position } from '@/game/types';

const ORIGIN: Position = { x: 0, z: 0 };

// Hotbar de teste: espada na mão + arco/pistola/rifle. Números casam com
// `data/weapons.ts` (range base) e `data/items.ts` (attackPower) no nível 1.
function sword(): AutoWeapon {
  return { hotbarIndex: 0, itemId: 'iron_sword', type: 'melee', range: 4, cooldown: 0.8, attackPower: 25, hasAmmo: true };
}
function axe(): AutoWeapon {
  return { hotbarIndex: 1, itemId: 'axe', type: 'melee', range: 4, cooldown: 0.8, attackPower: 15, hasAmmo: true };
}
function bow(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 8, itemId: 'bow', type: 'bow', range: 8, cooldown: 0.9, attackPower: 22, hasAmmo };
}
function pistol(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 9, itemId: 'pistol', type: 'pistol', range: 10, cooldown: 0.5, attackPower: 18, hasAmmo };
}
function rifle(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 10, itemId: 'rifle', type: 'rifle', range: 12, cooldown: 0.8, attackPower: 30, hasAmmo };
}

describe('weaponChoiceSystem — pura', () => {
  it('alvo a 9 m, espada na mão: maxAttackRange cobre e pickWeaponFor escolhe ranged', () => {
    const weapons = [sword(), bow(), pistol(), rifle()];
    expect(maxAttackRange(weapons, 4)).toBeGreaterThanOrEqual(9);
    const pick = pickWeaponFor(9, weapons);
    expect(pick).not.toBeNull();
    expect(pick!.type).not.toBe('melee');
  });

  it('alvo a 2 m: devolve a espada (maior attackPower entre os melee)', () => {
    const weapons = [sword(), axe(), bow(), pistol(), rifle()];
    const pick = pickWeaponFor(2, weapons);
    expect(pick?.itemId).toBe('iron_sword');
  });

  it('sem munição de bala, alvo a 7 m: devolve o arco', () => {
    const weapons = [sword(), bow(true), pistol(false), rifle(false)];
    const pick = pickWeaponFor(7, weapons);
    expect(pick?.itemId).toBe('bow');
  });

  it('sem nenhuma munição ranged, alvo a 9 m: devolve melee (pra aproximar)', () => {
    const weapons = [sword(), axe(), bow(false), pistol(false), rifle(false)];
    const pick = pickWeaponFor(9, weapons);
    expect(pick?.type).toBe('melee');
    expect(pick?.itemId).toBe('iron_sword');
  });

  it('hotbar só com poções (lista usável vazia): null', () => {
    expect(pickWeaponFor(9, [])).toBeNull();
    const noAmmo: AutoWeapon[] = [bow(false), pistol(false), rifle(false)];
    // Todas ranged sem munição e nenhum melee → nada usável.
    expect(pickWeaponFor(2, noAmmo.map(w => ({ ...w, hasAmmo: false })))).toBeNull();
  });

  it('MELEE_PREF_RANGE é 3.0', () => {
    expect(MELEE_PREF_RANGE).toBe(3.0);
  });

  it('empate de DPS entre ranged: desempata por maior range', () => {
    // pistola (18/0.5 = 36 DPS, range 10) vs rifle ajustado pra também dar 36 DPS.
    const p = pistol();
    const r: AutoWeapon = { ...rifle(), attackPower: 18, cooldown: 0.5 }; // 36 DPS, range 12
    const pick = pickWeaponFor(9, [p, r]);
    expect(pick?.itemId).toBe('rifle');
  });
});

describe('hunter_bow — arco, não espada', () => {
  it('weaponFor(hunter_bow) é ranged com projétil arrow', () => {
    const w = weaponFor('hunter_bow');
    expect(w.ranged).toBe(true);
    expect(w.projectile).toBe('arrow');
  });

  it('a 7 m com hunter_bow na hotbar, pickWeaponFor devolve o hunter_bow, não um melee', () => {
    const w = weaponFor('hunter_bow');
    const hb: AutoWeapon = {
      hotbarIndex: 7, itemId: 'hunter_bow', type: w.type, range: w.range,
      cooldown: w.cooldown, attackPower: 32, hasAmmo: true,
    };
    const pick = pickWeaponFor(7, [sword(), hb]);
    expect(pick?.itemId).toBe('hunter_bow');
    expect(pick?.type).not.toBe('melee');
  });
});

describe('integração: snapshot do store + decideIntent', () => {
  it('estado inicial (espada na mão, arco/pistola/rifle + 60 balas) ataca alvo a 9 m', () => {
    const snap = useGameStore.getState().buildAutoSnapshot();

    // O alcance efetivo passa a ser o da melhor arma (rifle=12), não o da espada (4).
    expect(snap.attackRange!).toBeGreaterThan(4);

    // Alvo hostil a ~9 m: com alcance efetivo > 9, o intent tem que ser 'attack'.
    const target: AutoSnapshot['creatures'][number] = {
      id: 'c1', position: { x: 9, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1,
    };
    const probe: AutoSnapshot = {
      ...snap,
      playerPosition: ORIGIN,
      playerLevel: 1,
      creatures: [target],
      resources: [],
      baseUnderSiege: false,
    };

    const intent = decideIntent(probe, 1000);
    expect(intent.kind).toBe('attack');
  });

  it('só empunháveis viram arma do piloto: sem torch/ancestral_strike/armadura, melee é a espada, ranged cobre 9 m', () => {
    const snap = useGameStore.getState().buildAutoSnapshot();
    const ids = snap.weapons!.map(w => w.itemId);

    // Não empunháveis não entram: tocha (utility) e golpe ancestral (skill).
    expect(ids).not.toContain('torch');
    expect(ids).not.toContain('ancestral_strike');
    // Nenhuma armadura (equippable, mas sem attackPower/ranged).
    expect(ids).not.toContain('leather_armor');
    expect(ids).not.toContain('bone_armor');
    expect(ids).not.toContain('guardian_plate');

    // Corpo a corpo a 2 m elege a espada, não o golpe ancestral (attackPower 40).
    const close = pickWeaponFor(2, snap.weapons!);
    expect(close?.itemId).toBe('iron_sword');

    // A 9 m segue elegendo uma ranged (conserto anterior preservado).
    const far = pickWeaponFor(9, snap.weapons!);
    expect(far).not.toBeNull();
    expect(far!.type).not.toBe('melee');
  });
});
