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
import { setWorldEpoch, worldEpoch } from '@/game/systems/dayNightSystem';
import { createWorldDecoder, createWorldEncoder, type WorldPacket } from './world-delta';

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
  /** Altura REAL dos pés de quem envia (ponte, assoalho da casa, pulo, morro). Opcional:
   *  cliente antigo sem `y` → o receptor calcula pelo chão (compatível). */
  y?: number;
  /** Item na mão (id) — o outro jogador desenha a mesma arma. Opcional (cliente antigo). */
  w?: string;
  action: string; t: number;
  /** Aliado ou Inimigo (declarado no card ao entrar). Default 'ally'. */
  side: PvpSide;
  /** Tropas em campo de quem envia (de carona na pose, 1 a cada 3 envios — sem mensagem nova).
   *  Lista vazia = recolheu. Ausente = sem novidade. */
  tr?: NetTroop[];
};

/** Tropa em campo vista pela rede (forma curta). */
export type NetTroop = { i: string; u: string; x: number; z: number; r: number; a: string; h: number; m: number };

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
  /** Evolução visual da base de cada um: 0 madeira · 1 pedra · 2 metal (23/10). */
  baseTiers: Record<string, number>;
  /** Tropas em campo de cada outro jogador (na horda dele). */
  troops: Record<string, NetTroop[]>;
  /** Snapshot do mundo enviado pelo anfitrião. Clientes convidados nunca o simulam. */
  world: CreatureState[] | null;
  join: (code?: string) => void;
  leave: () => void;
  setName: (n: string) => void;
};

const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n);
const randRoom = () => rand(5).toUpperCase();

/** Metadado de presença usado na eleição do host. `away` = aba escondida ou modo Clash. */
export type PresenceMeta = { joinedAt?: number; host?: boolean; away?: boolean };

/**
 * Quem segura a sala (simula os inimigos) — DETERMINÍSTICO: todo cliente vê a mesma
 * presença e chega ao mesmo resultado. Só conta quem está PRESENTE de verdade (não `away`):
 * (1) se há um host marcado e presente, ele continua (o mais antigo, se houver corrida);
 * (2) senão, o jogador presente MAIS ANTIGO assume (desempate pelo id). Se TODOS estão
 * ausentes, vale a mesma regra sobre todos (o solo segue no BackgroundSim).
 * Assim o host sair, minimizar ou entrar no modo Clash NÃO pausa nem laga os outros.
 */
export function electHost(members: { id: string; meta: PresenceMeta }[]): string | null {
  if (members.length === 0) return null;
  const order = (a: { id: string; meta: PresenceMeta }, b: { id: string; meta: PresenceMeta }) =>
    (a.meta.joinedAt ?? Infinity) - (b.meta.joinedAt ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const present = members.filter(m => !m.meta.away);
  const pool = present.length > 0 ? present : members;
  const flagged = pool.filter(m => m.meta.host).sort(order);
  if (flagged.length > 0) return flagged[0]!.id;
  return [...pool].sort(order)[0]!.id;
}

let selfAway = false;
let awayTimer: ReturnType<typeof setTimeout> | null = null;
let retrack: (() => void) | null = null;

/**
 * Marca o jogador local como AUSENTE (aba escondida / modo Clash) ou presente. Ausente há
 * 2 s → o host passa a sala pro próximo presente; voltar é imediato (entra como convidado).
 */
export function setAway(away: boolean): void {
  if (awayTimer) { clearTimeout(awayTimer); awayTimer = null; }
  const apply = (v: boolean) => { if (selfAway === v) return; selfAway = v; retrack?.(); };
  if (away) awayTimer = setTimeout(() => apply(true), 2000);
  else apply(false);
}

let channel: RealtimeChannel | null = null;
/** Recebi mundo AO VIVO de um host nesta sala? (decide se "retomar" usa a foto do banco) */
let hadLiveWorld = false;
/** Mundo em diferenças (world-delta.ts): host codifica, convidado remonta. Zera ao entrar/virar host. */
let worldEncoder = createWorldEncoder();
let worldDecoder = createWorldDecoder();
/** Convidados PRESENTES (aba visível, fora do Clash): sem nenhum, o host não manda o mundo pra ninguém. */
let presentGuests = new Set<string>();
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
  baseTiers: {},
  troops: {},
  world: null,

  setName: (n) => set({ selfName: n.trim() || get().selfName }),
  setSide: (s) => set({ selfSide: s, sideChosen: true }),

  join: (code) => {
    if (!supabase) return;
    get().leave();
    const isHost = !code; // quem cria a sala (sem código) é o host (simula inimigos)
    const room = (code || randRoom()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const selfId = get().selfId;
    const joinedAt = Date.now(); // ordem de chegada → quem assume se o host sair
    hadLiveWorld = false;
    worldEncoder = createWorldEncoder();
    worldDecoder = createWorldDecoder();
    presentGuests = new Set();
    const ch = supabase.channel('tribos:' + room, {
      config: { presence: { key: selfId }, broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'pose' }, ({ payload }) => {
      const p = payload as RemotePose;
      if (p.id === selfId) return;
      set((s) => ({ players: { ...s.players, [p.id]: p }, troops: applyPoseTroops(s.troops, p.id, p.tr) }));
    });

    ch.on('broadcast', { event: 'base' }, ({ payload }) => {
      const p = payload as { id: string; base: PlayerBaseState | null; tier?: number };
      if (p.id === selfId) return;
      set((s) => {
        const next = { ...s.bases };
        const tiers = { ...s.baseTiers };
        if (p.base) { next[p.id] = p.base; tiers[p.id] = p.tier ?? 0; } else { delete next[p.id]; delete tiers[p.id]; }
        return { bases: next, baseTiers: tiers };
      });
    });

    ch.on('broadcast', { event: 'world' }, ({ payload }) => {
      const p = payload as WorldPacket;
      // O anfitrião é a autoridade. Ele não deve aceitar um snapshot de convidado.
      if (p.id === selfId || get().isHost) return;
      if (typeof p.epoch === 'number') setWorldEpoch(p.epoch); // dia/noite iguais ao do anfitrião (26/10)
      const world = worldDecoder.apply(p); // foto completa ou só o que mudou (27/10)
      if (!world) return;
      hadLiveWorld = true;
      set({ world });
    });

    ch.on('broadcast', { event: 'creature-hit' }, ({ payload }) => {
      const hit = payload as CreatureHitIntent;
      if (!get().isHost || hit.id === selfId || !hit.targetId || !Number.isFinite(hit.damage)) return;
      creatureHitHandler?.(hit);
    });

    // PvP fatia 4: inimigo bateu na MINHA base. Só vale com inimizade (aliado não tem fogo amigo).
    ch.on('broadcast', { event: 'base-hit' }, ({ payload }) => {
      const hit = payload as BaseHitIntent;
      if (hit.ownerId !== selfId || hit.id === selfId || !Number.isFinite(hit.damage)) return;
      // Bicho da MINHA horda (simulado no host) batendo na minha base: vale sempre, sem PvP.
      if (!hit.mob && hit.fromSide !== 'enemy' && get().selfSide !== 'enemy') return;
      baseHitHandler?.(hit);
    });

    // RAID: inimigo (golpe/torre) acertou uma TROPA minha. Só com inimizade; o dono aplica.
    ch.on('broadcast', { event: 'troop-hit' }, ({ payload }) => {
      const hit = payload as TroopHitIntent;
      if (hit.ownerId !== selfId || hit.id === selfId || !Number.isFinite(hit.damage)) return;
      if (hit.fromSide !== 'enemy' && get().selfSide !== 'enemy') return;
      troopHitHandler?.(hit);
    });

    // Convidado avisou que a horda DELE começou → o host (dono da simulação) spawna.
    ch.on('broadcast', { event: 'wave-spawn' }, ({ payload }) => {
      const req = payload as WaveSpawnIntent;
      if (!get().isHost || req.id === selfId || !Number.isFinite(req.wave)) return;
      waveSpawnHandler?.(req);
    });

    // Mundo único: o bicho do HOST me acertou (eu sou convidado). Aplica com a MINHA armadura.
    ch.on('broadcast', { event: 'mob-hit' }, ({ payload }) => {
      const hit = payload as MobHitIntent;
      if (hit.targetId !== selfId || get().isHost || !Number.isFinite(hit.damage)) return;
      mobHitHandler?.(hit);
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
        const baseTiers: Record<string, number> = {};
        const troops: Record<string, NetTroop[]> = {};
        for (const id of ids) if (id !== selfId) {
          if (s.players[id]) players[id] = s.players[id]!;
          if (s.bases[id]) bases[id] = s.bases[id]!;
          if (s.baseTiers[id] !== undefined) baseTiers[id] = s.baseTiers[id]!;
          if (s.troops[id]) troops[id] = s.troops[id]!;
        }
        return { players, bases, baseTiers, troops, full: ids.length >= MAX_PLAYERS };
      });
      // MIGRAÇÃO DE HOST: se o host saiu (ou a sala estava vazia), o mais antigo assume e
      // segue simulando a partir do último snapshot que já tem no store. Nada quebra.
      const members = ids.map(id => ({ id, meta: ((st[id] as unknown as PresenceMeta[])?.[0]) ?? {} }));
      // Quem entrou ou voltou (aba visível de novo) recebe a foto completa no próximo envio.
      const guests = new Set(members.filter(m => m.id !== selfId && !m.meta.away).map(m => m.id));
      if ([...guests].some(id => !presentGuests.has(id))) worldEncoder.keyframe();
      presentGuests = guests;
      const elected = electHost(members);
      if (elected && (elected === selfId) !== get().isHost) setHost(elected === selfId);
    });

    const track = () => {
      if (!get().connected) return;
      void ch.track({ name: get().selfName, joinedAt, host: get().isHost, away: selfAway } satisfies PresenceMeta & { name: string });
    };
    retrack = track;
    const setHost = (host: boolean) => {
      if (host) worldEncoder = createWorldEncoder(); // virou host: 1º envio = foto completa
      else worldDecoder = createWorldDecoder();      // virou convidado: espera a foto do novo host
      set({ isHost: host, ...(host ? { world: null } : {}) });
      track();
      if (host) void registerRoom(room); else unregisterRoom();
    };

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        set({ connected: true });
        track();
      }
    });

    channel = ch;
    // Host entra como aliado (não escolhe); convidado (entrou por código/link) declara a
    // postura no card → `sideChosen=false` faz o card aparecer. (fatia 1 do PvP)
    set({ room, connected: false, isHost, players: {}, bases: {}, baseTiers: {}, troops: {}, world: null, selfSide: 'ally', sideChosen: isHost });
    if (isHost) void registerRoom(room); // publica a sala no lobby (aba de salas)
  },

  leave: () => {
    retrack = null;
    unregisterRoom();
    if (channel && supabase) { void supabase.removeChannel(channel); channel = null; }
    set({ room: null, connected: false, isHost: false, players: {}, bases: {}, baseTiers: {}, troops: {}, world: null, selfSide: 'ally', sideChosen: false });
  },
}));

/** Envia a pose do jogador local (chamar do loop; throttla sozinho a ~11Hz). */
let lastSent = 0;
export function broadcastPose(x: number, z: number, yaw: number, action: string, level: number, hp: number, maxHp: number, y?: number, weapon?: string | null): void {
  if (!channel || !useNet.getState().connected) return;
  const now = performance.now();
  if (now - lastSent < 88) return;
  lastSent = now;
  const { selfId, selfName, selfSide } = useNet.getState();
  // Tropas de carona: 1 a cada 3 poses (~3,5×/s) enquanto houver; uma lista vazia ao recolher.
  poseCount++;
  const pick = troopPiggyback(outgoingTroops, poseCount);
  const troops = pick.send;
  outgoingTroops = pick.next;
  void channel.send({
    type: 'broadcast', event: 'pose',
    payload: {
      id: selfId, name: selfName, level, hp, maxHp, x, z, yaw, action, t: now, side: selfSide,
      ...(y !== undefined && Number.isFinite(y) ? { y } : {}),
      ...(weapon ? { w: weapon } : {}),
      ...(troops ? { tr: troops } : {}),
    } satisfies RemotePose,
  });
}

let poseCount = 0;
let outgoingTroops: NetTroop[] | null = null;

/** Tropas de carona na pose: com tropas, 1 a cada 3 poses; lista vazia (recolheu) vai 1× e para. */
export function troopPiggyback(outgoing: NetTroop[] | null, count: number): { send: NetTroop[] | null; next: NetTroop[] | null } {
  if (!outgoing) return { send: null, next: null };
  if (outgoing.length === 0) return { send: [], next: null };
  return { send: count % 3 === 0 ? outgoing : null, next: outgoing };
}

/** Pose recebida: `tr` ausente = sem novidade; vazia = recolheu (apaga); com itens = substitui. */
export function applyPoseTroops(troops: Record<string, NetTroop[]>, id: string, tr: NetTroop[] | undefined): Record<string, NetTroop[]> {
  if (!tr) return troops;
  const next = { ...troops };
  if (tr.length) next[id] = tr; else delete next[id];
  return next;
}
/** A camada de mundo informa as tropas em campo (vão de carona na próxima pose). Vazio = recolheu. */
export function setOutgoingTroops(list: NetTroop[]): void {
  // Sem tropas e já avisado (null): nada a mandar. Senão guarda (lista vazia = avisa 1× que recolheu).
  if (list.length === 0 && outgoingTroops === null) return;
  outgoingTroops = list;
}

/** Transmite a base do jogador local (chamar ao mudar + heartbeat; raro). */
export function broadcastBase(base: PlayerBaseState | null, tier = 0): void {
  if (!channel || !useNet.getState().connected) return;
  const { selfId } = useNet.getState();
  // tier = evolução visual (0 madeira · 1 pedra · 2 metal) — os outros desenham igual (23/10).
  void channel.send({ type: 'broadcast', event: 'base', payload: { id: selfId, base, tier } });
}

/** Estado comum dos inimigos. Só o anfitrião publica; convidados apenas o consomem. */
export function broadcastWorld(creatures: CreatureState[]): void {
  if (!channel || !useNet.getState().connected || !useNet.getState().isHost) return;
  if (presentGuests.size === 0) return; // ninguém presente pra ver: não gasta tráfego (27/10)
  const pkt = worldEncoder.encode(creatures, Date.now()); // só o que mudou; foto completa a cada 30 s
  if (!pkt) return;
  const { selfId } = useNet.getState();
  void channel.send({ type: 'broadcast', event: 'world', payload: { id: selfId, ...pkt, epoch: worldEpoch() } });
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
export function broadcastPlayerHit(targetId: string, damage: number, fromName?: string): void {
  if (!channel || !useNet.getState().connected || !targetId || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfName, selfSide } = useNet.getState();
  if (targetId === selfId) return;
  // `fromName` opcional: torre da base ("Torre de X") — o golpe continua sendo DESTE jogador.
  void channel.send({
    type: 'broadcast', event: 'player-hit',
    payload: { id: selfId, targetId, damage, fromName: fromName ?? selfName, fromSide: selfSide } satisfies PlayerHitIntent,
  });
}

/** Registrado pela camada de mundo/HUD pra aplicar o dano PvP recebido no jogador local. */
export function registerPlayerHitHandler(handler: ((intent: PlayerHitIntent) => void) | null): void {
  playerHitHandler = handler;
}

/* ---- PvP fatia 4: golpe na BASE de um inimigo. O DONO da base valida e aplica. ---- */
export type BaseHitIntent = {
  id: string; ownerId: string; pieceId: string; damage: number; fromName: string; fromSide: PvpSide;
  /** true = bicho da horda do dono (host simula) — dano cheio, sem regra de PvP. */
  mob?: boolean;
};
let baseHitHandler: ((intent: BaseHitIntent) => void) | null = null;

export function broadcastBaseHit(ownerId: string, pieceId: string, damage: number, mobName?: string): void {
  if (!channel || !useNet.getState().connected || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfName, selfSide } = useNet.getState();
  if (ownerId === selfId) return;
  void channel.send({
    type: 'broadcast', event: 'base-hit',
    payload: {
      id: selfId, ownerId, pieceId, damage, fromName: mobName ?? selfName, fromSide: selfSide,
      ...(mobName ? { mob: true } : {}),
    } satisfies BaseHitIntent,
  });
}

/* ---- Horda do CONVIDADO: ele avisa, o host spawna/simula (o mundo é um só) ---- */
export type WaveSpawnIntent = { id: string; wave: number; center: { x: number; z: number } };
let waveSpawnHandler: ((intent: WaveSpawnIntent) => void) | null = null;

export function broadcastWaveSpawn(wave: number, center: { x: number; z: number }): void {
  if (!channel || !useNet.getState().connected || useNet.getState().isHost) return;
  void channel.send({
    type: 'broadcast', event: 'wave-spawn',
    payload: { id: useNet.getState().selfId, wave, center } satisfies WaveSpawnIntent,
  });
}

export function registerWaveSpawnHandler(handler: ((intent: WaveSpawnIntent) => void) | null): void {
  waveSpawnHandler = handler;
}

/** Dono de um bicho de horda pelo id (`wave3_oABC123_...`). null = horda sem dono (solo/antiga). */
export function waveOwner(creatureId: string): string | null {
  const m = /^wave\d+_o([A-Za-z0-9]+)_/.exec(creatureId);
  return m ? m[1]! : null;
}

/** Esse bicho de horda é da MINHA base? Sem dono = de quem simula (host/solo). */
export function isMyWave(creatureId: string): boolean {
  const owner = waveOwner(creatureId);
  const s = useNet.getState();
  if (owner) return s.connected ? owner === s.selfId : true;
  return canSimulateSharedWorld();
}

export function registerBaseHitHandler(handler: ((intent: BaseHitIntent) => void) | null): void {
  baseHitHandler = handler;
}

/* ---- RAID: golpe numa TROPA de outro jogador. O DONO valida e aplica (23/10). ---- */
export type TroopHitIntent = { id: string; ownerId: string; troopId: string; damage: number; fromName: string; fromSide: PvpSide };
let troopHitHandler: ((intent: TroopHitIntent) => void) | null = null;

/** Só manda quando alguém ATACA (clique/mira/torre) — nada contínuo. */
export function broadcastTroopHit(ownerId: string, troopId: string, damage: number, fromName?: string): void {
  if (!channel || !useNet.getState().connected || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfName, selfSide } = useNet.getState();
  if (ownerId === selfId) return;
  void channel.send({
    type: 'broadcast', event: 'troop-hit',
    payload: { id: selfId, ownerId, troopId, damage, fromName: fromName ?? selfName, fromSide: selfSide } satisfies TroopHitIntent,
  });
}

export function registerTroopHitHandler(handler: ((intent: TroopHitIntent) => void) | null): void {
  troopHitHandler = handler;
}

/* ---- Mundo único: o host mira QUALQUER jogador e avisa o convidado quando o bicho bate ---- */
export type MobHitIntent = { id: string; targetId: string; damage: number; creatureName: string };
let mobHitHandler: ((intent: MobHitIntent) => void) | null = null;

/** Jogadores remotos vivos (pro AI do HOST escolher o alvo mais perto). Vazio fora de sala/convidado. */
export function remoteTargets(): { id: string; x: number; z: number }[] {
  const s = useNet.getState();
  if (!s.connected || !s.isHost) return [];
  return Object.values(s.players).filter(p => p.hp > 0).map(p => ({ id: p.id, x: p.x, z: p.z }));
}

/** Host: um bicho acertou um CONVIDADO (dano bruto; o convidado aplica a própria armadura). */
export function broadcastMobHit(targetId: string, damage: number, creatureName: string): void {
  if (!channel || !useNet.getState().connected || !useNet.getState().isHost) return;
  void channel.send({
    type: 'broadcast', event: 'mob-hit',
    payload: { id: useNet.getState().selfId, targetId, damage, creatureName } satisfies MobHitIntent,
  });
}

export function registerMobHitHandler(handler: ((intent: MobHitIntent) => void) | null): void {
  mobHitHandler = handler;
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
 * LOBBY + PERSISTÊNCIA DA SALA (Multiplayer B). Tudo pela função do banco
 * `room_heartbeat` (SECURITY DEFINER): o GRANT da tabela é só SELECT, então o
 * upsert/update direto falhava calado (a aba Salas nunca listava nada).
 *  - Quem SEGURA a sala (host) bate a cada 15 s; a cada 30 s leva a FOTO do mundo
 *    (inimigos) — só grava quem tem a autoridade (lease 60 s no banco).
 *  - Passou a vez / saiu → solta a autoridade na hora (release) com a última foto.
 *  - Ninguém na sala → a linha FICA (pausada) até 3 dias; quem abrir o link nesse prazo
 *    RETOMA da foto. +3 dias sem ninguém → o próprio heartbeat limpa.
 * ------------------------------------------------------------------ */
export type RoomInfo = { code: string; players: number; max: number; updatedAt: string; live: boolean };

const ROOM_LIVE_MS = 60_000;                 // heartbeat recente = sala AO VIVO
const ROOM_KEEP_MS = 3 * 24 * 60 * 60_000;   // pausada até 3 dias (depois o banco limpa)
let roomHeartbeat: ReturnType<typeof setInterval> | null = null;
let heartbeatRoom: string | null = null;
let snapshotProvider: (() => CreatureState[]) | null = null;

/** A camada de mundo registra de onde tirar a foto (inimigos atuais do store). */
export function registerWorldSnapshotProvider(fn: (() => CreatureState[]) | null): void {
  snapshotProvider = fn;
}

function heartbeat(code: string, withSnapshot: boolean, release = false): void {
  if (!supabase) return;
  const players = Object.keys(useNet.getState().players).length + 1;
  const creatures = withSnapshot && snapshotProvider ? snapshotProvider() : null;
  void supabase.rpc('room_heartbeat', {
    p_code: code, p_players: players,
    p_snapshot: creatures ? { creatures, savedAt: Date.now() } : null,
    p_release: release,
  }).then(({ error }) => { if (error) console.warn('[sala] heartbeat falhou:', error.message); });
}

async function registerRoom(code: string): Promise<void> {
  if (!supabase || heartbeatRoom === code) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return; // sem login não persiste a sala (o P2P por link segue funcionando)
  unregisterRoom();
  heartbeatRoom = code;
  let tick = 0;
  heartbeat(code, true);
  roomHeartbeat = setInterval(() => { tick++; heartbeat(code, tick % 2 === 0); }, 15_000);
}

/** Para de segurar a sala: solta a autoridade JÁ (com a última foto). A linha NÃO é apagada. */
function unregisterRoom(): void {
  if (roomHeartbeat) { clearInterval(roomHeartbeat); roomHeartbeat = null; }
  if (heartbeatRoom) heartbeat(heartbeatRoom, true, true);
  heartbeatRoom = null;
}

/**
 * RETOMAR: se virei host SEM ter recebido mundo ao vivo (sala vazia/pausada), busco a última
 * foto salva da sala. Se eu era convidado e o host saiu, NÃO uso a foto do banco (o meu
 * estado ao vivo é mais novo).
 */
export async function fetchResumeSnapshot(): Promise<CreatureState[] | null> {
  const room = useNet.getState().room;
  if (!supabase || !room || hadLiveWorld) return null;
  const { data, error } = await supabase.from('game_rooms')
    .select('world_snapshot, world_version').eq('code', room).maybeSingle();
  if (error || !data) return null;
  const snap = data.world_snapshot as { creatures?: unknown } | null;
  return Array.isArray(snap?.creatures) && (data.world_version as number) > 1
    ? (snap!.creatures as CreatureState[]) : null;
}

/** Classifica a linha do lobby (pura, testável): ao vivo, pausada (retomável) ou expirada. */
export function roomStatus(lastActiveIso: string, now = Date.now()): 'live' | 'paused' | 'expired' {
  const age = now - new Date(lastActiveIso).getTime();
  if (age <= ROOM_LIVE_MS) return 'live';
  if (age <= ROOM_KEEP_MS) return 'paused';
  return 'expired';
}

/** Salas AO VIVO e PAUSADAS (até 3 dias, retomáveis pelo mesmo código). */
export async function listRooms(): Promise<RoomInfo[]> {
  if (!supabase) return [];
  const since = new Date(Date.now() - ROOM_KEEP_MS).toISOString();
  const { data, error } = await supabase
    .from('game_rooms')
    .select('code, active_players, max_players, last_active_at')
    .neq('status', 'closed')
    .gte('last_active_at', since)
    .order('last_active_at', { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data.map((r) => {
    const live = roomStatus(r.last_active_at as string) === 'live';
    return {
      code: r.code as string,
      players: live ? ((r.active_players as number) ?? 1) : 0,
      max: (r.max_players as number) ?? MAX_PLAYERS,
      updatedAt: r.last_active_at as string,
      live,
    };
  });
}
