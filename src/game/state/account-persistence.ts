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
import { restoreLocalSave, SAVE_KEY } from '../systems/persistenceSystem';

const TABLE = 'player_saves';
/** De QUAL conta é o personagem que está neste aparelho (memória + save local). */
export const OWNER_KEY = 'tribos.local.owner';

function readOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
function writeOwner(userId: string): void {
  try { localStorage.setItem(OWNER_KEY, userId); } catch { /* storage bloqueado */ }
}

/**
 * Decide o que fazer ao logar, dado o dono do personagem local (22/10: trocar de conta no
 * MESMO aparelho levava o personagem da conta anterior — conta nova nascia nível 30 e conta com
 * menos XP era SOBRESCRITA pelo "mais avançado vence").
 *  - 'load'  → aplica o save da conta (fonte da verdade);
 *  - 'push'  → o local é DESTA conta e está à frente (ex.: sessão expirou e a nuvem não gravou);
 *  - 'fresh' → conta sem save e o local é de outra conta/desconhecido → personagem novo.
 */
export function accountLoginAction(opts: {
  userId: string; owner: string | null; cloudXp: number | null; localXp: number;
}): 'load' | 'push' | 'fresh' {
  const mine = opts.owner === opts.userId;
  if (opts.cloudXp !== null) return mine && opts.localXp > opts.cloudXp ? 'push' : 'load';
  return mine ? 'push' : 'fresh';
}

export function startAccountPersistence(userId: string): () => void {
  if (!supabase || typeof window === 'undefined') return () => {};
  const client = supabase;
  const store = useGameStore;

  let stopped = false;
  let dirty = false;
  // A conta TEM save mas ele não passou na validação: nunca sobrescrever (subiria um
  // personagem zerado por cima do progresso real). Fica só no local até alguém corrigir.
  let locked = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let maxWait: ReturnType<typeof setTimeout> | undefined;

  // Nada sobe antes do load decidir de quem é o personagem (celular lento: o debounce de 2 s
  // subia o personagem da conta ANTERIOR na conta nova antes da resposta chegar).
  let loaded = false;

  const push = () => {
    if (!dirty || locked || !loaded) return;
    dirty = false;
    const blob = createLocalSave(store.getState());
    void client.from(TABLE).upsert(
      { user_id: userId, save: blob, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    ).then(({ error }) => {
      // Antes o erro era engolido (`void`) → gravação falhava calada (tabela vazia).
      // Agora loga e re-marca dirty pra tentar de novo (RLS/sessão/rede).
      if (!error) return;
      dirty = true;
      console.warn('[save conta] gravação falhou:', error.message);
      // Sessão EXPIROU (refresh 400 → upsert vira anônimo → RLS 401): para de martelar a cada
      // mudança. O save local segue (dono = esta conta) e sobe sozinho ao entrar de novo.
      void client.auth.getSession().then(({ data }) => {
        if (data.session || locked || stopped) return;
        locked = true;
        store.getState().setMessage('⚠️ Sua sessão expirou — progresso salvo NESTE aparelho. Entre de novo pra salvar na conta.');
      });
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
      loaded = readOwner() === userId; // só volta a subir se o personagem local é desta conta
      return;
    }
    const parsed = data?.save ? parseLocalSave(JSON.stringify(data.save)) : null;
    if (data?.save && !parsed) {
      locked = true;
      console.warn('[save conta] save da conta não passou na validação — NÃO sobrescrevo.');
      store.getState().setMessage('⚠️ Seu save da conta não carregou. Nada foi apagado — avise o suporte antes de jogar.');
      return;
    }
    // O personagem do aparelho só sobe/vence se for DESTA conta (ver `accountLoginAction`).
    const action = accountLoginAction({
      userId, owner: readOwner(),
      cloudXp: parsed ? parsed.player.totalXp ?? 0 : null,
      localXp: store.getState().player.totalXp ?? 0,
    });
    if (action === 'load' && parsed) {
      // Local de dono desconhecido e À FRENTE (aparelho antigo, antes do dono existir): guarda
      // cópia antes de carregar a conta — se era progresso não sincronizado, dá pra recuperar.
      if (readOwner() === null && (store.getState().player.totalXp ?? 0) > (parsed.player.totalXp ?? 0)) {
        try {
          localStorage.setItem(`${SAVE_KEY}.antes-da-conta`, JSON.stringify(createLocalSave(store.getState())));
        } catch { /* quota */ }
      }
      store.setState(restoreLocalSave(parsed, store.getState(), Date.now()));
    } else if (action === 'fresh') {
      // Personagem de OUTRA conta na memória: guarda cópia local e nasce um novo pra esta conta.
      try {
        localStorage.setItem(`${SAVE_KEY}.outra-conta`, JSON.stringify(createLocalSave(store.getState())));
      } catch { /* quota */ }
      store.getState().restartSurvival();
      store.getState().setMessage('🌱 Conta nova: um novo sobrevivente nasceu. Bem-vindo!');
    }
    writeOwner(userId);
    loaded = true;
    if (action !== 'load') dirty = true;
    push();
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
