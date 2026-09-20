import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { CrossHatchEffect } from '../src/cross-hatch.js';

function fixture() {
  const originalTarget = {};
  const renderer = {
    capabilities: { isWebGL2: true },
    extensions: { has: () => true },
    toneMappingExposure: 1.25,
    shadowMap: { autoUpdate: true, needsUpdate: true },
    target: originalTarget,
    getRenderTarget() { return this.target; },
    setRenderTarget(target) { this.target = target; },
    render() {},
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3b2619');
  scene.overrideMaterial = new THREE.MeshBasicMaterial();
  const sprite = new THREE.Sprite();
  const line = new THREE.LineSegments();
  const invisible = new THREE.Sprite();
  invisible.visible = false;
  const glow = new THREE.Mesh();
  glow.userData.excludeFromNormals = true;
  scene.add(sprite, line, invisible, glow);
  const effect = new CrossHatchEffect(renderer);
  return { renderer, scene, effect, sprite, line, invisible, glow, originalTarget };
}

for (const failNormalPass of [false, true]) {
  test(`render restores scene and renderer state${failNormalPass ? ' after an error' : ''}`, () => {
    const { renderer, scene, effect, sprite, line, invisible, glow, originalTarget } = fixture();
    const background = scene.background;
    const material = scene.overrideMaterial;
    let passes = 0;
    renderer.render = passScene => {
      passes++;
      if (passes === 1) {
        assert.equal(passScene, scene);
        assert.equal(renderer.target, effect.colorTarget);
        assert.equal(sprite.visible, true);
        assert.equal(line.visible, true);
        assert.equal(glow.visible, true);
      } else if (passes === 2) {
        assert.equal(renderer.target, effect.normalTarget);
        assert.equal(scene.overrideMaterial, effect.normalMaterial);
        assert.equal(sprite.visible, false);
        assert.equal(line.visible, false);
        assert.equal(glow.visible, false);
        assert.equal(renderer.shadowMap.autoUpdate, false);
        if (failNormalPass) throw new Error('Normal pass failed');
      } else {
        assert.equal(renderer.target, originalTarget);
        assert.equal(passScene, effect.postScene);
      }
    };
    if (failNormalPass) assert.throws(() => effect.render(scene, new THREE.Camera()), /Normal pass failed/);
    else effect.render(scene, new THREE.Camera());
    assert.equal(passes, failNormalPass ? 2 : 3);
    assert.equal(renderer.target, originalTarget);
    assert.equal(scene.background, background);
    assert.equal(scene.overrideMaterial, material);
    assert.equal(sprite.visible, true);
    assert.equal(line.visible, true);
    assert.equal(invisible.visible, false);
    assert.equal(glow.visible, true);
    assert.deepEqual(renderer.shadowMap, { autoUpdate: true, needsUpdate: true });
    effect.dispose();
  });
}

test('render targets use actual drawing-buffer dimensions and finite parameter limits', () => {
  const { effect } = fixture();
  effect.setSize(1280, 853);
  assert.deepEqual(effect.uniforms.resolution.value.toArray(), [1280, 853]);
  for (const target of [effect.colorTarget, effect.normalTarget]) {
    assert.equal(target.width, 1280);
    assert.equal(target.height, 853);
  }
  effect.setSize(0, 0);
  assert.equal(effect.colorTarget.width, 1);
  effect.setParameter('scale', 0);
  assert.equal(effect.uniforms.scale.value, 0.1);
  effect.setParameter('thickness', 0);
  assert.equal(effect.uniforms.thickness.value, 0);
  effect.setParameter('contour', NaN);
  assert.equal(effect.uniforms.contour.value, 4);
  effect.setParameter('inkColor', '#ff8000');
  assert.ok(Math.abs(effect.uniforms.inkColor.value.g - 128 / 255) < 0.00001);
  effect.dispose();
});

test('paper selection races cannot overwrite the latest texture or leak discarded textures', async t => {
  const pending = [];
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', () => new Promise(resolve => pending.push(resolve)));
  const { effect } = fixture();
  const first = effect.setPaper('Craft light');
  const second = effect.setPaper('Parchment');
  const oldTexture = new THREE.Texture();
  const newTexture = new THREE.Texture();
  let oldDisposed = false, newDisposed = false;
  oldTexture.addEventListener('dispose', () => { oldDisposed = true; });
  newTexture.addEventListener('dispose', () => { newDisposed = true; });
  pending[1](newTexture);
  assert.equal(await second, true);
  pending[0](oldTexture);
  assert.equal(await first, false);
  assert.equal(effect.uniforms.paperTexture.value, newTexture);
  assert.equal(oldDisposed, true);
  const third = effect.setPaper('Craft rough');
  const lateTexture = new THREE.Texture();
  let lateDisposed = false;
  lateTexture.addEventListener('dispose', () => { lateDisposed = true; });
  effect.dispose();
  pending[2](lateTexture);
  assert.equal(await third, false);
  assert.equal(newDisposed, true);
  assert.equal(lateDisposed, true);
});

test('ink-only logo output is opt-in and export scaling preserves stroke dimensions', () => {
  const { renderer, effect } = fixture();
  assert.equal(effect.uniforms.transparentPaper.value, false);
  assert.equal(effect.uniforms.displayColorInput.value, false);
  const logo = new CrossHatchEffect(renderer, { transparentPaper: true, displayColorInput: true });
  assert.equal(logo.uniforms.transparentPaper.value, true);
  assert.equal(logo.uniforms.displayColorInput.value, true);
  // Straight-alpha output must reach the canvas unchanged, without blending
  // against its clear color or a second copy of the unprocessed sphere.
  assert.equal(logo.material.blending, THREE.NoBlending);
  logo.setSize(3507, 3426, 1169, 1142);
  assert.deepEqual(logo.uniforms.resolution.value.toArray(), [1169, 1142]);
  assert.equal(logo.colorTarget.width, 3507);
  assert.equal(logo.normalTarget.height, 3426);
  logo.dispose(); effect.dispose();
});
