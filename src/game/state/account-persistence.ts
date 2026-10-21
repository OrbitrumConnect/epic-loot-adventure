/**
 * Persistência do progresso NA CONTA (Supabase), por cima do save local. Reusa a MESMA
 * serialização do save local (`createLocalSave`/`restoreLocalSave`), só que o blob vai pra
 * tabela `player_saves` (uma linha por usuário, RLS: cada um lê/escreve só a sua).
 *
 * Fluxo ao logar:
 *  - Se a conta JÁ tem save → ele é a fonte da verdade (carrega e aplica; segue entre
 *    dispositivos).
 *  - Se NÃO tem (primeira vez) → sobe o estado atual (o progresso local vira o save da conta;
 *    é o "continuou nível 30" do Pedro, agora amarrado à conta).
 * Depois, mudanças relevantes sobem com debounce. O save LOCAL continua rodando como fallback
 * offline — sem Supabase/sem login nada muda (zero regressão no solo).
 */
import { useGameStore } from './game-store';
import { supabase } from '@/net/multiplayer';
import { createLocalSave, parseLocalSave, persistedStateChanged } from '../systems/persistenceSystem';
import { restoreLocalSave } from '../systems/persistenceSystem';

const TABLE = 'player_saves';

export function startAccountPersistence(userId: string): () => void {
  if (!supabase || typeof window === 'undefined') return () => {};
  const client = supabase;
  const store = useGameStore;

  let stopped = false;
  let dirty = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let maxWait: ReturnType<typeof setTimeout> | undefined;

  const push = () => {
    if (!dirty) return;
    dirty = false;
    const blob = createLocalSave(store.getState());
    void client.from(TABLE).upsert(
      { user_id: userId, save: blob, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    ).then(({ error }) => {
      // Antes o erro era engolido (`void`) → gravação falhava calada (tabela vazia).
      // Agora loga e re-marca dirty pra tentar de novo (RLS/sessão/rede).
      if (error) { dirty = true; console.warn('[save conta] gravação falhou:', error.message); }
    });
  };
  const flush = () => {
    clearTimeout(debounce); clearTimeout(maxWait);
    debounce = maxWait = undefined;
    push();
  };

  // Carrega o save da conta; sem ele, semeia com o estado atual (progresso local).
  void client.from(TABLE).select('save').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
    if (stopped) return;
    if (error) {
      // Load falhou (RLS/rede): NÃO semeia por cima (isso destruía o save bom com o
      // estado fresco). Mantém o que tem; o save local segue de fallback.
      console.warn('[save conta] load falhou, mantém local:', error.message);
      return;
    }
    const parsed = data?.save ? parseLocalSave(JSON.stringify(data.save)) : null;
    // O MAIS AVANÇADO vence (XP total): um aparelho zerado que logou antes semeava nível 1
    // na conta e depois SOBRESCREVIA o progresso local de outro aparelho ("atualizei e zerou").
    const localXp = store.getState().player.totalXp ?? 0;
    if (parsed && (parsed.player.totalXp ?? 0) >= localXp) {
      store.setState(restoreLocalSave(parsed, store.getState(), Date.now()));
    } else if (parsed) {
      dirty = true;
      push(); // local está à frente da conta: sobe o local (não perde progresso).
    } else {
      dirty = true;
      push(); // genuinamente sem save nesta conta: sobe o que o jogador já tem.
    }
  });

  const unsub = store.subscribe((state, previous) => {
    if (stopped || !persistedStateChanged(state, previous)) return;
    dirty = true;
    clearTimeout(debounce);
    debounce = setTimeout(flush, 2000);
    maxWait ??= setTimeout(flush, 6000);
  });

  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true; // para de marcar dirty (subscribe/load); o flush final ainda sobe o pendente.
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibility);
    unsub();
    flush();
  };
}
