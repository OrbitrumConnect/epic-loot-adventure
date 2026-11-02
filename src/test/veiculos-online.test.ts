import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sameSpot, SAME_SPOT_M } from '@/components/zona-sul/zs-remote-vehicles';

/* Pedro 01/11 (online, 2 jogadores): "um no barco, outro na praia — não vejo o barco nem nada, por quê?" e "ver o navio
   dar dano, atacar outro player e ser atacado vai funcionar 100%?". Antes só o BONECO ia pela rede. */
describe('veículos e canhão pela rede', () => {
  it('o navio e o carro vão de carona na pose (sem mensagem nova) e os outros desenham', () => {
    const net = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(net).toMatch(/v\?: NetVehicle\[\];/);
    expect(net).toMatch(/\.\.\.\(vehicles && vehicles\.length \? \{ v: vehicles\.map\(\(v\) => \(\{ \.\.\.v \}\)\) \} : \{\}\)/);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/if \(ship && !warshipGone\(ship\)\) netVehicles\.push\(\{ k: 's'/); // afundado de vez não vai
    expect(zs).toMatch(/if \(car\) netVehicles\.push\(\{ k: 'c'/);
    expect(zs).toMatch(/<ZsRemoteVehicles myShip=\{shipRef\} myCar=\{carRef\} \/>/);
  });
  it('os dois ancorados no MESMO ponto (cada um tem o seu): desenha um só — longe, os dois', () => {
    const a = { x: 10, z: 20, yaw: 1 };
    expect(sameSpot(a, { x: 10.5, z: 20.4, yaw: 1.05 })).toBe(true);
    expect(sameSpot(a, { x: 10 + SAME_SPOT_M + 1, z: 20, yaw: 1 })).toBe(false);
    expect(sameSpot(a, { x: 10, z: 20, yaw: 1.6 })).toBe(false); // mesmo ponto, outro rumo
    expect(sameSpot(null, a)).toBe(false);
  });
  it('salva de canhão vai pela rede: os outros VEEM e OUVEM; o dano é só de quem atirou (não conta 2×)', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toMatch(/broadcastCannon\(salvo\.map/);
    const view = fs.readFileSync('src/components/zona-sul/zs-warship-view.tsx', 'utf8');
    expect(view).toMatch(/if \(!fb\.remote\) \{\s+useGameStore\.getState\(\)\.cannonHit/);
    expect(view).toMatch(/hit: false, remote: true/);
    // a bala bate no CONVÉS do navio de outro jogador (não atravessa o casco)
    expect(zs).toMatch(/for \(const d of remoteDecks\.values\(\)\) \{ const g = shipGround\(d\.c, x, z, 1e6\); if \(g && 'y' in g\) y = Math\.max\(y, g\.y\); \}/);
  });
});
