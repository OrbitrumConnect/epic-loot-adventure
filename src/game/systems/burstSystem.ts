/**
 * RAJADA (Pedro 25/10: "arma semiautomática de rajada, 6 a 9 tiros com intervalo leve de ~1 s, baixando com o nível;
 * o herói também"). Um gatilho solta a rajada inteira; depois vem a pausa. Só o RIFLE (pistola segue tiro único).
 *   tamanho: 6 tiros, +1 a cada 50 níveis, teto 9   ·   entre tiros: 0,1 s   ·   pausa: 1 s → 0,6 s no nível 150
 * Cada tiro gasta 1 bala e passa pelo MESMO caminho do tiro normal (dano, munição, som, rastro, rede).
 */
export const BURST_ITEMS = new Set(['rifle']);
export const BURST_GAP = 0.1;
export const BURST_MIN = 6;
export const BURST_MAX = 9;
export const BURST_PAUSE_START = 1.0;
export const BURST_PAUSE_END = 0.6;
const PAUSE_FULL_LEVEL = 150;

export function burstSize(itemId: string | null, level: number): number {
  if (!itemId || !BURST_ITEMS.has(itemId)) return 1;
  return Math.min(BURST_MAX, BURST_MIN + Math.floor(Math.max(0, level) / 50));
}
export function burstPause(level: number): number {
  const t = Math.min(1, Math.max(0, level) / PAUSE_FULL_LEVEL);
  return BURST_PAUSE_START - (BURST_PAUSE_START - BURST_PAUSE_END) * t;
}
/** Cadência (s) que o tiro precisa respeitar: dentro da rajada o intervalo curto; gatilho novo espera a pausa.
 *  `k` = multiplicador do BOOST FIRE (0,5 ativo; 1 normal). `manual` = tiro do JOGADOR (clique/toque): o automático
 *  segurando — a cadência da rajada, sem a pausa (ver GATILHO SEGURADO). */
export function shotCooldown(baseCooldown: number, itemId: string | null, level: number, fromBurst: boolean, k = 1, manual = false): number {
  if (burstSize(itemId, level) <= 1) return baseCooldown * k;
  if (manual) return autoGapS(k);
  return (fromBurst ? BURST_GAP * 0.8 : burstPause(level)) * k;
}

/**
 * GATILHO SEGURADO (Pedro 03/11: "no manual eu clico 1 vez sai uma bala; eu pressiono o dedo deveria sair a rajada
 * automática até soltar o dedo — igual CS, sem quebrar o idle"). Só o tiro do JOGADOR (clique, toque no ATACAR) entra
 * aqui: TOQUE = 1 bala; SEGURANDO = automático na cadência da rajada (0,1 s = 600/min; ×½ no Boost Fire) até soltar —
 * cada bala sai pra onde a mira está AGORA (antes a rajada de 6–9 repetia o ponto do 1º tiro mesmo virando a câmera).
 * O piloto/idle não passa por aqui: segue com as rajadas de sempre (6–9 tiros + pausa). Só o fuzil segura; pistola e
 * arco = 1 por clique. Cada tiro passa pelo MESMO caminho de sempre (dano, munição, som, rastro, rede).
 */
export const AUTO_GAP = BURST_GAP;
/** Folga do relógio (o quadro de 60 Hz cai em 0,1 s certinho em vez de pular pro seguinte). */
const AUTO_SLACK = 0.95;
/** Intervalo (s) do automático; `k` = Boost Fire (0,5) ou 1. */
export function autoGapS(k = 1): number { return AUTO_GAP * AUTO_SLACK * k; }
const trig = { held: false, fire: null as (() => void) | null, depth: 0 };
/** Roda `fn` como tiro do JOGADOR (toque = 1 bala, sem abrir a rajada do piloto). */
export function manualShot<T>(fn: () => T): T {
  trig.depth += 1;
  try { return fn(); } finally { trig.depth -= 1; }
}
export function isManualShot(): boolean { return trig.depth > 0; }
/** Apertou: 1º tiro na hora; enquanto segurar, o relógio (tickTrigger) dispara de novo. */
export function pressTrigger(fire: () => void): void { trig.held = true; trig.fire = fire; manualShot(fire); }
/** Soltou (ou pausou/trocou de tela/perdeu o foco). */
export function releaseTrigger(): void { trig.held = false; trig.fire = null; }
export function triggerHeld(): boolean { return trig.held; }
/** Por quadro: segurando e `due()` (fuzil na mão e a cadência venceu) → mais um tiro do jogador. */
export function tickTrigger(due: () => boolean): void {
  if (trig.held && trig.fire && due()) manualShot(trig.fire);
}
/** O automático vale pra este item? (só o que faz rajada: o fuzil) */
export function autoFireItem(itemId: string | null): boolean { return !!itemId && BURST_ITEMS.has(itemId); }

/**
 * BOOST FIRE (Pedro 25/10: "pra tiro talvez um boost fire"): poder com recarga — por 4 s pistola e rifle atiram 2×
 * mais rápido (rajada e pausa também). Desbloqueia no nv 25 (depois do Raio); recarga 30 s → 15 s (nv 1 → nv 200).
 * Tecla T, botão no rodapé e no arco do celular; o piloto usa sozinho com arma de fogo e hostil no alcance.
 */
export const BOOST_UNLOCK_LEVEL = 25;
export const BOOST_DURATION_MS = 4000;
export const BOOST_RATE = 2;
export const BOOST_ITEMS = new Set(['pistol', 'rifle']);
export function boostCooldown(level: number): number {
  const t = Math.min(1, Math.max(0, (level - 1) / 199));
  return Math.round((30 - 15 * t) * 10) / 10;
}
export function boostScale(itemId: string | null, nowMs: number, until: number): number {
  return itemId && BOOST_ITEMS.has(itemId) && nowMs < until ? 1 / BOOST_RATE : 1;
}

/** Rajada em curso (fora do React; um atirador local). `fire` devolve false = parou (alvo morreu, sem bala, trocou). */
type Pending = { left: number; nextAt: number; gapMs: number; fire: () => boolean };
let pending: Pending | null = null;

export function startBurst(size: number, fire: () => boolean, nowMs = Date.now(), gapS = BURST_GAP): void {
  pending = size > 1 ? { left: size - 1, nextAt: nowMs + gapS * 1000, gapMs: gapS * 1000, fire } : null;
}
export function burstActive(): boolean { return pending !== null; }
export function cancelBurst(): void { pending = null; }
/** Chamado por quadro (pausado = não chama). Dispara no máximo 1 tiro por chamada. */
export function tickBurst(nowMs = Date.now()): void {
  const p = pending;
  if (!p || nowMs < p.nextAt) return;
  const ok = p.fire();
  p.left -= 1;
  if (!ok || p.left <= 0) { if (pending === p) pending = null; return; }
  p.nextAt = Math.max(p.nextAt + p.gapMs, nowMs);
}
