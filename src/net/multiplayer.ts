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
import type { CreatureState } from '@/game/types/creature';

const SUPA_URL = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const SUPA_ANON = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;
export const MP_ENABLED = Boolean(SUPA_URL && SUPA_ANON);

// Exportado pra o módulo de AUTENTICAÇÃO (src/net/auth.ts) reusar o MESMO client — Supabase
// recomenda uma única instância (auth + realtime compartilham a sessão).
export const supabase = MP_ENABLED
  ? createClient(SUPA_URL as string, SUPA_ANON as string, { realtime: { params: { eventsPerSecond: 24 } } })
  : null;

export const MAX_PLAYERS = 8;

/** Postura PvP que o jogador declara ao entrar numa sala (fatia 1 do PvP). */
export type PvpSide = 'ally' | 'enemy';

export type RemotePose = {
  id: string; name: string;
  /** Metadado leve de presença; prepara a identidade persistente futura. */
  level: number;
  hp: number;
  maxHp: number;
  x: number; z: number; yaw: number;
  action: string; t: number;
  /** Aliado ou Inimigo (declarado no card ao entrar). Default 'ally'. */
  side: PvpSide;
};

export type CreatureHitIntent = {
  id: string;
  targetId: string;
  source: { x: number; z: number };
  damage: number;
};

/** Golpe PvP de um jogador em OUTRO (fatia 2). `id` = atacante, `targetId` = alvo. */
export type PlayerHitIntent = {
  id: string;
  targetId: string;
  damage: number;
  fromName: string;
  /** Postura do ATACANTE — o alvo só aceita o dano se houver inimizade. */
  fromSide: PvpSide;
};

type NetState = {
  room: string | null;
  connected: boolean;
  full: boolean;
  /** Host = quem CRIOU a sala (sala sem código na entrada). Simula os inimigos. */
  isHost: boolean;
  selfId: string;
  selfName: string;
  /** Minha postura PvP na sala (declarada no card). `sideChosen` controla o card. */
  selfSide: PvpSide;
  sideChosen: boolean;
  setSide: (s: PvpSide) => void;
  /** Outros jogadores (sem o self). */
  players: Record<string, RemotePose>;
  /** Base de cada outro jogador (pra renderizar a base dele no mapa). */
  bases: Record<string, PlayerBaseState>;
  /** Snapshot do mundo enviado pelo anfitrião. Clientes convidados nunca o simulam. */
  world: CreatureState[] | null;
  join: (code?: string) => void;
  leave: () => void;
  setName: (n: string) => void;
};

const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n);
const randRoom = () => rand(5).toUpperCase();

let channel: RealtimeChannel | null = null;
let creatureHitHandler: ((intent: CreatureHitIntent) => void) | null = null;
let playerHitHandler: ((intent: PlayerHitIntent) => void) | null = null;

export const useNet = create<NetState>((set, get) => ({
  room: null,
  connected: false,
  full: false,
  isHost: false,
  selfId: rand(8),
  selfName: 'Viajante-' + Math.floor(100 + Math.random() * 900),
  selfSide: 'ally',
  sideChosen: false,
  players: {},
  bases: {},
  world: null,

  setName: (n) => set({ selfName: n.trim() || get().selfName }),
  setSide: (s) => set({ selfSide: s, sideChosen: true }),

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

    ch.on('broadcast', { event: 'world' }, ({ payload }) => {
      const p = payload as { id: string; creatures: CreatureState[] };
      // O anfitrião é a autoridade. Ele não deve aceitar um snapshot de convidado.
      if (p.id === selfId || get().isHost || !Array.isArray(p.creatures)) return;
      set({ world: p.creatures });
    });

    ch.on('broadcast', { event: 'creature-hit' }, ({ payload }) => {
      const hit = payload as CreatureHitIntent;
      if (!get().isHost || hit.id === selfId || !hit.targetId || !Number.isFinite(hit.damage)) return;
      creatureHitHandler?.(hit);
    });

    // PvP (fatia 2): golpe de outro jogador. Só me interessa o que mira em MIM, e só vale se
    // houver inimizade (o atacante é inimigo OU eu me declarei inimigo). Fora isso, ignora.
    ch.on('broadcast', { event: 'player-hit' }, ({ payload }) => {
      const hit = payload as PlayerHitIntent;
      if (hit.targetId !== selfId || hit.id === selfId || !Number.isFinite(hit.damage)) return;
      if (hit.fromSide !== 'enemy' && get().selfSide !== 'enemy') return; // dois aliados não se ferem
      playerHitHandler?.(hit);
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
    // Host entra como aliado (não escolhe); convidado (entrou por código/link) declara a
    // postura no card → `sideChosen=false` faz o card aparecer. (fatia 1 do PvP)
    set({ room, connected: false, isHost, players: {}, bases: {}, world: null, selfSide: 'ally', sideChosen: isHost });
    if (isHost) void registerRoom(room); // publica a sala no lobby (aba de salas)
  },

  leave: () => {
    unregisterRoom();
    if (channel && supabase) { void supabase.removeChannel(channel); channel = null; }
    set({ room: null, connected: false, isHost: false, players: {}, bases: {}, world: null, selfSide: 'ally', sideChosen: false });
  },
}));

/** Envia a pose do jogador local (chamar do loop; throttla sozinho a ~11Hz). */
let lastSent = 0;
export function broadcastPose(x: number, z: number, yaw: number, action: string, level: number, hp: number, maxHp: number): void {
  if (!channel || !useNet.getState().connected) return;
  const now = performance.now();
  if (now - lastSent < 88) return;
  lastSent = now;
  const { selfId, selfName, selfSide } = useNet.getState();
  void channel.send({
    type: 'broadcast', event: 'pose',
    payload: { id: selfId, name: selfName, level, hp, maxHp, x, z, yaw, action, t: now, side: selfSide } satisfies RemotePose,
  });
}

/** Transmite a base do jogador local (chamar ao mudar + heartbeat; raro). */
export function broadcastBase(base: PlayerBaseState | null): void {
  if (!channel || !useNet.getState().connected) return;
  const { selfId } = useNet.getState();
  void channel.send({ type: 'broadcast', event: 'base', payload: { id: selfId, base } });
}

/** Estado comum dos inimigos. Só o anfitrião publica; convidados apenas o consomem. */
export function broadcastWorld(creatures: CreatureState[]): void {
  if (!channel || !useNet.getState().connected || !useNet.getState().isHost) return;
  const { selfId } = useNet.getState();
  void channel.send({ type: 'broadcast', event: 'world', payload: { id: selfId, creatures } });
}

/** Em uma sala, a simulação pertence ao anfitrião. Fora dela, o jogo continua solo. */
export function canSimulateSharedWorld(): boolean {
  const state = useNet.getState();
  return !state.connected || state.isHost;
}

/** Convidado pede o golpe; o anfitrião valida e altera o inimigo comum. */
export function broadcastCreatureHit(intent: Omit<CreatureHitIntent, 'id'>): void {
  if (!channel || !useNet.getState().connected || useNet.getState().isHost) return;
  const { selfId } = useNet.getState();
  void channel.send({ type: 'broadcast', event: 'creature-hit', payload: { ...intent, id: selfId } });
}

/** Registrado pela camada de mundo enquanto este navegador é anfitrião. */
export function registerCreatureHitHandler(handler: ((intent: CreatureHitIntent) => void) | null): void {
  creatureHitHandler = handler;
}

/** PvP (fatia 2): manda um golpe num jogador inimigo. O ALVO valida/aplica (não há autoridade
 *  central pra players). Inclui minha postura pra o alvo saber se há inimizade. */
export function broadcastPlayerHit(targetId: string, damage: number): void {
  if (!channel || !useNet.getState().connected || !targetId || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfName, selfSide } = useNet.getState();
  if (targetId === selfId) return;
  void channel.send({
    type: 'broadcast', event: 'player-hit',
    payload: { id: selfId, targetId, damage, fromName: selfName, fromSide: selfSide } satisfies PlayerHitIntent,
  });
}

/** Registrado pela camada de mundo/HUD pra aplicar o dano PvP recebido no jogador local. */
export function registerPlayerHitHandler(handler: ((intent: PlayerHitIntent) => void) | null): void {
  playerHitHandler = handler;
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

/* ------------------------------------------------------------------ *
 * LOBBY: registro das salas ativas na tabela `game_rooms` (SELECT público;
 * INSERT/UPDATE/DELETE só do dono via auth.uid()). Assim dá pra LISTAR as
 * partidas abertas e entrar por clique, sem link. Só o HOST registra a sala.
 * ------------------------------------------------------------------ */
export type RoomInfo = { code: string; players: number; max: number; updatedAt: string };

const ROOM_STALE_MS = 60_000; // sala sem heartbeat há +60s é considerada morta
let roomRowId: string | null = null;
let roomHeartbeat: ReturnType<typeof setInterval> | null = null;

async function registerRoom(code: string): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return; // sem login não registra (mas o P2P segue funcionando por link)
  const { data, error } = await supabase
    .from('game_rooms')
    .upsert({ code, owner_id: uid, max_players: MAX_PLAYERS, active_players: 1, status: 'open', last_active_at: new Date().toISOString() }, { onConflict: 'code' })
    .select('id')
    .maybeSingle();
  if (error || !data) return;
  roomRowId = data.id as string;
  roomHeartbeat = setInterval(() => {
    if (!supabase || !roomRowId) return;
    const players = Object.keys(useNet.getState().players).length + 1;
    void supabase.from('game_rooms').update({ active_players: players, last_active_at: new Date().toISOString() }).eq('id', roomRowId);
  }, 15_000);
}

function unregisterRoom(): void {
  if (roomHeartbeat) { clearInterval(roomHeartbeat); roomHeartbeat = null; }
  if (supabase && roomRowId) { void supabase.from('game_rooms').delete().eq('id', roomRowId); }
  roomRowId = null;
}

/** Lista as salas ABERTAS com heartbeat recente (pra aba de salas). */
export async function listRooms(): Promise<RoomInfo[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - ROOM_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('game_rooms')
    .select('code, active_players, max_players, last_active_at')
    .eq('status', 'open')
    .gte('last_active_at', since)
    .order('last_active_at', { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data.map((r) => ({
    code: r.code as string,
    players: (r.active_players as number) ?? 1,
    max: (r.max_players as number) ?? MAX_PLAYERS,
    updatedAt: r.last_active_at as string,
  }));
}
