/**
 * Golpe PvP do jogador LOCAL (em outro jogador ou na base de um inimigo). Regras iguais ao
 * ataque normal: CADÊNCIA da arma (acaba o spam de clique), ALCANCE da arma, arma de longe
 * gasta munição/flecha. Manda o dano BRUTO; quem recebe aplica as regras do PvP justo
 * (`pvpSystem`). Dispara a animação de ataque do herói.
 */
import { useGameStore } from '@/game/state/game-store';
import { weaponFor, weaponRangeFor } from '@/game/data/weapons';
import { damageMultiplier } from '@/game/systems/attributesSystem';
import { playerBaseAttack } from '@/game/systems/progressionSystem';
import { getItemCount, removeItem } from '@/game/systems/inventorySystem';
import { ITEMS } from '@/game/data/items';
import { selectedItemId } from './held-weapon';

/** Tenta golpear um alvo em (tx,tz). `extraRange` folga pro tamanho do alvo. true = golpe saiu. */
export function pvpStrike(targetName: string, tx: number, tz: number, extraRange: number, send: (raw: number) => void): boolean {
  const store = useGameStore.getState();
  const me = store.player;
  if (me.dead) return false;
  const heldId = selectedItemId(store);
  const prof = weaponFor(heldId);
  const now = Date.now() / 1000;
  if (now - me.lastAttackAt < prof.cooldown) return false; // cadência da arma (sem spam)
  const range = weaponRangeFor(heldId, me.level);
  const dist = Math.hypot(me.position.x - tx, me.position.z - tz);
  if (dist > range + extraRange) { store.setMessage(`${targetName} está longe demais (${range.toFixed(1)}m).`); return false; }
  const ammoItem = prof.ranged ? (prof.projectile === 'bullet' ? 'ammo' : 'arrow') : null;
  if (ammoItem && getItemCount(me.inventory, ammoItem) <= 0) {
    store.setMessage(ammoItem === 'ammo' ? 'Sem munição!' : 'Sem flechas!');
    return false;
  }
  const raw = Math.max(1, Math.round((playerBaseAttack(me.level) + (heldId ? (ITEMS[heldId]?.attackPower ?? 0) : 0)) * damageMultiplier(me)));
  useGameStore.setState((s) => ({
    player: { ...s.player, lastAttackAt: now, inventory: ammoItem ? removeItem(s.player.inventory, ammoItem, 1) : s.player.inventory },
    attackTick: s.attackTick + 1,
  }));
  send(raw);
  return true;
}
