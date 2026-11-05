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
import { noteHostClock, noteHostEpoch, resetRoomClock, setRoomActive } from './room-clock';

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
  /** VEÍCULOS de quem envia (01/11, Pedro online: "um no barco, outro na praia — não vejo o barco"): de carona na pose.
   *  Ausente = cliente antigo / sem veículo. */
  v?: NetVehicle[];
  /** EQUIPAMENTO em uso (02/11, Pedro online: "não vejo o skate dele; na prancha em pé"): [tipo (1 prancha · 2 skate ·
   *  3 asa-delta), altura acima do pé, rumo, rolagem, inclinação]. Ausente = nada (ou cliente antigo). */
  g?: number[];
  /** SKIN do herói (03/11): a escolhida quando não é a padrão (homem); ausente = homem (cliente antigo também). */
  sk?: 'mulher' | 'mercenario';
};

/** Veículo visto pela rede: `k` 's' = navio de guerra · 'c' = carro voador; `y` = altura (carro); `s` = velocidade;
 *  `h` = vida do navio (01/11, Pedro: "navio 5k vida") — 0 = afundando. */
export type NetVehicle = { k: 's' | 'c'; x: number; z: number; yaw: number; y?: number; s?: number; h?: number };

/** Canhão de OUTRO jogador acertou o MEU navio (01/11). O dono do navio valida (inimizade) e aplica.
 *  `w` 'gun' (02/11) = tiro de ARMA de mão (fuzil/pistola/arco/espada pela mira); ausente = canhão (cliente antigo). */
export type ShipHitIntent = { id: string; ownerId: string; damage: number; fromName: string; fromSide: PvpSide; w?: 'gun'; mob?: true };
let shipHitHandler: ((intent: ShipHitIntent) => void) | null = null;
export function registerShipHitHandler(handler: ((intent: ShipHitIntent) => void) | null): void { shipHitHandler = handler; }
export function broadcastShipHit(ownerId: string, damage: number, w?: 'gun'): void {
  if (!channel || !useNet.getState().connected || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfName, selfSide } = useNet.getState();
  if (ownerId === selfId) return;
  void channel.send({ type: 'broadcast', event: 'ship-hit', payload: { id: selfId, ownerId, damage: Math.round(damage), fromName: selfName, fromSide: selfSide, ...(w ? { w } : {}) } satisfies ShipHitIntent });
}

/** Bala da ESQUADRA PIRATA (simulada no anfitrião, 03/11) no navio de um jogador: vale SEMPRE (bicho do mundo, sem
 *  inimizade — como a horda na base). O dono do navio aplica. */
/** (04/11) `fromName`: o Kraken das Cagarras usa o mesmo caminho (bicho do mundo: vale sem inimizade). */
export function broadcastPirateShipHit(ownerId: string, damage: number, fromName = 'Esquadra pirata'): void {
  if (!channel || !useNet.getState().connected || !useNet.getState().isHost || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfSide } = useNet.getState();
  if (ownerId === selfId) return;
  void channel.send({ type: 'broadcast', event: 'ship-hit', payload: { id: selfId, ownerId, damage: Math.round(damage), fromName, fromSide: selfSide, mob: true } satisfies ShipHitIntent });
}

/**
 * ESQUADRA PIRATA ONLINE (03/11, Pedro: "o mesmo navio e inimigos no multiplayer, igual — todos veem normal; igual a tudo
 * que já temos online funcionando"). O ANFITRIÃO simula; a sala recebe os navios ~5×/s (`fleet`) e os rastros dos tiros
 * de fuzil da tripulação. Capitão e tripulação vão na foto do mundo (bichos: mira, dano e morte pelo caminho de sempre).
 * As salvas vão pelo `cannon` de sempre (só desenho); o dano em navio/jogador vai pelo ship-hit (pirata) e mob-hit.
 */
export type NetFleetShip = { i: string; x: number; z: number; yaw: number; r: number; h: number; sk: number | null; pd: 0 | 1 };
/** rastro de um tiro: de (x, y, z) até (x, y, z) */
export type NetFleetShot = [number, number, number, number, number, number];
/** o KRAKEN no convés (etapa 2): dono do navio, (u, v) no navio, subida 0→1, ação (0 sobe · 1 anda · 2 bate · 3 parado) */
export type NetFleetBoarder = { i: string; o: string; u: number; v: number; c: number; a: 0 | 1 | 2 | 3 };
export const netFleet: { ships: NetFleetShip[]; at: number; shots: NetFleetShot[]; k: NetFleetBoarder | null } = { ships: [], at: 0, shots: [], k: null };
export function broadcastFleet(ships: NetFleetShip[], shots: NetFleetShot[], k: NetFleetBoarder | null = null): void {
  if (!channel || !useNet.getState().connected || !useNet.getState().isHost) return;
  if (presentGuests.size === 0) return;
  void channel.send({ type: 'broadcast', event: 'fleet', payload: { id: useNet.getState().selfId, s: ships, sh: shots, k } });
}
/** Minha bala/tiro num navio da esquadra (CONVIDADO → o anfitrião aplica; `by` = quem leva o loot se afundar). */
export type FleetHitIntent = { id: string; shipId: string; damage: number };
let fleetHitHandler: ((intent: FleetHitIntent) => void) | null = null;
export function registerFleetHitHandler(handler: ((intent: FleetHitIntent) => void) | null): void { fleetHitHandler = handler; }
/** KRAKEN DAS CAGARRAS (04/11, etapa 3): o anfitrião manda fase, olhar e os tentáculos ~4×/s (a VIDA vai na foto do mundo,
 *  como todo bicho). ph: 0 dorme · 1 sobe · 2 luta · 3 morto; rt = subida 0–1; bo = corpo exposto; a = ação do corpo
 *  (0 parado · 1 bate · 2 morre); t = tentáculo vivo; s = chicotada [x, z, idade] ou null. */
// v2 kaiju (04/11): + ph 4 saiu atrás · 5 afundando; x/z onde ele está, mv andando, sk afundando 0–1; b = as CRIAS no convés
export type NetKraken = { ph: 0 | 1 | 2 | 3 | 4 | 5; rt: number; y: number; bo: 0 | 1; a: 0 | 1 | 2; t: (0 | 1)[]; s: ([number, number, number] | null)[]; x: number; z: number; mv: 0 | 1; sk: number; b: NetFleetBoarder[] };
export const netKraken: { k: NetKraken | null; at: number } = { k: null, at: 0 };
export function broadcastKraken(k: NetKraken): void {
  if (!channel || !useNet.getState().connected) return;
  void channel.send({ type: 'broadcast', event: 'kraken', payload: { id: useNet.getState().selfId, k } });
}
export function broadcastFleetHit(shipId: string, damage: number): void {
  if (!channel || !useNet.getState().connected || useNet.getState().isHost || !Number.isFinite(damage) || damage <= 0) return;
  void channel.send({ type: 'broadcast', event: 'fleet-hit', payload: { id: useNet.getState().selfId, shipId, damage: Math.round(damage) } satisfies FleetHitIntent });
}
/** Afundou com o tiro DESTE jogador (anfitrião → ele): o loot é de quem afundou. */
export type FleetRewardIntent = { id: string; targetId: string };
let fleetRewardHandler: (() => void) | null = null;
export function registerFleetRewardHandler(handler: (() => void) | null): void { fleetRewardHandler = handler; }
export function broadcastFleetReward(targetId: string): void {
  if (!channel || !useNet.getState().connected || !useNet.getState().isHost) return;
  void channel.send({ type: 'broadcast', event: 'fleet-reward', payload: { id: useNet.getState().selfId, targetId } satisfies FleetRewardIntent });
}
/** Em sala e NÃO sou o anfitrião (vejo a esquadra dele). */
export function isGuestInRoom(): boolean { const s = useNet.getState(); return s.connected && !s.isHost; }

/** Tiro de OUTRO jogador no MEU carro voador (02/11, Pedro: "fuzil tirando vida do navio/carro"). O dono valida e aplica. */
export type CarHitIntent = { id: string; ownerId: string; damage: number; fromName: string; fromSide: PvpSide };
let carHitHandler: ((intent: CarHitIntent) => void) | null = null;
export function registerCarHitHandler(handler: ((intent: CarHitIntent) => void) | null): void { carHitHandler = handler; }
// só em desenvolvimento: testes de tela simulam o tiro de outro jogador CHEGANDO (sem servidor no local)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zsNetIn?: unknown }).__zsNetIn = { shipHit: (h: ShipHitIntent) => shipHitHandler?.(h), carHit: (h: CarHitIntent) => carHitHandler?.(h) };
export function broadcastCarHit(ownerId: string, damage: number): void {
  if (!channel || !useNet.getState().connected || !Number.isFinite(damage) || damage <= 0) return;
  const { selfId, selfName, selfSide } = useNet.getState();
  if (ownerId === selfId) return;
  void channel.send({ type: 'broadcast', event: 'car-hit', payload: { id: selfId, ownerId, damage: Math.round(damage), fromName: selfName, fromSide: selfSide } satisfies CarHitIntent });
}

/** SALVA DE CANHÃO vista pela rede (01/11, Pedro: "ver o navio dar dano, atacar outro player e ser atacado"): as balas
 *  de quem atirou — saída/velocidade (`b`: ox, oy, oz, vx, vy, vz), onde caem (`l`: x, y, z, t) e o intervalo da
 *  salva. Os outros só DESENHAM (arco, splash, som); o dano já foi resolvido por quem atirou (cannonHit dele). */
export type NetCannon = { id: string; b: number[][]; l: number[][]; gap: number };
/** Salvas recebidas, esperando o desenho do navio pegar (ele esvazia a cada quadro). */
export const netCannonInbox: NetCannon[] = [];
/** MÍSSIL DA BAZUCA dos outros (04/11): de onde saiu e onde explode — só DESENHO (o dano é resolvido por quem atirou). */
export type NetMissile = { id: string; f: [number, number]; t: [number, number]; y?: number };
export const netMissileInbox: NetMissile[] = [];
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zsNetCannon?: unknown }).__zsNetCannon = netCannonInbox; // testes

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
  /** Aviso do lobby (04/11): "Sala fechada pelo administrador." / "Limite de 10 salas…" — some ao entrar noutra. */
  notice: string | null;
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
  notice: null,
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

    ch.on('broadcast', { event: 'cannon' }, ({ payload }) => {
      const p = payload as NetCannon;
      if (p.id === selfId || !Array.isArray(p.b) || p.b.length > 6) return;
      netCannonInbox.push(p);
      if (netCannonInbox.length > 12) netCannonInbox.splice(0, netCannonInbox.length - 12);
    });

    ch.on('broadcast', { event: 'missile' }, ({ payload }) => {
      const p = payload as NetMissile;
      if (p.id === selfId || !Array.isArray(p.f) || !Array.isArray(p.t) || p.f.length !== 2 || p.t.length !== 2) return;
      netMissileInbox.push(p);
      if (netMissileInbox.length > 8) netMissileInbox.splice(0, netMissileInbox.length - 8);
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
      if (typeof p.wt === 'number') { noteHostClock(p.wt); if (typeof p.epoch === 'number') noteHostEpoch(p.epoch); } // relógio da sala: as ondas iguais pra todos (02/11)
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

    // NAVIO (01/11): canhão de outro jogador no MEU navio — só com inimizade (aliado não afunda aliado)
    ch.on('broadcast', { event: 'ship-hit' }, ({ payload }) => {
      const hit = payload as ShipHitIntent;
      if (hit.ownerId !== selfId || hit.id === selfId || !Number.isFinite(hit.damage)) return;
      if (!hit.mob && hit.fromSide !== 'enemy' && get().selfSide !== 'enemy') return; // pirata (mob) vale sempre
      shipHitHandler?.(hit);
    });
    // ESQUADRA PIRATA (03/11): os navios do anfitrião (convidado desenha), o tiro do convidado nela, o loot de quem afundou
    ch.on('broadcast', { event: 'fleet' }, ({ payload }) => {
      const p = payload as { id: string; s: NetFleetShip[]; sh: NetFleetShot[]; k?: NetFleetBoarder | null };
      if (p.id === selfId || get().isHost || !Array.isArray(p.s)) return;
      netFleet.ships = p.s.slice(0, 6); netFleet.at = performance.now(); netFleet.k = p.k ?? null;
      if (Array.isArray(p.sh)) { netFleet.shots.push(...p.sh.slice(0, 30)); if (netFleet.shots.length > 40) netFleet.shots.splice(0, netFleet.shots.length - 40); }
    });
    ch.on('broadcast', { event: 'kraken' }, ({ payload }) => {
      const p = payload as { id: string; k: NetKraken };
      if (p.id === selfId || get().isHost || !p.k || !Array.isArray(p.k.t)) return;
      netKraken.k = p.k; netKraken.at = performance.now();
    });
    ch.on('broadcast', { event: 'fleet-hit' }, ({ payload }) => {
      const hit = payload as FleetHitIntent;
      if (!get().isHost || hit.id === selfId || !hit.shipId || !Number.isFinite(hit.damage)) return;
      fleetHitHandler?.(hit);
    });
    ch.on('broadcast', { event: 'fleet-reward' }, ({ payload }) => {
      const r = payload as FleetRewardIntent;
      if (r.targetId !== selfId || r.id === selfId) return;
      fleetRewardHandler?.();
    });
    // CARRO (02/11): tiro de outro jogador no MEU carro — mesma regra (só com inimizade)
    ch.on('broadcast', { event: 'car-hit' }, ({ payload }) => {
      const hit = payload as CarHitIntent;
      if (hit.ownerId !== selfId || hit.id === selfId || !Number.isFinite(hit.damage)) return;
      if (hit.fromSide !== 'enemy' && get().selfSide !== 'enemy') return;
      carHitHandler?.(hit);
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
      if (host) { worldEncoder = createWorldEncoder(); resetRoomClock(); } // virou host: 1º envio = foto completa; o relógio da sala é o dele
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
    set({ room, notice: null, connected: false, isHost, players: {}, bases: {}, baseTiers: {}, troops: {}, world: null, selfSide: 'ally', sideChosen: isHost });
    setRoomActive(true);
    if (isHost) void registerRoom(room); // publica a sala no lobby (aba de salas)
  },

  leave: () => {
    retrack = null;
    setRoomActive(false);
    unregisterRoom();
    if (channel && supabase) { void supabase.removeChannel(channel); channel = null; }
    set({ room: null, connected: false, isHost: false, players: {}, bases: {}, baseTiers: {}, troops: {}, world: null, selfSide: 'ally', sideChosen: false });
  },
}));

/** Skin do herói LOCAL que vai na pose (03/11) — quem desenha o herói avisa (`LocalHeroBody`). */
let poseSkin: 'homem' | 'mulher' | 'mercenario' = 'homem';
export function setPoseSkin(skin: 'homem' | 'mulher' | 'mercenario'): void { poseSkin = skin; }

/** Envia a pose do jogador local (chamar do loop; throttla sozinho a ~11Hz). */
let lastSent = 0;
export function broadcastPose(x: number, z: number, yaw: number, action: string, level: number, hp: number, maxHp: number, y?: number, weapon?: string | null, vehicles?: NetVehicle[] | null, gear?: number[] | null): void {
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
      ...(vehicles && vehicles.length ? { v: vehicles.map((v) => ({ ...v })) } : {}), // cópia: quem chama reaproveita a lista
      ...(gear ? { g: gear.slice() } : {}),
      ...(poseSkin === 'mulher' || poseSkin === 'mercenario' ? { sk: poseSkin } : {}),
    } satisfies RemotePose,
  });
}

/** Manda uma salva de canhão pros outros (só desenho/som — o dano é resolvido aqui por quem atirou). */
export function broadcastCannon(balls: number[][], lands: number[][], gapMs: number): void {
  if (!channel || !useNet.getState().connected) return;
  const r = (n: number) => Math.round(n * 100) / 100;
  void channel.send({
    type: 'broadcast', event: 'cannon',
    payload: { id: useNet.getState().selfId, b: balls.map((a) => a.map(r)), l: lands.map((a) => a.map(r)), gap: gapMs } satisfies NetCannon,
  });
}

/** Manda o míssil da bazuca pros outros (04/11): eles veem voar e explodir; o dano é daqui (`explosiveHit`). */
export function broadcastMissile(from: { x: number; z: number }, to: { x: number; z: number }, toY?: number): void {
  if (!channel || !useNet.getState().connected) return;
  const r = (n: number) => Math.round(n * 10) / 10;
  void channel.send({
    type: 'broadcast', event: 'missile',
    payload: { id: useNet.getState().selfId, f: [r(from.x), r(from.z)], t: [r(to.x), r(to.z)], ...(toY !== undefined && Number.isFinite(toY) ? { y: r(toY) } : {}) } satisfies NetMissile,
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
  // (03/11: o capitão e a tripulação da esquadra pirata VÃO junto — a sala os vê, mira e acerta pelo caminho dos bichos)
  const pkt = worldEncoder.encode(creatures, Date.now()); // só o que mudou; foto completa a cada 30 s
  if (!pkt) return;
  const { selfId } = useNet.getState();
  void channel.send({ type: 'broadcast', event: 'world', payload: { id: selfId, ...pkt, epoch: worldEpoch(), wt: Date.now() } });
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
export function remoteTargets(): { id: string; x: number; z: number; y?: number }[] {
  const s = useNet.getState();
  if (!s.connected || !s.isHost) return [];
  // y (31/10): a altura real dele — a IA sabe se ele está na caverna ou na superfície (camada)
  return Object.values(s.players).filter(p => p.hp > 0).map(p => ({ id: p.id, x: p.x, z: p.z, ...(Number.isFinite(p.y) ? { y: p.y as number } : {}) }));
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
 *  - Ninguém na sala → a linha FICA (pausada) até 12 h (04/11; antes 3 dias); quem abrir o link nesse prazo
 *    RETOMA da foto. +12 h sem ninguém → o próprio heartbeat limpa.
 *  - 04/11 (Pedro: "máximo de 10 salas; eu sou adm, posso fechar"): o banco recusa a 11ª sala ('room_limit') e a sala
 *    fechada pelo admin ('room_closed') — o app sai dela com o aviso (`notice`).
 * ------------------------------------------------------------------ */
export type RoomInfo = { code: string; players: number; max: number; updatedAt: string; live: boolean };

const ROOM_LIVE_MS = 60_000;                 // heartbeat recente = sala AO VIVO
const ROOM_KEEP_MS = 12 * 60 * 60_000;       // pausada até 12 h (04/11; antes 3 dias) — depois o banco limpa
/** Máximo de salas abertas/pausadas ao mesmo tempo (o banco recusa a 11ª). */
export const MAX_ROOMS = 10;
/** Aviso do banco → o que o jogador lê (e sai da sala). Puro (testável). */
export function roomRefusal(message: string | undefined | null): string | null {
  if (!message) return null;
  if (message.includes('room_closed')) return 'Sala fechada pelo administrador.';
  if (message.includes('room_limit')) return `Limite de ${MAX_ROOMS} salas abertas — entre numa da lista.`;
  return null;
}
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
  }).then(({ error }) => {
    if (!error) return;
    const why = roomRefusal(error.message);
    if (why && !release && useNet.getState().room === code) { useNet.getState().leave(); useNet.setState({ notice: why }); return; }
    console.warn('[sala] heartbeat falhou:', error.message);
  });
}

/** ADMIN (04/11): a conta é administradora? (`is_admin()` no banco; sem login/sem banco = não) */
export async function isRoomAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}
/** ADMIN fecha a sala (quem está nela sai no próximo heartbeat). Devolve o erro (texto) ou null. */
export async function adminCloseRoom(code: string): Promise<string | null> {
  if (!supabase) return 'sem banco';
  const { error } = await supabase.rpc('admin_close_room', { p_code: code });
  return error ? error.message : null;
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
