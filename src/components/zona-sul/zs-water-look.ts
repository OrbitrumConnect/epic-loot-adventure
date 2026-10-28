/**
 * ZONA SUL — o VISUAL da água num lugar só: o mar (zs-water) e a malha da onda do surf (surf-break) usam os mesmos
 * valores e a mesma ondulação. Sem isso a zona do surf aparecia como um retângulo de outra cor no mar.
 */
export const ZS_WATER_LOOK = { color: '#2b6f8f', opacity: 0.78, roughness: 0.18, metalness: 0.05 } as const;

/** Relógio da ondulação (avançado pelo mar, ZsWater): a onda usa O MESMO, então a ondulação casa na emenda. */
export const zsWaterTime = { value: 0 };

/** Ondulação fina na normal (fragmento). Precisa de `uniform float uTime` e `varying vec2 vWaveXZ` (x, z do mundo). */
export const ZS_RIPPLE_GLSL = `
  vec2 wq = vWaveXZ * 0.18;
  float w1 = sin(wq.x * 1.7 + uTime * 0.9) + sin(wq.y * 2.3 - uTime * 0.7);
  float w2 = sin((wq.x + wq.y) * 3.1 + uTime * 1.3);
  // some com a distância: longe a ondulação "tremia" em listras (vista de cima, 28/10)
  float wfade = clamp(1.0 - length(vViewPosition) / 180.0, 0.0, 1.0);
  normal = normalize(normal + wfade * vec3(cos(wq.x * 1.7 + uTime * 0.9) * 0.06 + w2 * 0.03, 0.0, cos(wq.y * 2.3 - uTime * 0.7) * 0.06 - w1 * 0.01));`;
