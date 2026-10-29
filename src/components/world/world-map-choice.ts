/**
 * QUAL MAPA o mundo 3D monta (29/10): 'classic' = Vale dos Ancestrais (o de sempre, padrão) · 'zona-sul' = Rio.
 * Mesmo personagem e save nos dois; a escolha fica NESTE aparelho. Store mínima (useSyncExternalStore), sem re-render
 * de ninguém além de quem lê.
 */
import { useSyncExternalStore } from 'react';

export type WorldMapId = 'classic' | 'zona-sul';
const KEY = 'tribos.map';
const listeners = new Set<() => void>();

function read(): WorldMapId {
  try { return localStorage.getItem(KEY) === 'zona-sul' ? 'zona-sul' : 'classic'; } catch { return 'classic'; }
}
let current: WorldMapId | null = null;

export function getWorldMap(): WorldMapId {
  if (current === null) current = typeof window === 'undefined' ? 'classic' : read();
  return current;
}

export function setWorldMap(id: WorldMapId): void {
  current = id;
  try { localStorage.setItem(KEY, id); } catch { /* sem storage: vale só nesta sessão */ }
  for (const l of listeners) l();
}

export function useWorldMap(): WorldMapId {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getWorldMap,
    () => 'classic',
  );
}
