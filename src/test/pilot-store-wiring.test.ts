/**
 * Elo ponta a ponta STORE REAL -> buildAutoSnapshot -> decideIntent.
 *
 * A auditoria apontou o padrão exato do bug original do projeto: um valor é
 * gravado no store e NUNCA chega até a decisão (ou chega e não muda nada) —
 * então o conserto parece pronto e no jogo não funciona. Os dois testes
 * abaixo usam a store de verdade (não um snapshot montado à mão) e provam,
 * com discriminação reversível (snapshot sem o campo), que cada elo tem
 * valor real sobre `decideIntent`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createQueue, decideIntent } from '@/game/systems/objectiveSystem';
import { useGameStore } from '@/game/state/game-store';
import { INITIAL_WAVE } from '@/game/systems/waveSystem';
import type { CreatureState } from '@/game/types';
import type { ResourceNode } from '@/game/types/world';

// Snapshot do player inicial (antes de qualquer teste tocar a store), pra
// devolver a store ao estado limpo entre os testes (ela é singleton).
const INITIAL_PLAYER = structuredClone(useGameStore.getState().player);

function resetWorld() {
  useGameStore.setState({
    // Posição fixa na origem: os testes abaixo colocam criaturas/recursos a
    // distâncias calculadas a partir daqui (o default do jogo é {x:7,z:-25}).
    player: { ...structuredClone(INITIAL_PLAYER), position: { x: 0, z: 0 } },
    creatures: [],
    resources: [],
    harvestNodes: [],
    camps: [],
    objectives: createQueue(),
    wave: INITIAL_WAVE,
    pilotLastIntent: null,
    autoPotion: true,
  });
}

beforeEach(resetWorld);
afterEach(resetWorld);

function pigeon(id: string, position: { x: number; z: number }): CreatureState {
  return {
    id,
    speciesId: 'pigeon', // hostil e nível 1 (ver CREATURES/creatureLevel) — não é "forte demais".
    name: 'Pombo Bravo',
    hp: 10,
    maxHp: 10,
    attackPower: 2,
    armor: 0,
    attackCooldown: 1.5,
    lastAttackAt: 0,
    position,
    behavior: 'patrol',
    lootTable: [],
    respawnAt: null,
  };
}

function node(id: string, position: { x: number; z: number }): ResourceNode {
  return {
    id,
    resourceId: 'wood',
    position,
    quantity: 10,
    maxQuantity: 10,
    respawnAt: null,
    depleted: false,
  };
}

// ---------------------------------------------------------------------------
// Item 1 — reportDamage(onPlayer) -> player.lastDamagedAt -> playerLastDamagedAt
// ---------------------------------------------------------------------------
describe('elo: reportDamage(onPlayer) chega em playerLastDamagedAt e muda a decisão', () => {
  it('store real: reportDamage grava lastDamagedAt, o snapshot carrega, e decideIntent revida em vez de farmar', () => {
    const aggressor = pigeon('aggressor', { x: 15, z: 0 }); // dentro de AGGRO_RESPONSE_RADIUS (20), fora de SELF_DEFENSE_RADIUS (10)
    const farmNode = node('node1', { x: 5, z: 0 }); // mais perto que o agressor, dentro do raio de farm

    useGameStore.setState({ creatures: [aggressor], resources: [farmNode] });

    // Caminho real: exatamente como `hostile-ai.ts:382` chama via `reportDamageToStore`.
    useGameStore.getState().reportDamage('player', 10, { x: 0, z: 0 }, true);

    const snapshot = useGameStore.getState().buildAutoSnapshot();
    expect(typeof snapshot.playerLastDamagedAt).toBe('number');

    const now = Date.now();
    const intent = decideIntent(snapshot, now);
    // Revida o AGRESSOR (15 m) em vez de farmar o recurso (5 m, mais perto). Como a arma de
    // longe já alcança 15 m, o piloto ATACA o agressor à distância; com alcance curto ele
    // andaria até lá ('move' + 'Revid'). Em ambos os casos o alvo é o agressor, não o recurso.
    expect(intent.kind === 'attack' || intent.kind === 'move').toBe(true);
    if (intent.kind === 'attack') {
      expect(intent.to).toEqual({ x: 15, z: 0 });
      expect(intent.creatureId).toBe('aggressor');
    } else if (intent.kind === 'move') {
      expect(intent.to).toEqual({ x: 15, z: 0 });
      expect(intent.reason).toContain('Revid');
    }

    // --- Discriminação: corta o elo de forma reversível (sem tocar o produto) ---
    // Monta o MESMO snapshot sem `playerLastDamagedAt` e prova que a decisão
    // vira farm (pega o recurso mais perto em vez de revidar).
    const { playerLastDamagedAt: _omitted, ...cutSnapshot } = snapshot;
    const cutIntent = decideIntent(cutSnapshot, now);
    expect(cutIntent.kind).toBe('move');
    if (cutIntent.kind === 'move') {
      expect(cutIntent.to).toEqual({ x: 5, z: 0 });
      expect(cutIntent.reason).toContain('Farm');
    }
  });

  it('dano fora da janela de resposta não chega a sequestrar o farm (controle negativo)', () => {
    const aggressor = pigeon('aggressor', { x: 15, z: 0 });
    const farmNode = node('node1', { x: 5, z: 0 });
    useGameStore.setState({ creatures: [aggressor], resources: [farmNode] });

    useGameStore.getState().reportDamage('player', 10, { x: 0, z: 0 }, true);
    const snapshot = useGameStore.getState().buildAutoSnapshot();

    // `now` bem depois da janela (RECENT_DAMAGE_WINDOW_MS = 6000ms do game-store).
    const now = (snapshot.playerLastDamagedAt ?? 0) + 20_000;
    const intent = decideIntent(snapshot, now);
    expect(intent.kind).toBe('move');
    if (intent.kind === 'move') expect(intent.to).toEqual({ x: 5, z: 0 });
  });
});

// ---------------------------------------------------------------------------
// Item 2 — recordPilotIntent -> pilotLastIntent -> previousIntent (alvo pegajoso)
// ---------------------------------------------------------------------------
describe('elo: recordPilotIntent chega em previousIntent e dá histerese à decisão', () => {
  it('store real: recordPilotIntent grava pilotLastIntent, o snapshot carrega, e decideIntent mantém o alvo anterior (alvo pegajoso)', () => {
    // A (10 m) é o alvo do tique anterior; B (8 m) é mais perto, mas não o
    // suficiente (TARGET_SWITCH_IMPROVEMENT = 0.75 → precisaria ser <= 7.5 m)
    // para roubar o alvo pegajoso.
    const creatureA = pigeon('creatureA', { x: 0, z: 10 });
    const creatureB = pigeon('creatureB', { x: 0, z: 8 });
    useGameStore.setState({ creatures: [creatureA, creatureB] });

    // Caminho real: a action que o executor (`auto-pilot.tsx`) chama a cada tick.
    useGameStore.getState().recordPilotIntent({ kind: 'attack', creatureId: 'creatureA', to: { x: 0, z: 10 } });

    const snapshot = useGameStore.getState().buildAutoSnapshot();
    expect(snapshot.previousIntent).toEqual({ kind: 'attack', creatureId: 'creatureA', to: { x: 0, z: 10 } });

    const intent = decideIntent(snapshot, Date.now());
    expect(intent.kind).toBe('attack');
    if (intent.kind === 'attack') expect(intent.creatureId).toBe('creatureA');

    // --- Discriminação: corta o elo de forma reversível (sem tocar o produto) ---
    // Sem `previousIntent`, nada prende o piloto no alvo antigo: ele troca
    // para o candidato mais perto (B).
    const { previousIntent: _omitted, ...cutSnapshot } = snapshot;
    const cutIntent = decideIntent(cutSnapshot, Date.now());
    expect(cutIntent.kind).toBe('attack');
    if (cutIntent.kind === 'attack') expect(cutIntent.creatureId).toBe('creatureB');
  });

  it('recordPilotIntent(null) limpa pilotLastIntent e o snapshot não carrega previousIntent', () => {
    useGameStore.getState().recordPilotIntent({ kind: 'idle', reason: 'teste' });
    expect(useGameStore.getState().buildAutoSnapshot().previousIntent).toEqual({ kind: 'idle', reason: 'teste' });

    useGameStore.getState().recordPilotIntent(null);
    expect(useGameStore.getState().pilotLastIntent).toBeNull();
    expect(useGameStore.getState().buildAutoSnapshot().previousIntent).toBeUndefined();
  });
});
