/**
 * Multiplayer leve via Supabase Realtime (Broadcast + Presence). SEM login:
 * cada cliente gera um id temporário. Uma sala = um canal (`tribos:<CÓDIGO>`).
 * Um jogador cria a sala (código aleatório) e compartilha o link `?room=CÓDIGO`;
 * os outros entram direto. Posições viajam por Broadcast (~11Hz, interpolado no
 * render). Presence lista quem está e libera a vaga ao sair. Máx. 8 jogadores.
 *
 * Só usa a **anon key (pública)** via env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 * Sem essas vars, o multiplayer fica DESLIGADO (jogo solo normal, zero regressão).
 */
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { PlayerBaseState } from '@/game/types/playerbase';

const SUPA_URL = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const SUPA_ANON = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;
export const MP_ENABLED = Boolean(SUPA_URL && SUPA_ANON);

const supabase = MP_ENABLED
  ? createClient(SUPA_URL as string, SUPA_ANON as string, { realtime: { params: { eventsPerSecond: 24 } } })
  : null;

export const MAX_PLAYERS = 8;

export type RemotePose = {
  id: string; name: string;
  x: number; z: number; yaw: number;
  action: string; t: number;
};

type NetState = {
  room: string | null;
  connected: boolean;
  full: boolean;
  /** Host = quem CRIOU a sala (sala sem código na entrada). Simula os inimigos. */
  isHost: boolean;
  selfId: string;
  selfName: string;
  /** Outros jogadores (sem o self). */
  players: Record<string, RemotePose>;
  /** Base de cada outro jogador (pra renderizar a base dele no mapa). */
  bases: Record<string, PlayerBaseState>;
  join: (code?: string) => void;
  leave: () => void;
  setName: (n: string) => void;
};

const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n);
const randRoom = () => rand(5).toUpperCase();

let channel: RealtimeChannel | null = null;

export const useNet = create<NetState>((set, get) => ({
  room: null,
  connected: false,
  full: false,
  isHost: false,
  selfId: rand(8),
  selfName: 'Viajante-' + Math.floor(100 + Math.random() * 900),
  players: {},
  bases: {},

  setName: (n) => set({ selfName: n.trim() || get().selfName }),

  join: (code) => {
    if (!supabase) return;
    get().leave();
    const isHost = !code; // quem cria a sala (sem código) é o host (simula inimigos)
    const room = (code || randRoom()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const selfId = get().selfId;
    const ch = supabase.channel('tribos:' + room, {
      config: { presence: { key: selfId }, broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'pose' }, ({ payload }) => {
      const p = payload as RemotePose;
      if (p.id === selfId) return;
      set((s) => ({ players: { ...s.players, [p.id]: p } }));
    });

    ch.on('broadcast', { event: 'base' }, ({ payload }) => {
      const p = payload as { id: string; base: PlayerBaseState | null };
      if (p.id === selfId) return;
      set((s) => {
        const next = { ...s.bases };
        if (p.base) next[p.id] = p.base; else delete next[p.id];
        return { bases: next };
      });
    });

    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      const ids = Object.keys(st);
      set((s) => {
        const players: Record<string, RemotePose> = {};
        const bases: Record<string, PlayerBaseState> = {};
        for (const id of ids) if (id !== selfId) {
          if (s.players[id]) players[id] = s.players[id]!;
          if (s.bases[id]) bases[id] = s.bases[id]!;
        }
        return { players, bases, full: ids.length >= MAX_PLAYERS };
      });
    });

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        set({ connected: true });
        void ch.track({ name: get().selfName });
      }
    });

    channel = ch;
    set({ room, connected: false, isHost, players: {}, bases: {} });
  },

  leave: () => {
    if (channel && supabase) { void supabase.removeChannel(channel); channel = null; }
    set({ room: null, connected: false, isHost: false, players: {}, bases: {} });
  },
}));

/** Envia a pose do jogador local (chamar do loop; throttla sozinho a ~11Hz). */
let lastSent = 0;
export function broadcastPose(x: number, z: number, yaw: number, action: string): void {
  if (!channel || !useNet.getState().connected) return;
  const now = performance.now();
  if (now - lastSent < 88) return;
  lastSent = now;
  const { selfId, selfName } = useNet.getState();
  void channel.send({
    type: 'broadcast', event: 'pose',
    payload: { id: selfId, name: selfName, x, z, yaw, action, t: now } satisfies RemotePose,
  });
}

/** Transmite a base do jogador local (chamar ao mudar + heartbeat; raro). */
export function broadcastBase(base: PlayerBaseState | null): void {
  if (!channel || !useNet.getState().connected) return;
  const { selfId } = useNet.getState();
  void channel.send({ type: 'broadcast', event: 'base', payload: { id: selfId, base } });
}

/** Link de convite da sala atual (pra compartilhar). */
export function inviteLink(room: string): string {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('room', room);
    return u.toString();
  } catch { return `?room=${room}`; }
}

/** Código da sala vindo do link (?room=XXXX), se houver. */
export function roomFromUrl(): string | null {
  try { return new URL(window.location.href).searchParams.get('room'); } catch { return null; }
}
