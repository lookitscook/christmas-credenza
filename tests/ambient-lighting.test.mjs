import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { AMBIENT_LIGHTING_DEFAULTS, createAmbientLighting } from '../src/ambient-lighting.js';

function fixture() {
  const hemisphere = new THREE.HemisphereLight('#d9c5a8', '#6b3920', .65);
  const key = new THREE.DirectionalLight('#ffe1ae', 1.15);
  key.position.set(-1.5, 3.4, 3.3);
  key.shadow.radius = 4;
  const fill = new THREE.DirectionalLight('#bac6da', .3);
  fill.position.set(1, 2, 4);
  let invalidations = 0;
  const controller = createAmbientLighting({ hemisphere, key, fill, invalidate: () => invalidations++ });
  return { hemisphere, key, fill, controller, invalidations: () => invalidations };
}

test('ambient lighting defaults preserve the authored scene lights exactly', () => {
  const { hemisphere, key, fill, controller } = fixture();
  controller.set();
  assert.equal(hemisphere.intensity, .65);
  assert.equal(key.intensity, 1.15);
  assert.equal(fill.intensity, .3);
  assert.ok(key.position.distanceTo(new THREE.Vector3(-1.5, 3.4, 3.3)) < 1e-12);
  assert.equal(key.shadow.radius, 4);
  assert.deepEqual(controller.getState(), {
    current: { ...AMBIENT_LIGHTING_DEFAULTS }, target: { ...AMBIENT_LIGHTING_DEFAULTS }, mix: 0,
  });
});

test('current and target states crossfade intensity, color, direction, and softness', () => {
  const { hemisphere, key, fill, controller, invalidations } = fixture();
  const current = { brightness: .5, ambientLevel: .5, shadowContrast: 0, shadowSoftness: 0, keyDirection: -90, keyElevation: 20, fillBalance: .5, temperature: 2200 };
  const target = { brightness: 2, ambientLevel: 2, shadowContrast: 2, shadowSoftness: 10, keyDirection: 90, keyElevation: 70, fillBalance: 2, temperature: 9000 };
  controller.set({ current, target, mix: 0 });
  const start = { hemi: hemisphere.intensity, key: key.intensity, fill: fill.intensity, color: key.color.clone(), position: key.position.clone() };
  controller.setMix(1);
  const end = { hemi: hemisphere.intensity, key: key.intensity, fill: fill.intensity, color: key.color.clone(), position: key.position.clone() };
  controller.setMix(.5);
  assert.ok(Math.abs(hemisphere.intensity - (start.hemi + end.hemi) / 2) < 1e-12);
  assert.ok(Math.abs(key.intensity - (start.key + end.key) / 2) < 1e-12);
  assert.ok(Math.abs(fill.intensity - (start.fill + end.fill) / 2) < 1e-12);
  const expectedColor = start.color.clone().lerp(end.color, .5);
  assert.ok(Math.hypot(
    key.color.r - expectedColor.r,
    key.color.g - expectedColor.g,
    key.color.b - expectedColor.b,
  ) < 1e-12);
  assert.ok(key.position.distanceTo(start.position.clone().lerp(end.position, .5)) < 1e-12);
  assert.equal(key.shadow.radius, 5);
  assert.equal(invalidations(), 3);
});

test('partial updates preserve prior values and public ranges are clamped', () => {
  const { controller } = fixture();
  controller.set({ current: { brightness: 2, temperature: 5000 }, target: { ambientLevel: 2 }, mix: 2 });
  controller.set({ current: { fillBalance: -1 }, target: { shadowSoftness: 99 } });
  const state = controller.getState();
  assert.equal(state.current.brightness, 2);
  assert.equal(state.current.temperature, 5000);
  assert.equal(state.current.fillBalance, 0);
  assert.equal(state.target.ambientLevel, 2);
  assert.equal(state.target.shadowSoftness, 12);
  assert.equal(state.mix, 1);
  assert.throws(() => controller.set({ mix: NaN }), /mix/);
  assert.throws(() => controller.set({ current: { brightness: 'bright' } }), /brightness/);
});
