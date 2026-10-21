/**
 * Autenticação (login/criar conta) via Supabase — SEM confirmação de email (fluxo direto
 * "nome + senha → nasce → joga"). Reusa o MESMO client do multiplayer (uma instância só).
 *
 * O jogador entra só com NOME + senha. O email é SINTETIZADO do nome (`<nome>@tribos.player`)
 * — o Supabase exige email, mas o jogador nunca vê/usa. Pra o fluxo ser direto, o projeto
 * precisa estar com "Confirm email" DESLIGADO (Auth → Providers → Email no painel Supabase).
 *
 * Sem as env VITE_SUPABASE_* (dev local), `AUTH_ENABLED=false`: o jogo roda offline, sem
 * tela de login (zero regressão no solo).
 */
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase, MP_ENABLED } from './multiplayer';

/** Login ligado só quando o Supabase está configurado (env setadas). */
export const AUTH_ENABLED = MP_ENABLED;

/** Email interno a partir do nome do sobrevivente (o jogador não vê). */
export function emailForName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${slug || 'sobrevivente'}@tribos.player`;
}

/** Nome do sobrevivente guardado no metadado do usuário. */
export function survivorName(user: User | null): string | null {
  const n = user?.user_metadata?.['survivor_name'];
  return typeof n === 'string' ? n : null;
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return 'Esse nome já existe. Tente entrar ou use outro.';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Nome ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Conta criada, mas falta confirmar (desative a confirmação de email no Supabase).';
  if (m.includes('password')) return 'Senha fraca (mínimo 6 caracteres).';
  return msg;
}

type AuthState = {
  ready: boolean;            // já checou a sessão inicial
  user: User | null;
  busy: boolean;
  error: string | null;
  init(): void;
  signUp(name: string, password: string): Promise<void>;
  signIn(name: string, password: string): Promise<void>;
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

  async signUp(name, password) {
    if (!supabase) return;
    set({ busy: true, error: null });
    const email = emailForName(name);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { survivor_name: name.trim() } } });
    if (error) { set({ busy: false, error: translate(error.message) }); return; }
    // Entra direto (se a confirmação de email estiver desligada no painel).
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    set({ busy: false, error: e2 ? translate(e2.message) : null });
  },

  async signIn(name, password) {
    if (!supabase) return;
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email: emailForName(name), password });
    set({ busy: false, error: error ? translate(error.message) : null });
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut();
  },
}));
