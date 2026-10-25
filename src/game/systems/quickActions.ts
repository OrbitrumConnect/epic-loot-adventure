/**
 * Regras puras das CARTAS de um toque (Pedro 25/10): escolher atributo ao subir de nível, distribuir automático e
 * "upar" prédio da cidade sem abrir a cidade. Testáveis, sem tela.
 */
import type { PlayerAttributes } from '../types/player';
import type { BaseState } from '../types/base';
import { SKILL_CAP_PER_ATTR } from './attributesSystem';
import { getUpgradeBlockReason, getUpgradeCost } from './baseSystem';
import { BUILDINGS } from '../data/buildings';

export const ATTR_LABEL: Record<keyof PlayerAttributes, string> = {
  damage: 'Dano', dexterity: 'Destreza', carry: 'Capacidade', moveSpeed: 'Velocidade',
};
export const ATTR_HINT: Record<keyof PlayerAttributes, string> = {
  damage: 'golpes e tiros mais fortes', dexterity: 'poderes e especiais mais rápidos',
  carry: 'bolsa aguenta mais peso', moveSpeed: 'anda e corre mais rápido',
};
const ATTRS: (keyof PlayerAttributes)[] = ['damage', 'dexterity', 'carry', 'moveSpeed'];

/** 3 atributos pra escolher (só os que ainda não bateram no teto). */
export function attributeChoices(attrs: PlayerAttributes, rng: () => number = Math.random): (keyof PlayerAttributes)[] {
  const open = ATTRS.filter((a) => (attrs[a] ?? 0) < SKILL_CAP_PER_ATTR);
  for (let i = open.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [open[i], open[j]] = [open[j]!, open[i]!]; }
  return open.slice(0, 3);
}

/** Ordem de gasto do "distribuir automático": sempre no atributo MAIS BAIXO (equilibra), respeitando o teto. */
export function autoDistribute(attrs: PlayerAttributes, points: number): (keyof PlayerAttributes)[] {
  const cur = { ...attrs };
  const out: (keyof PlayerAttributes)[] = [];
  for (let k = 0; k < points; k++) {
    const pick = ATTRS.filter((a) => cur[a] < SKILL_CAP_PER_ATTR).sort((a, b) => cur[a] - cur[b])[0];
    if (!pick) break;
    cur[pick] += 1;
    out.push(pick);
  }
  return out;
}

export type UpgradeSuggestion = { instanceId: string; name: string; from: number; to: number; cost: BaseState['resources'] };

/** Prédios da cidade que dá pra subir AGORA (paga, Salão permite) com construtor livre — os mais baratos primeiro. */
export function upgradeSuggestions(state: BaseState, max = 3): UpgradeSuggestion[] {
  const busy = state.buildings.filter((b) => b.construction && b.construction.startedAt != null).length;
  if (busy >= state.builders) return [];
  const out: (UpgradeSuggestion & { total: number })[] = [];
  for (const b of state.buildings) {
    if (getUpgradeBlockReason(state, b.id)) continue;
    const cost = getUpgradeCost(b.defId, b.level + 1);
    const total = cost.wood + cost.stone + cost.food + cost.essence;
    out.push({ instanceId: b.id, name: BUILDINGS[b.defId].name, from: b.level, to: b.level + 1, cost, total });
  }
  return out.sort((a, b) => a.total - b.total).slice(0, max).map(({ total: _t, ...s }) => s);
}
