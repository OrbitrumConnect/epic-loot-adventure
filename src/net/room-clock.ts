/**
 * RELÓGIO DA SALA (Pedro 02/11, online: "uns 7 s de diferença entre uma onda que quebrou pra um player e pro outro, mais
 * ou menos a mesma onda"). O relógio de parede de cada aparelho pode estar alguns segundos fora; aqui o convidado acerta
 * o dele pelo carimbo de hora (`wt`) que o anfitrião põe no pacote do mundo. Cada pacote dá `hora do host − minha hora`
 * = diferença dos relógios MENOS o atraso da rede; o MAIOR dos últimos é o que chegou mais rápido (erro ≈ o menor atraso,
 * dezenas de ms). Fora de sala, ou sendo o anfitrião, vale o próprio relógio.
 * Módulo leve (sem rede): o surf e os testes usam sem puxar o cliente do Supabase.
 */
const SAMPLES = 16;
const samples: number[] = [];
let offset = 0;
let follow = false;

/** Hora do anfitrião da sala (ms de relógio de parede); fora de sala / sendo o anfitrião = a própria. */
export function roomNow(now: number = Date.now()): number {
  return follow ? now + offset : now;
}

/** Convidado recebeu um pacote do anfitrião carimbado com a hora dele. */
export function noteHostClock(hostWall: number, now: number = Date.now()): void {
  if (!Number.isFinite(hostWall)) return;
  samples.push(hostWall - now);
  if (samples.length > SAMPLES) samples.shift();
  offset = Math.max(...samples);
  follow = true;
}

let hostEpoch: number | null = null;
/** Começo do mundo do anfitrião (ms), EXATO — o dia/noite ignora diferença < 2 s (não treme o céu), a onda não pode. */
export function noteHostEpoch(e: number): void { if (Number.isFinite(e)) hostEpoch = e; }
/** Começo do mundo da sala (null = fora de sala / sendo o anfitrião: vale o meu). */
export function roomEpoch(): number | null { return follow ? hostEpoch : null; }

/** Saiu da sala ou virou o anfitrião: volta pro próprio relógio. */
export function resetRoomClock(): void {
  samples.length = 0;
  offset = 0;
  follow = false;
  hostEpoch = null;
}

let inRoom = false;
/** Entrou/saiu de uma sala (o que é de um jogador só — ex.: tecla J do surf, que chama série na hora — desliga online). */
export function setRoomActive(on: boolean): void {
  inRoom = on;
  if (!on) resetRoomClock();
}
export function roomActive(): boolean { return inRoom; }
