import { renderHook } from '@testing-library/react';
import type { ThreeEvent } from '@react-three/fiber';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { useEnemyClick } from '@/components/world/hostile-ai';

vi.mock('@react-three/fiber', () => ({ useFrame: () => {} }));
vi.mock('@/components/world/world-kit', () => ({
  MAP_HALF: 100, terrainHeight: () => 2, pixelsPerUnit: () => 10, markPointerConsumed: vi.fn(),
}));

/* Pedro, 22/10: no modo manual (câmera de cima, mouse/toque) clicar no inimigo só SELECIONAVA —
   precisava de um 2º clique. Agora seleciona e já ataca. Mouse travado (3ª pessoa) = clique da mira. */
const initial = useGameStore.getState();
const click = (shiftKey = false) => ({
  button: 0, shiftKey, stopPropagation: vi.fn(), nativeEvent: new MouseEvent('pointerdown'),
}) as unknown as ThreeEvent<PointerEvent>;

describe('clique no inimigo', () => {
  afterEach(() => {
    useGameStore.setState(initial, true);
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });

  it('seleciona E ataca no mesmo clique', () => {
    const attack = vi.fn();
    useGameStore.setState({ attack });
    const { result } = renderHook(() => useEnemyClick('lobo-1', 'Lobo'));
    result.current(click());
    expect(useGameStore.getState().targetId).toBe('lobo-1');
    expect(attack).toHaveBeenCalledWith('lobo-1');
  });

  it('mouse travado (3ª pessoa): não mexe — o clique é da mira central', () => {
    const attack = vi.fn();
    useGameStore.setState({ attack });
    Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
    const { result } = renderHook(() => useEnemyClick('lobo-1', 'Lobo'));
    const e = click();
    result.current(e);
    expect(attack).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('morto não ataca; Shift enfileira caçada sem atacar', () => {
    const attack = vi.fn();
    useGameStore.setState({ attack, player: { ...initial.player, dead: true } });
    const { result } = renderHook(() => useEnemyClick('lobo-1', 'Lobo'));
    result.current(click());
    expect(attack).not.toHaveBeenCalled();
    useGameStore.setState({ player: { ...initial.player, dead: false } });
    result.current(click(true));
    expect(attack).not.toHaveBeenCalled();
  });
});
