import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { createInitialBase } from '@/game/systems/baseSystem';
import { attributeChoices, autoDistribute, upgradeSuggestions } from '@/game/systems/quickActions';
import { SKILL_CAP_PER_ATTR } from '@/game/systems/attributesSystem';
import { dismissCard, inCombat, pushCard, useCards } from '@/components/hud/card-queue';
import { powersUnlocked } from '@/components/hud/card-watchers';
import { CardHost } from '@/components/hud/card-host';

/* Pedro, 25/10: "card na tela, um toque". Nível = escolha 1 de 3 atributos (ele tinha 27 pontos parados), poder novo
   ensina a tecla, prédio pronto sem ir à cidade, lateral UPAR. Uma carta por vez; nunca no meio da luta. */
const initial = useGameStore.getState();
afterEach(() => { useGameStore.setState(initial, true); useCards.setState({ queue: [], shownAt: 0 }); });

describe('regras das cartas', () => {
  it('escolha 1 de 3: nunca oferece atributo no teto', () => {
    const attrs = { damage: SKILL_CAP_PER_ATTR, dexterity: 0, carry: 0, moveSpeed: 0 };
    for (let i = 0; i < 20; i++) {
      const c = attributeChoices(attrs);
      expect(c).toHaveLength(3);
      expect(c).not.toContain('damage');
    }
  });
  it('automático equilibra (sempre no mais baixo)', () => {
    const seq = autoDistribute({ damage: 2, dexterity: 0, carry: 0, moveSpeed: 1 }, 4);
    expect(seq.slice(0, 2).sort()).toEqual(['carry', 'dexterity']);
    expect(seq).toHaveLength(4);
  });
  it('UPAR: só com recurso e construtor livre; o mais barato primeiro', () => {
    const base = createInitialBase(Date.now());
    const rich = { ...base, resources: { wood: 99999, stone: 99999, food: 99999, essence: 99999 } };
    const sug = upgradeSuggestions(rich);
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0]!.to).toBe(sug[0]!.from + 1);
    const poor = { ...base, resources: { wood: 0, stone: 0, food: 0, essence: 0 } };
    expect(upgradeSuggestions(poor)).toEqual([]);
    const busy = { ...rich, builders: 0 };
    expect(upgradeSuggestions(busy)).toEqual([]);
  });
  it('fila: não duplica carta de nível; luta = golpe nos últimos 3,5 s', () => {
    pushCard({ kind: 'level', icon: '✦', title: 'x', sticky: true }, true);
    pushCard({ kind: 'level', icon: '✦', title: 'x', sticky: true }, true);
    expect(useCards.getState().queue).toHaveLength(1);
    dismissCard();
    expect(useCards.getState().queue).toHaveLength(0);
    expect(inCombat(10_000, 8_000, undefined)).toBe(true);
    expect(inCombat(10_000, 1_000, 1)).toBe(false);
  });
  it('poder novo: só os que passaram nesse nível (ensina a tecla)', () => {
    expect(powersUnlocked(9, 10).map((p) => p.key)).toEqual(['Z']);
    expect(powersUnlocked(10, 12)).toEqual([]);
  });
});

describe('carta de nível na tela', () => {
  it('fora de luta: mostra 3 opções; tocar gasta 1 ponto', () => {
    useGameStore.setState((s) => ({ player: { ...s.player, skillPoints: 2, lastDamagedAt: 0, lastAttackAt: 0 } }));
    act(() => pushCard({ kind: 'level', icon: '✦', title: 'Pontos', sticky: true }, true));
    render(<CardHost />);
    expect(screen.getByText('Escolha 1 de 3')).toBeTruthy();
    const opts = screen.getAllByRole('button').filter((b) => b.textContent?.startsWith('+1%'));
    expect(opts).toHaveLength(3);
    act(() => { fireEvent.click(opts[0]!); });
    expect(useGameStore.getState().player.skillPoints).toBe(1);
  });
  it('em luta: vira selinho (não atrapalha)', () => {
    useGameStore.setState((s) => ({ player: { ...s.player, skillPoints: 1, lastDamagedAt: Date.now() } }));
    act(() => pushCard({ kind: 'level', icon: '✦', title: 'Pontos', sticky: true }, true));
    render(<CardHost />);
    expect(screen.queryByText('Escolha 1 de 3')).toBeNull();
    expect(screen.getByTitle('Abrir carta')).toBeTruthy();
  });
});
