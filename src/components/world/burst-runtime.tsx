import { useFrame } from '@react-three/fiber';
import { autoFireItem, autoGapS, boostScale, cancelBurst, releaseTrigger, tickBurst, tickTrigger } from '@/game/systems/burstSystem';
import { getItemCount } from '@/game/systems/inventorySystem';
import { useGameStore } from '@/game/state/game-store';

/** GATILHO SEGURADO (03/11): fuzil na mão, vivo, com bala e a cadência vencida → mais um tiro do jogador. Sem bala:
 *  solta o gatilho e avisa 1× (o tiro de antes já gastou a última). Pistola/arco/espada: segurar não repete. */
function autoDue(): boolean {
  const st = useGameStore.getState();
  const slot = st.player.inventory.hotbar.slots[st.ui.selectedHotbar];
  const id = slot != null ? st.player.inventory.slots[slot]?.itemId ?? null : null;
  if (st.player.dead || !autoFireItem(id)) return false;
  if (getItemCount(st.player.inventory, 'ammo') <= 0) { releaseTrigger(); st.setMessage('Sem munição!'); return false; }
  return Date.now() / 1000 - st.player.lastAttackAt >= autoGapS(boostScale(id, Date.now(), st.boostFireUntil));
}

/** Solta os tiros seguintes da RAJADA do rifle (burstSystem) e o AUTOMÁTICO do gatilho segurado no relógio do jogo;
 *  pausar/abrir painel corta a rajada e solta o gatilho (o "soltou" pode não chegar com a tela por cima). */
export function BurstRuntime({ paused }: { paused: boolean }) {
  useFrame(() => {
    if (paused) { cancelBurst(); releaseTrigger(); return; }
    tickBurst();
    tickTrigger(autoDue);
  });
  return null;
}
