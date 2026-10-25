/**
 * Gerenciador de ÁUDIO (música) — fora do React (singleton), igual os outros
 * canais mutáveis do jogo. Duas camadas:
 *  - AMBIENTE: a faixa "normal" em loop, volume reduzido;
 *  - COMBATE: outra faixa que SOBE quando rola ataque (pedido do Pedro —
 *    "a normal roda reduzida; no ataque entra a outra e sobe ~20%").
 * O player no cabeçalho controla play/stop, volume e qual faixa normal toca.
 * Autoplay só após gesto do usuário (o botão Play É o gesto).
 */
export type TrackId = 'dry-ground-calls' | 'cautionary-pacing' | 'passos-na-fuga';

export const TRACKS: { id: TrackId; name: string; url: string }[] = [
  { id: 'dry-ground-calls', name: 'Dry Ground Calls', url: '/audio/dry-ground-calls.mp3' },
  { id: 'cautionary-pacing', name: 'Cautionary Pacing', url: '/audio/cautionary-pacing.mp3' },
  { id: 'passos-na-fuga', name: 'Passos na Fuga', url: '/audio/passos-na-fuga.mp3' },
];

/** Faixa que entra no combate (tensa). */
const COMBAT_TRACK: TrackId = 'cautionary-pacing';
const COMBAT_HOLD_MS = 5000; // quanto a trilha de combate segura após o último ataque

/** Sons do mundo (torre, morte). Morte = splat (carne) + gemido (humanoide) ou rosnado (bicho). */
export type WorldSfx = 'tower' | 'splat' | 'groan' | 'growl';
export const WORLD_SFX: Record<WorldSfx, { url: string; vol: number; rate: number }> = {
  tower: { url: '/audio/arrow-hit.wav', vol: 0.2, rate: 0.85 }, // flecha de balestra (mais grave que o arco)
  splat: { url: '/audio/gore-splat.wav', vol: 0.24, rate: 1 },
  groan: { url: '/audio/death-groan.wav', vol: 0.2, rate: 1 },
  growl: { url: '/audio/death-growl.wav', vol: 0.2, rate: 1 },
};
export const TOWER_SFX_GAP_MS = 80;
/** Volume pela distância: cheio até 6 m, some em 45 m. */
export const SFX_FULL_M = 6;
export const SFX_MAX_M = 45;
export function distanceGain(d: number): number {
  if (d <= SFX_FULL_M) return 1;
  const t = 1 - (d - SFX_FULL_M) / (SFX_MAX_M - SFX_FULL_M);
  return t <= 0 ? 0 : t * t;
}

type Listener = () => void;
const urlOf = (id: TrackId) => TRACKS.find((t) => t.id === id)!.url;

class AudioManager {
  private ambient: HTMLAudioElement | null = null;
  private combat: HTMLAudioElement | null = null;
  private shot: HTMLAudioElement | null = null;
  private gun: HTMLAudioElement | null = null;
  private harvest: HTMLAudioElement | null = null;
  private melee: HTMLAudioElement | null = null;
  private footsteps: HTMLAudioElement | null = null;
  private campfire: HTMLAudioElement | null = null;
  private campfireSampleAt = 0;
  private nearestCampfire = Infinity;
  playing = false;
  master = 0.7;
  ambientTrack: TrackId = 'dry-ground-calls';
  private combatUntil = 0;
  private raf = 0;
  private listeners = new Set<Listener>();
  /** O usuário parou a música de propósito → o autoplay não a liga de novo. */
  private userStopped = false;
  private autoplayArmed = false;

  private ensure() {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    if (!this.ambient) {
      this.ambient = new Audio(urlOf(this.ambientTrack));
      this.ambient.loop = true;
      this.ambient.volume = 0;
    }
    if (!this.combat) {
      this.combat = new Audio(urlOf(COMBAT_TRACK));
      this.combat.loop = true;
      this.combat.volume = 0;
    }
    if (!this.shot) this.shot = new Audio('/audio/arrow-hit.wav');
    if (!this.gun) this.gun = new Audio('/audio/gun-shot.mp3');
    if (!this.harvest) this.harvest = new Audio('/audio/harvest-hit.wav');
    if (!this.melee) this.melee = new Audio('/audio/melee-hit.wav');
    if (!this.footsteps) { this.footsteps = new Audio('/audio/footsteps.wav'); this.footsteps.loop = true; }
    if (!this.campfire) { this.campfire = new Audio('/audio/campfire-crackles.wav'); this.campfire.loop = true; }
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private emit() { for (const l of this.listeners) l(); }

  play() {
    this.ensure();
    if (!this.ambient || !this.combat) return;
    this.userStopped = false;
    this.playing = true;
    void this.ambient.play().catch(() => {});
    void this.combat.play().catch(() => {});
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    this.emit();
  }

  /**
   * "Música toca ao entrar no jogo" (pedido do Pedro). O browser só deixa áudio
   * tocar após um gesto do usuário, então aqui a gente ARMA: no primeiro
   * clique/tecla, liga a música — a menos que o usuário já tenha parado de
   * propósito. Idempotente: chamar várias vezes não empilha listeners.
   */
  armAutoplay() {
    if (typeof window === 'undefined') return;
    if (this.playing || this.autoplayArmed || this.userStopped) return;
    this.autoplayArmed = true;
    const start = () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      this.autoplayArmed = false;
      if (!this.playing && !this.userStopped) this.play();
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  stop() {
    this.userStopped = true;
    this.playing = false;
    this.ambient?.pause();
    this.combat?.pause();
    this.campfire?.pause();
    if (this.ambient) this.ambient.volume = 0;
    if (this.combat) this.combat.volume = 0;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.emit();
  }

  toggle() { if (this.playing) this.stop(); else this.play(); }

  setMaster(v: number) { this.master = Math.max(0, Math.min(1, v)); this.emit(); }

  setAmbientTrack(id: TrackId) {
    this.ambientTrack = id;
    if (this.ambient) {
      this.ambient.src = urlOf(id);
      this.ambient.volume = 0;
      if (this.playing) void this.ambient.play().catch(() => {});
    }
    this.emit();
  }

  /** Sinaliza um ataque/combate: segura a trilha de combate por alguns segundos. */
  pulseCombat(now = Date.now()) { this.combatUntil = now + COMBAT_HOLD_MS; }
  playShot() { this.ensure(); if (!this.shot) return; this.shot.volume = Math.min(0.22, this.master * 0.3); this.shot.currentTime = 0; void this.shot.play().catch(() => {}); }
  playGunShot() { this.ensure(); if (!this.gun) return; this.gun.volume = Math.min(0.26, this.master * 0.36); this.gun.currentTime = 0; void this.gun.play().catch(() => {}); }
  playHarvest() { this.ensure(); if (!this.harvest) return; this.harvest.volume = Math.min(0.16, this.master * 0.158); this.harvest.currentTime = 0; void this.harvest.play().catch(() => {}); }
  playMelee() { this.ensure(); if (!this.melee) return; this.melee.volume = Math.min(0.16, this.master * 0.158); this.melee.currentTime = 0; void this.melee.play().catch(() => {}); }
  /** Ataque de OUTRO jogador (online): cópias próprias (não corta o som local) e volume pela
   *  distância (`gain` 0..1). Pool pequeno por tipo, reaproveitado em rodízio. */
  private remotePool: Record<'bow' | 'gun' | 'melee', HTMLAudioElement[]> = { bow: [], gun: [], melee: [] };
  private remoteNext: Record<'bow' | 'gun' | 'melee', number> = { bow: 0, gun: 0, melee: 0 };
  playRemote(kind: 'bow' | 'gun' | 'melee', gain: number) {
    this.ensure();
    const src = kind === 'gun' ? this.gun : kind === 'bow' ? this.shot : this.melee;
    if (!src || gain <= 0.03) return;
    const pool = this.remotePool[kind];
    if (pool.length < 3) pool.push(src.cloneNode(true) as HTMLAudioElement);
    const a = pool[this.remoteNext[kind] % pool.length]!;
    this.remoteNext[kind]++;
    const base = kind === 'gun' ? 0.26 : kind === 'bow' ? 0.22 : 0.16;
    a.volume = Math.min(base, this.master * base * 1.2) * Math.min(1, gain);
    a.currentTime = 0;
    void a.play().catch(() => {});
  }
  /**
   * SONS DO MUNDO pela distância (Pedro 25/10: "torres não fazem barulho ao atirar; falta som de bicho morrendo").
   * Pool de 4 cópias por som em rodízio (muita coisa junta corta o mais velho — nunca empilha), tom variando
   * um pouco pra não soar repetido. Torre: limite de 1 som a cada 80 ms (várias torres a 20×/s).
   */
  private worldSrc: Partial<Record<WorldSfx, HTMLAudioElement>> = {};
  private worldPool: Partial<Record<WorldSfx, HTMLAudioElement[]>> = {};
  private worldNext: Partial<Record<WorldSfx, number>> = {};
  private towerAt = 0;
  playWorld(kind: WorldSfx, gain: number, now = performance.now()) {
    if (typeof Audio === 'undefined' || gain <= 0.03) return;
    if (kind === 'tower') { if (now - this.towerAt < TOWER_SFX_GAP_MS) return; this.towerAt = now; }
    const spec = WORLD_SFX[kind];
    const src = (this.worldSrc[kind] ??= new Audio(spec.url));
    const pool = (this.worldPool[kind] ??= []);
    if (pool.length < 4) pool.push(src.cloneNode(true) as HTMLAudioElement);
    const i = (this.worldNext[kind] ?? 0) % pool.length;
    this.worldNext[kind] = i + 1;
    const a = pool[i]!;
    a.volume = Math.min(spec.vol, this.master * spec.vol * 1.2) * Math.min(1, gain);
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
    a.playbackRate = spec.rate * (0.9 + Math.random() * 0.2);
    a.currentTime = 0;
    void a.play().catch(() => {});
  }
  setFootsteps(active: boolean, sprinting = false) {
    this.ensure(); if (!this.footsteps) return;
    this.footsteps.volume = Math.min(0.16, this.master * (sprinting ? 0.211 : 0.182));
    this.footsteps.playbackRate = sprinting ? 1.35 : 1;
    if (active) void this.footsteps.play().catch(() => {}); else this.footsteps.pause();
  }
  updateCampfireDistance(distance: number) {
    this.ensure(); if (!this.campfire) return;
    const now = performance.now();
    if (now - this.campfireSampleAt > 50) this.nearestCampfire = Infinity;
    this.campfireSampleAt = now;
    this.nearestCampfire = Math.min(this.nearestCampfire, distance);
    const t = Math.max(0, Math.min(1, 1 - this.nearestCampfire / 14));
    this.campfire.volume = this.master * 0.18 * t;
    if (t > 0) void this.campfire.play().catch(() => {}); else this.campfire.pause();
  }

  private loop = () => {
    if (!this.playing || !this.ambient || !this.combat) { this.raf = 0; return; }
    const inCombat = Date.now() < this.combatUntil;
    // Normal reduzida; no combate ela abaixa e a trilha tensa sobe (+~20% no topo).
    const ambTarget = this.master * (inCombat ? 0.35 : 0.55);
    const comTarget = inCombat ? Math.min(1, this.master * 1.2) : 0;
    this.ambient.volume += (ambTarget - this.ambient.volume) * 0.08; // fade suave
    this.combat.volume += (comTarget - this.combat.volume) * 0.08;
    this.raf = requestAnimationFrame(this.loop);
  };
}

export const audioManager = new AudioManager();
