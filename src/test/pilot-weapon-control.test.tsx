import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { PilotWeaponControl } from '@/components/hud/pilot-weapon-control';

// Prova de fiação do seletor de estilo de arma do piloto: o controle escreve e
// reflete o store real (`pilotWeaponStyle`), sem estado local solto.
const initial = useGameStore.getState();

// O nome acessível vem do aria-label (a dica), então buscamos o botão pelo texto
// visível e subimos até o <button>.
function opt(label: string): HTMLButtonElement {
  const el = screen.getByText(label).closest('button');
  if (!el) throw new Error(`botão não encontrado para "${label}"`);
  return el as HTMLButtonElement;
}

describe('PilotWeaponControl', () => {
  beforeEach(() => {
    useGameStore.setState({ pilotWeaponStyle: 'auto' });
  });
  afterEach(() => {
    cleanup();
    useGameStore.setState(initial, true);
  });

  it('começa marcando a opção que está no store', () => {
    useGameStore.setState({ pilotWeaponStyle: 'melee' });
    render(<PilotWeaponControl />);
    expect(opt('Corpo a corpo').getAttribute('aria-pressed')).toBe('true');
    expect(opt('À distância').getAttribute('aria-pressed')).toBe('false');
  });

  it('clicar em "À distância" grava ranged no store e marca o botão', () => {
    render(<PilotWeaponControl />);
    expect(useGameStore.getState().pilotWeaponStyle).toBe('auto');

    fireEvent.click(opt('À distância'));

    expect(useGameStore.getState().pilotWeaponStyle).toBe('ranged');
    expect(opt('À distância').getAttribute('aria-pressed')).toBe('true');
    expect(opt('À distância').getAttribute('data-active')).toBe('true');
    expect(opt('Automático').getAttribute('aria-pressed')).toBe('false');
  });

  it('reflete mudança externa do store (não é estado local)', () => {
    render(<PilotWeaponControl />);
    act(() => { useGameStore.getState().setPilotWeaponStyle('ranged'); });
    expect(opt('À distância').getAttribute('aria-pressed')).toBe('true');
  });
});
