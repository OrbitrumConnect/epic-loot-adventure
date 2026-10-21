/**
 * EMPURRÃO de criaturas (furacão/bumerangue do herói e da base). O bicho na tela é guiado
 * pelo próprio AI (`hostile-ai`), então só mudar a posição gravada no store não empurrava de
 * verdade. Aqui fica uma fila de empurrão por criatura que o AI CONSOME suave (~0,2 s) somando
 * ao movimento — e passa pelas mesmas colisões (muro, casa, fábrica): "colisão leve".
 */
const pending = new Map<string, { x: number; z: number }>();

/** Enfileira um empurrão (m) pra criatura. Empurrões seguidos somam. */
export function queueKnockback(id: string, dx: number, dz: number): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
  const p = pending.get(id) ?? { x: 0, z: 0 };
  p.x += dx;
  p.z += dz;
  pending.set(id, p);
}

/** O AI consome uma fatia do empurrão por quadro (suave). null = nada pendente. */
export function takeKnockback(id: string, dt: number): { x: number; z: number } | null {
  const p = pending.get(id);
  if (!p) return null;
  const k = Math.min(1, dt * 10);
  const out = { x: p.x * k, z: p.z * k };
  p.x -= out.x;
  p.z -= out.z;
  if (Math.abs(p.x) + Math.abs(p.z) < 0.01) pending.delete(id);
  return out;
}

/** Quanto ainda falta empurrar (testes/debug). */
export function pendingKnockback(id: string): { x: number; z: number } | null {
  return pending.get(id) ?? null;
}
