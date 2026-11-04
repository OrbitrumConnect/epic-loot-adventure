/**
 * ESQUADRA PIRATA — o que acontece quando uma bala cai (03/11). Separado da lógica pura (`zs-enemy-fleet`) e do desenho:
 * aqui mexe no jogo (vida do seu navio, do herói, do navio inimigo, loot, mensagens). Quem chama: o laço das balas
 * (`zs-warship-view`, onde todas as balas — minhas, de outro jogador e da esquadra — caem).
 * ONLINE (03/11): só o anfitrião aplica a bala da esquadra — no navio/herói dele aqui, no dos outros pelo ship-hit (pirata)
 * e mob-hit; a minha bala num navio pirata, se sou convidado, vai pro anfitrião (fleet-hit); o loot é de quem afundou.
 */
import { useGameStore } from '@/game/state/game-store';
import { hurtPlayerBy } from '@/components/world/hostile-ai';
import { addItem, canAddItem } from '@/game/systems/inventorySystem';
import { broadcastFleetReward, broadcastMobHit, broadcastPirateShipHit, useNet } from '@/net/multiplayer';
import { damageWarship, nearWarshipHull, WARSHIP, type ZsWarship } from './zs-warship';
import { FLEET, zsFleet, type EnemyShip } from './zs-enemy-fleet';
import { KRAKEN_BOSS } from './zs-kraken-boss';

let lastShipMsg = 0;
/** Bala da ESQUADRA caiu em `land`: no SEU navio (casco) tira vida dele; perto de VOCÊ (água/convés) tira a sua. Sendo
 *  anfitrião, também no navio/no herói de quem está na sala (eles aplicam). */
export function enemyBallLanded(land: { x: number; z: number }, myShip: ZsWarship | null, hero: { x: number; z: number }, halfBeam: number, src: 'pirata' | 'kraken' = 'pirata'): void {
  // (04/11) a PEDRA do Kraken das Cagarras cai pelo mesmo caminho, com o dano e a mensagem dela
  const kr = src === 'kraken', shipDmg = kr ? KRAKEN_BOSS.ROCK_DMG : FLEET.BALL_DMG, heroDmg = kr ? KRAKEN_BOSS.ROCK_HERO_DMG : FLEET.HERO_DMG;
  const who = kr ? 'Pedra do Kraken' : 'Canhão pirata';
  if (myShip && myShip.sinkT === null && nearWarshipHull(myShip, land.x, land.z, halfBeam, 0.8)) {
    const sank = damageWarship(myShip, shipDmg);
    const now = Date.now();
    if (sank) useGameStore.getState().setMessage(kr ? '🔥 Seu navio AFUNDOU — o Kraken das Cagarras! Construa outro na âncora ou no card da base.' : '🔥 Seu navio AFUNDOU — esquadra pirata! Construa outro na âncora ou no card da base.');
    else if (now - lastShipMsg > 2500) { lastShipMsg = now; useGameStore.getState().setMessage(`${kr ? '🪨 Pedra do Kraken' : '💥 Canhão pirata'} no seu navio! (${Math.round(myShip.hp / 1000)} mil / ${WARSHIP.HP / 1000} mil)`); }
  }
  if (Math.hypot(hero.x - land.x, hero.z - land.z) <= WARSHIP.SPLASH_R) {
    hurtPlayerBy(who, heroDmg, land, (dmg, hp, max) => `${kr ? '🪨 Pedra do Kraken' : '💥 Bala de canhão pirata'}! -${dmg} HP (${hp}/${max})`);
  }
  // ONLINE (anfitrião): o navio e o corpo dos OUTROS jogadores
  const net = useNet.getState();
  if (!net.connected || !net.isHost) return;
  for (const r of Object.values(net.players)) {
    for (const v of r.v ?? []) {
      if (v.k === 's' && (v.h ?? 1) > 0 && nearWarshipHull(v, land.x, land.z, halfBeam, 0.8)) broadcastPirateShipHit(r.id, shipDmg);
    }
    if (r.hp > 0 && Math.hypot(r.x - land.x, r.z - land.z) <= WARSHIP.SPLASH_R) broadcastMobHit(r.id, heroDmg, who);
  }
}

/** A esquadra passa a caçar `who` (quem atirou nela). */
export function fleetProvoked(who: string): void {
  const F = zsFleet;
  if (F.targetId === who) { F.lostSince = null; return; }
  F.targetId = who; F.lostSince = null; F.huntSince = null;
  if (who === (useNet.getState().selfId || 'eu')) useGameStore.getState().setMessage('🏴‍☠️ Você atacou a esquadra pirata — ela vem atrás de você!');
}
/** O loot de UM navio afundado (pra quem afundou). */
export function grantFleetLoot(left: number): void {
  const gs = useGameStore.getState();
  let inv = gs.player.inventory;
  const got: string[] = [];
  for (const it of FLEET.LOOT.items) if (canAddItem(inv, it.id, it.n)) { inv = addItem(inv, it.id, it.n); got.push(`+${it.n} ${it.id === 'iron_ore' ? 'ferro' : 'madeira'}`); }
  useGameStore.setState((st) => ({
    player: { ...st.player, gold: st.player.gold + FLEET.LOOT.gold, inventory: inv },
    ui: { ...st.ui, message: `⚓ Navio pirata afundado! +${FLEET.LOOT.gold} ouro${got.length ? ', ' + got.join(', ') : ''}${left > 0 ? ` — faltam ${left}` : left === 0 ? ' — esquadra derrotada!' : ''}` },
  }));
}

/** Bala/tiro num navio da esquadra (quem simula aplica): tira vida; afundou = capitão e tripulação vão junto e o loot vai
 *  pra quem afundou (`byId` = outro jogador da sala → por evento; ausente/eu = aqui). Devolve se afundou agora. */
export function fleetShipHit(s: EnemyShip, dmg: number, byId?: string): boolean {
  // (04/11, Pedro: "ataquei de longe um navio inimigo — ele deve vir atrás de mim") levou tiro = a esquadra caça QUEM
  // ATIROU, mesmo além dos 300 m de vista ("quem me bate" manda; o alvo tem que estar a bordo — quem atira de canhão está)
  if (s.sinkT === null) fleetProvoked(byId || useNet.getState().selfId || 'eu');
  if (!damageWarship(s, dmg)) return false;
  const left = zsFleet.ships.filter((o) => o.sinkT === null).length;
  useGameStore.setState((st) => ({ creatures: st.creatures.filter((c) => c.id !== s.pilotId && !s.crewIds.includes(c.id)) })); // afundam junto
  if (!s.rewarded) {
    s.rewarded = true;
    const me = useNet.getState().selfId;
    if (!byId || byId === me) grantFleetLoot(left);
    else { broadcastFleetReward(byId); useGameStore.getState().setMessage(`⚓ Um navio pirata afundou!${left ? ` — faltam ${left}` : ' — esquadra derrotada!'}`); }
  }
  return true;
}
