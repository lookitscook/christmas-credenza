import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneCircleCutout } from '../src/scene-cutout.js';

test('the homepage opening follows the sphere in desktop and mobile layouts at every pixel ratio', () => {
  for (const [stage, circle] of [
    [{ left: 260, top: 48, width: 1100, height: 580 }, { left: 952, top: 448, width: 360, height: 360 }],
    [{ left: 24, top: 152, width: 342, height: 360 }, { left: 16, top: 333, width: 358, height: 358 }],
  ]) {
    const cutout = sceneCircleCutout(stage, circle);
    for (const dpr of [1, 1.7, 2, 3]) {
      const width = stage.width * dpr, height = stage.height * dpr;
      const unit = Math.min(width, height);
      assert.ok(Math.abs(stage.left + cutout.x * width / dpr - (circle.left + circle.width / 2)) < 1e-8);
      assert.ok(Math.abs(stage.top + (1 - cutout.y) * height / dpr - (circle.top + circle.height / 2)) < 1e-8);
      assert.ok(Math.abs(cutout.radius * unit / dpr - circle.width / 2) < 1e-8);
      assert.ok(Math.abs(cutout.feather * unit / dpr - 28) < 1e-8);
    }
    // Scrolling both elements together cannot move the opening relative to the sphere.
    assert.deepEqual(sceneCircleCutout({ ...stage, top: stage.top - 400 }, { ...circle, top: circle.top - 400 }), cutout);
  }
  assert.equal(sceneCircleCutout({ width: 0, height: 360 }, {}), null);
});
