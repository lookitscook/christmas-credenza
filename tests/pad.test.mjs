import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { PAD_LANDMARKS, dirToPad, padColor, padColorHex, PAD_COLOR_GLSL, padEmotion, nearestPadEmotion, ringAngle, ringIntensity, padCameraDistance } from '../src/pad-model.js';

test('all 151 Table 4 mean triplets are present in original row order', () => {
  assert.equal(PAD_LANDMARKS.length, 151);
  assert.equal(new Set(PAD_LANDMARKS.map(([name]) => name)).size, 151);
  // Spot checks span all four printed pages, including low-magnitude means and
  // multi-word terms that disappear from abbreviated/common-emotion datasets.
  for (const [number, row] of [
    [1, ['Bold', .44, .61, .66]], [40, ['Proud and lonely', .01, .02, .26]],
    [44, ['Thankful', .61, .10, -.13]], [45, ['Respectful', .38, .13, -.08]],
    [62, ['Secure', .74, -.13, .03]], [82, ['Angry', -.51, .59, .25]],
    [91, ['Skeptical', -.22, .21, .03]], [92, ['Burdened with responsibility', -.08, .28, .19]],
    [118, ['Guilty', -.57, -.28, -.34]], [138, ['Subdued', -.17, -.26, -.18]],
    [139, ['Impotent', -.53, -.13, -.29]], [141, ['Blasé', -.29, -.51, -.16]],
    [151, ['Sad', -.63, -.27, -.33]],
  ]) assert.deepEqual(PAD_LANDMARKS[number - 1], row);
  for (const row of PAD_LANDMARKS) {
    assert.equal(row.length, 4);
    assert.ok(row.slice(1).every(value => Number.isFinite(value) && Math.abs(value) <= 1));
    assert.ok(Object.isFrozen(row));
  }
});

test('PAD directions retain the source cube mapping and intensity bounds', () => {
  assert.deepEqual(dirToPad({ x: 1, y: .5, z: -.25 }, .8), { p: .8, a: .4, d: -.2 });
  assert.deepEqual(dirToPad({ x: 10, y: 5, z: -2.5 }, .8), { p: .8, a: .4, d: -.2 });
  assert.deepEqual(dirToPad({ x: 0, y: 0, z: 0 }, 1), { p: 0, a: 0, d: 0 });
  assert.deepEqual(dirToPad({ x: 1, y: 1, z: 1 }, 4), { p: 1, a: 1, d: 1 });
  assert.deepEqual(dirToPad({ x: 1, y: 1, z: 1 }, -1), { p: 0, a: 0, d: 0 });
});

test('source emotion landmarks are preserved and zero intensity is neutral', () => {
  for (const [name, p, a, d] of PAD_LANDMARKS) assert.equal(padEmotion({ p, a, d }), name);
  assert.equal(padEmotion(dirToPad({ x: .55, y: .42, z: .25 }, .68)), 'Lucky');
  assert.equal(padEmotion(dirToPad({ x: -.8, y: .2, z: .5 }, 0)), 'Neutral');
  assert.equal(padEmotion({ p: -1, a: -1, d: 1 }), 'PAD');
});

test('PAD colors remain clipped and the neutral source color stays gray', () => {
  for (const p of [-1, 0, 1]) for (const a of [-1, 0, 1]) for (const d of [-1, 0, 1]) {
    for (const channel of padColor(p, a, d)) assert.ok(channel >= 0 && channel <= 1);
  }
  for (const channel of padColor(0, 0, 0)) assert.ok(Math.abs(channel - .5) < .02);
  const darker = padColor(.2, -.1, -.5), lighter = padColor(.2, -.1, .5);
  assert.ok(lighter.every((channel, index) => channel > darker[index]));
});

test('YUV mapping inverts pleasure and produces display sRGB without extra gamma', () => {
  assert.equal(padColorHex(0, 0, 0), '#818281');
  assert.equal(padColorHex(.81, .51, .46), '#ffba00'); // Happy, Table 4 row 31.
  assert.equal(padColorHex(-.51, .59, .25), '#ff51ff'); // Angry, row 82.
  assert.equal(padColorHex(-.63, -.27, -.33), '#194ef2'); // Sad, row 151.
  assert.ok(padColor(.5, 0, 0)[2] < padColor(-.5, 0, 0)[2]);
  assert.match(PAD_COLOR_GLSL, /1\.0 - pad\.x/);
  assert.match(PAD_COLOR_GLSL, /1\.164, -0\.392, -0\.813/);
});

test('intensity ring positions round trip through the 270-degree sweep', () => {
  for (const intensity of [0, .1, .25, .5, .68, .9, 1]) {
    const angle = ringAngle(intensity);
    for (const radius of [1, 140, 600]) {
      assert.ok(Math.abs(ringIntensity(Math.cos(angle) * radius, Math.sin(angle) * radius) - intensity) < 1e-10);
    }
  }
  assert.ok(Math.abs(ringIntensity(0, 1) - .5) < 1e-12);
  assert.ok(Math.cos(ringAngle(0)) > 0 && Math.sin(ringAngle(0)) < 0);
  assert.ok(Math.cos(ringAngle(1)) < 0 && Math.sin(ringAngle(1)) < 0);
});

test('the bottom gap and center cannot select an intensity', () => {
  for (let degrees = 226; degrees < 315; degrees++) {
    const angle = THREE.MathUtils.degToRad(degrees);
    assert.equal(ringIntensity(Math.cos(angle), Math.sin(angle)), null);
  }
  assert.equal(ringIntensity(0, 0), null);
  assert.equal(ringIntensity(0, -1), null);
});

test('snapping finds the closest landmark even outside the emotion display threshold', () => {
  for (const [name, p, a, d] of PAD_LANDMARKS) {
    const nearest = nearestPadEmotion({ p: p + .001, a: a - .001, d });
    assert.equal(nearest.name, name);
    const direction = new THREE.Vector3(nearest.p, nearest.a, nearest.d).normalize();
    const intensity = Math.max(Math.abs(nearest.p), Math.abs(nearest.a), Math.abs(nearest.d));
    const result = dirToPad(direction, intensity);
    assert.ok(Math.hypot(result.p - p, result.a - a, result.d - d) < 1e-12);
  }
  const distant = { p: -1, a: -1, d: 1 };
  assert.equal(padEmotion(distant), 'PAD');
  assert.equal(nearestPadEmotion(distant).name, 'Uninterested');
  assert.equal(nearestPadEmotion({ p: .8, a: .5, d: .45 }).name, 'Happy');
  assert.equal(nearestPadEmotion({ p: .75, a: .47, d: .34 }).name, 'Joyful');
});

test('camera framing keeps the complete ring and knob visible in portrait and landscape', () => {
  for (const aspect of [.35, .65, 1, 1.5, 3]) {
    const camera = new THREE.PerspectiveCamera(34, aspect, .1, 100);
    camera.position.z = padCameraDistance(aspect, camera.fov);
    camera.updateMatrixWorld();
    for (let i = 0; i < 72; i++) {
      const angle = i / 72 * Math.PI * 2;
      const point = new THREE.Vector3(Math.cos(angle) * 1.94, Math.sin(angle) * 1.94, .075).project(camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
    }
  }
});
