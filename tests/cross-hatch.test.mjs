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
  const cabinet = new THREE.Mesh();
  const lightAssembly = new THREE.Group();
  lightAssembly.userData.excludeFromContours = true;
  const bulb = new THREE.Mesh();
  const socket = new THREE.Mesh();
  lightAssembly.add(bulb, socket);
  scene.add(sprite, line, invisible, glow, cabinet, lightAssembly);
  const effect = new CrossHatchEffect(renderer);
  return { renderer, scene, effect, sprite, line, invisible, glow, cabinet, bulb, socket, originalTarget };
}

for (const failNormalPass of [false, true]) {
  test(`render restores scene and renderer state${failNormalPass ? ' after an error' : ''}`, () => {
    const { renderer, scene, effect, sprite, line, invisible, glow, cabinet, bulb, socket, originalTarget } = fixture();
    const background = scene.background;
    const material = scene.overrideMaterial;
    const colorMaterials = [cabinet.material, bulb.material, socket.material];
    let passes = 0;
    renderer.render = passScene => {
      passes++;
      if (passes === 1) {
        assert.equal(passScene, scene);
        assert.equal(renderer.target, effect.colorTarget);
        assert.equal(sprite.visible, true);
        assert.equal(line.visible, true);
        assert.equal(glow.visible, true);
        assert.deepEqual([cabinet.material, bulb.material, socket.material], colorMaterials);
      } else if (passes === 2) {
        assert.equal(renderer.target, effect.normalTarget);
        assert.equal(scene.overrideMaterial, null);
        assert.equal(cabinet.material, effect.normalMaterial);
        for (const light of [bulb, socket]) {
          assert.equal(light.visible, true);
          assert.equal(light.material, effect.noContourMaterial);
          assert.equal(light.material.opacity, 0);
          assert.equal(light.material.blending, THREE.NoBlending);
          assert.equal(light.material.transparent, false);
          assert.equal(light.material.depthWrite, true);
          assert.equal(light.material.depthTest, true);
        }
        assert.equal(sprite.visible, false);
        assert.equal(line.visible, false);
        assert.equal(glow.visible, false);
        assert.equal(renderer.shadowMap.autoUpdate, false);
        if (failNormalPass) throw new Error('Normal pass failed');
      } else {
        assert.equal(renderer.target, originalTarget);
        assert.equal(passScene, effect.postScene);
        assert.deepEqual([cabinet.material, bulb.material, socket.material], colorMaterials);
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
    assert.deepEqual([cabinet.material, bulb.material, socket.material], colorMaterials);
    assert.deepEqual(renderer.shadowMap, { autoUpdate: true, needsUpdate: true });
    effect.dispose();
  });
}

test('selective contours preserve grouped materials, hidden surfaces, and original materials across frames', () => {
  const { renderer, scene, effect, cabinet, bulb } = fixture();
  const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const visibleMaterial = new THREE.MeshBasicMaterial();
  const originalMaterials = [visibleMaterial, hiddenMaterial];
  cabinet.material = originalMaterials;
  bulb.visible = false;
  const bulbMaterial = bulb.material;
  renderer.render = passScene => {
    if (renderer.target === effect.normalTarget) {
      assert.equal(passScene, scene);
      assert.deepEqual(cabinet.material, [effect.normalMaterial, hiddenMaterial]);
      assert.equal(bulb.visible, false);
      assert.equal(bulb.material, bulbMaterial);
    }
  };
  for (let frame = 0; frame < 2; frame++) {
    effect.render(scene, new THREE.Camera());
    assert.equal(cabinet.material, originalMaterials);
    assert.equal(bulb.material, bulbMaterial);
    assert.equal(bulb.visible, false);
  }
  let masksDisposed = 0;
  effect.noContourMaterial.addEventListener('dispose', () => { masksDisposed++; });
  effect.noContourLineMaterial.addEventListener('dispose', () => { masksDisposed++; });
  effect.dispose();
  assert.equal(masksDisposed, 2);
});

test('tree contour mask covers nested meshes and needles but preserves star, base, and scene contours', () => {
  const { renderer, scene, effect, cabinet } = fixture();
  const tree = new THREE.Group();
  tree.userData.excludeFromContours = true;
  const trunk = new THREE.Mesh();
  const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(), new THREE.MeshBasicMaterial(), 1);
  const needles = new THREE.LineSegments();
  const topper = new THREE.Group();
  const star = new THREE.Mesh();
  star.userData.excludeFromContours = false;
  topper.add(star);
  const base = new THREE.Mesh();
  base.userData.excludeFromContours = false;
  const baseDetail = new THREE.Mesh();
  base.add(baseDetail);
  tree.add(trunk, foliage, needles, topper, base);
  scene.add(tree);
  const objects = [trunk, foliage, needles, star, base, baseDetail, cabinet];
  const originalMaterials = objects.map(object => object.material);
  for (const failNormalPass of [false, true]) {
    renderer.render = () => {
      if (renderer.target === effect.normalTarget) {
        for (const object of [trunk, foliage]) assert.equal(object.material, effect.noContourMaterial);
        assert.equal(needles.visible, true);
        assert.equal(needles.material, effect.noContourLineMaterial);
        assert.equal(needles.material.opacity, 0);
        assert.equal(needles.material.blending, THREE.NoBlending);
        assert.equal(needles.material.depthTest, true);
        assert.equal(needles.material.depthWrite, true);
        for (const object of [star, base, baseDetail, cabinet]) assert.equal(object.material, effect.normalMaterial);
        if (failNormalPass) throw new Error('Normal pass failed');
      } else {
        assert.deepEqual(objects.map(object => object.material), originalMaterials);
      }
    };
    if (failNormalPass) assert.throws(() => effect.render(scene, new THREE.Camera()), /Normal pass failed/);
    else effect.render(scene, new THREE.Camera());
    assert.deepEqual(objects.map(object => object.material), originalMaterials);
    assert.equal(needles.visible, true);
  }
  effect.dispose();
});

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
  effect.setParameter('black', .8);
  assert.equal(effect.uniforms.inkColor.value.getHexString(), '000000');
  assert.equal(effect.uniforms.black.value, 0);
  effect.dispose();
});

test('ink-only logo output is opt-in and export scaling preserves stroke dimensions', () => {
  const { renderer, effect } = fixture();
  assert.equal(effect.uniforms.transparentBackground.value, false);
  assert.equal(effect.uniforms.displayColorInput.value, false);
  const logo = new CrossHatchEffect(renderer, { transparentBackground: true, displayColorInput: true });
  assert.equal(logo.uniforms.transparentBackground.value, true);
  assert.equal(logo.uniforms.displayColorInput.value, true);
  // The sphere supplies its own shaped edge; a rectangular scene fade must
  // not crop its preview or exported artwork.
  assert.equal(logo.uniforms.edgeFade.value, 0);
  // Straight-alpha output must reach the canvas unchanged, without blending
  // against its clear color or a second copy of the unprocessed sphere.
  assert.equal(logo.material.blending, THREE.NoBlending);
  logo.setSize(3507, 3426, 1169, 1142);
  assert.deepEqual(logo.uniforms.resolution.value.toArray(), [1169, 1142]);
  assert.equal(logo.colorTarget.width, 3507);
  assert.equal(logo.normalTarget.height, 3426);
  logo.dispose(); effect.dispose();
});

test('solid effect background matches display RGB and updates independently of ink', () => {
  const { effect } = fixture();
  const expected = [243, 240, 230].map(value => value / 255);
  effect.uniforms.backgroundColor.value.toArray().forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < .00001));
  effect.setParameter('inkColor', '#336699');
  const ink = effect.uniforms.inkColor.value.clone();
  effect.setBackground('#ff8000');
  assert.ok(Math.abs(effect.uniforms.backgroundColor.value.g - 128 / 255) < .00001);
  assert.deepEqual(effect.uniforms.inkColor.value, ink);
  effect.dispose();
});

test('scene edge fade updates live within its limits without changing the logo default', () => {
  const { renderer, effect } = fixture();
  const sceneEffect = new CrossHatchEffect(renderer, { edgeFade: .16 });
  sceneEffect.setParameter('edgeFade', 0);
  assert.equal(sceneEffect.uniforms.edgeFade.value, 0);
  sceneEffect.setParameter('edgeFade', 2);
  assert.equal(sceneEffect.uniforms.edgeFade.value, .5);
  sceneEffect.setParameter('edgeFade', -.2);
  assert.equal(sceneEffect.uniforms.edgeFade.value, 0);
  sceneEffect.setParameter('edgeFade', .31);
  sceneEffect.setParameter('edgeFade', NaN);
  sceneEffect.setParameter('edgeFade', Infinity);
  sceneEffect.setParameter('thickness', 3);
  sceneEffect.setSize(1536, 1024);
  sceneEffect.setBackground('#112233');
  assert.equal(sceneEffect.uniforms.edgeFade.value, .31);
  assert.equal(sceneEffect.uniforms.thickness.value, 3);
  assert.deepEqual(sceneEffect.uniforms.resolution.value.toArray(), [1536, 1024]);
  assert.equal(effect.uniforms.edgeFade.value, 0);
  sceneEffect.dispose(); effect.dispose();
});
