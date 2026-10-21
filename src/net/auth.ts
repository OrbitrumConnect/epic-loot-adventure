/**
 * Autenticação (login/criar conta) via Supabase — SEM confirmação de email (fluxo direto
 * "nome + email + senha → nasce → joga"). Reusa o MESMO client do multiplayer (uma instância).
 *
 * Criar conta pede NOME (sobrevivente, vai pro HUD/ranking) + EMAIL (real — serve de login e
 * de lead) + SENHA. Entrar é por EMAIL + SENHA. Pra o fluxo ser direto, o projeto precisa estar
 * com "Confirm email" DESLIGADO (`mailer_autoconfirm=true` — já configurado).
 *
 * Sem as env VITE_SUPABASE_* (dev local), `AUTH_ENABLED=false`: o jogo roda offline, sem
 * tela de login (zero regressão no solo).
 */
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase, MP_ENABLED } from './multiplayer';

/** Login ligado só quando o Supabase está configurado (env setadas). */
export const AUTH_ENABLED = MP_ENABLED;

/** Valida formato de email (checagem leve no cliente). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Nome do sobrevivente guardado no metadado do usuário. */
export function survivorName(user: User | null): string | null {
  const n = user?.user_metadata?.['survivor_name'];
  return typeof n === 'string' ? n : null;
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return 'Esse email já tem conta. Use "Entrar".';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Email ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Falta confirmar o email (desative a confirmação no Supabase).';
  if (m.includes('invalid') && m.includes('email')) return 'Email inválido.';
  if (m.includes('password')) return 'Senha fraca (mínimo 6 caracteres).';
  return msg;
}

type AuthState = {
  ready: boolean;            // já checou a sessão inicial
  user: User | null;
  busy: boolean;
  error: string | null;
  init(): void;
  signUp(name: string, email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  // Sem Supabase (dev local): já "pronto" e sem usuário → a tela de login não aparece.
  ready: !AUTH_ENABLED,
  user: null,
  busy: false,
  error: null,

  init() {
    if (!supabase) { set({ ready: true }); return; }
    void supabase.auth.getSession().then(({ data }) => set({ user: data.session?.user ?? null, ready: true }));
    supabase.auth.onAuthStateChange((_event, session) => set({ user: session?.user ?? null }));
  },

  async signUp(name, email, password) {
    if (!supabase) return;
    set({ busy: true, error: null });
    const mail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signUp({ email: mail, password, options: { data: { survivor_name: name.trim() } } });
    if (error) { set({ busy: false, error: translate(error.message) }); return; }
    // Entra direto (confirmação de email desligada no painel → sessão já vem na resposta).
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: mail, password });
    set({ busy: false, error: e2 ? translate(e2.message) : null });
  },

  async signIn(email, password) {
    if (!supabase) return;
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    set({ busy: false, error: error ? translate(error.message) : null });
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut();
  },
}));
