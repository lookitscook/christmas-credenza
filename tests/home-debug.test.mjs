import test from 'node:test';
import assert from 'node:assert/strict';
import { isHomeDebug, isHomeDevelopment, readHomeSceneSettings, HOME_SCENE_STORAGE_KEY } from '../src/home-debug-state.js';
import { SCENE_HATCH_DEFAULTS } from '../src/cross-hatch.js';

test('homepage controls require development and the explicit debug=true parameter', () => {
  assert.equal(isHomeDebug(true, '?debug=true'), true);
  assert.equal(isHomeDebug(true, '?other=1&debug=true'), true);
  for (const development of [false, undefined]) assert.equal(isHomeDebug(development, '?debug=true'), false);
  for (const query of ['', '?debug', '?debug=false', '?debug=1']) assert.equal(isHomeDebug(true, query), false);
});

test('homepage scene settings restore only supported values without changing defaults', () => {
  const saved = { effect: 'none', hatch: { scale: .73, thickness: 100, contour: -1, black: 1, edgeFade: .14 } };
  const storage = { getItem(key) { assert.equal(key, HOME_SCENE_STORAGE_KEY); return JSON.stringify(saved); } };
  assert.deepEqual(readHomeSceneSettings(storage), {
    effect: 'none', hatch: { ...SCENE_HATCH_DEFAULTS, scale: .73, thickness: 3, contour: 0, edgeFade: .14 },
  });
  for (const storage of [
    { getItem: () => '{broken' },
    { getItem() { throw new Error('Unavailable'); } },
    { getItem: () => JSON.stringify({ effect: 'invalid', hatch: { scale: 'bad' } }) },
  ]) assert.deepEqual(readHomeSceneSettings(storage), { effect: 'cross-hatch', hatch: { ...SCENE_HATCH_DEFAULTS } });
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
