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
import { pickWeaponFor, type AutoWeapon } from '@/game/systems/weaponChoiceSystem';

export type PilotAttackDecision =
  | { action: 'switch'; hotbarIndex: number }
  | { action: 'special' }
  | { action: 'attack' }
  | { action: 'wait' }
  | { action: 'approach' };

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
};

/** Margem subtraída do alcance pra o tiro nascer dentro do alcance real da arma. */
const REACH_MARGIN = 0.4;

export function decidePilotAttack(input: PilotAttackInput): PilotAttackDecision {
  const {
    dist, weapons, heldHotbarIndex, heldRange, heldIsMelee, heldCooldownMs,
    now, lastWeaponSwitch, lastAttack, switchDebounceMs, specialReady,
  } = input;

  // Arma eleita pela distância (fonte única: módulo puro).
  const pick = pickWeaponFor(dist, weapons);
  // Nenhuma arma usável (ex.: só bala sem munição): segura posição, não spamma store.attack().
  if (pick == null) return { action: 'wait' };
  const wantSwitch = pick != null && pick.hotbarIndex !== heldHotbarIndex;

  // Troca ANTES de andar/atacar, respeitando o debounce. Trocou → não ataca
  // neste tick: o ataque sai no próximo, já com a arma certa na mão.
  if (wantSwitch && now - lastWeaponSwitch > switchDebounceMs) {
    return { action: 'switch', hotbarIndex: pick!.hotbarIndex };
  }

  // Reach SEMPRE o da arma na mão (não o máximo da hotbar).
  const reach = Math.max(1, heldRange - REACH_MARGIN);
  if (dist > reach) return { action: 'approach' };

  // Dentro do alcance: especial só com melee na mão; senão ataque normal no
  // ritmo do cooldown da arma na mão.
  if (specialReady && heldIsMelee) return { action: 'special' };
  if (now - lastAttack > heldCooldownMs) return { action: 'attack' };
  return { action: 'wait' };
}
