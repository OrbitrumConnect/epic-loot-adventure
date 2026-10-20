/**
 * Decisão de COMBATE do piloto automático (camada pura, sem React nem store).
 *
 * O laço de quadro em `auto-pilot.tsx` chama esta função a cada tick quando a
 * intenção é `attack`. Ela resolve, a partir da distância ao alvo e das armas
 * da hotbar, UMA ação: trocar de arma, atacar (normal/especial), esperar o
 * cooldown ou aproximar. A escolha da arma delega a `pickWeaponFor` — fonte
 * única de verdade compartilhada com o store (`buildAutoSnapshot`).
 *
 * Por que trocar ANTES de atacar: a arma certa é eleita pela distância, mas o
 * `reach` que decide "atacar daqui" vs "andar" é SEMPRE o alcance da arma na
 * MÃO — nunca o alcance máximo da hotbar. Senão o piloto "atiraria" de 12 m com
 * a espada na mão e não acertava nada. Depois de trocar, o ataque só acontece no
 * tick SEGUINTE, já com a arma certa empunhada (o snapshot reflete a troca).
 */
import type { Position } from '@/game/types';
import { pickWeaponFor, type AutoWeapon, type PilotWeaponStyle } from '@/game/systems/weaponChoiceSystem';
import type { AutoIntent } from '@/game/types/objective';

export type PilotAttackDecision =
  | { action: 'switch'; hotbarIndex: number }
  | { action: 'special' }
  | { action: 'attack' }
  | { action: 'wait' }
  | { action: 'approach' }
  /** Kiting (estilo 'ranged'): recuar para a faixa de tiro. */
  | { action: 'retreat' };

export type PilotAttackInput = {
  /** Distância planar (m) até o alvo. */
  dist: number;
  /** Armas usáveis da hotbar (já com `hasAmmo`), igual ao snapshot. */
  weapons: AutoWeapon[];
  /** Índice da hotbar da arma na MÃO agora. */
  heldHotbarIndex: number;
  /** Alcance (m) da arma na mão. */
  heldRange: number;
  /** A arma na mão é corpo a corpo? (especial `spin` só vale pra melee). */
  heldIsMelee: boolean;
  /** Cadência da arma na mão em ms (cooldown do perfil × 1000). */
  heldCooldownMs: number;
  /** `Date.now()` do tick. */
  now: number;
  /** Último instante (ms) em que trocou de arma. */
  lastWeaponSwitch: number;
  /** Último instante (ms) em que atacou. */
  lastAttack: number;
  /** Debounce da troca de arma (ms) pra não oscilar a cada tick. */
  switchDebounceMs: number;
  /** Ataque especial disponível (cooldown do especial já cumprido). */
  specialReady: boolean;
  /**
   * O piloto já estava EM POSIÇÃO DE TIRO (parado atirando/esperando) no tick
   * anterior? Liga a banda morta: uma vez parado no alcance, só volta a andar
   * quando o alvo escapa do alcance REAL da arma (`reach + REENGAGE_MARGIN`).
   * Ausente = `false` (sem banda morta → comportamento antigo dos testes).
   */
  engaged?: boolean;
  /** Preferência de arma do jogador (HUD). Ausente = 'auto'. */
  style?: PilotWeaponStyle | undefined;
  /**
   * O piloto estava RECUANDO (kiting) no tick anterior? Liga a histerese do
   * kiting: uma vez recuando, só para ao chegar em `KITE_STOP_FRACTION`.
   */
  kiting?: boolean;
  /**
   * O recuo EMPACOU contra um bicho rápido demais? Quando o alvo é tão veloz
   * quanto o piloto (ou mais), recuar não abre distância — a distância encolhe
   * tick após tick e o kiting degeneraria em "recua pra sempre sem atirar".
   * O laço de quadro (`auto-pilot.tsx`) mede esse travamento e, ao confirmá-lo,
   * passa `true`: aqui o piloto DESISTE do recuo e luta (atira parado no ritmo
   * da arma) em vez de fugir eternamente. Ausente/false = kiting normal.
   */
  kiteStalled?: boolean;
};

/** Margem subtraída do alcance pra o tiro nascer dentro do alcance real da arma. */
const REACH_MARGIN = 0.4;

/** Alcance de TIRO da arma na mão (alcance real menos a margem), mínimo 1 m. */
export function firingReach(heldRange: number): number {
  return Math.max(1, heldRange - REACH_MARGIN);
}

/**
 * Banda morta do movimento de combate. O piloto PARA de aproximar ao chegar no
 * ponto de tiro (`reach = heldRange - REACH_MARGIN`) e só volta a ANDAR quando o
 * alvo escapa do alcance REAL da arma (`heldRange`). A janela de parada é, assim,
 * exatamente `REACH_MARGIN` (0,4 m): dentro dela o piloto fica parado atirando —
 * o tiro é válido até `heldRange`, então ele nunca "atira de longe demais". Sem
 * essa banda, um bicho oscilando ~0,4 m na borda do alcance fazia o piloto
 * andar/parar a cada tick (0,25 s) — o "vai-e-vem" reclamado pelo dono.
 */
export const REENGAGE_MARGIN = REACH_MARGIN;

/**
 * Ao se aproximar, o piloto mira um ponto a `reach * STANDOFF_FACTOR` do alvo
 * (não a posição do alvo). Assim PARA dentro do alcance de tiro em vez de colar
 * no bicho: com arma de longe, atira à distância; e a inércia do sprint (~1 m)
 * não o joga pra dentro do corpo-a-corpo. 0.85 deixa margem pro overshoot.
 */
export const STANDOFF_FACTOR = 0.85;

/**
 * Ponto de parada da aproximação: na reta de `from` até `target`, a
 * `reach * STANDOFF_FACTOR` metros do alvo. Se já está mais perto que isso,
 * devolve a própria posição (nada a andar). Puro e determinístico.
 */
export function approachStandoff(
  from: Position, target: Position, reach: number,
): Position {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const standoff = reach * STANDOFF_FACTOR;
  if (d <= standoff || d === 0) return { x: from.x, z: from.z };
  // Caminha (d - standoff) metros em direção ao alvo e para lá.
  const t = (d - standoff) / d;
  return { x: from.x + dx * t, z: from.z + dz * t };
}

/**
 * Kiting do estilo 'ranged' (frações do alcance de tiro `firingReach`):
 *  - TRIGGER 0.4: abaixo disso o bicho está "em cima" (rifle 11.6 m → 4.6 m;
 *    arco 7.6 m → 3 m, ~= MELEE_PREF_RANGE) e o piloto recua;
 *  - STOP 0.6: recuando, só para ao passar de 0.6 (histerese de 0.2 do alcance
 *    — sem ela, parar em 0.41 e re-disparar em 0.39 alternaria a cada tick);
 *  - DEST 0.7: ponto-alvo do recuo, entre STOP e STANDOFF_FACTOR (0.85), logo
 *    DENTRO da faixa de tiro: nunca dispara 'approach' (que só ocorre > reach),
 *    então recuo e aproximação não se alternam.
 * Só vale com estilo 'ranged' E arma à distância na mão; 'auto'/'melee' intactos.
 */
export const KITE_TRIGGER_FRACTION = 0.4;
export const KITE_STOP_FRACTION = 0.6;
export const KITE_DEST_FRACTION = 0.7;

/** Ponto de recuo: na reta oposta ao alvo, a `reach * KITE_DEST_FRACTION` dele. */
export function kiteRetreatPoint(
  from: Position, target: Position, reach: number,
): Position {
  let dx = from.x - target.x;
  let dz = from.z - target.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d === 0) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  const r = reach * KITE_DEST_FRACTION;
  return { x: target.x + dx * r, z: target.z + dz * r };
}

/**
 * Chave de conteúdo do intent: o que a histerese de `decideIntent` lê
 * (kind + alvo). Posições/razões mudam todo tick e NÃO entram.
 */
export function intentKey(intent: AutoIntent | null): string {
  if (intent == null) return 'null';
  if (intent.kind === 'attack') return `attack:${intent.creatureId}`;
  if (intent.kind === 'gather') return `gather:${intent.nodeId}`;
  return intent.kind;
}

/**
 * Devolve um gravador que só chama `record` quando o intent MUDA de conteúdo.
 * `recordPilotIntent` compara por identidade e o intent é objeto novo a cada
 * tick (0,25 s): sem este filtro cada tick faria `set()` e re-render.
 */
export function createIntentRecorder(
  record: (intent: AutoIntent | null) => void,
): (intent: AutoIntent | null) => void {
  let last: string | undefined;
  return (intent) => {
    const key = intentKey(intent);
    if (key === last) return;
    last = key;
    record(intent);
  };
}

export function decidePilotAttack(input: PilotAttackInput): PilotAttackDecision {
  const {
    dist, weapons, heldHotbarIndex, heldRange, heldIsMelee, heldCooldownMs,
    now, lastWeaponSwitch, lastAttack, switchDebounceMs, specialReady,
    engaged = false, style = 'auto', kiting = false, kiteStalled = false,
  } = input;

  // Arma eleita pela distância (fonte única: módulo puro).
  const pick = pickWeaponFor(dist, weapons, style);
  // Nenhuma arma usável (ex.: só bala sem munição): segura posição, não spamma store.attack().
  if (pick == null) return { action: 'wait' };
  const wantSwitch = pick != null && pick.hotbarIndex !== heldHotbarIndex;

  // Troca ANTES de andar/atacar, respeitando o debounce. Trocou → não ataca
  // neste tick: o ataque sai no próximo, já com a arma certa na mão.
  if (wantSwitch && now - lastWeaponSwitch > switchDebounceMs) {
    return { action: 'switch', hotbarIndex: pick!.hotbarIndex };
  }

  // Reach SEMPRE o da arma na mão (não o máximo da hotbar).
  const reach = firingReach(heldRange);
  // Banda morta: já parado no alcance, só volta a andar quando o alvo sai do
  // alcance REAL da arma (reach + REENGAGE_MARGIN = heldRange). Andando (não
  // engajado), fecha até reach. Mata o vai-e-vem na borda sem atirar de longe.
  // Kiting: estilo 'ranged' + arma à distância na mão + bicho em cima → recua
  // para a faixa de tiro (com histerese; ver KITE_*). Nunca com melee na mão.
  // `kiteStalled`: o recuo não abre distância (bicho >= velocidade do piloto) —
  // desiste de fugir e atira parado, senão "recua pra sempre sem atirar".
  if (style === 'ranged' && !heldIsMelee && !kiteStalled) {
    const kiteLimit = reach * (kiting ? KITE_STOP_FRACTION : KITE_TRIGGER_FRACTION);
    if (dist < kiteLimit) return { action: 'retreat' };
  }
  const resumeThreshold = engaged ? reach + REENGAGE_MARGIN : reach;
  if (dist > resumeThreshold) return { action: 'approach' };

  // Dentro do alcance: especial só com melee na mão; senão ataque normal no
  // ritmo do cooldown da arma na mão.
  if (specialReady && heldIsMelee) return { action: 'special' };
  if (now - lastAttack > heldCooldownMs) return { action: 'attack' };
  return { action: 'wait' };
}
