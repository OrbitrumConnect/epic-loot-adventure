import { afterEach, describe, expect, it } from 'vitest';

import {
  addObjective, createQueue, decideIntent, tickObjectives,
} from '@/game/systems/objectiveSystem';
import { pickWeaponFor, type AutoWeapon } from '@/game/systems/weaponChoiceSystem';
import { useGameStore } from '@/game/state/game-store';
import type { AutoIntent, AutoSnapshot, ObjectiveQueueState, Position } from '@/game/types';

const ORIGIN: Position = { x: 0, z: 0 };
const NOW = 100_000;

// ---------------------------------------------------------------------------
// Fábricas de arma (números casam com weapons.ts/items.ts no nível 1).
// ---------------------------------------------------------------------------
function sword(): AutoWeapon {
  return { hotbarIndex: 0, itemId: 'iron_sword', type: 'melee', range: 4, cooldown: 0.8, attackPower: 25, hasAmmo: true };
}
function rifle(hasAmmo = true): AutoWeapon {
  return { hotbarIndex: 10, itemId: 'rifle', type: 'rifle', range: 12, cooldown: 0.8, attackPower: 30, hasAmmo };
}

function snap(partial: Partial<AutoSnapshot> = {}): AutoSnapshot {
  return {
    playerPosition: ORIGIN,
    playerHp: 100,
    playerMaxHp: 100,
    playerDead: false,
    healSlot: null,
    playerLevel: 5,
    creatures: [],
    camps: [],
    resources: [],
    objectives: createQueue(),
    homePosition: { x: 0, z: 1 },
    gatherCapacity: true,
    ...partial,
  };
}

/** Promove o primeiro objetivo da fila para ativo, como o tick faria. */
function activeHunt(): ObjectiveQueueState {
  const queue = addObjective(createQueue(), {
    kind: 'hunt_creature', targetId: 'c1', position: ORIGIN, label: 'caçar c1',
  }, 0);
  return tickObjectives(queue, {
    playerPosition: ORIGIN,
    creatures: [{ id: 'c1', behavior: 'idle', hp: 50 }],
    camps: [],
    resources: [],
  }, 0).queue;
}

afterEach(() => {
  // A store é singleton: devolve a preferência ao default pra não vazar entre testes.
  useGameStore.getState().setPilotWeaponStyle?.('auto');
});

// ---------------------------------------------------------------------------
// Item 1 — preferência de arma do jogador
// ---------------------------------------------------------------------------
describe('item 1 · preferência de arma do piloto', () => {
  it("'ranged' empunha a arma à distância mesmo colado no bicho", () => {
    const weapons = [sword(), rifle()];
    const pick = pickWeaponFor(2, weapons, 'ranged');
    expect(pick).not.toBeNull();
    expect(pick!.type).not.toBe('melee');
    expect(pick!.itemId).toBe('rifle');
  });

  it("'melee' empunha corpo a corpo mesmo de longe", () => {
    const weapons = [sword(), rifle()];
    const pick = pickWeaponFor(9, weapons, 'melee');
    expect(pick?.type).toBe('melee');
    expect(pick?.itemId).toBe('iron_sword');
  });

  it("'ranged' sem munição de bala cai no melee", () => {
    const weapons = [sword(), rifle(false)];
    const pick = pickWeaponFor(9, weapons, 'ranged');
    expect(pick?.itemId).toBe('iron_sword');
  });

  it('store tem setter e o snapshot carrega o estilo escolhido', () => {
    const store = useGameStore.getState();
    expect(typeof store.setPilotWeaponStyle).toBe('function');
    store.setPilotWeaponStyle('ranged');
    expect(useGameStore.getState().buildAutoSnapshot().pilotWeaponStyle).toBe('ranged');
  });
});

// ---------------------------------------------------------------------------
// Item 2 — combate tem prioridade sobre farm quando o jogador apanhou
// ---------------------------------------------------------------------------
describe('item 2 · sob ataque, revida antes de farmar', () => {
  it('tomou dano há pouco + hostil no raio de resposta → ataca, não farma', () => {
    const s = snap({
      playerLastDamagedAt: NOW - 1000,
      creatures: [{ id: 'ag', position: { x: 15, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1 }],
      resources: [{ id: 'n1', position: { x: 5, z: 0 }, depleted: false }],
    });
    const intent = decideIntent(s, NOW);
    // Vai atrás do agressor (15 m), não do recurso (5 m).
    expect(intent.kind).toBe('move');
    if (intent.kind === 'move') {
      expect(intent.to).toEqual({ x: 15, z: 0 });
      expect(intent.reason).toContain('Revid');
    }
  });

  it('dano velho (fora da janela) não sequestra o farm', () => {
    const s = snap({
      playerLastDamagedAt: NOW - 20_000,
      creatures: [{ id: 'ag', position: { x: 15, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1 }],
      resources: [{ id: 'n1', position: { x: 5, z: 0 }, depleted: false }],
    });
    const intent = decideIntent(s, NOW);
    expect(intent.kind).toBe('move');
    if (intent.kind === 'move') expect(intent.to).toEqual({ x: 5, z: 0 });
  });
});

// ---------------------------------------------------------------------------
// Item 3 — histerese: alvo oscilando na borda do alcance não faz flip-flop
// ---------------------------------------------------------------------------
describe('item 3 · banda morta de combate', () => {
  it('alvo oscilando em torno do alcance: intent não alterna attack/move', () => {
    const objectives = activeHunt();
    let previous: AutoIntent | undefined;
    const kinds: string[] = [];

    for (let i = 0; i < 12; i++) {
      // Oscila entre 3.0 e 3.4 m, em torno do ATTACK_RANGE (3.2) usado no fallback.
      const cx = i % 2 === 0 ? 3.0 : 3.4;
      const s = snap({
        objectives,
        creatures: [{ id: 'c1', position: { x: cx, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1 }],
        ...(previous ? { previousIntent: previous } : {}),
      });
      const intent = decideIntent(s, NOW + i * 250);
      kinds.push(intent.kind);
      previous = intent;
    }

    // Uma vez atacando, a banda morta segura o ataque — zero alternância.
    expect(kinds.every(k => k === 'attack')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Item 4 — nearestNode com raio: farm não arrasta o piloto pelo mapa
// ---------------------------------------------------------------------------
describe('item 4 · farm só dentro do raio, senão caça o que está perto', () => {
  it('recurso longe (>raio de farm) é ignorado; caça a presa perto', () => {
    const s = snap({
      creatures: [{ id: 'prey', position: { x: 20, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1 }],
      resources: [{ id: 'far', position: { x: 40, z: 0 }, depleted: false }],
    });
    const intent = decideIntent(s, NOW);
    expect(intent.kind).toBe('move');
    if (intent.kind === 'move') expect(intent.to).toEqual({ x: 20, z: 0 });
  });

  it('recurso perto (dentro do raio) ainda é farmado', () => {
    const s = snap({
      resources: [{ id: 'near', position: { x: 10, z: 0 }, depleted: false }],
    });
    const intent = decideIntent(s, NOW);
    expect(intent.kind).toBe('move');
    if (intent.kind === 'move') expect(intent.to).toEqual({ x: 10, z: 0 });
  });
});

// ---------------------------------------------------------------------------
// Item 5 — alcance coerente com a arma que o piloto vai usar
// ---------------------------------------------------------------------------
describe('item 5 · engage usa o alcance da arma eleita, não o máximo da hotbar', () => {
  it("'melee' a 9 m: aproxima (alcance 4), não 'ataca' de 9 m usando o rifle da hotbar", () => {
    const s = snap({
      pilotWeaponStyle: 'melee',
      attackRange: 12, // máximo da hotbar (rifle) — o valor que o código antigo usava
      weapons: [sword(), rifle()],
      creatures: [{ id: 'alvo', position: { x: 9, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1 }],
    });
    const intent = decideIntent(s, NOW);
    expect(intent.kind).toBe('move');
  });

  it("'ranged' a 9 m: ataca (o rifle cobre), coerente dos dois lados", () => {
    const s = snap({
      pilotWeaponStyle: 'ranged',
      attackRange: 12,
      weapons: [sword(), rifle()],
      creatures: [{ id: 'alvo', position: { x: 9, z: 0 }, behavior: 'idle', hp: 50, hostile: true, level: 1 }],
    });
    const intent = decideIntent(s, NOW);
    expect(intent.kind).toBe('attack');
  });
});
