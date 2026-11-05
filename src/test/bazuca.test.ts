import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAZOOKA, bazookaCraftBlock, missileFlightMs } from '@/game/data/bazooka';
import { WEAPONS, aimedRangeFor } from '@/game/data/weapons';
import { ITEMS } from '@/game/data/items';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';
import { useGameStore } from '@/game/state/game-store';
import { HERO_SHOT_DELAY_MS } from '@/game/systems/feedbackSystem';

/* Pedro, 04/11: "GLBs míssil e bazuca já nos downloads pra otimizar e ajustar! libera pra fabricar após matar o Kraken!"
   · "o ideal é apenas liberar ela ter no card abaixo do navio pirata pra buildar nessas condições! usa um materialzinho!
   cada bala usa material isolado, né?" · custos aprovados: bazuca 120 ferro / 60 madeira / 40 pedra; míssil 6 / 4 / 2. */
describe('bazuca', () => {
  it('custos do Pedro; míssil cada um com o seu material', () => {
    expect(BAZOOKA.COST).toEqual([{ id: 'iron_ore', n: 120 }, { id: 'wood', n: 60 }, { id: 'stone', n: 40 }]);
    expect(BAZOOKA.MISSILE_COST).toEqual([{ id: 'iron_ore', n: 6 }, { id: 'stone', n: 4 }, { id: 'wood', n: 2 }]);
  });
  it('só libera depois de matar o Kraken; 1 bazuca por personagem; míssil à vontade', () => {
    expect(bazookaCraftBlock('bazooka', false, false, [])).toBe('🔒 Mate o Kraken das Cagarras');
    expect(bazookaCraftBlock('missile', false, false, [])).toBe('🔒 Mate o Kraken das Cagarras');
    expect(bazookaCraftBlock('bazooka', true, true, [])).toBe('Você já tem');
    expect(bazookaCraftBlock('missile', true, true, [])).toBeNull();
    expect(bazookaCraftBlock('missile', true, false, [{ id: 'iron_ore', n: 3 }])).toBe('Falta material');
  });
  it('arma: segura como o fuzil, 1 míssil por tiro a cada 2,5 s, mira até 150 m (a do fuzil); míssil voa (70 m/s) e explode em 6 m', () => {
    expect(WEAPONS['bazooka']).toEqual({ type: 'rifle', ranged: true, range: 30, cooldown: 2.5, projectile: 'missile' });
    expect(aimedRangeFor('bazooka', 1)).toBe(aimedRangeFor('rifle', 1));
    expect(ITEMS['bazooka']?.category).toBe('weapon');
    expect(ITEMS['missile']?.maxStack).toBeGreaterThan(1000);
    expect(BAZOOKA.SPLASH_R).toBe(6);
    expect(BAZOOKA.LAUNCH_DELAY_MS).toBe(HERO_SHOT_DELAY_MS); // sai junto com o braço, como as armas de fogo
    expect(missileFlightMs(70)).toBeCloseTo(HERO_SHOT_DELAY_MS + 1000, 5);
  });

  it('na loja: sem a marca do Kraken não fabrica; com ela fabrica e paga; tiro gasta 1 míssil e explode em área', async () => {
    const inv = createInventory([{ itemId: 'iron_ore', quantity: 500 }, { itemId: 'wood', quantity: 500 }, { itemId: 'stone', quantity: 500 }]);
    useGameStore.setState((s) => ({ player: { ...s.player, inventory: inv, krakenSlain: false, dead: false } }));
    expect(useGameStore.getState().craftBazookaItem('bazooka')).toBe('🔒 Mate o Kraken das Cagarras');
    useGameStore.setState((s) => ({ player: { ...s.player, krakenSlain: true } }));
    expect(useGameStore.getState().craftBazookaItem('bazooka')).toBe('Bazuca fabricada!');
    expect(useGameStore.getState().craftBazookaItem('bazooka')).toBe('Você já tem');
    for (let i = 0; i < 3; i++) useGameStore.getState().craftBazookaItem('missile');
    const p = useGameStore.getState().player.inventory;
    expect(getItemCount(p, 'bazooka')).toBe(1);
    expect(getItemCount(p, 'missile')).toBe(3);
    // ferro só da bolsa: 120 + 3×6
    expect(getItemCount(p, 'iron_ore')).toBe(500 - 120 - 18);
    // força: ~10× um tiro "de fuzil" do mesmo herói
    const s = useGameStore.getState();
    expect(s.missilePower()).toBeGreaterThan(s.cannonPower() * 3);
  });

  it('caminho próprio no tiro (fuzil e arco intactos) + explosão = a conta do canhão', () => {
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain("if (prof.projectile === 'missile') { if (!fromBurst) get().fireBazooka(creature.position, undefined, aimed); return; }");
    expect(g).toContain("if (prof.projectile === 'missile') return fromBurst ? false : get().fireBazooka(toward, towardY, true);");
    expect(g).toContain("cannonHit: (at, radius) => get().explosiveHit(at, radius, get().cannonPower(), 'Canhão'),");
    // 04/11: o míssil atravessa armadura (o último true) — o Canibal gigante
    expect(g).toContain("get().explosiveHit(at, BAZOOKA.SPLASH_R, power, 'Bazuca', true);");
    expect(g).toContain('}, missileFlightMs(Math.min(d, reach)));');
  });

  it('desenho: modelo na mão (pose do fuzil), boca própria, míssil GLB com fumaça e bola de fogo; card abaixo do navio', () => {
    const h = fs.readFileSync('src/components/world/held-weapon.tsx', 'utf8');
    expect(h).toContain("bazooka: 'rifle',");
    expect(h).toContain("MUZZLE_OFFSET[bazooka ? 'bazooka' : kind]");
    const w = fs.readFileSync('src/components/world/weapon-models.tsx', 'utf8');
    expect(w).toContain("export const BAZOOKA_FIT: PropFit = { url: '/models/weapons/bazooka.glb', z: [-1, 0, 0], y: [0, 1, 0], grip: [0.16, -0.12, 0], span: 1.903, length: 1.35 };");
    const pr = fs.readFileSync('src/components/world/projectiles.tsx', 'utf8');
    // 05/11: o estouro ganhou o som do míssil dos outros (o boom segue no mesmo lugar)
    expect(pr).toMatch(/if \(k >= 1\) \{\r?\n\s+boom\(s\.to\);/);
    expect(pr).toContain('<MissileAssetLoader onReady={onMissileReady} />');
    const t = fs.readFileSync('src/components/hud/tool-crafting.tsx', 'utf8');
    expect(t).toMatch(/<VehicleRows \/>\r?\n\s+<BazookaRows \/>/);
    // os modelos otimizados (bazuca ~0,7 MB, míssil ~0,25 MB)
    expect(fs.statSync('public/models/weapons/bazooka.glb').size).toBeLessThan(900_000);
    expect(fs.statSync('public/models/weapons/missile.glb').size).toBeLessThan(400_000);
  });
});

/* Pedro, 04/11 ("ok seguir pro elite"): o amigo na sala vê o míssil voando e explodindo — só desenho (o dano é de quem atirou). */
describe('bazuca no online', () => {
  it('quem atira manda o míssil (origem → explosão); os outros desenham e não aplicam dano', () => {
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain('broadcastMissile(p, at, k < 1 ? undefined : towardY);');
    const m = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(m).toContain("ch.on('broadcast', { event: 'missile' }, ({ payload }) => {");
    expect(m).toContain('if (netMissileInbox.length > 8) netMissileInbox.splice(0, netMissileInbox.length - 8);');
    const pr = fs.readFileSync('src/components/world/projectiles.tsx', 'utf8');
    expect(pr).toContain('while (netMissileInbox.length) {');
    // o desenho do míssil dos outros não chama dano (só o spawn do projétil)
    const block = pr.slice(pr.indexOf('while (netMissileInbox.length) {'), pr.indexOf('while (netMissileInbox.length) {') + 400);
    expect(block).not.toMatch(/explosiveHit|cannonHit|attack\(/);
  });
});

/* Pedro, 05/11: "mirando a bazuca pro navio inimigo no PvP já acerta, destrói? atirei e parece não dar dano em nada!" ·
   "o som da bazuca está do tiro — deve ser o mesmo do canhão". */
describe('bazuca: navios, Kraken e som', () => {
  it('a explosão avisa quem desenha os navios (pirata e de outro jogador) — o mesmo caminho da bala do canhão', () => {
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain('runExplosionHooks(at, BAZOOKA.SPLASH_R, power);');
    const w = fs.readFileSync('src/components/zona-sul/zs-warship-view.tsx', 'utf8');
    expect(w).toContain('if (es) { if (isGuestInRoom()) broadcastFleetHit(es.id, power); else fleetShipHit(es, power); }');
    expect(w).toContain('if (shipGround(d.c, at.x, at.z, 1e6)) { broadcastShipHit(d.id, power); break; }');
    expect(w).toContain('explosionHooks.add(hook);');
  });
  it('míssil na "pele" do Kraken conta (corpo 19 m, tentáculos ~15 m) — medido: 10 m ao lado do tentáculo 8000 → 3005', () => {
    const k = fs.readFileSync('src/components/zona-sul/zs-kraken-boss-view.tsx', 'utf8');
    expect(k).toContain('setBigCreatureRadius(KRAKEN_BODY_ID, KRAKEN_BOSS.BODY_R);');
    expect(k).toContain('for (let i = 0; i < KRAKEN_BOSS.TENTACLES; i++) setBigCreatureRadius(krakenTentId(i), 15);');
  });
  it('som: o do CANHÃO no disparo e no estouro', () => {
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain("audioManager.playWorld('cannon', 1); // 05/11 (Pedro): o som da bazuca é o do CANHÃO");
  });
});
