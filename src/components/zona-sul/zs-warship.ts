/**
 * ZONA SUL — NAVIO DE GUERRA (Pedro 01/11: "navio de guerra pega acima do nível 70; ataca com bola de canhão, mirando").
 * Lógica PURA (testável), no mesmo molde do carro (`zs-car.ts`):
 *  - DIRIGIR pesado: W/S vela (acelera devagar, máx. ~32 km/h), A/D leme (gira devagar, só andando). Só anda no MAR FUNDO
 *    (casco inteiro: proa, popa e meio) — na costa desliza e perde a velocidade, nunca encalha na areia.
 *  - CANHÕES: o lado sai de pra onde a câmera olha (bombordo = esquerda, boreste = direita); a inclinação da câmera dá a
 *    elevação (alcance). Salva de 3 balas em ARCO com gravidade; recarga por lado. Onde cai = dano em área.
 *  - Navio contra navio de OUTRO jogador e vida do navio: próxima etapa (precisa do veículo do outro na rede).
 * Frente do navio = (sin yaw, cos yaw), igual ao herói e ao carro.
 */
import { VEHICLE_COST } from '@/game/data/vehicle-costs';

export const WARSHIP = {
  LENGTH: 36.8,                     // m (o encalhado tem 38) — Pedro 01/11: "aumentar o navio uns 15%" (era 32)
  // Pedro 01/11: "mais leve pra dirigir, tá meio lento, engessado" → era 9 m/s, acel. 1,5, giro 0,3 rad/s (resp. 1,4)
  MAX: 12, REVERSE: 3.5,            // m/s (12 ≈ 43 km/h)
  ACCEL: 3.2, BRAKE: 4.5, COAST: 0.18,
  TURN: 0.55, TURN_RESP: 3,         // giro máx. (rad/s) e resposta (1/s)
  TURN_STOPPED: 0.25,               // parado ainda gira um pouco (fração do giro) — não fica "engessado"
  AIM_SWING: 0.87,                  // a mira gira até ±50° pra frente/trás do través (segue a câmera)
  MIN_DEPTH: 3.2,                   // fundura mínima embaixo do casco (m)
  SCRAPE_DRAG: 0.9,                 // raspando na margem perde ~60% do embalo por segundo (mas segue)
  BOARD_DIST: 16,                   // E embarca a até isto do centro (m)
  BOARD_MARGIN: 4,                  // E sobe a bordo a até isto do CASCO (m) — nadando do lado ou na proa/popa
  HELM_REACH: 3.5,                  // no convés, E perto do timão (m) = pilotar
  // canhões
  BALL_SPEED: 52, GRAVITY: 9.8,
  ELEV_MIN: 0.04, ELEV_MAX: 0.62,   // elevação (rad): ~25 m … ~270 m de alcance
  RELOAD_S: 4, SALVO: 3, SALVO_GAP_MS: 150, SALVO_SPREAD: 5,  // 3 balas espalhadas 5 m ao longo do costado
  SPLASH_R: 5,
  UNLOCK_ID: 'war_ship',
  /** VIDA do navio (Pedro 01/11: "navio 5k vida"): só canhão de jogador INIMIGO tira (pela rede). Zerou: afunda
   *  (SINK_S), quem está nele cai na água, e outro se CONSTRÓI na âncora com recurso da bolsa (BUILD_COST). */
  // 02/11 (Pedro, depois de brigar com o amigo online: "a vida do barco boa é 50k — 2 tiros em cheio estourou o barco")
  HP: 50000,
  SINK_S: 6,
  BUILD_COST: VEHICLE_COST.war_ship as readonly { id: string; n: number }[], // 600 madeira + 240 ferro + 120 pedra (3×)
  /** E a até isto (m) da âncora com o navio afundado = construir outro */
  BUILD_NEAR: 30,
  /** ancorado no mar fundo mais perto disto: perto do Arpoador, do lado de Ipanema, FORA da onda (a zona de surf vai até
   *  ~160 m pro oeste do pico, x ≈ −70) */
  DOCK_NEAR: { x: -140, z: 470 },
} as const;

export type WarshipSide = 'port' | 'starboard';
export type ZsWarship = {
  x: number; z: number; yaw: number;
  speed: number; yawRate: number;
  /** adernar visual (rad) ao virar */
  roll: number;
  /** segundos até poder atirar de novo, por lado */
  reload: Record<WarshipSide, number>;
  /** vida (WARSHIP.HP) e há quanto tempo está afundando (null = inteiro) */
  hp: number;
  sinkT: number | null;
};
export type WarshipInput = { throttle: number; steer: number };

export function newWarship(x: number, z: number, yaw: number): ZsWarship {
  return { x, z, yaw, speed: 0, yawRate: 0, roll: 0, reload: { port: 0, starboard: 0 }, hp: WARSHIP.HP, sinkT: null };
}

/** CORRENTEZA externa no navio do HERÓI (04/11 — o redemoinho do Kraken das Cagarras puxa pro centro dele), em m/s.
 *  Quem puxa escreve todo quadro (0 = nada). Só o navio do herói (o mundo aplica depois do passo, antes do convés levar
 *  quem está em pé — ninguém escorrega). */
export const warshipDrift = { x: 0, z: 0 };
export function driftWarship(swimmable: (x: number, z: number) => boolean, s: ZsWarship, dt: number): void {
  if (s.sinkT !== null || (warshipDrift.x === 0 && warshipDrift.z === 0)) return;
  const nx = s.x + warshipDrift.x * dt, nz = s.z + warshipDrift.z * dt;
  if (hullFits(swimmable, nx, nz, s.yaw)) { s.x = nx; s.z = nz; }
}
/** Canhão INIMIGO acertou o navio: tira vida; zerou = começa a afundar. Devolve se afundou AGORA. */
export function damageWarship(s: ZsWarship, dmg: number): boolean {
  if (s.sinkT !== null || !(dmg > 0)) return false;
  s.hp = Math.max(0, s.hp - Math.round(dmg));
  if (s.hp > 0) return false;
  s.sinkT = 0; s.speed = 0; s.yawRate = 0;
  return true;
}
/** Afundou de vez (acabou a animação) — some do mar (e da rede); outro se constrói na âncora. */
export function warshipGone(s: ZsWarship | null): boolean {
  return !!s && s.sinkT !== null && s.sinkT >= WARSHIP.SINK_S;
}

/** Coordenadas DO NAVIO: u = pro lado (boreste +), v = ao longo (proa +). Mesmo giro do three.js em Y. */
export function warshipLocal(s: { x: number; z: number; yaw: number }, x: number, z: number): { u: number; v: number } {
  const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return { u: dx * c - dz * sn, v: dx * sn + dz * c };
}
/** Do navio pro mundo (inverso de `warshipLocal`). */
export function warshipWorld(s: { x: number; z: number; yaw: number }, u: number, v: number): { x: number; z: number } {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return { x: s.x + u * c + v * sn, z: s.z - u * sn + v * c };
}
/** Perto do CASCO (não só do centro — o navio tem 32 m): dentro do retângulo do navio com `margin` m de folga. */
export function nearWarshipHull(s: { x: number; z: number; yaw: number }, x: number, z: number, halfBeam: number, margin: number, len: number = WARSHIP.LENGTH): boolean {
  const { u, v } = warshipLocal(s, x, z);
  return Math.abs(u) <= halfBeam + margin && Math.abs(v) <= len / 2 + margin;
}
/** Quem está no convés vai JUNTO quando o navio anda/gira: (x, z) na pose `a` → mesma posição no navio na pose `b`. */
export function carryOnDeck(a: { x: number; z: number; yaw: number }, b: { x: number; z: number; yaw: number }, x: number, z: number): { x: number; z: number } {
  const l = warshipLocal(a, x, z);
  return warshipWorld(b, l.u, l.v);
}

/** O casco cabe em (x, z, yaw)? Proa, popa, meio e as bordas (1/4 da boca) em mar fundo. `len` (03/11): navio menor (a
 *  esquadra inimiga é 35% menor); sem ele, o do herói. */
export function hullFits(swimmable: (x: number, z: number) => boolean, x: number, z: number, yaw: number, len: number = WARSHIP.LENGTH): boolean {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), half = len / 2, beam = len * 0.12;
  for (const u of [-half, -half / 2, 0, half / 2, half]) for (const v of [-beam, 0, beam]) {
    if (!swimmable(x + fx * u + fz * v, z + fz * u - fx * v)) return false;
  }
  return true;
}

/** Um passo do navio (mexe em `s`). `swimmable` = mar com fundura suficiente (o mapa diz). */
export function warshipStep(swimmable: (x: number, z: number) => boolean, s: ZsWarship, inp: WarshipInput, dt: number, len: number = WARSHIP.LENGTH, maxSpeed: number = WARSHIP.MAX): void {
  if (s.sinkT !== null) { s.sinkT += dt; s.speed = 0; s.yawRate = 0; return; } // afundando: parado
  for (const side of ['port', 'starboard'] as const) s.reload[side] = Math.max(0, s.reload[side] - dt);
  let v = s.speed;
  if (inp.throttle > 0) v += WARSHIP.ACCEL * inp.throttle * Math.max(0, 1 - v / maxSpeed) * dt;
  else if (inp.throttle < 0) v = v > 0.2 ? Math.max(0, v - WARSHIP.BRAKE * -inp.throttle * dt) : Math.max(-WARSHIP.REVERSE, v + WARSHIP.ACCEL * 0.5 * inp.throttle * dt);
  else v *= Math.exp(-WARSHIP.COAST * dt);
  // leme: andando vira tudo; parado ainda gira um pouco (TURN_STOPPED); de ré inverte
  const sp = Math.abs(v), dir = v >= 0 ? 1 : -1;
  const want = -inp.steer * WARSHIP.TURN * Math.min(1, WARSHIP.TURN_STOPPED + sp / 2.5) * dir;
  s.yawRate += (want - s.yawRate) * Math.min(1, WARSHIP.TURN_RESP * dt);
  const ny = s.yaw + s.yawRate * dt;
  const nx = s.x + Math.sin(ny) * v * dt, nz = s.z + Math.cos(ny) * v * dt;
  if (hullFits(swimmable, nx, nz, ny, len)) { s.x = nx; s.z = nz; s.yaw = ny; }
  else if (Math.abs(v) > 0.05 && scrape(swimmable, s, nx, nz, ny, dt, len)) v *= Math.exp(-WARSHIP.SCRAPE_DRAG * dt); // raspou e seguiu
  else if (hullFits(swimmable, s.x, s.z, ny, len)) { s.yaw = ny; v *= 0.3; }   // não passa: gira no lugar e perde o embalo
  else { v *= 0.3; s.yawRate *= 0.5; }
  s.speed = v;
  s.roll += (-s.yawRate * Math.min(1, sp / maxSpeed) * 0.6 - s.roll) * Math.min(1, dt * 1.5);
}

/**
 * RASPAR NA PAREDE (Pedro 01/11: "tô encalhando na entrada do canal"): o passo não coube → tenta o MESMO passo com o
 * casco empurrado um pouco pro lado e/ou a proa virando um pouco (o menor ajuste primeiro, pra onde a água deixa) — o
 * navio desliza pela margem e se alinha com o canal em vez de travar (como barco em jogo: encosta, raspa e segue).
 * Ajustes por quadro proporcionais ao dt (no máx. ~0,5 m e ~0,03 rad a 30 FPS).
 */
const SCRAPE_TRIES: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (const lat of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5]) for (const dy of [0, 0.015, -0.015, 0.03, -0.03]) if (lat || dy) out.push([lat, dy]);
  return out.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) * 15 - (Math.abs(b[0]) + Math.abs(b[1]) * 15));
})();
function scrape(swimmable: (x: number, z: number) => boolean, s: ZsWarship, nx: number, nz: number, ny: number, dt: number, len: number = WARSHIP.LENGTH): boolean {
  const k = Math.min(2, dt * 30);
  for (const [lat, dy] of SCRAPE_TRIES) {
    const yaw = ny + dy * k, rx = Math.cos(yaw), rz = -Math.sin(yaw); // direita do navio
    const x = nx + rx * lat * k, z = nz + rz * lat * k;
    if (hullFits(swimmable, x, z, yaw, len)) { s.x = x; s.z = z; s.yaw = yaw; return true; }
  }
  return false;
}

/** Lado do costado pra onde a câmera olha (yaw da VISÃO, câmera → alvo). Direita do navio = (cos yaw, −sin yaw). */
export function cannonSide(shipYaw: number, viewYaw: number): WarshipSide {
  const rx = Math.cos(shipYaw), rz = -Math.sin(shipYaw);
  return Math.sin(viewYaw) * rx + Math.cos(viewYaw) * rz >= 0 ? 'starboard' : 'port';
}

/** Elevação do canhão a partir da inclinação da câmera (mais alta = mais longe). */
export function cannonElevation(camPitch: number): number {
  const k = Math.max(0, Math.min(1, (camPitch - 0.05) / 0.9));
  return WARSHIP.ELEV_MIN + (WARSHIP.ELEV_MAX - WARSHIP.ELEV_MIN) * k;
}

export type CannonBall = { ox: number; oy: number; oz: number; vx: number; vy: number; vz: number };

/** Quanto a mira gira pra frente/trás do través (rad, ±AIM_SWING) pra seguir a câmera: `viewYaw` = pra onde ela olha. */
export function cannonSwing(s: ZsWarship, side: WarshipSide, viewYaw: number): number {
  const out = s.yaw + (side === 'starboard' ? Math.PI / 2 : -Math.PI / 2); // yaw do través (pra fora)
  let d = viewYaw - out;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-WARSHIP.AIM_SWING, Math.min(WARSHIP.AIM_SWING, d));
}

/** As balas de uma salva: saem do costado `side`, pra fora do navio (girado `swing` pra frente/trás do través), com a
 *  elevação dada. `deckY` = altura dos canhões. */
export function cannonSalvo(s: ZsWarship, side: WarshipSide, elevation: number, deckY: number, swing = 0): CannonBall[] {
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const sgn = side === 'starboard' ? 1 : -1;
  const outYaw = s.yaw + sgn * Math.PI / 2 + swing, ox = Math.sin(outYaw), oz = Math.cos(outYaw); // pra fora do costado
  const bx = Math.cos(s.yaw) * sgn, bz = -Math.sin(s.yaw) * sgn; // a boca do canhão fica no costado (sem girar)
  const beam = WARSHIP.LENGTH * 0.1, h = Math.cos(elevation) * WARSHIP.BALL_SPEED, up = Math.sin(elevation) * WARSHIP.BALL_SPEED;
  const out: CannonBall[] = [];
  for (let i = 0; i < WARSHIP.SALVO; i++) {
    const u = (i - (WARSHIP.SALVO - 1) / 2) * WARSHIP.SALVO_SPREAD;
    out.push({ ox: s.x + fx * u + bx * beam, oy: deckY, oz: s.z + fz * u + bz * beam, vx: ox * h + fx * s.speed, vy: up, vz: oz * h + fz * s.speed });
  }
  return out;
}

/** Posição da bala no tempo t (s). */
export function ballAt(b: CannonBall, t: number): { x: number; y: number; z: number } {
  return { x: b.ox + b.vx * t, y: b.oy + b.vy * t - 0.5 * WARSHIP.GRAVITY * t * t, z: b.oz + b.vz * t };
}

/** Onde e quando a bala cai: primeiro ponto abaixo de `surfaceAt` (máx(chão, água)). Passos de 1/30 s, até 12 s. */
export function ballLanding(b: CannonBall, surfaceAt: (x: number, z: number) => number): { x: number; y: number; z: number; t: number } {
  const step = 1 / 30;
  for (let t = step; t <= 12; t += step) {
    const p = ballAt(b, t);
    if (p.y <= surfaceAt(p.x, p.z)) return { ...p, t };
  }
  const p = ballAt(b, 12);
  return { ...p, t: 12 };
}

/** Ponto de ANCORAGEM: o mais perto de `near` onde o casco cabe, paralelo à costa (varre anéis e giros). Determinístico. */
export function findWarshipDock(swimmable: (x: number, z: number) => boolean, near: { x: number; z: number }): { x: number; z: number; yaw: number } | null {
  for (let r = 0; r <= 400; r += 6) {
    const n = Math.max(1, Math.round((2 * Math.PI * r) / 6));
    for (let a = 0; a < n; a++) {
      const ang = (a / n) * Math.PI * 2, x = near.x + Math.sin(ang) * r, z = near.z + Math.cos(ang) * r;
      for (let k = 0; k < 12; k++) { const yaw = (k / 12) * Math.PI; if (hullFits(swimmable, x, z, yaw)) return { x, z, yaw }; }
    }
  }
  return null;
}
