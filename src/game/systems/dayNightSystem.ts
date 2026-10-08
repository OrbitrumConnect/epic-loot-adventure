/**
 * Ciclo dia/noite. Um dia inteiro do jogo dura CYCLE_MS reais (30 min). A
 * função é pura: dado o relógio real, devolve posição/cor/intensidade do sol,
 * ambiente e névoa, mais o horário do jogo pra HUD. O mundo 3D e a HUD leem o
 * MESMO `WORLD_EPOCH`, então mostram sempre o mesmo instante.
 */

/** Momento em que a sessão começou — fixado quando o módulo carrega. */
export const WORLD_EPOCH = Date.now();
/** Duração real de um dia completo do jogo (30 min). */
export const CYCLE_MS = 30 * 60 * 1000;
/** Hora do jogo em que a sessão abre. */
const START_HOUR = 8;

export type DayNight = {
  sunPos: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
};

type Keyframe = DayNight & { h: number };

// Quadros-chave ao longo das 24h (ordenados por hora). Interpolados em anel.
// Noite com luz azulada suave — escura pra ter clima, mas ainda jogável
// (o jogador enxerga ao redor; a tocha e as luminárias completam).
const KEYFRAMES: Keyframe[] = [
  { h: 0,  sunPos: [6, 11, 10],   sunColor: '#5c74b8', sunIntensity: 0.7,  ambientColor: '#3a4570', ambientIntensity: 0.85, fogColor: '#1c2742', fogNear: 48, fogFar: 160 },
  { h: 5,  sunPos: [-16, 4, 8],   sunColor: '#8a78c0', sunIntensity: 0.95, ambientColor: '#5a5680', ambientIntensity: 1.0,  fogColor: '#55566f', fogNear: 55, fogFar: 160 },
  { h: 7,  sunPos: [-18, 7, 8],   sunColor: '#ffb36b', sunIntensity: 1.9,  ambientColor: '#8a7a90', ambientIntensity: 1.2,  fogColor: '#d9b48a', fogNear: 65, fogFar: 175 },
  { h: 12, sunPos: [-5, 28, 8],   sunColor: '#fff3d6', sunIntensity: 3.0,  ambientColor: '#bfe0ff', ambientIntensity: 1.6,  fogColor: '#cfe6c0', fogNear: 90, fogFar: 195 },
  { h: 17, sunPos: [12, 10, 8],   sunColor: '#ffbf7a', sunIntensity: 2.2,  ambientColor: '#c7b3cf', ambientIntensity: 1.3,  fogColor: '#d6b59a', fogNear: 75, fogFar: 185 },
  { h: 19, sunPos: [18, 5, 8],    sunColor: '#ff7a45', sunIntensity: 1.5,  ambientColor: '#6a5a86', ambientIntensity: 1.05, fogColor: '#9c6f86', fogNear: 60, fogFar: 165 },
  { h: 21, sunPos: [10, 12, 10],  sunColor: '#5467ac', sunIntensity: 0.8,  ambientColor: '#424d80', ambientIntensity: 0.9,  fogColor: '#1f2a46', fogNear: 50, fogFar: 158 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

/** Hora do jogo (0–24, fracionária) no instante real `now`. */
export function gameHour(now: number = Date.now()): number {
  const phase = (((now - WORLD_EPOCH) % CYCLE_MS) + CYCLE_MS) % CYCLE_MS / CYCLE_MS;
  return (START_HOUR + phase * 24) % 24;
}

/**
 * Fator de noite 0–1 (0 = dia pleno, 1 = noite fechada). Usado por luzes que
 * acendem ao anoitecer: tocha, luminárias da estrada, janelas etc.
 */
export function nightFactor(now: number = Date.now()): number {
  const h = gameHour(now);
  if (h >= 8 && h <= 17) return 0;          // dia
  if (h >= 21 || h <= 5) return 1;          // noite
  if (h > 17 && h < 21) return (h - 17) / 4; // entardecer 17→21
  return 1 - (h - 5) / 3;                     // amanhecer 5→8
}

/** Número do dia (começa em 1), avança a cada ciclo completo. */
export function gameDay(now: number = Date.now()): number {
  return 1 + Math.floor((now - WORLD_EPOCH) / CYCLE_MS);
}

/** Relógio pra HUD: "Dia N · HH:MM". */
export function gameClock(now: number = Date.now()): { day: number; time: string } {
  const h = gameHour(now);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { day: gameDay(now), time: `${pad(hh)}:${pad(mm)}` };
}

/** Estado de iluminação interpolado para o instante real `now`. */
export function dayNight(now: number = Date.now()): DayNight {
  const h = gameHour(now);
  const first = KEYFRAMES[0]!;
  const last = KEYFRAMES[KEYFRAMES.length - 1]!;

  let a = last;
  let b = first;
  let span = first.h + 24 - last.h;
  let into = (h - last.h + 24) % 24;

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const k = KEYFRAMES[i]!;
    const n = KEYFRAMES[i + 1]!;
    if (h >= k.h && h < n.h) {
      a = k;
      b = n;
      span = n.h - k.h;
      into = h - k.h;
      break;
    }
  }

  const t = span > 0 ? into / span : 0;
  return {
    sunPos: [lerp(a.sunPos[0], b.sunPos[0], t), lerp(a.sunPos[1], b.sunPos[1], t), lerp(a.sunPos[2], b.sunPos[2], t)],
    sunColor: lerpColor(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    ambientColor: lerpColor(a.ambientColor, b.ambientColor, t),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    fogColor: lerpColor(a.fogColor, b.fogColor, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
  };
}
