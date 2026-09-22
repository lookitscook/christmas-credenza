import { PAD_EMOTIONS } from './pad-model.js';

export const EMOTION_VIDEO_NAMES = Object.freeze(PAD_EMOTIONS.map(([name]) => name));

export function emotionVideoUrl(name) {
  const canonical = EMOTION_VIDEO_NAMES.find(candidate => candidate.toLowerCase() === String(name).toLowerCase());
  if (!canonical) return null;
  const filename = `${canonical.toLowerCase()}.mp4`;
  return new URL(`../content/emotions/${filename}`, import.meta.url).href;
}

export function randomEmotionVideo(random = Math.random) {
  const index = Math.min(EMOTION_VIDEO_NAMES.length - 1, Math.floor(random() * EMOTION_VIDEO_NAMES.length));
  const name = EMOTION_VIDEO_NAMES[Math.max(0, index)];
  return { name, url: emotionVideoUrl(name) };
}
