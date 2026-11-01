// Interpolate the original closed filament; do not change its geometry.
export function sampleFilament(screen, samples, index, out) {
  const wrapped = ((index % samples) + samples) % samples;
  const whole = Math.floor(wrapped), fraction = wrapped - whole;
  const a = whole * 4, b = ((whole + 1) % samples) * 4;
  for (let k = 0; k < 4; k++) out[k] = screen[a + k] + (screen[b + k] - screen[a + k]) * fraction;
  return out;
}

export function resolutionFor(width, height, dpr = 1, quality = 'high') {
  if (quality === 'reference') return Math.min(dpr, 1.15, 1550 / width);
  const maxWidth = quality === 'ultra' ? 5120 : 3200;
  const maxPixels = quality === 'ultra' ? 14_745_600 : 8_294_400;
  return Math.min(Math.max(dpr, 1.25), 2, maxWidth / width, Math.sqrt(maxPixels / (width * height)));
}

export function sphereResolution(cssSize, dpr = 1, quality = 'high') {
  if (quality === 'reference') return Math.max(160, Math.min(920, Math.round(cssSize * Math.min(dpr, 1.6))));
  return Math.max(160, Math.min(quality === 'ultra' ? 2048 : 1600, Math.round(cssSize * Math.max(2, Math.min(dpr, 2.5)))));
}
