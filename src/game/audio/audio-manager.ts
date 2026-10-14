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

type Listener = () => void;
const urlOf = (id: TrackId) => TRACKS.find((t) => t.id === id)!.url;

class AudioManager {
  private ambient: HTMLAudioElement | null = null;
  private combat: HTMLAudioElement | null = null;
  playing = false;
  master = 0.7;
  ambientTrack: TrackId = 'dry-ground-calls';
  private combatUntil = 0;
  private raf = 0;
  private listeners = new Set<Listener>();

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
  }

  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  private emit() { for (const l of this.listeners) l(); }

  play() {
    this.ensure();
    if (!this.ambient || !this.combat) return;
    this.playing = true;
    void this.ambient.play().catch(() => {});
    void this.combat.play().catch(() => {});
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    this.emit();
  }

  stop() {
    this.playing = false;
    this.ambient?.pause();
    this.combat?.pause();
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
