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

test('the flat picker opening keeps the ring clearance and feather proportional on mobile', () => {
  for (const size of [230, 276, 358]) {
    const scale = size / 276;
    const ringRadius = size * 1.86 / 4.16;
    const radius = (size / 2 + ringRadius) / 2;
    const padding = radius - ringRadius;
    const stage = { left: 24, top: 150, width: 700, height: 420 };
    const circle = { left: 500 - radius, top: 550 - radius, width: radius * 2, height: radius * 2 };
    const rect = { left: 500 - 43.7 * scale, top: 550 - size / 2 + 3 * scale, width: 87.4 * scale, height: 22 * scale };
    const cutout = sceneCircleCutout(stage, circle, 14 * scale, { rect, padding });
    assert.ok(Math.abs(cutout.box.padding / cutout.radius - (1 - ringRadius / radius)) < 1e-10);
    assert.ok(Math.abs(cutout.feather * 420 / scale - 14) < 1e-10);
    assert.ok(Math.abs(cutout.box.halfWidth * 420 * 2 - rect.width) < 1e-10);
    assert.ok(Math.abs(cutout.box.halfHeight * 420 * 2 - rect.height) < 1e-10);
    const clearedTop = stage.top + (1 - cutout.box.y) * stage.height
      - (cutout.box.halfHeight + cutout.box.padding) * 420;
    assert.ok(Math.abs(clearedTop - (rect.top - padding)) < 1e-10);
  }
});
