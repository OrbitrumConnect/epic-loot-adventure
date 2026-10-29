/**
 * QUAL MAPA o mundo 3D monta. 29/10 (Pedro): "a Zona Sul vai ser o mapa VERDADEIRO — esconde o Vale e entra direto na
 * Zona Sul". O Vale saiu do menu; o código dele fica só até as BASES virem pra Zona Sul (elas moram lá, salvas e
 * paradas). Porta de teste interna (não aparece pro jogador): endereço com ?mapa=vale.
 */
import { useSyncExternalStore } from 'react';
import { resetWorldProfile, WORLD } from '@/game/data/world-profile';
import { useGameStore } from '@/game/state/game-store';

export type WorldMapId = 'classic' | 'zona-sul';
const KEY = 'tribos.map';
const listeners = new Set<() => void>();

function read(): WorldMapId {
  try { return /[?&]mapa=vale(&|$)/.test(window.location.search) ? 'classic' : 'zona-sul'; } catch { return 'zona-sul'; }
}
let current: WorldMapId | null = null;

export function getWorldMap(): WorldMapId {
  if (current === null) current = typeof window === 'undefined' ? 'zona-sul' : read();
  return current;
}

export function setWorldMap(id: WorldMapId): void {
  current = id;
  // voltar pro Vale: o perfil e o mundo do Vale entram ANTES de ele desenhar (nada monta no chão da Zona Sul).
  // Ir pra Zona Sul: quem troca é o mundo dela, ao carregar o terreno (precisa dele).
  if (id === 'classic' && WORLD.id !== 'classic') { resetWorldProfile(); useGameStore.getState().enterWorld('classic'); }
  try { localStorage.setItem(KEY, id); } catch { /* sem storage: vale só nesta sessão */ }
  for (const l of listeners) l();
}

export function useWorldMap(): WorldMapId {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getWorldMap,
    () => 'zona-sul',
  );
}
