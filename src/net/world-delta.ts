/**
 * Mundo da sala em DIFERENÇAS (27/10 — egress do Supabase em 4,13 de 5 GB).
 *
 * Antes o anfitrião mandava a lista INTEIRA de bichos (nome, loot, ataque… ~45 KB com 192 bichos) a cada
 * 450 ms pra cada convidado (~100 KB/s ≈ 360 MB/h por convidado). Agora:
 *  - FOTO COMPLETA (`creatures`, mesmo campo de antes → aba com versão velha continua recebendo) no começo,
 *    a cada KEYFRAME_MS (30 s) e quando alguém entra/volta pra sala. `k` = número da foto;
 *  - entre as fotos: `p` = posições compactas [nº do bicho, x, z, …] (quase todo bicho anda todo envio);
 *    `c` = bicho novo inteiro (com `$i` = nº fixo dele) ou só os CAMPOS que mudaram; `d` = ids que saíram.
 * Diferença só vale pra mesma foto (`k`): quem perdeu a foto espera a próxima (≤ 30 s); um pacote perdido
 * nunca troca um bicho por outro (o nº de cada um é fixo e vem junto quando ele nasce).
 * Posição viaja em centímetros. O convidado mantém o MESMO objeto pro bicho que não mudou (memo da lista).
 */
import type { CreatureState } from '@/game/types/creature';

/** Foto de segurança (corrige pacote perdido). Quem entra/volta já pede foto na hora — por isso 30 s basta:
 *  medido 27/10 (192 bichos), a foto a cada 10 s era MAIS da metade do tráfego que sobrou. */
export const KEYFRAME_MS = 30_000;

type Entry = Partial<CreatureState> & { id: string; $u?: string[]; $i?: number };
export type WorldPacket = {
  id: string; epoch?: number; k?: number;
  creatures?: CreatureState[]; p?: number[]; c?: Entry[]; d?: string[];
};

const cm = (v: number) => Math.round(v * 100) / 100;
function quantize(cr: CreatureState): CreatureState {
  const { x, z } = cr.position;
  return cm(x) === x && cm(z) === z ? cr : { ...cr, position: { x: cm(x), z: cm(z) } };
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

let seqBase = Math.floor(Math.random() * 1e6); // foto de outro host nunca casa por acaso

/** Lado do anfitrião: devolve o pacote (ou null se nada mudou e não é hora de foto). */
export function createWorldEncoder() {
  let sentRaw = new Map<string, CreatureState>(); // objeto da store já enviado (mesma referência = nada mudou)
  let sent = new Map<string, CreatureState>();    // versão arredondada que o convidado tem
  let index = new Map<string, number>();          // nº fixo de cada bicho dentro desta foto
  let nextIndex = 0;
  let k = 0;
  let lastKey = -Infinity;
  let wantKey = true;
  return {
    /** Próximo envio vai com foto completa (alguém entrou/voltou). */
    keyframe() { wantKey = true; },
    encode(creatures: CreatureState[], now: number): Omit<WorldPacket, 'id' | 'epoch'> | null {
      if (wantKey || now - lastKey >= KEYFRAME_MS) {
        wantKey = false;
        lastKey = now;
        k = ++seqBase;
        const full = creatures.map(quantize);
        sentRaw = new Map(creatures.map(cr => [cr.id, cr]));
        sent = new Map(full.map(cr => [cr.id, cr]));
        index = new Map(full.map((cr, i) => [cr.id, i]));
        nextIndex = full.length;
        return { k, creatures: full };
      }
      const p: number[] = [];
      const c: Entry[] = [];
      const seen = new Set<string>();
      for (const cr of creatures) {
        seen.add(cr.id);
        if (sentRaw.get(cr.id) === cr) continue;
        sentRaw.set(cr.id, cr);
        const q = quantize(cr);
        const prev = sent.get(cr.id);
        sent.set(cr.id, q);
        if (!prev) { // bicho novo: vai inteiro, com o nº fixo dele
          const i = nextIndex++;
          index.set(cr.id, i);
          c.push({ ...q, $i: i });
          continue;
        }
        const diff: Entry = { id: cr.id };
        let others = false;
        let moved = false;
        for (const key of Object.keys(q) as (keyof CreatureState)[]) {
          if (key === 'id' || same(prev[key], q[key])) continue;
          if (key === 'position') { moved = true; continue; }
          (diff as Record<string, unknown>)[key] = q[key];
          others = true;
        }
        const unset = Object.keys(prev).filter(key => (prev as Record<string, unknown>)[key] !== undefined
          && (q as Record<string, unknown>)[key] === undefined);
        if (unset.length) { diff.$u = unset; others = true; }
        if (moved) p.push(index.get(cr.id)!, q.position.x, q.position.z);
        if (others) c.push(diff);
      }
      const d: string[] = [];
      for (const id of sent.keys()) if (!seen.has(id)) d.push(id);
      for (const id of d) { sent.delete(id); sentRaw.delete(id); }
      if (p.length === 0 && c.length === 0 && d.length === 0) return null;
      return { k, ...(p.length ? { p } : {}), ...(c.length ? { c } : {}), ...(d.length ? { d } : {}) };
    },
  };
}

/** Lado do convidado: aplica o pacote e devolve a lista completa (null = ainda sem foto / outra foto). */
export function createWorldDecoder() {
  let list: CreatureState[] | null = null;
  let k: number | undefined;
  let byIndex: string[] = [];
  return {
    apply(pkt: Pick<WorldPacket, 'k' | 'creatures' | 'p' | 'c' | 'd'>): CreatureState[] | null {
      if (Array.isArray(pkt.creatures)) {
        list = pkt.creatures;
        k = pkt.k;
        byIndex = list.map(cr => cr.id);
        return list;
      }
      if (!list || k === undefined || pkt.k !== k) return null; // sem a foto desta rodada: espera a próxima
      const idx = new Map(list.map((cr, i) => [cr.id, i]));
      const next = list.slice();
      for (const part of pkt.c ?? []) {
        const { $u, $i, ...fields } = part;
        const i = idx.get(part.id);
        if (i === undefined) {
          if (typeof part.speciesId !== 'string') continue; // diferença de bicho que não tenho: a foto corrige
          if (typeof $i === 'number') byIndex[$i] = part.id;
          idx.set(part.id, next.push(fields as CreatureState) - 1);
          continue;
        }
        const merged = { ...next[i]!, ...fields } as Record<string, unknown>;
        for (const key of $u ?? []) delete merged[key];
        next[i] = merged as CreatureState;
      }
      const p = pkt.p ?? [];
      for (let j = 0; j + 2 < p.length; j += 3) {
        const id = byIndex[p[j]!];
        const i = id === undefined ? undefined : idx.get(id);
        if (i === undefined) continue;
        next[i] = { ...next[i]!, position: { x: p[j + 1]!, z: p[j + 2]! } };
      }
      const gone = new Set(pkt.d ?? []);
      list = gone.size ? next.filter(cr => !gone.has(cr.id)) : next;
      return list;
    },
  };
}
