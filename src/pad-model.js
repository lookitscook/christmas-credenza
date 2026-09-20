import { PAD_LANDMARKS } from './pad-landmarks.js';
export { PAD_LANDMARKS };

export function dirToPad(dir, intensity) {
  const maximum = Math.max(Math.abs(dir.x), Math.abs(dir.y), Math.abs(dir.z)) || 1;
  const amount = Math.max(0, Math.min(1, intensity));
  return { p: dir.x / maximum * amount, a: dir.y / maximum * amount, d: dir.z / maximum * amount };
}

// Preserve the supplied project's video-range conversion coefficients, with the
// reference's inverted P → U. Its RGB result is already display-encoded sRGB.
const YUV_MATRIX = [[1.164, 0, 1.596], [1.164, -.392, -.813], [1.164, 2.017, 0]];
export function padColor(p, a, d) {
  const yuv = [(d + 1) * 127.5 - 16, (1 - p) * 127.5 - 128, (a + 1) * 127.5 - 128];
  return YUV_MATRIX.map(row => Math.max(0, Math.min(255, row.reduce((sum, coefficient, i) => sum + coefficient * yuv[i], 0))) / 255);
}

export function padColorHex(p, a, d) {
  return `#${padColor(p, a, d).map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
}

// Share the conversion matrix with the per-fragment sphere shader. Mapping each
// pixel before clipping avoids interpolating between already-clipped vertex colors.
export const PAD_COLOR_GLSL = `
vec3 padSrgbColor(vec3 pad) {
  vec3 yuv = vec3((pad.z + 1.0) * 127.5 - 16.0, (1.0 - pad.x) * 127.5 - 128.0, (pad.y + 1.0) * 127.5 - 128.0);
  return clamp(vec3(${YUV_MATRIX.map(row => `dot(yuv, vec3(${row.map(value => value.toFixed(3)).join(', ')}))`).join(', ')}), 0.0, 255.0) / 255.0;
}`;

export function nearestPadEmotion({ p, a, d }) {
  let result, nearest = Infinity;
  for (const [name, pleasure, arousal, dominance] of PAD_LANDMARKS) {
    const distance = Math.hypot(p - pleasure, a - arousal, d - dominance);
    if (distance < nearest) {
      nearest = distance;
      result = { name, p: pleasure, a: arousal, d: dominance, distance };
    }
  }
  return result;
}

export function padEmotion(values) {
  if (Math.max(Math.abs(values.p), Math.abs(values.a), Math.abs(values.d)) < .00001) return 'Neutral';
  const nearest = nearestPadEmotion(values);
  return nearest.distance < .48 ? nearest.name : 'PAD';
}

export const RING_START = Math.PI * 7 / 4;
export const RING_SWEEP = Math.PI * 3 / 2;
export function ringAngle(intensity) { return RING_START + RING_SWEEP * intensity; }

export function ringIntensity(x, y) {
  if (x === 0 && y === 0) return null;
  const angle = (Math.atan2(y, x) - RING_START + Math.PI * 4) % (Math.PI * 2);
  // The bottom 90 degrees are inactive, including during a captured drag.
  return angle > RING_SWEEP + 1e-10 ? null : Math.min(1, angle / RING_SWEEP);
}

export function padCameraDistance(aspect, fov = 34) {
  // Fit the complete ring and knob on the shorter viewport dimension.
  return 2.08 / (Math.tan(fov * Math.PI / 360) * Math.min(1, Math.max(.01, aspect)));
}
