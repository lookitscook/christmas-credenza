import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createCRTScreen } from '../src/crt-screen.js';
import { CRT_CONTROLS, CRT_DEFAULTS, crtUniformName } from '../src/crt-shader.js';

function fixture() {
  const texture = new THREE.Texture();
  const originalMaterial = new THREE.MeshPhysicalMaterial({ map: texture });
  const originalGeometry = new THREE.PlaneGeometry(.567, .475, 2, 2);
  originalGeometry.attributes.uv.setXY(0, .12, .81);
  const screen = new THREE.Mesh(originalGeometry, originalMaterial);
  const crt = createCRTScreen(screen, new THREE.Texture());
  const light = screen.children.find(child => child.isRectAreaLight);
  const glow = screen.children.find(child => child.userData.excludeFromNormals);
  return { crt, screen, light, glow, originalMaterial, originalGeometry };
}

test('turning off TV restores original glass and disables the area light and bloom together', () => {
  const { crt, screen, light, glow, originalMaterial, originalGeometry } = fixture();
  crt.setEnabled(true);
  assert.notEqual(screen.material, originalMaterial);
  assert.notEqual(screen.geometry, originalGeometry);
  assert.ok(light.intensity > 0);
  assert.equal(glow.visible, true);
  crt.setEnabled(false);
  assert.equal(screen.material, originalMaterial);
  assert.equal(screen.geometry, originalGeometry);
  assert.equal(screen.geometry.attributes.uv.getX(0), originalGeometry.attributes.uv.getX(0));
  assert.equal(light.intensity, 0);
  assert.equal(glow.visible, false);
  // A late color sample cannot re-enable either effect while video is off.
  crt.updateColor(new THREE.Color('white'));
  assert.equal(light.intensity, 0);
  assert.equal(glow.visible, false);
  crt.setEnabled(true);
  assert.ok(light.intensity > 0);
  assert.equal(glow.visible, true);
  crt.dispose();
});

test('the rectangular emitter faces out of the screen and cleanup preserves original assets', () => {
  const { crt, screen, light, originalMaterial, originalGeometry } = fixture();
  assert.equal(light.width, .567);
  assert.equal(light.height, .475);
  const emission = new THREE.Vector3(0, 0, -1).applyQuaternion(light.quaternion);
  assert.ok(emission.z > .999);
  assert.ok(light.position.z > .014); // Beyond the convex glass.
  let originalDisposed = false;
  originalMaterial.addEventListener('dispose', () => { originalDisposed = true; });
  originalGeometry.addEventListener('dispose', () => { originalDisposed = true; });
  crt.setEnabled(true);
  crt.dispose();
  assert.equal(screen.children.length, 0);
  assert.equal(screen.material, originalMaterial);
  assert.equal(screen.geometry, originalGeometry);
  assert.equal(originalDisposed, false);
});

function compileUniforms(material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader);
  return shader.uniforms;
}

test('CRT settings stay live across recompilation and shader bypass preserves video glass', () => {
  const { crt, screen, light, glow, originalMaterial } = fixture();
  crt.setEnabled(true);
  const material = screen.material;
  const uniforms = compileUniforms(material);
  crt.setParameter('scanlineIntensity', .65);
  crt.setParameter('vignetteStrength', .2);
  crt.setShaderEnabled(false);
  crt.setTime(12.5);
  assert.equal(uniforms.crtScanlineIntensity.value, .65);
  assert.equal(uniforms.crtVignetteStrength.value, .2);
  assert.equal(uniforms.crtTime.value, 12.5);
  assert.equal(uniforms.crtEnabled.value, false);
  assert.equal(screen.material, material);
  assert.notEqual(screen.material, originalMaterial);
  assert.equal(compileUniforms(material).crtScanlineIntensity, uniforms.crtScanlineIntensity);
  crt.setEnabled(false);
  crt.setParameter('bloomIntensity', 1.5);
  crt.setShaderEnabled(true);
  assert.equal(light.intensity, 0);
  assert.equal(glow.visible, false);
  assert.equal(screen.material, originalMaterial);
  crt.setEnabled(true);
  assert.equal(screen.material, material);
  assert.equal(uniforms.crtScanlineIntensity.value, .65);
  crt.dispose();
});

test('CRT controls clamp values and reject non-finite parameters', () => {
  const { crt, screen } = fixture();
  crt.setEnabled(true);
  const uniforms = compileUniforms(screen.material);
  for (const { key, min, max } of CRT_CONTROLS) {
    const uniform = uniforms[crtUniformName(key)];
    assert.equal(uniform.value, CRT_DEFAULTS[key]);
    crt.setParameter(key, -100);
    assert.equal(uniform.value, min);
    crt.setParameter(key, 10000);
    assert.equal(uniform.value, max);
    crt.setParameter(key, NaN);
    crt.setParameter(key, Infinity);
    assert.equal(uniform.value, max);
  }
  crt.setTime(NaN);
  assert.equal(uniforms.crtTime.value, 0);
  assert.doesNotThrow(() => crt.setParameter('unknown', 1));
  crt.dispose();
});
