/**
 * TROPAS NAS ONDAS (etapa 1 — Pedro, 23/10). As tropas treinadas no Campo de Guerra saem da base
 * quando a HORDA começa e lutam ao lado das torres: atacam o hostil mais perto (dentro da área de
 * defesa da base), tomam dano dos bichos colados nelas e, se morrerem, saem da contagem. Acabou a
 * onda → as vivas voltam pra base (seguem na contagem). Lógica pura; a store aplica o dano no bicho
 * pelo MESMO caminho da torre (loot/XP/online) e desenha via `ally-troops.tsx`.
 */
import type { Position } from '../types';

export type TroopUnitId = 'warrior' | 'spearman' | 'archer';
export type TroopStats = { hp: number; dmg: number; range: number; cooldownMs: number; speed: number };

/** Números aprovados pelo Pedro (23/10). Escalam com o nível do Campo de Guerra. */
export const TROOP_STATS: Record<TroopUnitId, TroopStats> = {
  warrior: { hp: 260, dmg: 16, range: 2.5, cooldownMs: 1200, speed: 3.2 },  // linha de frente
  spearman: { hp: 420, dmg: 12, range: 3, cooldownMs: 1400, speed: 2.8 },   // tanque
  archer: { hp: 140, dmg: 18, range: 14, cooldownMs: 1500, speed: 3.2 },    // de longe
};
/** Ordem de saída (tanque na frente). */
export const TROOP_ORDER: TroopUnitId[] = ['spearman', 'warrior', 'archer'];
/** No máximo em campo ao mesmo tempo (leve); o resto é reserva e entra quando uma cai. */
export const TROOP_FIELD_CAP = 12;
/** +8% de vida e dano por nível do Campo de Guerra acima do 1. */
export const WAR_CAMP_BONUS = 0.08;
/** Área que as tropas defendem (a partir do núcleo da base). */
export const TROOP_GUARD_RADIUS = 35;
/** Bicho a até isto da tropa bate nela (contato). */
export const TROOP_CONTACT = 2.2;

export type FieldTroop = {
  id: string;
  unitId: TroopUnitId;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  /** Posto de guarda (volta pra cá quando não há inimigo). */
  postX: number;
  postZ: number;
  lastAttackAt: number;
  action: 'idle' | 'walk' | 'attack';
  yaw: number;
};

export type TroopFoe = {
  id: string;
  position: Position;
  hp: number;
  attackPower: number;
  attackCooldown: number; // s
};

export const isTroopUnit = (id: string): id is TroopUnitId => id in TROOP_STATS;

export function troopScale(warCampLevel: number): number {
  return 1 + WAR_CAMP_BONUS * Math.max(0, warCampLevel - 1);
}

/** Completa o campo até o limite com as tropas da contagem que ainda não saíram. */
export function deployTroops(
  counts: Record<string, number>,
  field: readonly FieldTroop[],
  center: Position,
  warCampLevel: number,
  seq: number,
  /** Meia-largura do terreno da base (m). Os postos ficam FORA da cerca (Pedro, 23/10). */
  fenceHalf = 11,
): { field: FieldTroop[]; seq: number } {
  const out = field.slice();
  const scale = troopScale(warCampLevel);
  let n = seq;
  for (const unitId of TROOP_ORDER) {
    const have = counts[unitId] ?? 0;
    let inField = out.filter((t) => t.unitId === unitId).length;
    while (inField < have && out.length < TROOP_FIELD_CAP) {
      // Postos em anel FORA da cerca: corpo a corpo mais pra fora, arqueiro logo depois do muro.
      const k = out.length;
      const ang = (k / TROOP_FIELD_CAP) * Math.PI * 2;
      const r = fenceHalf + (unitId === 'archer' ? 1.5 : 4);
      // A cerca é QUADRADA: posto no contorno de um quadrado (num círculo, a quina ficaria dentro).
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const edge = Math.max(Math.abs(cos), Math.abs(sin));
      const postX = center.x + (cos / edge) * r;
      const postZ = center.z + (sin / edge) * r;
      const hp = Math.round(TROOP_STATS[unitId].hp * scale);
      out.push({ id: `troop_${n++}`, unitId, hp, maxHp: hp, x: postX, z: postZ, postX, postZ, lastAttackAt: 0, action: 'idle', yaw: 0 });
      inField++;
    }
  }
  return { field: out, seq: n };
}

/**
 * Um passo: cada tropa escolhe o hostil vivo mais perto DENTRO da área de defesa da base, anda até o
 * alcance e golpeia no ritmo dela; bichos colados batem nela (dano contínuo pela cadência do bicho).
 * Devolve os golpes (pra store aplicar como a torre) e as tropas que caíram.
 */
export function stepTroops(
  field: readonly FieldTroop[],
  foes: readonly TroopFoe[],
  center: Position,
  warCampLevel: number,
  dt: number,
  now: number,
): { field: FieldTroop[]; hits: { creatureId: string; damage: number }[]; dead: FieldTroop[] } {
  const scale = troopScale(warCampLevel);
  const alive = foes.filter((f) => f.hp > 0 && Math.hypot(f.position.x - center.x, f.position.z - center.z) <= TROOP_GUARD_RADIUS);
  const hits: { creatureId: string; damage: number }[] = [];
  const dead: FieldTroop[] = [];
  const next: FieldTroop[] = [];
  for (const t0 of field) {
    const t = { ...t0 };
    const s = TROOP_STATS[t.unitId];
    // Dano recebido: bichos colados (cada um no seu ritmo).
    for (const f of alive) {
      if (Math.hypot(f.position.x - t.x, f.position.z - t.z) <= TROOP_CONTACT) {
        t.hp -= (f.attackPower * dt) / Math.max(0.3, f.attackCooldown);
      }
    }
    if (t.hp <= 0) { dead.push({ ...t, hp: 0 }); continue; }
    // Alvo: o hostil mais perto da tropa.
    let target: TroopFoe | null = null;
    let best = Infinity;
    for (const f of alive) {
      const d = Math.hypot(f.position.x - t.x, f.position.z - t.z);
      if (d < best) { best = d; target = f; }
    }
    const goTo = (x: number, z: number, stopAt: number) => {
      const dx = x - t.x, dz = z - t.z;
      const d = Math.hypot(dx, dz);
      if (d <= stopAt) return false;
      const step = Math.min(s.speed * dt, d - stopAt);
      t.x += (dx / d) * step;
      t.z += (dz / d) * step;
      t.yaw = Math.atan2(dx, dz);
      return true;
    };
    if (target) {
      if (best > s.range) {
        goTo(target.position.x, target.position.z, s.range * 0.9);
        t.action = 'walk';
      } else {
        t.yaw = Math.atan2(target.position.x - t.x, target.position.z - t.z);
        if (now - t.lastAttackAt >= s.cooldownMs) {
          t.lastAttackAt = now;
          hits.push({ creatureId: target.id, damage: Math.round(s.dmg * scale) });
          t.action = 'attack';
        } else if (t.action !== 'attack' || now - t.lastAttackAt > 450) {
          t.action = 'idle';
        }
      }
    } else {
      t.action = goTo(t.postX, t.postZ, 0.4) ? 'walk' : 'idle';
    }
    next.push(t);
  }
  return { field: next, hits, dead };
}
