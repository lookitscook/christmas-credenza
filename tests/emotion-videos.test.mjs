import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { PAD_EMOTIONS } from '../src/pad-model.js';
import { EMOTION_VIDEO_NAMES, emotionVideoUrl, randomEmotionVideo } from '../src/emotion-videos.js';

test('every dropdown emotion has a matching web video', async () => {
  assert.deepEqual(EMOTION_VIDEO_NAMES, PAD_EMOTIONS.map(([name]) => name));
  await Promise.all(EMOTION_VIDEO_NAMES.map(async name => {
    const url = emotionVideoUrl(name);
    assert.match(url, new RegExp(`/content/emotions/${name.toLowerCase()}\\.mp4$`));
    await access(new URL(url));
  }));
  assert.equal(emotionVideoUrl('not-an-emotion'), null);
});

test('random editor videos span the curated set deterministically at the bounds', () => {
  assert.equal(randomEmotionVideo(() => 0).name, EMOTION_VIDEO_NAMES[0]);
  assert.equal(randomEmotionVideo(() => .999999).name, EMOTION_VIDEO_NAMES.at(-1));
});
