import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createLampLighting } from '../src/lamp-lighting.js';

function fixture() {
  const point = new THREE.PointLight('#ffb750', 3.5);
  const wash = new THREE.PointLight('#ffc370', 1.1);
  const coverMaterial = new THREE.MeshStandardMaterial({ emissive: '#ffad43', emissiveIntensity: .47 });
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: '#fff0c7' });
  let invalidations = 0;
  const lighting = createLampLighting({ point, wash, coverMaterial, bulbMaterial, invalidate: () => invalidations++ });
  return { point, wash, coverMaterial, bulbMaterial, lighting, invalidations: () => invalidations };
}

test('lamp brightness linearly controls both lights, the cover glow, and bulb', () => {
  const { point, wash, coverMaterial, bulbMaterial, lighting, invalidations } = fixture();
  const bulb = bulbMaterial.color.clone();
  assert.equal(lighting.set(.4), .4);
  assert.ok(Math.abs(point.intensity - 1.4) < 1e-12);
  assert.ok(Math.abs(wash.intensity - .44) < 1e-12);
  assert.ok(Math.abs(coverMaterial.emissiveIntensity - .188) < 1e-12);
  assert.deepEqual(bulbMaterial.color, bulb.clone().multiplyScalar(.4));
  assert.equal(lighting.get(), .4);
  assert.equal(invalidations(), 1);
});

test('lamp brightness clamps to 0–1 and rejects non-finite input', () => {
  const { point, wash, coverMaterial, bulbMaterial, lighting } = fixture();
  lighting.set(-1);
  assert.equal(point.intensity, 0);
  assert.equal(wash.intensity, 0);
  assert.equal(coverMaterial.emissiveIntensity, 0);
  assert.equal(bulbMaterial.color.getHex(), 0);
  lighting.set(2);
  assert.equal(point.intensity, 3.5);
  assert.equal(wash.intensity, 1.1);
  assert.equal(coverMaterial.emissiveIntensity, .47);
  assert.throws(() => lighting.set(NaN), /finite/);
});
