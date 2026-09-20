import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_DEFAULTS } from '../src/camera-controls.js';
import { CRT_DEFAULTS } from '../src/crt-shader.js';
import { SCENE_HATCH_DEFAULTS } from '../src/cross-hatch.js';
import { STATE_APP, STATE_VERSION, STATE_COOKIE, MAX_STATE_BYTES, parseSceneState, validateSceneState, readStateCookie, writeStateCookie, createScenePersistence } from '../src/scene-state.js';

function fixture() {
  return {
    app: STATE_APP, version: STATE_VERSION, camera: structuredClone(CAMERA_DEFAULTS),
    train: { running: true, position: 2.45, wheelTravel: 25.62 },
    tv: { enabled: false, currentTime: 12.375 },
    crt: { enabled: false, parameters: { ...CRT_DEFAULTS, brightness: 1.43 } },
    effect: 'cross-hatch', hatch: { ...SCENE_HATCH_DEFAULTS },
    panels: { crt: false, hatch: true },
  };
}
function cookieDocument() {
  let cookie = 'unrelated=kept';
  return Object.assign(new EventTarget(), {
    getCookie: () => cookie,
    setCookie: value => { cookie = `unrelated=kept; ${value.split(';')[0]}`; },
  });
}
function withCookie(doc) {
  Object.defineProperty(doc, 'cookie', { get: doc.getCookie, set: doc.setCookie, configurable: true });
  return doc;
}

test('JSON and cookie round trips preserve the complete scene and fit in one cookie', () => {
  const state = fixture();
  assert.deepEqual(parseSceneState(JSON.stringify(state, null, 2)), state);
  const doc = withCookie(cookieDocument());
  assert.equal(writeStateCookie(doc, state, true), true);
  assert.ok(doc.cookie.length < 4000);
  assert.deepEqual(readStateCookie(doc), state);
  assert.match(doc.cookie, /unrelated=kept/);
});

test('invalid imports are rejected and numeric limits are normalized', () => {
  assert.throws(() => parseSceneState('{broken'), /valid JSON/);
  assert.throws(() => parseSceneState(' '.repeat(MAX_STATE_BYTES + 1)), /too large/);
  for (const change of [
    state => { state.version = 2; },
    state => { delete state.camera; },
    state => { state.camera.target = [0, null, 0]; },
    state => { state.tv.currentTime = Infinity; },
    state => { state.crt.enabled = 'false'; },
    state => { state.effect = 'unknown'; },
  ]) {
    const state = fixture(); change(state);
    assert.throws(() => validateSceneState(state));
  }
  const state = fixture();
  state.camera.distance = 1000;
  state.crt.parameters.brightness = 99;
  state.hatch.scale = -.2;
  state.hatch.contour = 2.45678;
  state.unrecognized = 'ignored';
  const normalized = validateSceneState(state);
  assert.equal(normalized.camera.distance, 4.8);
  assert.equal(normalized.crt.parameters.brightness, 1.8);
  assert.equal(normalized.hatch.scale, .1);
  assert.equal(normalized.hatch.contour, 2.46);
  assert.equal(normalized.unrecognized, undefined);
});

test('corrupt or blocked cookies do not look like successful saves', () => {
  assert.throws(() => readStateCookie({ cookie: `${STATE_COOKIE}=%ZZ` }));
  const doc = { get cookie() { return ''; }, set cookie(value) {} };
  assert.equal(writeStateCookie(doc, fixture()), false);
});

test('older scene snapshots restore supported settings and discard obsolete paper selections', () => {
  const expected = fixture();
  const legacy = structuredClone(expected);
  legacy.hatch.paper = 'Craft rough';
  assert.deepEqual(parseSceneState(JSON.stringify(legacy)), expected);
});

test('edge fade round trips, defaults for older saves, and rejects invalid values', () => {
  const state = fixture();
  delete state.hatch.edgeFade;
  assert.equal(parseSceneState(JSON.stringify(state)).hatch.edgeFade, .16);
  for (const [input, expected] of [[0, 0], [.31, .31], [.5, .5], [-1, 0], [2, .5]]) {
    state.hatch.edgeFade = input;
    assert.equal(parseSceneState(JSON.stringify(state)).hatch.edgeFade, expected);
    const doc = withCookie(cookieDocument());
    writeStateCookie(doc, state);
    assert.equal(readStateCookie(doc).hatch.edgeFade, expected);
  }
  for (const input of [null, '25%', NaN, Infinity]) {
    state.hatch.edgeFade = input;
    assert.throws(() => validateSceneState(state), /edgeFade/);
  }
});

test('scene imports and cookies normalize retired CMYK and ink controls', () => {
  const expected = fixture();
  expected.hatch.scale = 1.2;
  for (const saved of [
    { cyan: 0, magenta: .25, yellow: .75, black: .35, inkColor: '#336699' },
    { cyan: null, magenta: 'obsolete', yellow: -5, black: 'obsolete', inkColor: '<script>' },
    {},
  ]) {
    const legacy = structuredClone(expected);
    for (const key of ['cyan', 'magenta', 'yellow', 'black', 'inkColor']) delete legacy.hatch[key];
    Object.assign(legacy.hatch, saved);
    assert.deepEqual(parseSceneState(JSON.stringify(legacy)), expected);
    const doc = withCookie(cookieDocument());
    writeStateCookie(doc, legacy);
    assert.deepEqual(readStateCookie(doc), expected);
  }
});

test('persistence restores on load, validates imports before applying, and flushes on pagehide', async t => {
  const doc = withCookie(cookieDocument());
  const win = new EventTarget();
  const storage = new Map();
  const globals = { document: doc, window: win, location: { protocol: 'http:' },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  const descriptors = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  let persistence;
  t.after(() => {
    persistence?.dispose();
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const elements = Object.fromEntries(['[data-state-status]', '[data-action="export-state"]', '[data-action="import-state"]', '[data-state-file]'].map(key => [key, new EventTarget()]));
  const root = Object.assign(new EventTarget(), { querySelector: selector => elements[selector] });
  const expected = fixture();
  writeStateCookie(doc, expected);
  let current = fixture(), applications = 0;
  persistence = createScenePersistence(root, () => current, state => { current = state; applications++; });
  assert.equal(applications, 1);
  assert.deepEqual(current, expected);
  const input = elements['[data-state-file]'];
  input.files = [{ size: 10, text: async () => '{invalid}' }];
  input.dispatchEvent(new Event('change'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(applications, 1);
  assert.match(elements['[data-state-status]'].textContent, /Could not import/);
  const imported = fixture(); imported.camera.target = [.5, 1.5, .1]; imported.tv.enabled = true;
  const text = JSON.stringify(imported);
  input.files = [{ size: text.length, text: async () => text }];
  input.dispatchEvent(new Event('change'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(applications, 2);
  assert.deepEqual(current, imported);
  assert.deepEqual(readStateCookie(doc), imported);
  current.train.position = 3.5;
  current.tv.currentTime = 19;
  win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(readStateCookie(doc), current);
  persistence.dispose();
  // The offline edition has no cookies, but must restore the same backup.
  Object.defineProperty(doc, 'cookie', { get: () => '', set() {}, configurable: true });
  globals.location.protocol = 'file:';
  persistence = createScenePersistence(root, () => current, state => { current = state; applications++; });
  assert.equal(applications, 3);
  assert.deepEqual(current, parseSceneState(storage.get(STATE_COOKIE)));
});
