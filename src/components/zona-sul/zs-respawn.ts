/**
 * RENASCER ESCOLHENDO NO MAPA (05/11, Pedro: "após a morte, antes de nascer, seria legal o mapa abrir e escolher nascer no
 * navio, na base ou no carro — se tiver em missão com esses itens facilita a volta ao jogo" · "morreu: aparece a mensagem,
 * dura 6 s; depois aparece o mapa e aí tem os 6 s restantes vendo aonde quer nascer; passou os 12 no total, ele nasce onde
 * escolheu"). Como o ARK (a tela de morte É o mapa com as camas) e o Atlas (a cama do navio é ponto de nascer).
 *  - 0–6 s: "Você morreu!" (quem matou). 6–12 s: o MAPA com os pontos — clicou, fica escolhido. 12 s: nasce lá.
 *  - Pontos: BASE (sempre que tiver base), NAVIO (o seu, inteiro, nível do navio, sem levar tiro há 30 s), CARRO (o seu,
 *    inteiro, nível do carro, fora da caverna), PRAIA do Arpoador (sempre). Navio e carro: recarga de 3 min (não vira
 *    teletransporte). Nunca dentro da caverna (não pula o caminho até o Canibal).
 *  - Sem escolher: a BASE se tiver, senão a praia (o de antes).
 *  - ENTRADA DA CAVERNA (05/11, Pedro: "checkpoint no Canibal ao morrer… ou joga lá pra porta da cave, início de tudo — veja o
 *    melhor"): morreu no caminho do Canibal (pegou checkpoint da caverna nesta vida) → aparece a boca do Pico da Tijuca, do
 *    lado de FORA (o começo do caminho: não pula a fenda nem a rampa — sem espera). O carro estacionado lá fora segue valendo.
 * Regras PURAS aqui (testáveis); a tela em hud/zs-respawn-screen, o nascer em zona-sul-world.
 */
import { create } from 'zustand';

export const RESPAWN = {
  /** só a mensagem "Você morreu!" */
  MSG_MS: 6000,
  /** total até nascer (a mensagem + o mapa) */
  TOTAL_MS: 12_000,
  /** navio e carro: espera entre um nascer e outro no mesmo ponto */
  VEH_CD_MS: 3 * 60_000,
  /** navio que levou tiro há menos disto não serve (está em combate) */
  SHIP_CALM_MS: 30_000,
} as const;

export type SpawnKind = 'base' | 'ship' | 'car' | 'cave' | 'beach';
export type SpawnPoint = { kind: SpawnKind; x: number; z: number; ok: boolean; why: string | null };
export const SPAWN_LABEL: Record<SpawnKind, string> = { base: 'Base', ship: 'Navio', car: 'Carro', cave: 'Entrada da caverna', beach: 'Praia do Arpoador' };
export const SPAWN_ICON: Record<SpawnKind, string> = { base: '🏠', ship: '⚓', car: '🚗', cave: '🕳️', beach: '🏖️' };

export type SpawnInput = {
  now: number;
  base: { x: number; z: number } | null;
  beach: { x: number; z: number };
  ship: { x: number; z: number; gone: boolean; unlocked: boolean; hitAt: number } | null;
  car: { x: number; z: number; gone: boolean; unlocked: boolean; underground: boolean } | null;
  /** quando nasceu no navio / no carro pela última vez (0 = nunca) */
  usedAt: { ship: number; car: number };
  /** morreu no caminho do Canibal: a entrada da caverna (lado de fora da boca do Pico) — senão nem aparece */
  cave?: { x: number; z: number } | null;
};

const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function vehWhy(kind: 'ship' | 'car', i: SpawnInput): string | null {
  const v = kind === 'ship' ? i.ship : i.car;
  if (!v) return null;
  if (v.gone) return kind === 'ship' ? 'afundou' : 'explodiu';
  if (!v.unlocked) return kind === 'ship' ? 'nível do navio' : 'nível do carro';
  if (kind === 'car' && i.car!.underground) return 'dentro da caverna';
  if (kind === 'ship' && i.ship!.hitAt > 0 && i.now - i.ship!.hitAt < RESPAWN.SHIP_CALM_MS) return 'em combate';
  const left = i.usedAt[kind] > 0 ? i.usedAt[kind] + RESPAWN.VEH_CD_MS - i.now : 0;
  if (left > 0) return `volta em ${mmss(left)}`;
  return null;
}
/** Os pontos que aparecem no mapa (os que não servem agora vêm com `ok: false` e o porquê). Sem navio/carro: nem aparecem. */
export function spawnPoints(i: SpawnInput): SpawnPoint[] {
  const out: SpawnPoint[] = [];
  if (i.base) out.push({ kind: 'base', x: i.base.x, z: i.base.z, ok: true, why: null });
  for (const k of ['ship', 'car'] as const) {
    const v = k === 'ship' ? i.ship : i.car;
    if (!v) continue;
    const why = vehWhy(k, i);
    out.push({ kind: k, x: v.x, z: v.z, ok: why === null, why });
  }
  if (i.cave) out.push({ kind: 'cave', x: i.cave.x, z: i.cave.z, ok: true, why: null });
  out.push({ kind: 'beach', x: i.beach.x, z: i.beach.z, ok: true, why: null });
  return out;
}
/** Sem escolher: a BASE se tiver, senão a praia (o de sempre). */
export function defaultSpawn(points: SpawnPoint[]): SpawnKind {
  return points.some((p) => p.kind === 'base' && p.ok) ? 'base' : 'beach';
}
/** Onde nasce: o escolhido se ainda serve (pode ter afundado/explodido no meio), senão o padrão. */
export function resolveSpawn(points: SpawnPoint[], choice: SpawnKind | null): SpawnPoint {
  const want = choice ? points.find((p) => p.kind === choice && p.ok) : undefined;
  if (want) return want;
  const d = defaultSpawn(points);
  return points.find((p) => p.kind === d)!;
}
/** Em que parte da morte está: mensagem (0–6 s), mapa (6–12 s), nascer (12 s+). */
export function deathStage(deathAt: number, now: number): 'msg' | 'map' | 'go' {
  const t = now - deathAt;
  return t < RESPAWN.MSG_MS ? 'msg' : t < RESPAWN.TOTAL_MS ? 'map' : 'go';
}
/** Segundos (pra cima) até o fim da parte atual: até o mapa abrir (na mensagem) ou até nascer (no mapa). */
export function stageSecondsLeft(deathAt: number, now: number): number {
  const t = now - deathAt, end = t < RESPAWN.MSG_MS ? RESPAWN.MSG_MS : RESPAWN.TOTAL_MS;
  return Math.max(0, Math.ceil((end - t) / 1000));
}
/** Pontos quase no mesmo lugar (o carro estaciona do lado da praia): quantos ANTES dele estão a menos de NEAR_M — a tela
 *  afasta o ícone de lado e põe o nome em cima, pra um não cobrir o outro. */
export const SPAWN_NEAR_M = 80;
export function spawnNudge(points: SpawnPoint[]): number[] {
  return points.map((p, k) => points.slice(0, k).filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < SPAWN_NEAR_M).length);
}
/** Mesmos pontos (tipo, se serve, porquê, < 3 m)? — pra não repintar a tela à toa. */
export function samePoints(a: SpawnPoint[], b: SpawnPoint[]): boolean {
  return a.length === b.length && a.every((p, k) => { const q = b[k]!; return p.kind === q.kind && p.ok === q.ok && p.why === q.why && Math.hypot(p.x - q.x, p.z - q.z) < 3; });
}

/** A morte em curso (o mundo escreve; a tela lê): quando morreu, onde, o que escolheu e os pontos de agora. */
export const useZsRespawn = create<{ deathAt: number; diedAt: { x: number; z: number } | null; choice: SpawnKind | null; points: SpawnPoint[] }>(() => ({
  deathAt: 0, diedAt: null, choice: null, points: [],
}));
/** recarga do navio/carro (vale a sessão), quando o MEU navio levou tiro pela última vez e — morreu no caminho do Canibal —
 *  a entrada da caverna pra oferecer no mapa (vale até nascer) */
export const zsRespawnMem = { usedAt: { ship: 0, car: 0 }, shipHitAt: 0, shipHp: -1, cave: null as { x: number; z: number } | null };
