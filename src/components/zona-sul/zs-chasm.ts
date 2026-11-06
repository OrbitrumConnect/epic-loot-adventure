/**
 * PRECIPÍCIO + CHECKPOINT + DANO DE QUEDA (05/11, Pedro: "caminho até ele mais longe com parkour — pula; caiu no precipício
 * volta pro checkpoint" · "o caminho para o boss mais curto vai continuar curto daquele jeito fácil?" · "o ideal seria não
 * ali na descida — a boa seria no túnel, no caminho" · "o parkour só vai dar bom se tiver dano de queda! correto por vida e
 * altura, né? não temos dano de queda ainda").
 * Antes: o jogo não tinha dano de queda — dava pra pular do balcão do ABISMO (58 m) e do balcão do COVIL (93 m) direto no
 * fundo, e a garganta do fundo do abismo até o covil tinha 53 m: do Pico da Tijuca até o Canibal em ~1 min.
 * Agora:
 *  - O CAMINHO passa pela FENDA (zs-cave.ts): do fundo do abismo a garganta vai pro leste até uma rachadura funda; no meio
 *    dela o PRECIPÍCIO — atravessa pulando de coluna em coluna — e do outro lado um túnel volta até o balcão do covil (que
 *    girou pro nordeste). Todo caminho até o Canibal (pelo Pico ou pelo Rebouças) passa por ela.
 *  - PRECIPÍCIO (a fenda e os 2 poços — abismo e covil): queda livre de mais de FALL_M = volta pro último checkpoint
 *    (pega ainda no ar; a tela escurece) e perde PIT_PCT da vida — é a queda que mataria, "salva" no checkpoint.
 *  - DANO DE QUEDA em todo lugar (a pé): por ALTURA e pela VIDA — até FALL.SAFE_M nada; daí sobe em CURVA (começa leve)
 *    até FALL.LETHAL_M = a vida inteira (em % da vida máxima: vale igual pro nível 1 e pro 80). Caiu na ÁGUA: nada.
 * Checkpoint = um marco (cristal) do lado do caminho: passou perto, fica guardado (a mensagem avisa).
 * 05/11 (noite, Pedro: "tomei queda lá na entrada e fui teleportado pra cima — o check é APENAS antes do parkour do boss e 1
 * nos 2 lados do outro túnel, só isso" · "o checkpoint da queda é só quando cai no abismo PRETO do parkour; quando cai em
 * local que anda do mapa normal não precisa"): 3 checkpoints (beira e fim da fenda, balcão do covil — antes do parkour da
 * rampa) e precipício só na FENDA e no COVIL. O abismo do Pico voltou a ser chão normal: lá é dano de queda (por altura).
 * Regras PURAS aqui (testáveis); o corpo (cair, voltar, perder vida) em zona-sul-world. SEM marco desenhado (05/11 noite,
 * Pedro: o cristal e depois a fogueira ficaram "meio feio") — passou perto, a mensagem avisa; `mark` guarda onde ficaria.
 */
import { create } from 'zustand';
import { useGameStore } from '@/game/state/game-store';
import { reportDamageToStore } from '@/components/world/hostile-ai';
import { CAVE_ROOMS, caveChasmAt, caveFloorAt } from './zs-cave';

export const CHASM = {
  /** queda livre (m) que conta como "caiu no precipício" — os pulos do parkour descem ~1 m */
  FALL_M: 9,
  /** cair no precipício (pego no ar, volta pro checkpoint) custa esta fração da vida máxima */
  PIT_PCT: 0.25,
  /** pega o checkpoint a até CP_R m (no plano) e CP_DY m (na altura) do ponto */
  CP_R: 6, CP_DY: 4,
  /** piloto/clique NÃO desce degrau maior que isto (não se joga no poço/precipício sozinho) */
  EDGE_M: 2.5,
} as const;

/** DANO DE QUEDA em fração da vida MÁXIMA. 05/11: 6 m nada, linha reta até 24 m mata (Minecraft). 06/11 (Pedro: "dano de
 *  queda tá muito forte"): seguro 6 → 8 m, mortal 24 → 40 m e a subida em CURVA (expoente CURVE — queda média dói pouco,
 *  queda grande dói muito): 10 m 1% · 12 m 4% · 15 m 9% · 20 m 21% · 24 m 33% · 30 m 55% · 35 m 76% · 40 m mata
 *  (antes: 10 m 22% · 12 m 33% · 15 m 50% · 20 m 78% · 24 m mata). O abismo do Pico (57 m) segue matando. */
export const FALL = { SAFE_M: 8, LETHAL_M: 40, CURVE: 1.6 } as const;
/** Fração da vida máxima que a queda de `h` m tira (0 até SAFE_M; 1 = morre). */
export function fallDamagePct(h: number): number {
  return h <= FALL.SAFE_M ? 0 : Math.min(1, ((h - FALL.SAFE_M) / (FALL.LETHAL_M - FALL.SAFE_M)) ** FALL.CURVE);
}
/** Dano (HP) da queda de `h` m pra quem tem `maxHp` de vida (≥ 1 quando passa do seguro; a queda mortal tira tudo). */
export function fallDamage(h: number, maxHp: number): number {
  const k = fallDamagePct(h);
  return k <= 0 ? 0 : k >= 1 ? maxHp : Math.max(1, Math.round(maxHp * k));
}

/** Os precipícios (o "abismo preto do parkour"): a FENDA do caminho e o COVIL (a rampa com vãos). */
export const CHASM_ROOMS = ['fenda', 'covil'] as const;
export type ChasmRoom = (typeof CHASM_ROOMS)[number];
/** x/y/z = onde o herói volta (no meio do caminho); mark = o marco (cristal), do lado — encostado na parede. */
export type Checkpoint = { id: string; name: string; room: ChasmRoom; x: number; y: number; z: number; yaw: number; mark: { x: number; y: number; z: number } };

/** [id, nome, salão, grau ao longo da rampa (null = ponto fixo), fração do raio | x, z, rumo (rad) do ponto fixo] */
const CP_SPEC: readonly (readonly [string, string, ChasmRoom, number | null, number, number?, number?])[] = [
  // a FENDA: a beirada de cá (olhando o precipício) e a de lá
  ['fenda_inicio', 'beira da fenda', 'fenda', null, -1059, -267, Math.PI / 2],
  ['fenda_fim', 'fim da fenda', 'fenda', null, -1011, -267, Math.PI / 2],
  // o balcão do covil: ANTES do parkour da rampa (o único lá)
  ['covil_topo', 'balcão do covil', 'covil', 10, 0.92],
];
let cps: Checkpoint[] | null = null;
/** Os checkpoints (no chão, virados pro sentido do caminho). */
export function caveCheckpoints(): Checkpoint[] {
  if (cps) return cps;
  cps = CP_SPEC.map(([id, name, room, deg, a, b, yawFix]) => {
    const r = CAVE_ROOMS.find((q) => q.id === room)!, sp = r.spiral;
    let x: number, z: number, yaw: number, hint: number;
    if (deg === null || !sp) { x = a; z = b!; yaw = yawFix ?? Math.atan2(x - r.x, z - r.z); hint = r.y; }
    else {
      const th = sp.a0 + sp.dir * deg * (Math.PI / 180);
      x = r.x + a * r.rx * Math.cos(th); z = r.z + a * r.rz * Math.sin(th);
      yaw = Math.atan2(-r.rx * Math.sin(th) * sp.dir, r.rz * Math.cos(th) * sp.dir); // tangente, descendo
      hint = sp.yTop - ((deg * Math.PI) / 180 / sp.sweep) * (sp.yTop - r.y);
    }
    const y = caveFloorAt(x, z, hint + 1) ?? hint;
    // o marco: na rampa, 2,6 m pra fora (rumo à parede); no ponto fixo, 3 m de lado — onde houver chão na mesma altura
    const ol = Math.hypot(x - r.x, z - r.z) || 1, ox = (x - r.x) / ol, oz = (z - r.z) / ol;
    const [mx, mz] = deg === null ? [x + Math.cos(yaw) * 3, z - Math.sin(yaw) * 3] : [x + ox * 2.6, z + oz * 2.6];
    const my = caveFloorAt(mx, mz, y + 1);
    const mark = my !== null && Math.abs(my - y) < 1.5 ? { x: mx, y: my, z: mz } : { x, y, z };
    return { id, name, room, x: Math.round(x * 10) / 10, y: Math.round(y * 100) / 100, z: Math.round(z * 10) / 10, yaw, mark };
  });
  return cps;
}

/** Em cima do "abismo do parkour" (o vão da fenda ou um vão da rampa do covil)? — só ali a queda volta pro checkpoint. */
export function chasmZone(x: number, z: number): ChasmRoom | null { return caveChasmAt(x, z) as ChasmRoom | null; }
/** Caiu no precipício? (na caverna, num precipício, mais de FALL_M de queda desde o último chão) */
export function fellIntoChasm(inCave: boolean, fromY: number, y: number, x: number, z: number): boolean {
  return inCave && fromY - y > CHASM.FALL_M && chasmZone(x, z) !== null;
}
/** O checkpoint que o pé está pegando agora (null = nenhum perto). */
export function checkpointAt(x: number, y: number, z: number): Checkpoint | null {
  for (const c of caveCheckpoints()) if (Math.hypot(x - c.x, z - c.z) < CHASM.CP_R && Math.abs(y - c.y) < CHASM.CP_DY) return c;
  return null;
}
/** Pra onde volta: o último checkpoint pego; sem nenhum, o mais perto de onde pulou. */
export function chasmReturn(lastId: string | null, fromX: number, fromY: number, fromZ: number): Checkpoint {
  const all = caveCheckpoints(), last = lastId ? all.find((c) => c.id === lastId) : undefined;
  if (last) return last;
  let best = all[0]!, bd = Infinity;
  for (const c of all) { const d = Math.hypot(c.x - fromX, (c.y - fromY) * 2, c.z - fromZ); if (d < bd) { bd = d; best = c; } }
  return best;
}
/** Piloto/clique: o passo desce um degrau grande (beira do poço/precipício)? — então não dá (o piloto não se joga). */
export function edgeDrop(groundNow: number, groundNext: number): boolean { return groundNext < groundNow - CHASM.EDGE_M; }

/** O que já pegou nesta vida (o marco fica aceso) e o último (pra onde volta). Zera ao morrer. */
export const zsChasm = { last: null as string | null, touched: new Set<string>(), v: 0 };
export function resetChasm(): void { zsChasm.last = null; zsChasm.touched.clear(); zsChasm.v++; }
/** Escurece a tela um instante quando volta pro checkpoint (a tela lê `at`). */
export const useZsChasmFx = create<{ at: number }>(() => ({ at: 0 }));

/** Tira a vida da QUEDA do herói local (`h` m; `pit` = caiu no precipício e voltou pro checkpoint). Por % da vida máxima:
 *  armadura não segura queda (nem rolar). Zerou = morre ("A queda te matou" na tela da morte). Devolve o dano. */
export function hurtPlayerByFall(dmg: number, h: number, at: { x: number; z: number }, pit: string | null = null): number {
  const st = useGameStore.getState();
  if (st.player.dead || dmg <= 0) return 0;
  reportDamageToStore('player', dmg, at, true);
  const m = Math.round(h);
  useGameStore.setState((s) => {
    if (s.player.dead) return {};
    const hp = Math.max(0, s.player.hp - dmg);
    if (hp <= 0) return { player: { ...s.player, hp: 0, dead: true, respawnAt: Date.now() + 15_000 }, ui: { ...s.ui, message: pit ? 'Você caiu no precipício e não aguentou.' : `A queda de ${m} m te matou.`, deathBy: { name: 'A queda', pvp: false } } };
    return { player: { ...s.player, hp }, ui: { ...s.ui, message: pit ? `🕳️ Caiu no precipício! −${dmg} HP (${hp}/${s.player.maxHp}) — voltou pro checkpoint: ${pit}.` : `🦴 Queda de ${m} m! −${dmg} HP (${hp}/${s.player.maxHp})` } };
  });
  return dmg;
}
