/**
 * Som procedural (Web Audio) — SFX sintetizados, SEM arquivos de áudio. Dá vida
 * sonora ao combate/coleta/level-up sem peso de assets. Mudo por padrão até o
 * primeiro gesto do usuário (política de autoplay dos navegadores) e
 * respeita um mute salvo em localStorage. Tudo em try/catch: áudio nunca
 * derruba o jogo (SSR, navegador sem Web Audio, etc.).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let unlocked = false;

const MUTE_KEY = 'tribos_muted';

try {
  if (typeof localStorage !== 'undefined') muted = localStorage.getItem(MUTE_KEY) === '1';
} catch { /* ignore */ }

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    return ctx;
  } catch { return null; }
}

/** Liga o áudio no 1º gesto (autoplay). Chamado uma vez pelo SoundFX. */
export function unlockAudio(): void {
  if (unlocked) return;
  const c = ensure();
  if (!c) return;
  unlocked = true;
  try { if (c.state === 'suspended') void c.resume(); } catch { /* ignore */ }
}

export function isMuted(): boolean { return muted; }

export function setMuted(v: boolean): void {
  muted = v;
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

export function toggleMuted(): boolean { setMuted(!muted); return muted; }

/** Um tom com envelope. `slideTo` desliza a frequência (sweep). */
function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  const c = ctx; if (!c || !master) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t + dur + 0.02);
}

/** Estalo de ruído (impacto). */
function noise(dur: number, vol: number, hp = 1200): void {
  const c = ctx; if (!c || !master) return;
  const t = c.currentTime;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const filt = c.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

export type Sfx = 'hit' | 'crit' | 'hurt' | 'harvest' | 'loot' | 'levelup' | 'death' | 'heal' | 'shot';

export function playSfx(name: Sfx): void {
  if (muted || !unlocked) return;
  const c = ensure(); if (!c) return;
  try {
    switch (name) {
      case 'hit': noise(0.09, 0.25, 900); tone(180, 0.1, 'square', 0.12, 90); break;
      case 'crit': noise(0.12, 0.3, 1400); tone(320, 0.12, 'sawtooth', 0.16, 140); tone(640, 0.14, 'square', 0.1); break;
      case 'hurt': tone(220, 0.22, 'sawtooth', 0.18, 70); break;
      case 'harvest': tone(520, 0.07, 'triangle', 0.14, 680); break;
      case 'loot': tone(660, 0.1, 'triangle', 0.14); setTimeout(() => tone(880, 0.12, 'triangle', 0.13), 70); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.16), i * 90)); break;
      case 'death': noise(0.2, 0.22, 500); tone(160, 0.3, 'sawtooth', 0.16, 50); break;
      case 'heal': tone(700, 0.14, 'sine', 0.12, 980); break;
      case 'shot': noise(0.05, 0.18, 2000); break;
    }
  } catch { /* ignore */ }
}
