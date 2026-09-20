import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.js';
import * as model from '../src/pad-model.js';

// Run the real controls with real Three geometry/raycasting and a stub renderer.
async function selector(reducedMotion = false, width = 600, height = 600) {
  const frames = new Map();
  let nextFrame = 0, now = 0, scene;
  function element() {
    const handlers = new Map();
    return {
      textContent: '', clientWidth: 600, clientHeight: 600, captured: null,
      style: {}, children: [], classList: { toggle() {} },
      get offsetWidth() { return this.textContent.length * 7 + 14; },
      offsetHeight: 22,
      setAttribute() {}, appendChild(child) { this.children.push(child); },
      append(...children) { this.children.push(...children); }, remove() {}, focus() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }),
      addEventListener(type, handler) { handlers.set(type, [...(handlers.get(type) || []), handler]); },
      fire(type, values = {}) {
        for (const handler of handlers.get(type) || []) handler({ type, preventDefault() {}, ...values });
      },
      setPointerCapture(id) { this.captured = id; },
      hasPointerCapture(id) { return this.captured === id; },
      releasePointerCapture() { this.captured = null; },
    };
  }
  const window = element();
  window.matchMedia = () => ({ matches: reducedMotion });
  const elements = Object.fromEntries(['pad-stage', 'pad-emotion', 'pad-values', 'pad-message', 'pad-neutral', 'pad-color-swatch', 'pad-color-value', 'pad-landmark-picker', 'pad-landmark-count']
    .map(id => [id, element()]));
  elements['pad-stage'].clientWidth = width;
  elements['pad-stage'].clientHeight = height;
  const renderers = [];
  function WebGLRenderer() {
    const renderer = {
      domElement: element(), calls: [], disposed: false,
      setClearColor() {},
      setPixelRatio(value) { this.pixelRatio = value; },
      setSize(width, height) { this.size = [width, height]; },
      dispose() { this.disposed = true; },
      render(value, camera) {
        scene = value; scene.updateMatrixWorld(true); camera.updateMatrixWorld();
        const objects = [];
        scene.traverseVisible(object => {
          if (object.material && object.layers.test(camera.layers)) objects.push({
            object, colorWrite: object.material.colorWrite, depthWrite: object.material.depthWrite,
          });
        });
        this.calls.push(objects);
      },
    };
    renderers.push(renderer);
    return renderer;
  }
  const source = await readFile(new URL('../src/pad-editor.js', import.meta.url), 'utf8');
  vm.runInNewContext(source.replace(/^import .*;\n/gm, ''), {
    ...model, THREE: { ...THREE, WebGLRenderer },
    window, document: { getElementById: id => elements[id], createElement: element }, console, AbortController,
    LOGO_STORAGE_KEY: 'test', readPageBackground: () => '#f3f0e6', applyPageBackground: value => value,
    pageForeground: () => '#062627', performance: { now: () => now },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const canvas = renderers.find(renderer => renderer.domElement.className === 'pad-overlay').domElement;
  function tick(time) {
    now = time;
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback(time);
  }
  tick(0);
  function pointer(type, x = 300, y = 300) {
    canvas.fire(type, { pointerId: 1, button: 0, clientX: x, clientY: y });
  }
  return { canvas, elements, tick, pointer, frames, renderers, window, group: scene.children[0] };
}

function visibleLabelNames(app) {
  const layer = app.elements['pad-stage'].children.find(child => child.className === 'pad-landmarks');
  return layer.children.filter(child => child.className === 'pad-landmark-label' && !child.hidden)
    .map(label => label.textContent);
}

test('globe colors render separately from overlays, retaining sphere depth and synchronized canvases', async () => {
  const app = await selector();
  const globe = app.renderers.find(renderer => renderer.domElement.className === 'pad-globe');
  const overlay = app.renderers.find(renderer => renderer.domElement === app.canvas);
  const sphere = app.group.children.find(object => object.material?.isShaderMaterial);
  const marker = app.group.children.find(object => object.geometry?.parameters?.radius === .055);
  function checkLayers() {
    assert.deepEqual(globe.calls.at(-1), [{ object: sphere, colorWrite: true, depthWrite: true }]);
    const overlays = overlay.calls.at(-1);
    assert.deepEqual(overlays.filter(item => !item.colorWrite), [{ object: sphere, colorWrite: false, depthWrite: true }]);
    assert.ok(overlays.some(item => item.object === marker && item.colorWrite));
    assert.ok(overlays.filter(item => item.colorWrite).length >= 6, 'mesh, ring, track, knob, marker and halo remain on the overlay');
    assert.equal(sphere.material.colorWrite, true, 'restore globe colors for the next frame');
    assert.deepEqual(globe.size, overlay.size);
    assert.equal(globe.pixelRatio, overlay.pixelRatio);
  }
  checkLayers();
  app.pointer('pointerdown');
  app.pointer('pointermove', 340, 325);
  app.pointer('pointerup', 340, 325);
  app.tick(210);
  checkLayers();
  app.elements['pad-stage'].clientWidth = 320;
  app.elements['pad-stage'].clientHeight = 280;
  app.window.fire('resize');
  app.tick(420);
  assert.deepEqual(globe.size, [320, 280]);
  checkLayers();
  globe.domElement.fire('webglcontextlost');
  assert.ok(app.renderers.every(renderer => renderer.disposed));
  assert.equal(app.frames.size, 0);
  assert.equal(app.elements['pad-message'].hidden, false);
});

test('drag release eases to an exact emotion and stops rendering when settled', async () => {
  const app = await selector();
  assert.deepEqual(visibleLabelNames(app), [app.elements['pad-emotion'].textContent]);
  app.pointer('pointerdown');
  app.pointer('pointermove', 340, 325);
  assert.equal(visibleLabelNames(app).length, 4);
  const before = app.group.quaternion.clone();
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(before.clone().invert());
  const expected = model.nearestPadEmotion(model.dirToPad(direction, .68));
  app.pointer('pointerup', 340, 325);
  app.tick(210);
  const halfway = app.group.quaternion.clone();
  assert.ok(before.angleTo(halfway) > .0001);
  assert.deepEqual(visibleLabelNames(app), []);
  app.tick(420);
  assert.ok(halfway.angleTo(app.group.quaternion) > .0001);
  assert.equal(app.elements['pad-emotion'].textContent, expected.name);
  assert.deepEqual(visibleLabelNames(app), [expected.name]);
  const result = model.dirToPad(new THREE.Vector3(0, 0, 1).applyQuaternion(app.group.quaternion.clone().invert()),
    Math.max(Math.abs(expected.p), Math.abs(expected.a), Math.abs(expected.d)));
  assert.ok(Math.hypot(result.p - expected.p, result.a - expected.a, result.d - expected.d) < 1e-10);
  const format = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  assert.ok(app.elements['pad-values'].textContent.startsWith(`P ${format(expected.p)} · A ${format(expected.a)} · D ${format(expected.d)}`));
  assert.equal(app.frames.size, 0);
});

test('picker and point transitions hide labels until arrival, and only dragging restores nearby labels', async () => {
  const app = await selector();
  const picker = app.elements['pad-landmark-picker'];
  picker.value = String(model.PAD_EMOTIONS.findIndex(([name]) => name === 'Happy'));
  picker.fire('change');
  assert.deepEqual(visibleLabelNames(app), []);
  app.tick(419);
  assert.deepEqual(visibleLabelNames(app), []);
  app.tick(420);
  assert.deepEqual(visibleLabelNames(app), ['Happy']);
  const layer = app.elements['pad-stage'].children.find(child => child.className === 'pad-landmarks');
  const points = layer.children.filter(child => child.className === 'pad-landmark-point');
  const leaders = layer.children.filter(child => child.className === 'pad-landmark-leader');
  assert.equal(leaders.filter(leader => !leader.hidden).length, 1);
  assert.ok(points.filter(point => !point.hidden).length > 4);
  const nextIndex = points.findIndex((point, i) => !point.hidden && model.PAD_EMOTIONS[i][0] !== 'Happy');
  const next = points[nextIndex];
  next.fire('pointerenter');
  assert.deepEqual(visibleLabelNames(app), ['Happy']);
  next.fire('click');
  assert.deepEqual(visibleLabelNames(app), []);
  app.tick(630);
  next.fire('pointerenter');
  assert.deepEqual(visibleLabelNames(app), []);
  app.tick(840);
  assert.deepEqual(visibleLabelNames(app), [model.PAD_EMOTIONS[nextIndex][0]]);
  app.pointer('pointerdown');
  assert.equal(visibleLabelNames(app).length, 4);
  app.pointer('pointercancel');
  app.tick(1300);
  assert.deepEqual(visibleLabelNames(app), [app.elements['pad-emotion'].textContent]);
  app.canvas.fire('keydown', { key: 'ArrowRight' });
  assert.deepEqual(visibleLabelNames(app), [app.elements['pad-emotion'].textContent]);
});

test('clicking a label fades outgoing labels and reveals only the destination after snapping', async () => {
  const app = await selector();
  const layer = app.elements['pad-stage'].children.find(child => child.className === 'pad-landmarks');
  const labels = layer.children.filter(child => child.className === 'pad-landmark-label');
  const leaders = layer.children.filter(child => child.className === 'pad-landmark-leader');
  const selected = app.elements['pad-emotion'].textContent;
  assert.deepEqual(visibleLabelNames(app), [selected]);
  const hidden = labels.find(label => label.hidden);
  hidden.fire('click');
  assert.deepEqual(visibleLabelNames(app), [selected], 'fading-out labels are not clickable');

  app.pointer('pointerdown');
  const destination = labels.find(label => !label.hidden && label.textContent !== selected);
  assert.ok(destination);
  destination.fire('click');
  assert.equal(app.canvas.captured, null);
  for (const time of [0, 90, 180, 210, 419]) {
    app.tick(time);
    assert.deepEqual(visibleLabelNames(app), []);
    assert.ok(leaders.every(leader => leader.hidden));
  }
  app.tick(420);
  assert.deepEqual(visibleLabelNames(app), [destination.textContent]);
  assert.equal(app.elements['pad-emotion'].textContent, destination.textContent);
  assert.equal(leaders.filter(leader => !leader.hidden).length, 1);
});

test('new drags interrupt snapping, cancelled drags do not snap, and reset stays neutral', async () => {
  const app = await selector();
  app.pointer('pointerdown');
  app.pointer('pointermove', 360, 320);
  app.pointer('pointerup', 360, 320);
  app.tick(100);
  app.pointer('pointerdown');
  const interrupted = app.group.quaternion.clone();
  app.tick(500);
  assert.ok(interrupted.angleTo(app.group.quaternion) < 1e-7);
  assert.equal(visibleLabelNames(app).length, 4);
  app.pointer('pointercancel');
  assert.equal(app.frames.size, 0);
  app.pointer('pointerdown');
  app.pointer('pointermove', 330, 320);
  app.pointer('pointerup', 330, 320);
  app.tick(600);
  app.elements['pad-neutral'].fire('click');
  app.tick(1000);
  assert.equal(app.elements['pad-emotion'].textContent, 'Neutral');
  assert.ok(app.elements['pad-values'].textContent.endsWith('· 0%'));
  assert.equal(app.frames.size, 0);
});

test('the rendered bottom gap cannot start a drag or change intensity during a ring drag', async () => {
  const app = await selector();
  const radius = 1.86 * 300 / 2.08;
  app.pointer('pointerdown', 300, 300 + radius);
  assert.equal(app.canvas.captured, null);
  assert.deepEqual(visibleLabelNames(app), [app.elements['pad-emotion'].textContent]);
  app.pointer('pointerdown', 300 + radius, 300);
  assert.equal(app.canvas.captured, 1);
  assert.equal(visibleLabelNames(app).length, 4);
  const value = app.elements['pad-values'].textContent;
  assert.ok(value.endsWith('· 17%'));
  app.pointer('pointermove', 300, 300 + radius);
  assert.equal(app.elements['pad-values'].textContent, value);
  app.pointer('pointercancel');
});

test('reduced motion snaps immediately without animating', async () => {
  const app = await selector(true);
  app.pointer('pointerdown');
  app.pointer('pointermove', 340, 325);
  app.pointer('pointerup', 340, 325);
  const result = app.group.quaternion.clone();
  app.tick(100);
  assert.ok(result.angleTo(app.group.quaternion) < 1e-7);
  assert.equal(app.frames.size, 0);
  assert.notEqual(app.elements['pad-emotion'].textContent, 'PAD');
  assert.deepEqual(visibleLabelNames(app), [app.elements['pad-emotion'].textContent]);
});

test('emotion points follow rotation, hide on the far side, and keep clustered labels apart', async () => {
  const app = await selector();
  const layer = app.elements['pad-stage'].children.find(child => child.className === 'pad-landmarks');
  const points = layer.children.filter(child => child.className === 'pad-landmark-point');
  const labels = layer.children.filter(child => child.className === 'pad-landmark-label');
  assert.deepEqual(labels.map(label => label.textContent), model.PAD_EMOTIONS.map(([name]) => name));
  const original = points.map(point => ({ x: point.style.left, y: point.style.top, hidden: point.hidden }));
  app.pointer('pointerdown');
  function checkVisibilityAndLayout() {
    const facing = [];
    model.PAD_EMOTIONS.forEach(([, p, a, d], i) => {
      const world = new THREE.Vector3(p, a, d).normalize().multiplyScalar(1.545).applyQuaternion(app.group.quaternion);
      if (world.dot(new THREE.Vector3(0, 0, model.padCameraDistance(1)).sub(world)) <= 0) assert.ok(points[i].hidden);
      else facing.push(i);
      if (points[i].hidden) assert.ok(labels[i].hidden);
    });
    const visible = labels.filter(label => !label.hidden);
    assert.equal(visible.length, Math.min(4, facing.length));
    assert.equal(points.filter(point => !point.hidden).length, Math.min(20, facing.length));
    const distance = i => Math.hypot(parseFloat(points[i].style.left) - 300, parseFloat(points[i].style.top) - 300);
    const nearestNames = facing.sort((a, b) => distance(a) - distance(b)).slice(0, 4).map(i => labels[i].textContent);
    assert.deepEqual(visible.map(label => label.textContent).sort(), nearestNames.sort());
    for (let i = 0; i < visible.length; i++) {
      const a = visible[i], ax = parseFloat(a.style.left), ay = parseFloat(a.style.top);
      assert.ok(ax >= 0 && ay >= 0 && ax + a.offsetWidth <= 600 && ay + a.offsetHeight <= 600);
      for (const b of visible.slice(i + 1)) {
        const bx = parseFloat(b.style.left), by = parseFloat(b.style.top);
        assert.ok(ax + a.offsetWidth <= bx || bx + b.offsetWidth <= ax || ay + a.offsetHeight <= by || by + b.offsetHeight <= ay,
          `${a.textContent} overlaps ${b.textContent}`);
      }
    }
  }
  checkVisibilityAndLayout();
  const unlabeledPoint = points.find((point, i) => !point.hidden && labels[i].hidden);
  assert.ok(unlabeledPoint);
  unlabeledPoint.fire('pointerenter');
  checkVisibilityAndLayout();
  unlabeledPoint.fire('pointerleave');
  app.pointer('pointermove', 700, 400);
  checkVisibilityAndLayout();
  assert.ok(points.some((point, i) => point.hidden !== original[i].hidden));
  assert.ok(points.some((point, i) => !point.hidden && (point.style.left !== original[i].x || point.style.top !== original[i].y)));
});

test('reticle and displayed YUV color agree through intensity changes, snapping, and neutral', async () => {
  const app = await selector();
  const marker = app.group.children.find(child => child.geometry?.parameters?.radius === .055);
  function checkColor(p, a, d) {
    const expected = new THREE.Color(...model.padColor(p, a, d)).convertSRGBToLinear();
    const hex = `#${expected.getHexString(THREE.SRGBColorSpace)}`;
    assert.ok(['r', 'g', 'b'].every(channel => Math.abs(marker.material.color[channel] - expected[channel]) < 1e-12));
    assert.equal(app.elements['pad-color-swatch'].style.backgroundColor, hex);
    assert.equal(app.elements['pad-color-value'].textContent, hex.toUpperCase());
  }
  const initial = model.dirToPad({ x: .55, y: .42, z: .25 }, .68);
  checkColor(initial.p, initial.a, initial.d);
  app.canvas.fire('keydown', { key: '+' });
  const brighter = model.dirToPad({ x: .55, y: .42, z: .25 }, .73);
  checkColor(brighter.p, brighter.a, brighter.d);
  app.pointer('pointerdown');
  app.pointer('pointermove', 340, 325);
  app.pointer('pointerup', 340, 325);
  app.tick(420);
  const [, p, a, d] = model.PAD_EMOTIONS.find(([name]) => name === app.elements['pad-emotion'].textContent);
  const result = new THREE.Color(...model.padColor(p, a, d)).convertSRGBToLinear();
  assert.equal(app.elements['pad-color-value'].textContent, `#${result.getHexString()}`.toUpperCase());
  app.elements['pad-neutral'].fire('click');
  checkColor(0, 0, 0);
  assert.deepEqual(visibleLabelNames(app), []);
});

test('every curated emotion can be selected exactly and its surface intensity matches the reticle', async () => {
  const app = await selector(true);
  const picker = app.elements['pad-landmark-picker'];
  assert.equal(picker.children.length, model.PAD_EMOTIONS.length);
  assert.equal(app.elements['pad-landmark-count'].textContent, '64 EMOTION LANDMARKS');
  const names = picker.children.map(option => option.textContent);
  assert.deepEqual(names, model.PAD_EMOTIONS.map(([name]) => name).sort((a, b) => a.localeCompare(b, 'en')));
  const sphere = app.group.children.find(child => child.material?.isShaderMaterial);
  assert.ok(sphere);
  assert.equal(sphere.material.toneMapped, false);
  assert.match(sphere.material.fragmentShader, /vec4\(padSrgbColor\(pad\), 1\.0\)/);
  assert.ok(!sphere.material.fragmentShader.includes('colorspace_fragment'));
  for (const option of picker.children) {
    const index = Number(option.value);
    const [name, p, a, d] = model.PAD_EMOTIONS[index];
    assert.equal(option.textContent, name);
    picker.value = option.value;
    picker.fire('change');
    assert.equal(app.elements['pad-emotion'].textContent, name);
    const intensity = sphere.material.uniforms.intensity.value;
    assert.equal(intensity, Math.max(Math.abs(p), Math.abs(a), Math.abs(d)));
    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(app.group.quaternion.clone().invert());
    const pad = model.dirToPad(direction, intensity);
    assert.ok(Math.hypot(pad.p - p, pad.a - a, pad.d - d) < 1e-10);
    assert.equal(app.elements['pad-color-value'].textContent, model.padColorHex(p, a, d).toUpperCase());
  }
  app.elements['pad-neutral'].fire('click');
  assert.equal(sphere.material.uniforms.intensity.value, 0);
});

test('all landmarks remain available on narrow screens and the selected label stays readable', async () => {
  const app = await selector(true, 320, 280);
  const picker = app.elements['pad-landmark-picker'];
  const layer = app.elements['pad-stage'].children.find(child => child.className === 'pad-landmarks');
  const labels = layer.children.filter(child => child.className === 'pad-landmark-label');
  const points = layer.children.filter(child => child.className === 'pad-landmark-point');
  assert.equal(points.length, model.PAD_EMOTIONS.length);
  for (let index = 0; index < model.PAD_EMOTIONS.length; index++) {
    picker.value = String(index);
    picker.fire('change');
    const label = labels[index];
    assert.equal(label.hidden, false, `${label.textContent} must stay visible when selected`);
    assert.deepEqual(visibleLabelNames(app), [label.textContent]);
    assert.ok(points.filter(point => !point.hidden).length <= 20);
    const x = parseFloat(label.style.left), y = parseFloat(label.style.top);
    assert.ok(x >= 0 && y >= 0 && x + label.offsetWidth <= 320 && y + label.offsetHeight <= 280);
    app.pointer('pointerdown');
    app.pointer('pointermove', 310, 300);
    assert.equal(visibleLabelNames(app).length, 4);
    const distance = i => Math.hypot(parseFloat(points[i].style.left) - 160, parseFloat(points[i].style.top) - 140);
    const nearest = points.map((point, i) => ({ point, i })).filter(({ point }) => !point.hidden)
      .sort((a, b) => distance(a.i) - distance(b.i)).slice(0, 4).map(({ i }) => labels[i].textContent);
    assert.deepEqual(labels.filter(item => !item.hidden).map(item => item.textContent).sort(), nearest.sort());
    app.pointer('pointercancel');
  }
});
