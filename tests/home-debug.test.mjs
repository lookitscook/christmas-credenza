import test from 'node:test';
import assert from 'node:assert/strict';
import { isHomeDebug, isHomeDevelopment, readHomeSceneSettings, HOME_SCENE_STORAGE_KEY, HOME_SCENE_SETTINGS_VERSION } from '../src/home-debug-state.js';
import { SCENE_HATCH_DEFAULTS } from '../src/cross-hatch.js';
import { CRT_DEFAULTS } from '../src/crt-shader.js';

const defaultHomeScene = () => ({
  effect: 'cross-hatch', hatch: { ...SCENE_HATCH_DEFAULTS, scale: 1.7 },
  crt: { enabled: true, parameters: { ...CRT_DEFAULTS, brightness: 1 } },
});

test('homepage controls require development and the explicit debug=true parameter', () => {
  assert.equal(isHomeDebug(true, '?debug=true'), true);
  assert.equal(isHomeDebug(true, '?other=1&debug=true'), true);
  for (const development of [false, undefined]) assert.equal(isHomeDebug(development, '?debug=true'), false);
  for (const query of ['', '?debug', '?debug=false', '?debug=1']) assert.equal(isHomeDebug(true, query), false);
});

test('homepage scene and CRT settings restore only supported values without changing defaults', () => {
  const saved = {
    version: HOME_SCENE_SETTINGS_VERSION,
    effect: 'none', hatch: { scale: .73, thickness: 100, contour: -1, black: 1, edgeFade: .14 },
    crt: { enabled: false, parameters: { brightness: 99, scanlineCount: 471.2, curvature: .12 } },
  };
  const storage = { getItem(key) { assert.equal(key, HOME_SCENE_STORAGE_KEY); return JSON.stringify(saved); } };
  assert.deepEqual(readHomeSceneSettings(storage), {
    effect: 'none', hatch: { ...SCENE_HATCH_DEFAULTS, scale: .73, thickness: 3, contour: 0, edgeFade: .14 },
    crt: { enabled: false, parameters: { ...CRT_DEFAULTS, brightness: 1.8, scanlineCount: 471, curvature: .12 } },
  });
  for (const storage of [
    { getItem: () => '{broken' },
    { getItem() { throw new Error('Unavailable'); } },
    { getItem: () => JSON.stringify({ effect: 'invalid', hatch: { scale: 'bad' } }) },
  ]) assert.deepEqual(readHomeSceneSettings(storage), defaultHomeScene());
});

test('v1 homepage settings adopt the new hatch size and CRT brightness once', () => {
  const storage = { getItem: () => JSON.stringify({
    hatch: { scale: .2, thickness: 2 },
    crt: { enabled: false, parameters: { brightness: 1.75, contrast: 1.2 } },
  }) };
  const restored = readHomeSceneSettings(storage);
  assert.equal(restored.hatch.scale, 1.7);
  assert.equal(restored.hatch.thickness, 2);
  assert.equal(restored.crt.parameters.brightness, 1);
  assert.equal(restored.crt.parameters.contrast, 1.2);
  assert.equal(restored.crt.enabled, false);
});

test('the local source server supports debug without enabling production previews', () => {
  const source = 'http://127.0.0.1:4178/src/home-debug-state.js';
  assert.equal(isHomeDevelopment(undefined, source), true);
  assert.equal(isHomeDevelopment(true, source), true);
  assert.equal(isHomeDevelopment(false, source), false);
  for (const url of [
    'https://example.com/src/home-debug-state.js',
    'http://127.0.0.1:4178/dist/assets/home-debug-state.js',
    'file:///src/home-debug-state.js',
    'invalid',
  ]) assert.equal(isHomeDevelopment(undefined, url), false);
});
