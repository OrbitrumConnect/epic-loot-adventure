/**
 * ZONA SUL — SOM DO MUNDO (29/10, Pedro: "não esquecer do som das coisas"). O jogo já tem arquivos de combate, passos,
 * fogueira e bichos (tocam igual na Zona Sul); o que NÃO tinha som: o MAR, a ARREBENTAÇÃO da onda, o CARRO voador e o
 * VENTO. Esses são GERADOS no navegador (Web Audio: ruído filtrado + osciladores) — nenhum arquivo novo, custo ~zero.
 *  - mar: "shhh" das ondas na areia, mais alto perto da praia, com o vai-e-vem lento da água;
 *  - arrebentação: o estrondo grave perto do pico de surf;
 *  - carro: zumbido do motor flutuante — tom sobe com a velocidade e a altura;
 *  - vento: no voo do carro e no surf rápido.
 * Segue o volume geral do jogo (`audioManager.master`). Só liga depois de um clique/tecla (regra do navegador).
 */
import { audioManager } from '@/game/audio/audio-manager';

export type AmbienceState = {
  /** 0..1 — quanto mar tem em volta (e quão perto do nível da água você está) */
  sea: number;
  /** 0..1 — perto do pico de surf com onda quebrando */
  surf: number;
  /** dirigindo o carro */
  car: boolean;
  /** velocidade do carro (m/s) e altura acima do chão (m) */
  carSpeed: number;
  carAlt: number;
  /** 0..1 — vento (voo/surf rápido) */
  wind: number;
};

type Chain = { gain: GainNode; filter: BiquadFilterNode };

class ZsAmbience {
  private ctx: AudioContext | null = null;
  private armed = false;
  private sea: Chain | null = null;
  private surf: Chain | null = null;
  private wind: Chain | null = null;
  private car: { gain: GainNode; filter: BiquadFilterNode; o1: OscillatorNode; o2: OscillatorNode; whine: OscillatorNode; whineGain: GainNode } | null = null;
  private seaLfo: OscillatorNode | null = null;

  /** Liga no 1º gesto do jogador (o navegador não deixa tocar antes). Idempotente. */
  arm(): void {
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const start = () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      this.build();
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  private noise(ctx: AudioContext): AudioBufferSourceNode {
    // ruído "marrom" (grave, como água) num laço de 3 s
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    return src;
  }

  private chain(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): Chain {
    const src = this.noise(ctx), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q; gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    return { gain, filter };
  }

  private build(): void {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.sea = this.chain(ctx, 'lowpass', 520);
    // vai-e-vem do mar: o filtro abre e fecha devagar (~8 s)
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 0.12; lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(this.sea.filter.frequency); lfo.start();
    this.seaLfo = lfo;
    this.surf = this.chain(ctx, 'lowpass', 180, 1.2);
    this.wind = this.chain(ctx, 'bandpass', 600, 0.6);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 55; o2.frequency.value = 27.5; o2.detune.value = 8;
    filter.type = 'lowpass'; filter.frequency.value = 380; gain.gain.value = 0;
    o1.connect(filter); o2.connect(filter); filter.connect(gain).connect(ctx.destination); o1.start(); o2.start();
    const whine = ctx.createOscillator(), whineGain = ctx.createGain();
    whine.type = 'sine'; whine.frequency.value = 240; whineGain.gain.value = 0;
    whine.connect(whineGain).connect(ctx.destination); whine.start();
    this.car = { gain, filter, o1, o2, whine, whineGain };
  }

  /** Chamado ~10×/s pelo herói. Rampas curtas (sem estalo). */
  update(s: AmbienceState): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime, r = 0.25, m = audioManager.master;
    this.sea?.gain.gain.setTargetAtTime(m * 0.16 * s.sea, t, r);
    this.surf?.gain.gain.setTargetAtTime(m * 0.32 * s.surf, t, r);
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(m * 0.12 * s.wind, t, r);
      this.wind.filter.frequency.setTargetAtTime(400 + s.wind * 900, t, r);
    }
    const c = this.car;
    if (c) {
      const sp = Math.abs(s.carSpeed);
      const f = 48 + sp * 2.2 + s.carAlt * 0.6;
      c.o1.frequency.setTargetAtTime(f, t, r); c.o2.frequency.setTargetAtTime(f * 0.5, t, r);
      c.filter.frequency.setTargetAtTime(300 + sp * 22, t, r);
      c.gain.gain.setTargetAtTime(s.car ? m * (0.05 + Math.min(0.05, sp * 0.002)) : 0, t, r);
      c.whine.frequency.setTargetAtTime(220 + sp * 9 + s.carAlt * 3, t, r);
      c.whineGain.gain.setTargetAtTime(s.car ? m * 0.012 : 0, t, r);
    }
  }

  /** Saiu da Zona Sul: silencia (o contexto fica, barato, pra voltar sem estalo). */
  mute(): void {
    this.update({ sea: 0, surf: 0, car: false, carSpeed: 0, carAlt: 0, wind: 0 });
  }
}

export const zsAmbience = new ZsAmbience();
