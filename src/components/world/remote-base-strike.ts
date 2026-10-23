/**
 * Golpe numa peça da base de OUTRO jogador (PvP fatia 4). Usado pelo clique (muro/porta/telhado/
 * TORRE da base remota) e pela mira em 3ª pessoa. Só com inimizade; aliado = só a ficha.
 * Sem 3D aqui: a mira carrega antes do login e não pode puxar modelo.
 */
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { broadcastBaseHit, useNet } from '@/net/multiplayer';
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
