import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_GAP, autoFireItem, autoGapS, burstActive, BURST_GAP, burstPause, cancelBurst, isManualShot, manualShot,
  pressTrigger, releaseTrigger, shotCooldown, tickBurst, tickTrigger, triggerHeld,
} from '@/game/systems/burstSystem';
import { useGameStore } from '@/game/state/game-store';
import { PAGE_PLAYER_SKIP, sameExcept, sameInvButAmmo } from '@/game/state/player-sans-position';

/* Pedro 03/11: "esse burst fire tá meio bugado! no manual eu clico no mouse 1 vez sai uma bala, eu pressiono o dedo
   deveria sair a rajada automática até soltar o dedo — seria o correto pro elite jogável, igual CS normal, sem quebrar
   o idle". Medido antes (navegador): 1 clique soltava 7 tiros que seguiam no PONTO do 1º tiro mesmo virando a mira. */
const read = (p: string) => fs.readFileSync(p, 'utf8');
function rifleInHand(level = 60, ammoQ = 500) {
  const st = useGameStore.getState();
  const slots = st.player.inventory.slots.map((s) => (s?.itemId === 'rifle' || s?.itemId === 'ammo' ? { itemId: null, quantity: 0 } : s));
  const rifleSlot = slots.findIndex((s) => !s?.itemId);
  slots[rifleSlot] = { itemId: 'rifle', quantity: 1 };
  const ammoSlot = slots.findIndex((s, i) => !s?.itemId && i !== rifleSlot);
  slots[ammoSlot] = { itemId: 'ammo', quantity: ammoQ };
  const hotbar = st.player.inventory.hotbar.slots.slice(); hotbar[0] = rifleSlot;
  useGameStore.setState({
    player: { ...st.player, level, dead: false, lastAttackAt: 0, inventory: { ...st.player.inventory, slots, hotbar: { ...st.player.inventory.hotbar, slots: hotbar } } },
    ui: { ...st.ui, selectedHotbar: 0 }, boostFireUntil: 0,
  });
}
const ammo = () => useGameStore.getState().player.inventory.slots.reduce((a, s) => a + (s?.itemId === 'ammo' ? s.quantity : 0), 0);
const shoot = () => { useGameStore.getState().fireMiss({ x: 10, z: 10 }); };

describe('gatilho segurado: toque = 1 bala, segurando = automático até soltar (só o jogador)', () => {
  beforeEach(() => { cancelBurst(); releaseTrigger(); vi.useFakeTimers(); vi.setSystemTime(1_000_000); });
  afterEach(() => { releaseTrigger(); cancelBurst(); vi.useRealTimers(); });

  it('cadência: o automático é a da rajada (0,1 s; ½ no Boost), sem a pausa; pistola/arco iguais; só o fuzil repete', () => {
    expect(AUTO_GAP).toBe(BURST_GAP);
    expect(shotCooldown(0.8, 'rifle', 1, false, 1, true)).toBeCloseTo(autoGapS(1), 6);
    expect(autoGapS(1)).toBeLessThanOrEqual(0.1); expect(autoGapS(1)).toBeGreaterThan(0.09); // 60 Hz: sai no 6º quadro
    expect(shotCooldown(0.8, 'rifle', 1, false, 0.5, true)).toBeCloseTo(autoGapS(0.5), 6);
    expect(shotCooldown(0.8, 'rifle', 1, false)).toBeCloseTo(burstPause(1), 5); // piloto: igual antes
    expect(shotCooldown(0.5, 'pistol', 200, false, 1, true)).toBe(0.5);
    expect(autoFireItem('rifle')).toBe(true);
    for (const id of ['pistol', 'bow', 'sword', null]) expect(autoFireItem(id)).toBe(false);
    expect(isManualShot()).toBe(false);
    expect(manualShot(() => isManualShot())).toBe(true);
    expect(isManualShot()).toBe(false);
  });

  it('TOQUE: 1 bala, sem abrir a rajada; o PILOTO (fora do gatilho) segue com a rajada de 6–9', () => {
    rifleInHand();
    const a0 = ammo();
    manualShot(shoot);
    expect(ammo()).toBe(a0 - 1);
    expect(burstActive()).toBe(false);
    for (let t = 0; t < 1500; t += 16) { vi.setSystemTime(1_000_000 + t); tickBurst(); }
    expect(ammo()).toBe(a0 - 1); // nada mais saiu
    // piloto/idle: o mesmo tiro sem o gatilho do jogador → rajada (como sempre)
    vi.setSystemTime(1_010_000);
    shoot();
    expect(burstActive()).toBe(true);
  });

  it('SEGURANDO: 1º na hora + 1 a cada 0,1 s até soltar (cada um pelo caminho normal: bala, rastro); soltou, parou', () => {
    rifleInHand();
    const a0 = ammo(), due = () => true;
    pressTrigger(shoot);
    expect(triggerHeld()).toBe(true);
    expect(ammo()).toBe(a0 - 1);
    for (let t = 16; t <= 1000; t += 16) { vi.setSystemTime(1_000_000 + t); tickTrigger(due); }
    const fired = a0 - ammo();
    expect(fired).toBeGreaterThanOrEqual(10); expect(fired).toBeLessThanOrEqual(11); // ~600/min
    releaseTrigger();
    const left = ammo();
    for (let t = 1016; t <= 2000; t += 16) { vi.setSystemTime(1_000_000 + t); tickTrigger(due); }
    expect(ammo()).toBe(left);
    expect(burstActive()).toBe(false); // nenhuma rajada "fantasma" sobrou
  });

  it('o tiro do jogador CORTA a rajada do piloto que estava correndo (senão ela seguia no ponto velho)', () => {
    rifleInHand();
    shoot(); // piloto
    expect(burstActive()).toBe(true);
    vi.setSystemTime(1_000_000 + 120);
    manualShot(shoot);
    expect(burstActive()).toBe(false);
  });

  it('FPS: a bala não redesenha a página (perfil segurando: 15 → 33 FPS); munição e peso redesenham só o número', () => {
    rifleInHand();
    const p0 = useGameStore.getState().player;
    vi.setSystemTime(1_005_000);
    manualShot(shoot);
    const p1 = useGameStore.getState().player;
    expect(p1.inventory).not.toBe(p0.inventory); // a bala saiu da mochila…
    expect(sameExcept(p0, p1, PAGE_PLAYER_SKIP, { inventory: sameInvButAmmo })).toBe(true); // …e a página não redesenha
    // qualquer outra mudança na mochila redesenha (item novo, quantidade de outro item, barra rápida, acabou a bala)
    const inv = p0.inventory;
    const other = inv.slots.findIndex((s) => s.itemId && s.itemId !== 'ammo');
    const more = inv.slots.map((s, i) => (i === other ? { ...s, quantity: s.quantity + 1 } : s));
    expect(sameInvButAmmo(inv, { ...inv, slots: more })).toBe(false);
    const ai = inv.slots.findIndex((s) => s.itemId === 'ammo');
    const gone = inv.slots.map((s, i) => (i === ai ? { itemId: null, quantity: 0 } : s));
    expect(sameInvButAmmo(inv, { ...inv, slots: gone })).toBe(false);
    const less = inv.slots.map((s, i) => (i === ai ? { ...s, quantity: s.quantity - 1 } : s));
    expect(sameInvButAmmo(inv, { ...inv, slots: less })).toBe(true);
    const hb = inv.hotbar.slots.slice(); hb[5] = ai; // munição NA barra rápida: a quantidade aparece lá → redesenha
    expect(sameInvButAmmo({ ...inv, hotbar: { ...inv.hotbar, slots: hb } }, { ...inv, slots: less, hotbar: { ...inv.hotbar, slots: hb } })).toBe(false);
    expect(PAGE_PLAYER_SKIP).toContain('lastAttackAt');
    const idx = read('src/routes/index.tsx');
    expect(idx).toMatch(/function AmmoCount\(\) \{\n  const ammo = useGameStore\(s => getItemCount\(s\.player\.inventory, 'ammo'\)\);/);
    expect(idx).toMatch(/const kg = useGameStore\(s => getWeight\(s\.player\.inventory\)\.toFixed\(1\)\);/);
    expect(idx).toContain('<AmmoCount />'); expect(idx).toContain('<BagWeight />');
    expect(read('src/game/state/player-sans-position.ts')).toMatch(/return useStableExcept\(\(s\) => s\.player, PAGE_PLAYER_SKIP, PAGE_PLAYER_EQ\);/);
  });

  it('ligado: Zona Sul (clique no pontinho na câmera de ombro, segurar, soltar, foco), celular, relógio, pontinho, coice', () => {
    const zs = read('src/components/zona-sul/zona-sul-world.tsx');
    // ombro (sem mirar também): o clique atira no PONTINHO — o tiro de longe pega (antes: o mais perto do alcance curto)
    expect(zs).toMatch(/if \(!\(\(useAim\.getState\(\)\.active \|\| !mobaOn\(\)\) && aimFire\(\)\)\) zsAttack\.fn\?\.\(\); \};/);
    expect(zs).toMatch(/if \(locked\(\) \|\| useAim\.getState\(\)\.active\) \{ if \(drive\.mode === 'sailing'\) fire\(\); else pressTrigger\(fire\); return; \}/);
    expect(zs).toMatch(/holdT = window\.setTimeout\(\(\) => \{ if \(press && canFight\(\) && heldAuto\(\)\) pressTrigger\(fire\); \}, 200\);/);
    expect(zs).toMatch(/if \(triggerHeld\(\)\) releaseTrigger\(\);/);
    expect(zs).toMatch(/else if \(press && !press\.eaten && performance\.now\(\) - press\.at < 350\) manualShot\(fire\);/);
    expect(zs).toMatch(/eaten: wasPointerConsumed\(e\)/); // clicou no corpo do bicho: o clique dele já atirou
    // clicar NO CORPO do bicho com arma de longe = mirado (alcance real) se você o enxerga; 1 bala (tiro do jogador)
    const ai = read('src/components/world/hostile-ai.ts');
    expect(ai).toMatch(/const seen = !worldBlocksShot\(o, e\.point, Math\.hypot\(o\.x - me\.x, o\.z - me\.z\) \+ 0\.3\);/);
    expect(ai).toMatch(/manualShot\(\(\) => store\.attack\(creatureId, false, seen\)\);/);
    expect(ai).toMatch(/if \(!weaponFor\(held\)\.ranged\) \{ store\.attack\(creatureId\); return; \}/);
    expect(zs).toMatch(/const blur = \(\) => \{ input\.keys\.clear\(\); releaseLeaveGuard\(\); releaseTrigger\(\); \};/);
    expect(zs).toMatch(/kk = t - lastKick\.current < 0\.25 \? 0\.25 : 1/); // coice dos tiros seguidos a 1/4
    const mc = read('src/components/world/mobile-controls.tsx');
    expect(mc).toMatch(/pressTrigger\(shoot\);/);
    expect(mc).toMatch(/atkLook\.current = null; releaseTrigger\(\);/);
    const rt = read('src/components/world/burst-runtime.tsx');
    expect(rt).toMatch(/if \(paused\) \{ cancelBurst\(\); releaseTrigger\(\); return; \}/);
    expect(rt).toMatch(/tickTrigger\(autoDue\);/);
    expect(rt).toMatch(/if \(getItemCount\(st\.player\.inventory, 'ammo'\) <= 0\) \{ releaseTrigger\(\);/);
    expect(read('src/routes/index.tsx')).toMatch(/if \(!active && !\(shoulder && weaponFor\(held\)\.ranged\)\) return null;/);
    const store = read('src/game/state/game-store.ts');
    expect(store.match(/const manual = !fromBurst && isManualShot\(\);/g)).toHaveLength(2);
    expect(store.match(/if \(!fromBurst && burstN > 1 && manual\) cancelBurst\(\);/g)).toHaveLength(2);
  });
});
