// Gera os sons de MORTE (Pedro 25/10: "falta som de bicho morrendo — urgh, carne que explode").
// Sintetizados aqui (sem baixar nada de fora), determinísticos: `node scripts/gen-death-sfx.mjs`.
//   gore-splat.wav  — estouro molhado de carne (ruído filtrado + baque grave + respingos)
//   death-groan.wav — "urgh" humano (pulso de garganta caindo de tom, 2 formantes de vogal)
//   death-growl.wav — rosnado de bicho (mais grave e áspero)
import fs from 'node:fs';

const SR = 22050;
let seed = 1234567;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;

function bandpass(freq, q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, f = freq) => {
    const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w);
    const b0 = a, b2 = -a, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

function writeWav(name, data) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.9 / peak : 1;
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * k)) * 32767), 44 + i * 2));
  fs.writeFileSync(`public/audio/${name}`, buf);
  console.log(name, buf.length, 'bytes');
}

function splat() {
  const n = Math.round(SR * 0.42), out = new Float32Array(n);
  let lp = 0, phase = 0;
  const drops = Array.from({ length: 7 }, () => ({ t: 0.03 + rnd() * 0.28, f: 900 + rnd() * 1600 }));
  const bps = drops.map((d) => bandpass(d.f, 4));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const cut = 300 + 2700 * Math.exp(-t / 0.05);          // abre e fecha: "pof" molhado
    lp += (noise() - lp) * (1 - Math.exp(-2 * Math.PI * cut / SR));
    let v = lp * Math.exp(-t / 0.075) * Math.min(1, t / 0.002) * 1.6;
    phase += 2 * Math.PI * (45 + 50 * Math.exp(-t / 0.04)) / SR;  // baque grave
    v += Math.sin(phase) * Math.exp(-t / 0.09) * 0.9;
    drops.forEach((d, j) => {                               // respingos
      const dt = t - d.t;
      if (dt > 0 && dt < 0.06) v += bps[j](noise()) * Math.exp(-dt / 0.012) * 2.2;
      else bps[j](0);
    });
    out[i] = v;
  }
  return out;
}

function voice({ dur, f0a, f0b, formants, rough, breath }) {
  const n = Math.round(SR * dur), out = new Float32Array(n);
  const fs_ = formants.map(([f, q]) => bandpass(f, q));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / dur;
    const f0 = (f0a + (f0b - f0a) * u) * (1 + 0.03 * noise());
    ph += f0 / SR;
    const pulse = (ph % 1) < 0.35 ? 1 - (ph % 1) / 0.35 : -0.25;   // pulso de garganta
    const am = 1 - rough + rough * (0.5 + 0.5 * Math.sin(2 * Math.PI * 27 * t)); // aspereza
    const src = pulse * am + noise() * breath;
    let v = 0;
    fs_.forEach((bp, j) => { v += bp(src, formants[j][0] * (1 - 0.12 * u)) * (j === 0 ? 1 : 0.6); });
    const env = Math.min(1, t / 0.03) * (u < 0.55 ? 1 : Math.exp(-(u - 0.55) / 0.14));
    out[i] = v * env;
  }
  return out;
}

writeWav('gore-splat.wav', splat());
writeWav('death-groan.wav', voice({ dur: 0.55, f0a: 150, f0b: 82, formants: [[620, 6], [1150, 8], [2500, 10]], rough: 0.35, breath: 0.25 }));
writeWav('death-growl.wav', voice({ dur: 0.65, f0a: 85, f0b: 52, formants: [[420, 5], [850, 7]], rough: 0.7, breath: 0.45 }));
