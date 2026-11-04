/**
 * ESQUADRA PIRATA — o que acontece quando uma bala cai (03/11). Separado da lógica pura (`zs-enemy-fleet`) e do desenho:
 * aqui mexe no jogo (vida do seu navio, do herói, do navio inimigo, loot, mensagens). Quem chama: o laço das balas
 * (`zs-warship-view`, onde todas as balas — minhas, de outro jogador e da esquadra — caem).
 */
import { useGameStore } from '@/game/state/game-store';
import { hurtPlayerBy } from '@/components/world/hostile-ai';
import { addItem, canAddItem } from '@/game/systems/inventorySystem';
import { damageWarship, nearWarshipHull, WARSHIP, type ZsWarship } from './zs-warship';
import { FLEET, zsFleet, type EnemyShip } from './zs-enemy-fleet';

let lastShipMsg = 0;
/** Bala da ESQUADRA caiu em `land`: no SEU navio (casco) tira vida dele; perto de VOCÊ (água/convés) tira a sua. */
export function enemyBallLanded(land: { x: number; z: number }, myShip: ZsWarship | null, hero: { x: number; z: number }, halfBeam: number): void {
  if (myShip && myShip.sinkT === null && nearWarshipHull(myShip, land.x, land.z, halfBeam, 0.8)) {
    const sank = damageWarship(myShip, FLEET.BALL_DMG);
    const now = Date.now();
    if (sank) useGameStore.getState().setMessage('🔥 Seu navio AFUNDOU — esquadra pirata! Construa outro na âncora ou no card da base.');
    else if (now - lastShipMsg > 2500) { lastShipMsg = now; useGameStore.getState().setMessage(`💥 Canhão pirata no seu navio! (${Math.round(myShip.hp / 1000)} mil / ${WARSHIP.HP / 1000} mil)`); }
  }
  if (Math.hypot(hero.x - land.x, hero.z - land.z) <= WARSHIP.SPLASH_R) {
    hurtPlayerBy('Canhão pirata', FLEET.HERO_DMG, land, (dmg, hp, max) => `💥 Bala de canhão pirata! -${dmg} HP (${hp}/${max})`);
  }
}

/** Minha bala acertou o casco de um navio da esquadra: tira vida; afundou = loot na bolsa e o capitão vai junto. */
export function fleetShipHit(s: EnemyShip, dmg: number): void {
  if (!damageWarship(s, dmg)) return;
  const gs = useGameStore.getState();
  let inv = gs.player.inventory;
  const got: string[] = [];
  if (!s.rewarded) {
    s.rewarded = true;
    for (const it of FLEET.LOOT.items) if (canAddItem(inv, it.id, it.n)) { inv = addItem(inv, it.id, it.n); got.push(`+${it.n} ${it.id === 'iron_ore' ? 'ferro' : 'madeira'}`); }
  }
  const left = zsFleet.ships.filter((o) => o.sinkT === null).length;
  useGameStore.setState((st) => ({
    player: { ...st.player, gold: st.player.gold + FLEET.LOOT.gold, inventory: inv },
    creatures: st.creatures.filter((c) => c.id !== s.pilotId && !s.crewIds.includes(c.id)), // capitão e tripulação afundam junto
    ui: { ...st.ui, message: `⚓ Navio pirata afundado! +${FLEET.LOOT.gold} ouro${got.length ? ', ' + got.join(', ') : ''}${left ? ` — faltam ${left}` : ' — esquadra derrotada!'}` },
  }));
}
