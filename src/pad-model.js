import { PAD_LANDMARKS } from './pad-landmarks.js';
import { PAD_WARRINER_LANDMARKS } from './pad-warriner.js';
export { PAD_LANDMARKS };

// Reviewed allowlist: merge near-synonyms, preferring a 1977 landmark for each
// concept. Supplemental terms fill gaps rather than competing with those anchors.
// Categories and familiarity order are editorial, not study classifications.
// Supplement the original directions with measured word ratings to fill gaps;
// never move a landmark or pull unreviewed (including sexual) terms into the UI.
const EMOTION_NAMES = {
  positive: ['Happy', 'Kind', 'Secure', 'Bold', 'Humble', 'Protected', 'Impressed', 'Respectful', 'Devoted',
    'Grateful', 'Reverent', 'Consoled', 'Relaxed', 'Curious', 'Fascinated', 'Awed', 'Excited', 'Inspired', 'Powerful',
    'Cooperative', 'Free', 'Content', 'Confident', 'Hopeful', 'Patient', 'Successful', 'Nostalgic', 'Playful', 'Attentive', 'Proud', 'Lucky',
    'Relief', 'Resolute', 'Resilient', 'Vigorous', 'Dignified', 'Empathy', 'Assertive', 'Affectionate', 'Receptive'],
  neutral: ['Surprised', 'Overwhelmed', 'Reserved', 'Aloof', 'Quiet', 'Serious', 'Reflective', 'Indifferent',
    'Sleepy', 'Stoic', 'Anticipation', 'Indulgent', 'Emotional'],
  negative: ['Sad', 'Angry', 'Ennui', 'Frustrated', 'Timid', 'Dissatisfied', 'Defiant', 'Anxious', 'Confused', 'Selfish', 'Repentant'],
};
const emotionKinds = new Map(Object.entries(EMOTION_NAMES).flatMap(([kind, names]) => names.map(name => [name, kind])));
const emotionSources = new Map();
export const PAD_EMOTIONS = Object.freeze([...emotionKinds.keys()].map(name => {
  const primary = PAD_LANDMARKS.find(row => row[0] === name);
  const row = primary || PAD_WARRINER_LANDMARKS.find(row => row[0] === name);
  emotionSources.set(name, Object.freeze({ year: primary ? 1977 : 2013, term: row[0] }));
  return row;
}));
export function padEmotionSource(name) { return emotionSources.get(name); }
export const PAD_VISIBLE_LIMIT = 20;
export const PAD_LABEL_LIMIT = 4;
export function padEmotionKind(name) { return emotionKinds.get(name); }
const emotionOrder = new Map(PAD_EMOTIONS.map(([name], index) => [name, index]));
const sourcePriority = (a, b) => padEmotionSource(a.name).year - padEmotionSource(b.name).year
  || emotionOrder.get(a.name) - emotionOrder.get(b.name);
const emotionDirections = new Map(PAD_EMOTIONS.map(([name, p, a, d]) => {
  const length = Math.hypot(p, a, d);
  return [name, [p / length, a / length, d / length]];
}));
function emotionSeparation(a, b) {
  const left = emotionDirections.get(a.name), right = emotionDirections.get(b.name);
  const dot = left.reduce((sum, value, i) => sum + value * right[i], 0);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

// Screen distance matches what the user sees around the fixed center reticle.
export function nearestPadLabels(candidates, reticle) {
  const distance = item => Math.hypot(item.x - reticle.x, item.y - reticle.y);
  return candidates.filter(item => emotionOrder.has(item.name))
    .sort((a, b) => distance(a) - distance(b) || emotionOrder.get(a.name) - emotionOrder.get(b.name))
    .slice(0, PAD_LABEL_LIMIT);
}

export function visiblePadEmotions(candidates, reticle, selectedName, hoveredName) {
  const ranked = candidates.filter(item => emotionOrder.has(item.name))
    .sort(sourcePriority);
  const chosen = [];
  function add(item) {
    if (item && chosen.length < PAD_VISIBLE_LIMIT && !chosen.includes(item)) chosen.push(item);
  }
  // Reserve the closest four before distributing the other points, so neither
  // valence preferences nor hover can hide a point that should have a label.
  nearestPadLabels(ranked, reticle).forEach(add);
  add(ranked.find(item => item.name === hoveredName));
  add(ranked.find(item => item.name === selectedName));
  while (chosen.length < Math.min(PAD_VISIBLE_LIMIT, ranked.length)) {
    const scores = ranked.filter(item => !chosen.includes(item)).map(item => ({ item,
      gap: Math.min(...chosen.map(other => emotionSeparation(item, other))) }));
    const bestGap = Math.max(...scores.map(score => score.gap));
    // Fill the biggest angular gaps. Original 1977 landmarks win close ties
    // before valence/familiarity; supplemental terms cover distinct directions.
    add(scores.find(score => score.gap >= bestGap - Math.PI / 60).item);
  }
  return chosen;
}

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
  for (const [name, pleasure, arousal, dominance] of PAD_EMOTIONS) {
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
