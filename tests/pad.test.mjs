import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { PAD_LANDMARKS, PAD_EMOTIONS, padEmotionKind, padEmotionSource, visiblePadEmotions, nearestPadLabels, dirToPad, padColor, padColorHex, PAD_COLOR_GLSL, padEmotion, nearestPadEmotion, ringAngle, ringIntensity, padCameraDistance, padSphereCrop } from '../src/pad-model.js';
import { WARRINER_RATINGS, PAD_WARRINER_LANDMARKS } from '../src/pad-warriner.js';

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

test('curated emotion landmarks retain their PAD values and zero intensity is neutral', () => {
  for (const [name, p, a, d] of PAD_EMOTIONS) assert.equal(padEmotion({ p, a, d }), name);
  assert.equal(padEmotion(dirToPad({ x: .55, y: .42, z: .25 }, .68)), 'Inspired');
  assert.equal(padEmotion(dirToPad({ x: -.8, y: .2, z: .5 }, 0)), 'Neutral');
  assert.equal(padEmotion({ p: -1, a: -.5, d: 1 }), 'PAD');
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

test('intensity ring positions round trip through the 300-degree sweep', () => {
  for (const intensity of [0, .1, .25, .5, .68, .9, 1]) {
    const angle = ringAngle(intensity);
    for (const radius of [1, 140, 600]) {
      const actual = ringIntensity(Math.cos(angle) * radius, Math.sin(angle) * radius);
      assert.ok(Math.abs(actual - intensity) < 1e-10);
      if (intensity === 0 || intensity === 1) assert.equal(actual, intensity);
    }
  }
  assert.ok(Math.abs(ringIntensity(0, 1) - .5) < 1e-12);
  assert.ok(Math.cos(ringAngle(0)) < 0 && Math.sin(ringAngle(0)) < 0, 'low starts on the left');
  assert.ok(Math.cos(ringAngle(1)) > 0 && Math.sin(ringAngle(1)) < 0, 'high ends on the right');
  assert.ok(ringIntensity(-1, 0) < .5);
  assert.ok(ringIntensity(1, 0) > .5);
});

test('the enlarged picker widens endpoint spacing by 25% with matching hit detection', () => {
  const gap = 2 * Math.asin(.5 * 1.25);
  const separation = value => Math.cos(ringAngle(1, value)) - Math.cos(ringAngle(0, value));
  assert.ok(Math.abs(separation(gap) / separation(Math.PI / 3) - 1.25) < 1e-10);
  for (const intensity of [0, .1, .5, .9, 1]) {
    const angle = ringAngle(intensity, gap);
    assert.ok(Math.abs(ringIntensity(Math.cos(angle), Math.sin(angle), gap) - intensity) < 1e-10);
  }
  const oldEndpoint = ringAngle(1);
  assert.equal(ringIntensity(Math.cos(oldEndpoint), Math.sin(oldEndpoint), gap), null);
});

test('the bottom gap and center cannot select an intensity', () => {
  for (let degrees = 241; degrees < 300; degrees++) {
    const angle = THREE.MathUtils.degToRad(degrees);
    assert.equal(ringIntensity(Math.cos(angle), Math.sin(angle)), null);
  }
  assert.equal(ringIntensity(0, 0), null);
  assert.equal(ringIntensity(0, -1), null);
});

test('snapping finds the closest landmark even outside the emotion display threshold', () => {
  for (const [name, p, a, d] of PAD_EMOTIONS) {
    const nearest = nearestPadEmotion({ p: p + .001, a: a - .001, d });
    assert.equal(nearest.name, name);
    const direction = new THREE.Vector3(nearest.p, nearest.a, nearest.d).normalize();
    const intensity = Math.max(Math.abs(nearest.p), Math.abs(nearest.a), Math.abs(nearest.d));
    const result = dirToPad(direction, intensity);
    assert.ok(Math.hypot(result.p - p, result.a - a, result.d - d) < 1e-12);
  }
  const distant = { p: -1, a: -.5, d: 1 };
  assert.equal(padEmotion(distant), 'PAD');
  assert.equal(nearestPadEmotion(distant).name, 'Selfish');
  assert.equal(nearestPadEmotion({ p: .8, a: .5, d: .45 }).name, 'Happy');
  assert.equal(nearestPadEmotion({ p: .75, a: .47, d: .34 }).name, 'Happy');
});

test('surface-nearest emotions and readouts ignore intensity and keep measured coordinates', () => {
  for (const [name, p, a, d] of PAD_EMOTIONS) {
    for (const intensity of [.000001, .01, .1, .5, 1]) {
      const values = dirToPad({ x: p, y: a, z: d }, intensity);
      const nearest = nearestPadEmotion(values);
      assert.equal(nearest.name, name);
      assert.equal(padEmotion(values), name);
      assert.deepEqual([nearest.p, nearest.a, nearest.d], [p, a, d]);
      assert.ok(nearest.distance < 1e-7);
    }
  }
  // This direction used to select different moods as radial intensity changed.
  const direction = new THREE.Vector3(.55, .42, .25);
  const [, p, a, d] = PAD_EMOTIONS.find(([name]) => name === 'Inspired');
  const angle = direction.angleTo(new THREE.Vector3(p, a, d));
  for (const intensity of [.01, .1, .5, .68, 1]) {
    const values = dirToPad(direction, intensity);
    const nearest = nearestPadEmotion(values);
    assert.equal(nearest.name, 'Inspired');
    assert.equal(padEmotion(values), 'Inspired');
    assert.ok(Math.abs(nearest.distance - angle) < 1e-12);
  }
  assert.equal(nearestPadEmotion({ p: 0, a: 0, d: 0 }), null);
  assert.equal(padEmotion({ p: 0, a: 0, d: 0 }), 'Neutral');
});

test('the curated allowlist retains anchors and roughly a 4:1 mix, with no sexual terms', () => {
  assert.equal(PAD_EMOTIONS.length, 64);
  assert.equal(new Set(PAD_EMOTIONS.map(([name]) => name)).size, PAD_EMOTIONS.length);
  for (const name of ['Happy', 'Sad', 'Angry', 'Ennui', 'Fearful', 'Stoic', 'Nostalgic']) {
    assert.ok(PAD_EMOTIONS.some(row => row[0] === name));
  }
  assert.deepEqual(PAD_EMOTIONS.find(([name]) => name === 'Fearful'), ['Fearful', -.64, .60, -.43]);
  const count = kind => PAD_EMOTIONS.filter(([name]) => padEmotionKind(name) === kind).length;
  assert.equal(count('positive'), 40);
  assert.equal(count('negative'), 11);
  assert.equal(count('neutral'), 13);
  for (const row of PAD_EMOTIONS) {
    assert.doesNotMatch(row[0], /arous|sex|lust|erotic|horny|impoten|sensual|seduc|orgasm/i);
    const metadata = padEmotionSource(row[0]);
    const primary = PAD_LANDMARKS.find(([name]) => name === metadata.term);
    const source = primary || PAD_WARRINER_LANDMARKS.find(([name]) => name === metadata.term);
    assert.equal(metadata.year, primary ? 1977 : 2013);
    assert.deepEqual(row.slice(1), source.slice(1), `${row[0]} must keep its source coordinates`);
    assert.ok(Object.isFrozen(row));
  }
});

test('near-synonyms consolidate under the original landmark values', () => {
  const names = PAD_EMOTIONS.map(([name]) => name);
  for (const group of [
    ['Appreciative', 'Grateful', 'Thankful'], ['Humble', 'Modest'],
    ['Nonchalant', 'Relaxed', 'Calm', 'Mellow', 'Leisurely', 'Untroubled'], ['Excited', 'Ecstatic'],
    ['Bold', 'Brave'], ['Kind', 'Compassionate'], ['Startled', 'Surprised', 'Astonished'],
    ['Hopeful', 'Optimistic'], ['Sleepy', 'Drowsy'], ['Fearful', 'Afraid', 'Terrified'],
    ['Loved', 'Love', 'Loving', 'Inlove', 'Affectionate'], ['Sheltered', 'Protected'],
    ['Carefree', 'Free'], ['Humorous', 'Playful'], ['Triumphant', 'Successful'],
  ]) assert.deepEqual(group.filter(name => names.includes(name)), [group[0]]);
  assert.deepEqual(PAD_EMOTIONS.find(([name]) => name === 'Overwhelmed'), ['Overwhelmed', .14, .45, -.24]);
  for (const name of ['Angry', 'Fearful', 'Hopeful', 'Nonchalant', 'Overwhelmed',
    'Selfish', 'Repentant', 'Disgusted', 'Dignified', 'Loved', 'Sheltered', 'Triumphant', 'Appreciative']) {
    assert.equal(PAD_EMOTIONS.find(row => row[0] === name), PAD_LANDMARKS.find(row => row[0] === name));
  }
  assert.equal(PAD_EMOTIONS.filter(([name]) => padEmotionSource(name).year === 1977).length, 45);
});

test('Warriner additions preserve original aggregate ratings and normalize all three axes', () => {
  assert.equal(WARRINER_RATINGS.length, 35);
  assert.deepEqual(WARRINER_RATINGS.find(([word]) => word === 'love'), ['love', 7246, 8, 5.36, 5.92]);
  assert.deepEqual(PAD_WARRINER_LANDMARKS.find(([name]) => name === 'Love'), ['Love', .75, .09, .23]);
  assert.deepEqual(PAD_WARRINER_LANDMARKS.find(([name]) => name === 'Calm'), ['Calm', .4725, -.8325, .61]);
  assert.deepEqual(PAD_EMOTIONS.find(([name]) => name === 'Content'), ['Content', .425, -.4575, .23]);
  assert.deepEqual(PAD_EMOTIONS.find(([name]) => name === 'Emotional'), ['Emotional', .0275, .08, -.125]);
  assert.deepEqual(PAD_EMOTIONS.find(([name]) => name === 'Resolute'), ['Resolute', .2375, -.535, .23]);
  for (const [record, normalized] of [
    [['humorous', 6001, 7.81, 5.33, 6.80], ['Humorous', .7025, .0825, .45]],
    [['sensitive', 10922, 6.33, 3.68, 5.00], ['Sensitive', .3325, -.33, 0]],
    [['understanding', 13041, 7.14, 3.09, 7.31], ['Understanding', .535, -.4775, .5775]],
  ]) {
    assert.deepEqual(WARRINER_RATINGS.find(([word]) => word === record[0]), record);
    assert.deepEqual(PAD_EMOTIONS.find(([name]) => name === normalized[0]), normalized);
  }
  for (const [word, id, ...means] of WARRINER_RATINGS) {
    const row = PAD_WARRINER_LANDMARKS.find(([name]) => name.toLowerCase() === word);
    assert.ok(Number.isInteger(id) && id > 0);
    assert.ok(means.every(mean => mean >= 1 && mean <= 9));
    means.forEach((mean, i) => assert.ok(Math.abs(row[i + 1] * 4 + 5 - mean) < 1e-12));
    if (PAD_EMOTIONS.includes(row)) assert.equal(padEmotionSource(row[0]).year, 2013);
  }
});

test('the revised 64 terms reduce surface gaps and crowding without changing intensity', () => {
  // Compare equal-size sets using the archived measurements, including terms
  // replaced in this revision. Normalize every vector so radius cannot help.
  const previousNames = ['Happy', 'Kind', 'Secure', 'Bold', 'Humble', 'Protected', 'Impressed', 'Respectful', 'Devoted',
    'Grateful', 'Reverent', 'Consoled', 'Relaxed', 'Curious', 'Fascinated', 'Awed', 'Excited', 'Inspired', 'Powerful',
    'Cooperative', 'Free', 'Content', 'Confident', 'Hopeful', 'Patient', 'Successful', 'Nostalgic', 'Playful', 'Attentive', 'Proud', 'Lucky',
    'Relief', 'Resolute', 'Resilient', 'Vigorous', 'Dignified', 'Empathy', 'Assertive', 'Affectionate', 'Receptive',
    'Surprised', 'Overwhelmed', 'Reserved', 'Aloof', 'Quiet', 'Serious', 'Reflective', 'Indifferent', 'Sleepy', 'Stoic', 'Anticipation', 'Indulgent',
    'Emotional', 'Sad', 'Angry', 'Ennui', 'Frustrated', 'Timid', 'Dissatisfied', 'Defiant', 'Anxious', 'Confused', 'Selfish', 'Repentant'];
  const original = previousNames.map(name => PAD_LANDMARKS.find(row => row[0] === name)
    || PAD_WARRINER_LANDMARKS.find(row => row[0] === name));
  assert.equal(original.length, 64);
  assert.ok(original.every(Boolean));
  function gaps(rows) {
    const directions = rows.map(([, p, a, d]) => new THREE.Vector3(p, a, d).normalize());
    return Array.from({ length: 5000 }, (_, i) => {
      const z = 1 - 2 * (i + .5) / 5000, r = Math.sqrt(1 - z * z), theta = Math.PI * (3 - Math.sqrt(5)) * i;
      const point = new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), z);
      return Math.min(...directions.map(dir => point.angleTo(dir)));
    });
  }
  const before = gaps(original), after = gaps(PAD_EMOTIONS);
  assert.ok(Math.max(...after) < THREE.MathUtils.degToRad(34));
  assert.ok(Math.max(...after) < Math.max(...before) * .92);
  assert.ok(after.reduce((sum, gap) => sum + gap, 0) < before.reduce((sum, gap) => sum + gap, 0) * .95);
  const largeGaps = values => values.filter(gap => gap > THREE.MathUtils.degToRad(30)).length;
  assert.ok(largeGaps(after) < largeGaps(before) * .4);
  const directions = PAD_EMOTIONS.map(([, p, a, d]) => new THREE.Vector3(p, a, d).normalize());
  for (let i = 0; i < directions.length; i++) for (let j = i + 1; j < directions.length; j++) {
    assert.ok(directions[i].angleTo(directions[j]) > THREE.MathUtils.degToRad(5.9),
      `${PAD_EMOTIONS[i][0]} and ${PAD_EMOTIONS[j][0]} must leave room for distinct points`);
  }
});

test('twenty visible points retain the nearest four, selection, hover, and angular coverage', () => {
  const direction = { x: .55, y: .42, z: .25 };
  const candidates = PAD_EMOTIONS.map(([name], index) => ({ name, x: 300 + index * 2, y: 200 }));
  const chosen = visiblePadEmotions(candidates, direction, 'Ennui', 'Fearful');
  assert.equal(chosen.length, 20);
  assert.equal(new Set(chosen).size, 20);
  for (const name of ['Inspired', 'Happy', 'Friendly', 'Excited', 'Ennui', 'Fearful']) {
    assert.ok(chosen.some(item => item.name === name));
  }
  assert.deepEqual(nearestPadLabels(chosen, direction).map(item => item.name), ['Inspired', 'Happy', 'Friendly', 'Excited']);
  // The low-arousal and negative-dominance poles should get points even when
  // all four reticle neighbors are from the more familiar positive group.
  for (const direction of [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)]) {
    assert.ok(chosen.some(item => {
      const [, p, a, d] = PAD_EMOTIONS.find(([name]) => name === item.name);
      return direction.angleTo(new THREE.Vector3(p, a, d)) < Math.PI / 6;
    }));
  }
  const few = candidates.slice(-4);
  assert.equal(visiblePadEmotions(few, direction).length, 4);
  assert.equal(nearestPadLabels(few, direction).length, 4);
  assert.deepEqual(visiblePadEmotions([], direction), []);
  assert.deepEqual(nearestPadLabels([], direction), []);
});

test('labels use surface distance regardless of intensity, screen projection, valence or order', () => {
  const candidates = PAD_EMOTIONS.map(([name], index) => ({ name, x: 100 + index, y: 100 + index * 2 }));
  const direction = new THREE.Vector3(.55, .42, .25);
  const chosen = nearestPadLabels(candidates, direction);
  assert.equal(chosen.length, 4);
  assert.deepEqual(chosen.map(item => item.name), ['Inspired', 'Happy', 'Friendly', 'Excited']);
  assert.deepEqual(nearestPadLabels([...candidates].reverse(), direction), chosen);
  for (const scale of [.001, .1, .5, 1, 10]) {
    assert.deepEqual(nearestPadLabels(candidates, direction.clone().multiplyScalar(scale)), chosen);
  }
  const reprojected = candidates.map(item => ({ name: item.name, x: -item.x * 4, y: item.y / 2 }));
  assert.deepEqual(nearestPadLabels(reprojected, direction).map(item => item.name), chosen.map(item => item.name));
  const visible = visiblePadEmotions(candidates, direction, 'Happy', 'Overwhelmed');
  assert.deepEqual(nearestPadLabels(visible, direction), chosen);
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

test('the logo source crop includes the complete perspective circle at every selector aspect ratio', () => {
  for (const aspect of [.35, .65, 1, 1.5, 3]) {
    const camera = new THREE.PerspectiveCamera(34, aspect, .1, 100);
    const distance = padCameraDistance(aspect);
    camera.position.z = distance;
    camera.updateMatrixWorld();
    const [x, y, width, height] = padSphereCrop(aspect);
    assert.ok(x >= 0 && y >= 0 && x + width <= 1 && y + height <= 1);
    assert.ok(Math.abs(width * aspect - height) < 1e-12, 'the crop is circular in pixels');
    const radius = 1.51, z = radius * radius / distance;
    const transverse = Math.sqrt(radius * radius - z * z);
    const right = new THREE.Vector3(transverse, 0, z).project(camera);
    const top = new THREE.Vector3(0, transverse, z).project(camera);
    assert.ok(Math.abs(x + width - (right.x + 1) / 2) < 1e-12);
    assert.ok(Math.abs(y + height - (top.y + 1) / 2) < 1e-12);
    assert.ok(Math.abs(x + width / 2 - .5) < 1e-12);
    assert.ok(Math.abs(y + height / 2 - .5) < 1e-12);
  }
});
