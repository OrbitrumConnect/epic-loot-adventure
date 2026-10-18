import { useGameStore } from './game-store';
import { createLocalSave, parseLocalSave, persistedStateChanged, restoreLocalSave, SAVE_KEY, type PersistState } from '../systems/persistenceSystem';

type PersistenceStore = {
  getState: () => PersistState;
  setState: (patch: Partial<PersistState>) => void;
  subscribe: (listener: (state: PersistState, previous: PersistState) => void) => () => void;
};
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Reidrata sincronicamente antes do chamador liberar o primeiro quadro. */
export function connectLocalPersistence(store: PersistenceStore, storage: SaveStorage, now: () => number = Date.now) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    const save = parseLocalSave(raw);
    if (save) {
      const restored = restoreLocalSave(save, store.getState(), now());
      const potionIdx = restored.player.inventory.slots.findIndex(s => s.itemId === 'health_potion');
      const hotbar = [...restored.player.inventory.hotbar.slots];
      // Recursos brutos ficam somente na mochila; nunca ocupam a hotbar.
      for (let i = 0; i < hotbar.length; i++) {
        const invIdx = hotbar[i];
        if (invIdx == null) continue;
        const item = restored.player.inventory.slots[invIdx]?.itemId;
        if (item === 'wood' || item === 'stone') hotbar[i] = null;
      }
      if (potionIdx >= 0) {
        hotbar[11] = potionIdx;
        store.setState({
          ...restored,
          player: { ...restored.player, inventory: { ...restored.player.inventory, hotbar: { ...restored.player.inventory.hotbar, slots: hotbar } } },
        });
      } else store.setState({ ...restored, player: { ...restored.player, inventory: { ...restored.player.inventory, hotbar: { ...restored.player.inventory.hotbar, slots: hotbar } } } });
    }
    else if (raw !== null) storage.removeItem(SAVE_KEY);
  } catch { /* Storage bloqueado/corrompido: mantém o protótipo local jogável. */ }

  let dirty = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let maxWait: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    clearTimeout(debounce);
    clearTimeout(maxWait);
    debounce = maxWait = undefined;
  };
  const flush = () => {
    clearTimers();
    if (!dirty) return;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(createLocalSave(store.getState())));
      dirty = false;
    } catch { /* Quota: mantém dirty para nova tentativa ao sair ou mudar estado. */ }
  };
  const unsubscribe = store.subscribe((state, previous) => {
    if (!persistedStateChanged(state, previous)) return;
    dirty = true;
    clearTimeout(debounce);
    debounce = setTimeout(flush, 2000);
    // Torres podem atirar continuamente; não adiar o save indefinidamente.
    maxWait ??= setTimeout(flush, 10000);
  });
  return { flush, stop: () => { unsubscribe(); flush(); } };
}

/** Chamado somente pelo effect de hidratação; nenhum acesso a window em SSR. */
export function startLocalPersistence(): () => void {
  if (typeof window === 'undefined') return () => {};
  let storage: Storage;
  try { storage = window.localStorage; } catch { return () => {}; }
  const persistence = connectLocalPersistence(useGameStore, storage);
  const onVisibility = () => { if (document.visibilityState === 'hidden') persistence.flush(); };
  window.addEventListener('pagehide', persistence.flush);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', persistence.flush);
    document.removeEventListener('visibilitychange', onVisibility);
    persistence.stop();
  };
}
