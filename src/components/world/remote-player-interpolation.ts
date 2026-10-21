import type { RemotePoseSample } from '@/net/multiplayer';

export type InterpolatedRemotePose = {
  x: number;
  z: number;
  yaw: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpola dois estados; fora do intervalo, mantém o estado mais próximo. */
export function interpolateRemotePose(
  first: RemotePoseSample,
  second: RemotePoseSample,
  at: number,
): InterpolatedRemotePose {
  const span = second.receivedAt - first.receivedAt;
  const t = span > 0 ? Math.max(0, Math.min(1, (at - first.receivedAt) / span)) : 1;
  let yawDelta = second.pose.yaw - first.pose.yaw;
  while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  return {
    x: lerp(first.pose.x, second.pose.x, t),
    z: lerp(first.pose.z, second.pose.z, t),
    yaw: first.pose.yaw + yawDelta * t,
  };
}

/** Renderiza atrasado; extrapola só durante uma lacuna curta e congela depois. */
export function resolveRemotePose(
  history: readonly RemotePoseSample[],
  renderAt: number,
  now: number,
  maxExtrapolationMs = 150,
): InterpolatedRemotePose | null {
  if (history.length === 0) return null;
  if (history.length === 1 || renderAt <= history[0]!.receivedAt) {
    return interpolateRemotePose(history[0]!, history[0]!, renderAt);
  }
  for (let i = 1; i < history.length; i += 1) {
    if (renderAt <= history[i]!.receivedAt) {
      return interpolateRemotePose(history[i - 1]!, history[i]!, renderAt);
    }
  }
  const last = history[history.length - 1]!;
  const previous = history[history.length - 2]!;
  const age = now - last.receivedAt;
  if (age <= 0 || age > maxExtrapolationMs) return interpolateRemotePose(last, last, now);
  const span = last.receivedAt - previous.receivedAt;
  if (span <= 0) return interpolateRemotePose(last, last, now);
  const ratio = age / span;
  return {
    x: last.pose.x + (last.pose.x - previous.pose.x) * ratio,
    z: last.pose.z + (last.pose.z - previous.pose.z) * ratio,
    yaw: last.pose.yaw + (last.pose.yaw - previous.pose.yaw) * ratio,
  };
}
