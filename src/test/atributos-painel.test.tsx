import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttributesPanel } from '@/components/hud/attributes-panel';
import { useGameStore } from '@/game/state/game-store';

describe('AttributesPanel', () => {
  beforeEach(() => {
    useGameStore.setState(s => ({ player: { ...s.player, skillPoints: 3, attributes: { damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 } } }));
  });
  it('mostra os pontos acumulados e os 4 atributos', () => {
    render(<AttributesPanel onClose={() => {}} />);
    expect(screen.getByText('Dano')).toBeTruthy();
    expect(screen.getByText('Destreza')).toBeTruthy();
    expect(screen.getByText('Capacidade')).toBeTruthy();
    expect(screen.getByText('Velocidade')).toBeTruthy();
  });
  it('o + gasta um ponto e sobe o atributo', () => {
    render(<AttributesPanel onClose={() => {}} />);
    const before = useGameStore.getState().player.skillPoints ?? 0;
    fireEvent.click(screen.getByLabelText('Aumentar Dano'));
    const after = useGameStore.getState();
    expect(after.player.skillPoints ?? 0).toBe(before - 1);
    expect(after.player.attributes?.damage).toBe(1);
  });
});

describe('card de nível abre o painel (fiação no index)', () => {
  it('index.tsx liga player-profile ao painel attributes', () => {
    const src = readFileSync('src/routes/index.tsx', 'utf8');
    expect(src).toContain("setPanel('attributes')");
    expect(src).toContain('AttributesPanel');
    expect(src).toMatch(/panel === 'attributes' && <AttributesPanel/);
  });
});
