/**
 * Monta a malha da CAVERNA fora da thread do jogo (Pedro: "sem pesar"): recebe o mapa de altura (só pras bocas), roda o
 * marching cubes inteiro (~1,5 s de conta) e devolve os pedaços prontos (buffers transferidos, sem cópia).
 */
import { triTable } from 'three/addons/objects/MarchingCubes.js';
import { caveMeshJob, setCaveTerrain } from './zs-cave';

type Msg = { heights: Float32Array; w: number; h: number; cell: number; x0: number; z0: number };

self.onmessage = (e: MessageEvent<Msg>) => {
  const { heights, w, h, cell, x0, z0 } = e.data;
  setCaveTerrain({ heights, w, h, cell, x0, z0, surf: new Uint8Array(0) });
  const job = caveMeshJob(triTable);
  let r = job.next();
  while (!r.done) r = job.next();
  const tiles = r.value;
  const transfer: ArrayBuffer[] = [];
  for (const t of tiles) transfer.push(t.pos.buffer as ArrayBuffer, t.nor.buffer as ArrayBuffer, t.col.buffer as ArrayBuffer, t.top.buffer as ArrayBuffer, t.out.buffer as ArrayBuffer, t.idx.buffer as ArrayBuffer);
  (self as unknown as { postMessage: (m: unknown, t: ArrayBuffer[]) => void }).postMessage(tiles, transfer);
};
