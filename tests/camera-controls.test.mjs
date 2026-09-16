import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { attachCameraControls, createCameraRig, CAMERA_DEFAULTS } from '../src/camera-controls.js';

function fixture(aspect = 1.5) {
  const camera = new THREE.PerspectiveCamera(36, aspect, .02, 25);
  const rig = createCameraRig(camera);
  return { camera, rig };
}

// Independently trace viewport rays to the actual floor/back wall. They must
// hit those surfaces inside their edges, before reaching any side or ceiling.
function assertRoomCoverage(camera) {
  for (let x = -1; x <= 1; x += .25) for (let y = -1; y <= 1; y += .25) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const { origin, direction } = ray.ray;
    const wall = direction.z < 0 ? (-.525 - origin.z) / direction.z : Infinity;
    const floor = direction.y < 0 ? (-.005 - origin.y) / direction.y : Infinity;
    const distance = Math.min(wall, floor);
    assert.ok(distance > 0 && distance < camera.far, 'ray reaches the room');
    const hit = ray.ray.at(distance, new THREE.Vector3());
    assert.ok(Math.abs(hit.x) < 6, `side edge visible at ${hit.x}`);
    assert.ok(hit.y < 5, `top edge visible at ${hit.y}`);
    assert.ok(hit.z < 6, `floor edge visible at ${hit.z}`);
  }
}

test('panning follows screen axes without changing orbit or zoom', () => {
  const { rig, camera } = fixture();
  const before = rig.getState();
  const originalPosition = camera.position.clone();
  const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  rig.pan(20, -10, 600);
  const after = rig.getState();
  assert.equal(after.yaw, before.yaw);
  assert.equal(after.pitch, before.pitch);
  assert.equal(after.distance, before.distance);
  const shift = camera.position.clone().sub(originalPosition);
  assert.ok(shift.dot(screenRight) < 0);
  assert.ok(shift.dot(screenUp) < 0);
  assertRoomCoverage(camera);
  rig.pan(-20, 10, 600);
  assert.ok(camera.position.distanceTo(originalPosition) < 1e-10);
});

test('an unobstructed oblique imported view is restored exactly', () => {
  const { rig, camera } = fixture();
  const state = { yaw: .3, pitch: .35, distance: 3.8, target: [.4, 1.45, 0] };
  rig.setState(state);
  assert.deepEqual(rig.getState(), state);
  assertRoomCoverage(camera);
});

test('room stays covered at extreme orbit, zoom, pan, import, and resized views', () => {
  const { rig, camera } = fixture();
  let seed = 123456;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 500; i++) {
    switch (i % 5) {
      case 0: rig.orbit((random() - .5) * 3000, (random() - .5) * 2000); break;
      case 1: rig.pan((random() - .5) * 10000, (random() - .5) * 10000, 600); break;
      case 2: rig.zoom(random() < .5 ? .001 : 1000); break;
      case 3: rig.setState({ yaw: random() * 20 - 10, pitch: random() * 20 - 10, distance: random() * 100, target: [random() * 20 - 10, random() * 20 - 10, random() * 20 - 10] }); break;
      case 4: camera.aspect = [.5, 1, 1.5, 2, 2.5][i % 7 % 5]; camera.updateProjectionMatrix(); rig.resize(); break;
    }
    assertRoomCoverage(camera);
  }
  rig.setState(CAMERA_DEFAULTS);
  assert.deepEqual(rig.getState(), CAMERA_DEFAULTS);
});

class Canvas extends EventTarget {
  clientHeight = 600;
  setPointerCapture() {}
}
function pointer(canvas, type, values = {}) {
  const event = new Event(type);
  Object.assign(event, { pointerId: 1, button: 0, clientX: 100, clientY: 100, shiftKey: false, ...values });
  canvas.dispatchEvent(event);
}

test('Shift switches a live drag to panning; orbit, pinch and capture cleanup still work', () => {
  const { rig } = fixture();
  const canvas = new Canvas();
  const controls = attachCameraControls(canvas, rig, () => {});
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointermove', { clientX: 110 });
  const orbit = rig.getState();
  assert.notEqual(orbit.yaw, CAMERA_DEFAULTS.yaw);
  pointer(canvas, 'pointermove', { clientX: 130, clientY: 110, shiftKey: true });
  const pan = rig.getState();
  assert.equal(pan.yaw, orbit.yaw);
  assert.equal(pan.pitch, orbit.pitch);
  assert.notDeepEqual(pan.target, orbit.target);
  pointer(canvas, 'lostpointercapture');
  pointer(canvas, 'pointermove', { clientX: 150 });
  assert.deepEqual(rig.getState(), pan);
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerdown', { pointerId: 2, clientX: 200 });
  pointer(canvas, 'pointermove', { pointerId: 2, clientX: 200 });
  pointer(canvas, 'pointermove', { pointerId: 2, clientX: 300 });
  assert.ok(rig.getState().distance < pan.distance);
  pointer(canvas, 'pointermove', { pointerId: 2 }); // Coincident fingers.
  assert.ok(Number.isFinite(rig.getState().distance));
  controls.dispose();
});
