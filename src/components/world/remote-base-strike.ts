/**
 * Golpe numa peça da base de OUTRO jogador (PvP fatia 4). Usado pelo clique (muro/porta/telhado/
 * TORRE da base remota) e pela mira em 3ª pessoa. Só com inimizade; aliado = só a ficha.
 * Sem 3D aqui: a mira carrega antes do login e não pode puxar modelo.
 */
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { broadcastBaseHit, broadcastTroopHit, useNet } from '@/net/multiplayer';
import { pvpStrike } from './pvp-attack';

/** Peça remota que bloqueia/apanha (muro, torre, porta). Telhado/centro também apanham no clique. */
export const STRIKABLE_REMOTE = new Set(['wall', 'tower', 'gate']);

export function isHostileBaseOwner(ownerId: string): boolean {
  const net = useNet.getState();
  return net.players[ownerId]?.side === 'enemy' || net.selfSide === 'enemy';
}

/** true = golpe saiu (alcance/cadência/munição da arma na mão). */
export function strikeRemotePiece(ownerId: string, pieceId: string): boolean {
  const net = useNet.getState();
  const ownerName = net.players[ownerId]?.name ?? 'Viajante';
  const piece = net.bases[ownerId]?.pieces.find((p) => p.id === pieceId);
  if (!piece) return false;
  if (!isHostileBaseOwner(ownerId)) {
    useGameStore.getState().setMessage(`Base de ${ownerName} (aliado) · ${piece.hp}/${piece.maxHp} PV.`);
    return false;
  }
  const ctr = cellCenter(piece.cell);
  const what = piece.kind === 'tower' ? 'a torre' : 'a base';
  if (pvpStrike(`${what === 'a torre' ? 'A torre' : 'A base'} de ${ownerName}`, ctr.x, ctr.z, 1.5, (raw) => broadcastBaseHit(ownerId, pieceId, raw))) {
    useGameStore.getState().setMessage(`🏹 Você atacou ${what} de ${ownerName}!`);
    return true;
  }
  return false;
}

/** RAID: golpe numa TROPA de jogador inimigo (clique/mira) — alcance/cadência/munição da arma na mão;
 *  o DONO da tropa aplica o dano (`troop-hit`). true = golpe saiu. */
export function strikeRemoteTroop(ownerId: string, troopId: string): boolean {
  if (!isHostileBaseOwner(ownerId)) return false;
  const t = useNet.getState().troops[ownerId]?.find((x) => x.i === troopId);
  if (!t || t.h <= 0) return false;
  const ownerName = useNet.getState().players[ownerId]?.name ?? 'Viajante';
  if (pvpStrike(`Tropa de ${ownerName}`, t.x, t.z, 0.6, (raw) => broadcastTroopHit(ownerId, troopId, raw))) {
    useGameStore.getState().setMessage(`⚔️ Você atacou uma tropa de ${ownerName}!`);
    return true;
  }
  return false;
}
