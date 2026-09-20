import * as THREE from '../vendor/three.module.js';
import { LOGO_STORAGE_KEY, readPageBackground, applyPageBackground, pageForeground } from './page-background.js';
import { PAD_EMOTIONS, PAD_COLOR_GLSL, padEmotionSource, visiblePadEmotions, nearestPadLabels, dirToPad, padColor, padColorHex, padEmotion, nearestPadEmotion, RING_START, RING_SWEEP, ringAngle, ringIntensity, padCameraDistance } from './pad-model.js';

const stage = document.getElementById('pad-stage');
const emotionEl = document.getElementById('pad-emotion');
const padEl = document.getElementById('pad-values');
const message = document.getElementById('pad-message');
const neutralButton = document.getElementById('pad-neutral');
const colorSwatch = document.getElementById('pad-color-swatch');
const colorValue = document.getElementById('pad-color-value');
const landmarkPicker = document.getElementById('pad-landmark-picker');
document.getElementById('pad-landmark-count').textContent = `${PAD_EMOTIONS.length} EMOTION LANDMARKS`;
applyPageBackground(readPageBackground());

function createSelector() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const overlayRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const renderers = [renderer, overlayRenderer];
  for (const layer of renderers) {
    layer.setClearColor(0x000000, 0);
    layer.outputColorSpace = THREE.SRGBColorSpace;
  }
  // CSS filters affect an entire canvas. Keep every overlay on a separate,
  // unfiltered canvas above the globe's color surface.
  renderer.domElement.className = 'pad-globe';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const canvas = overlayRenderer.domElement;
  canvas.className = 'pad-overlay';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Interactive PAD sphere');
  canvas.setAttribute('aria-describedby', 'pad-help pad-keyboard-help pad-values');
  stage.append(renderer.domElement, canvas);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let frame = null, disposed = false, snap = null;
  let activePointer = null, dragMode = null, lastX = 0, lastY = 0;
  function invalidate() {
    if (frame !== null || disposed) return;
    frame = requestAnimationFrame(now => {
      frame = null;
      if (snap) {
        const progress = Math.min(1, (now - snap.started) / 420);
        const eased = progress * progress * (3 - 2 * progress);
        group.quaternion.slerpQuaternions(snap.from, snap.to, eased);
        selectedDirection.copy(front).applyQuaternion(group.quaternion.clone().invert()).normalize();
        intensity = THREE.MathUtils.lerp(snap.intensityFrom, snap.intensityTo, eased);
        if (progress === 1) snap = null;
        update(false);
      }
      try {
        camera.layers.set(1);
        renderer.render(scene, camera);
        // Keep the sphere's depth in the overlay pass so rear mesh lines stay
        // hidden, but draw its color only on the filtered canvas below.
        camera.layers.set(0);
        sphere.material.colorWrite = false;
        overlayRenderer.render(scene, camera);
      } finally {
        camera.layers.set(0);
        sphere.material.colorWrite = true;
      }
      if (snap) invalidate();
    });
  }

  const group = new THREE.Group();
  scene.add(group);
  const geometry = new THREE.IcosahedronGeometry(1.52, 3);
  const sphere = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: { intensity: { value: .68 } },
    vertexShader: `varying vec3 padPosition;
      void main() {
        padPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `${PAD_COLOR_GLSL}
      varying vec3 padPosition;
      uniform float intensity;
      void main() {
        float maximum = max(max(abs(padPosition.x), abs(padPosition.y)), abs(padPosition.z));
        vec3 pad = padPosition / max(maximum, 0.00001) * intensity;
        // The mapping already produces display sRGB; do not encode it a second time.
        gl_FragColor = vec4(padSrgbColor(pad), 1.0);
      }`,
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  sphere.layers.enable(1);
  group.add(sphere);

  const meshLines = new THREE.LineSegments(new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x062627, transparent: true, opacity: .4, depthWrite: false }));
  group.add(meshLines);

  const ringRadius = 1.86;
  const curve = new THREE.EllipseCurve(0, 0, ringRadius, ringRadius, RING_START, RING_START + RING_SWEEP, false, 0);
  const ringPoints = curve.getPoints(256).map(point => new THREE.Vector3(point.x, point.y, 0));
  const ringMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .45 });
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), ringMaterial));
  const trackMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .12 });
  const ringTrack = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, .025, 12, 160, RING_SWEEP), trackMaterial);
  ringTrack.rotation.z = RING_START;
  scene.add(ringTrack);
  const knobMaterial = new THREE.MeshBasicMaterial();
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.075, 24, 24), knobMaterial);
  scene.add(knob);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.055, 20, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(.085, .115, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, side: THREE.DoubleSide }));
  group.add(marker, halo);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'pad-landmarks';
  labelLayer.setAttribute('aria-hidden', 'true');
  stage.appendChild(labelLayer);
  let hoveredLandmark = null;
  const landmarks = PAD_EMOTIONS.map(([name, p, a, d]) => {
    const point = document.createElement('button');
    point.className = 'pad-landmark-point';
    point.type = 'button';
    point.tabIndex = -1; // The native picker provides keyboard access to every term.
    point.style.backgroundColor = padColorHex(p, a, d);
    const source = padEmotionSource(name);
    point.title = `${name}: P ${p.toFixed(2)}, A ${a.toFixed(2)}, D ${d.toFixed(2)} · ${source.year}, ${source.term}`;
    const leader = document.createElement('span');
    leader.className = 'pad-landmark-leader';
    const label = document.createElement('span');
    label.className = 'pad-landmark-label';
    label.textContent = name;
    label.hidden = leader.hidden = true;
    labelLayer.append(point, leader, label);
    point.addEventListener('pointerenter', () => { hoveredLandmark = name; updateLandmarks(emotionEl.textContent); }, options);
    point.addEventListener('pointerleave', () => { hoveredLandmark = null; updateLandmarks(emotionEl.textContent); }, options);
    point.addEventListener('click', () => snapToEmotion({ name, p, a, d }), options);
    label.addEventListener('click', () => {
      if (!label.hidden) snapToEmotion({ name, p, a, d });
    }, options);
    return { name, position: new THREE.Vector3(p, a, d).normalize().multiplyScalar(1.545), point, leader, label };
  });
  const pickerRows = PAD_EMOTIONS.map(([name], index) => ({ name, index }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const { name, index } of pickerRows) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = name;
    landmarkPicker.appendChild(option);
  }
  landmarkPicker.addEventListener('change', () => {
    if (landmarkPicker.value === '') return;
    const row = PAD_EMOTIONS[Number(landmarkPicker.value)];
    if (!row) return;
    const [name, p, a, d] = row;
    snapToEmotion({ name, p, a, d });
  }, options);
  function updateLandmarks(selectedLabel) {
    camera.updateMatrixWorld();
    const width = stage.clientWidth, height = stage.clientHeight;
    const visible = [];
    for (const landmark of landmarks) {
      const world = landmark.position.clone().applyQuaternion(group.quaternion);
      // Hide points on the far side, accounting for the perspective camera.
      const facing = world.dot(camera.position.clone().sub(world)) > 0;
      landmark.point.hidden = true;
      if (!facing) continue;
      const projected = world.project(camera);
      landmark.x = (projected.x + 1) * width / 2;
      landmark.y = (1 - projected.y) * height / 2;
      landmark.point.style.left = `${landmark.x}px`;
      landmark.point.style.top = `${landmark.y}px`;
      landmark.point.classList.toggle('is-selected', landmark.name === selectedLabel);
      landmark.label.classList.toggle('is-selected', landmark.name === selectedLabel);
      visible.push(landmark);
    }
    const displayed = visiblePadEmotions(visible, selectedDirection, selectedLabel, hoveredLandmark);
    // Labels and leaders are only visible during a drag. The picker keeps
    // showing the selection while idle or snapping.
    const labeled = activePointer !== null && !snap
      ? nearestPadLabels(displayed, selectedDirection)
      : [];
    for (const landmark of displayed) landmark.point.hidden = false;
    // Keep labels clear of the reticle, all points, and each other.
    const occupied = [{ x: width / 2 - 18, y: height / 2 - 18, w: 36, h: 36 },
      ...displayed.map(({ x, y }) => ({ x: x - 6, y: y - 6, w: 12, h: 12 }))];
    const positioned = new Set();
    for (const landmark of labeled) {
      const w = landmark.label.offsetWidth, h = landmark.label.offsetHeight;
      let best, bestScore = Infinity;
      function consider(x, y, distance) {
        const overlap = occupied.reduce((area, box) => area
          + Math.max(0, Math.min(x + w + 3, box.x + box.w) - Math.max(x - 3, box.x))
          * Math.max(0, Math.min(y + h + 3, box.y + box.h) - Math.max(y - 3, box.y)), 0);
        const score = overlap > 0 ? Infinity : distance;
        if (score < bestScore) { bestScore = score; best = { x, y, w, h }; }
      }
      for (let offset = 0; offset <= height; offset += h + 4) {
        for (const sign of offset ? [-1, 1] : [1]) {
          for (const side of [1, -1]) {
            const x = Math.max(4, Math.min(width - w - 4, landmark.x + (side === 1 ? 12 : -w - 12)));
            const y = Math.max(4, Math.min(height - h - 4, landmark.y - h / 2 + offset * sign));
            consider(x, y, offset + (side === -1 ? 1 : 0));
          }
        }
        if (best) break;
      }
      // Dense clusters can block both adjacent columns on small screens. Search
      // the remaining space before dropping one of the four nearest labels.
      if (!best) {
        for (let y = 4; y <= height - h - 4; y += 8) {
          for (let x = 4; x <= width - w - 4; x += 8) {
            consider(x, y, Math.hypot(x + w / 2 - landmark.x, y + h / 2 - landmark.y));
          }
        }
      }
      if (!best) continue;
      positioned.add(landmark);
      occupied.push(best);
      landmark.label.style.left = `${best.x}px`;
      landmark.label.style.top = `${best.y}px`;
      const endX = Math.max(best.x, Math.min(best.x + w, landmark.x));
      const endY = Math.max(best.y, Math.min(best.y + h, landmark.y));
      const dx = endX - landmark.x, dy = endY - landmark.y;
      landmark.leader.style.left = `${landmark.x}px`;
      landmark.leader.style.top = `${landmark.y}px`;
      landmark.leader.style.width = `${Math.hypot(dx, dy)}px`;
      landmark.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
    // Commit visibility once, after measuring and positioning. Resetting it
    // during layout would interrupt CSS fades on every rotation frame.
    for (const landmark of landmarks) {
      landmark.label.hidden = landmark.leader.hidden = !positioned.has(landmark);
    }
  }

  // Start at the exact landmark nearest the default view, not just a direction
  // near it, so the selected point is under the reticle on the first frame.
  const initialEmotion = nearestPadEmotion({ p: .55, a: .42, d: .25 });
  let intensity = Math.max(Math.abs(initialEmotion.p), Math.abs(initialEmotion.a), Math.abs(initialEmotion.d));
  const front = new THREE.Vector3(0, 0, 1);
  const selectedDirection = new THREE.Vector3(initialEmotion.p, initialEmotion.a, initialEmotion.d).normalize();
  group.quaternion.setFromUnitVectors(selectedDirection, front);
  function update(render = true) {
    const angle = ringAngle(intensity);
    knob.position.set(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0);
    const values = dirToPad(selectedDirection, intensity);
    const label = padEmotion(values);
    sphere.material.uniforms.intensity.value = intensity;
    marker.material.color.setRGB(...padColor(values.p, values.a, values.d), THREE.SRGBColorSpace);
    const hex = padColorHex(values.p, values.a, values.d);
    colorSwatch.style.backgroundColor = hex;
    colorValue.textContent = hex.toUpperCase();
    colorSwatch.title = `${label} — YUV mapped color ${hex.toUpperCase()}`;
    if (emotionEl.textContent !== label) emotionEl.textContent = label;
    const selectedIndex = PAD_EMOTIONS.findIndex(([name]) => name === label);
    landmarkPicker.value = selectedIndex < 0 ? '' : String(selectedIndex);
    const format = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    padEl.textContent = `P ${format(values.p)} · A ${format(values.a)} · D ${format(values.d)} · ${Math.round(intensity * 100)}%`;
    marker.position.copy(selectedDirection).multiplyScalar(1.535);
    halo.position.copy(marker.position);
    group.updateMatrixWorld(true);
    halo.lookAt(camera.position);
    updateLandmarks(label);
    if (render) invalidate();
  }
  // Use the retained surface direction even at zero intensity, where PAD is
  // the origin and cannot identify a direction on its own.
  function snapToEmotion(emotion = nearestPadEmotion(dirToPad(selectedDirection, 1))) {
    releaseDrag();
    snap = null;
    const direction = new THREE.Vector3(emotion.p, emotion.a, emotion.d).normalize();
    const correction = new THREE.Quaternion().setFromUnitVectors(direction.applyQuaternion(group.quaternion), front);
    const to = group.quaternion.clone().premultiply(correction);
    const intensityTo = Math.max(Math.abs(emotion.p), Math.abs(emotion.a), Math.abs(emotion.d));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      group.quaternion.copy(to);
      selectedDirection.copy(front).applyQuaternion(to.clone().invert()).normalize();
      intensity = intensityTo;
      update();
      return;
    }
    snap = { started: performance.now(), from: group.quaternion.clone(), to, intensityFrom: intensity, intensityTo };
    updateLandmarks(emotionEl.textContent);
    invalidate();
  }
  function neutral() { releaseDrag(); snap = null; intensity = 0; update(); }
  function rotate(dx, dy) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * .006, dx * .006, 0, 'XYZ'));
    group.quaternion.premultiply(rotation);
    selectedDirection.set(0, 0, 1).applyQuaternion(group.quaternion.clone().invert()).normalize();
    update();
  }

  function syncBackground() {
    const background = applyPageBackground(readPageBackground());
    const foreground = pageForeground(background);
    for (const material of [ringMaterial, trackMaterial, knobMaterial]) material.color.set(foreground);
    invalidate();
  }
  window.addEventListener('storage', event => {
    if (event.key === LOGO_STORAGE_KEY || event.key === null) syncBackground();
  }, options);
  window.addEventListener('pageshow', syncBackground, options);
  syncBackground();

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function changeIntensity(event) {
    const rect = canvas.getBoundingClientRect();
    const next = ringIntensity(event.clientX - rect.left - rect.width / 2, rect.top + rect.height / 2 - event.clientY);
    if (next === null) return;
    intensity = next;
    update();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || activePointer !== null) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObjects([ringTrack, knob], false).length) dragMode = 'ring';
    else if (raycaster.intersectObject(sphere, false).length) dragMode = 'sphere';
    else return;
    snap = null;
    activePointer = event.pointerId;
    updateLandmarks(emotionEl.textContent);
    event.preventDefault();
    lastX = event.clientX; lastY = event.clientY;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    if (dragMode === 'ring') changeIntensity(event);
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    if (dragMode === 'ring') changeIntensity(event);
    else if (dragMode === 'sphere') rotate(event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX; lastY = event.clientY;
  }, options);
  function releaseDrag() {
    const pointerId = activePointer;
    activePointer = dragMode = null;
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  }
  function endDrag(event) {
    if (event.pointerId !== activePointer) return;
    releaseDrag();
    if (event.type === 'pointerup') snapToEmotion();
    else updateLandmarks(emotionEl.textContent);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endDrag, options);
  canvas.addEventListener('dblclick', neutral, options);
  neutralButton.addEventListener('click', neutral, options);
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(event.key)) return;
    snap = null;
    const step = event.shiftKey ? 40 : 10;
    switch (event.key) {
      case 'ArrowLeft': rotate(-step, 0); break;
      case 'ArrowRight': rotate(step, 0); break;
      case 'ArrowUp': rotate(0, -step); break;
      case 'ArrowDown': rotate(0, step); break;
      case '+': case '=': intensity = Math.min(1, intensity + .05); update(); break;
      case '-': case '_': intensity = Math.max(0, intensity - .05); update(); break;
      case 'Home': neutral(); break;
      default: return;
    }
    event.preventDefault();
  }, options);

  function resize() {
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    for (const layer of renderers) {
      layer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      layer.setSize(width, height, false);
    }
    camera.aspect = width / height;
    camera.position.set(0, 0, padCameraDistance(camera.aspect, camera.fov));
    camera.updateProjectionMatrix();
    update();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  window.addEventListener('resize', resize, options);
  resize();
  message.hidden = true;
  neutralButton.disabled = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    snap = null;
    listeners.abort(); resizeObserver.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    labelLayer.remove();
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const layer of renderers) layer.dispose();
  }
  for (const layer of renderers) layer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); dispose(); neutralButton.disabled = true;
    message.hidden = false; message.textContent = 'The graphics connection was lost. Reload to restore the sphere.';
  }, options);
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, options);
}

try { createSelector(); }
catch (error) {
  message.hidden = false;
  message.textContent = 'The PAD sphere needs WebGL to render. Reload or try a browser with graphics enabled.';
  console.error(error);
}
