import * as THREE from '../vendor/three.module.js';

export const CAMERA_DEFAULTS = Object.freeze({
  yaw: -0.5231882112845768, pitch: 0.12120312500000002, distance: 1.8825519019374903,
  target: Object.freeze([0.0759447936460346, 1.263378774797568, 0.08526518192651969]),
});
const clamp = THREE.MathUtils.clamp;
const copy = state => ({ ...state, target: [...state.target] });

// Inset from the room's actual edges (x = ±6, ceiling y = 5, floor end z = 6).
// Test the whole frustum against these faces, so its corners cannot reveal a
// side/top edge when orbiting, panning, zooming, importing, or resizing.
const roomFaces = [
  [[-5.9, -.005, -.525], [-5.9, 4.9, 5.9]],
  [[5.9, -.005, -.525], [5.9, 4.9, 5.9]],
  [[-5.9, 4.9, -.525], [5.9, 4.9, 5.9]],
  [[-5.9, -.005, 5.9], [5.9, 4.9, 5.9]],
].map(([min, max]) => {
  const bounds = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
  const axes = [0, 1, 2].filter(axis => min[axis] !== max[axis]);
  const corners = [[0, 0], [0, 1], [1, 1], [1, 0]].map(bits => {
    const point = [...min];
    axes.forEach((axis, i) => { point[axis] = bits[i] ? max[axis] : min[axis]; });
    return new THREE.Vector3(...point);
  });
  return { bounds, corners };
});

function intersectsFace(frustum, face) {
  if (!frustum.intersectsBox(face.bounds)) return false;
  // A bounding-box test alone gives false positives for oblique views. Clip
  // the face to the frustum so ordinary orbit/pan stays free until a room edge
  // would actually enter the image.
  let polygon = face.corners;
  for (const plane of frustum.planes) {
    const clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (da >= 0) clipped.push(a);
      if ((da >= 0) !== (db >= 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
    }
    if (!clipped.length) return false;
    polygon = clipped;
  }
  return true;
}

export function createCameraRig(camera) {
  let state = copy(CAMERA_DEFAULTS);
  const target = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  function place(value) {
    const { yaw, pitch, distance } = value;
    target.fromArray(value.target);
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function safe(value) {
    place(value);
    const p = camera.position;
    if (Math.abs(p.x) >= 5.9 || p.y <= .08 || p.y >= 4.9 || p.z <= -.4 || p.z >= 5.9) return false;
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return roomFaces.every(face => !intersectsFace(frustum, face));
  }
  function setState(value) {
    const desired = {
      yaw: clamp(value.yaw, -1.1, 1.1), pitch: clamp(value.pitch, .05, .92),
      distance: clamp(value.distance, 1.7, 4.8),
      target: value.target.map((n, i) => clamp(n, i === 2 ? -.3 : -5, 5)),
    };
    if (![desired.yaw, desired.pitch, desired.distance, ...desired.target].every(Number.isFinite)) return;
    if (!safe(state)) {
      // The stage normally stays 3:2. A narrower fallback also handles a
      // different aspect ratio if the layout is changed in the future.
      state = copy(CAMERA_DEFAULTS);
      state.distance = 1.7;
    }
    if (safe(desired)) state = desired;
    else {
      const start = copy(state);
      let low = 0, high = 1;
      for (let i = 0; i < 24; i++) {
        const t = (low + high) / 2;
        const candidate = {
          yaw: THREE.MathUtils.lerp(start.yaw, desired.yaw, t),
          pitch: THREE.MathUtils.lerp(start.pitch, desired.pitch, t),
          distance: THREE.MathUtils.lerp(start.distance, desired.distance, t),
          target: start.target.map((n, axis) => THREE.MathUtils.lerp(n, desired.target[axis], t)),
        };
        if (safe(candidate)) { low = t; state = candidate; }
        else high = t;
      }
    }
    place(state);
  }
  setState(state);
  return {
    getState: () => copy(state),
    setState,
    resize() { setState(state); },
    orbit(dx, dy) { setState({ ...state, yaw: state.yaw - dx * .004, pitch: state.pitch + dy * .003 }); },
    zoom(factor) { setState({ ...state, distance: state.distance * factor }); },
    pan(dx, dy, height) {
      if (!height) return;
      const scale = 2 * state.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / height;
      const offset = new THREE.Vector3(-dx * scale, dy * scale, 0).applyQuaternion(camera.quaternion);
      setState({ ...state, target: target.clone().add(offset).toArray() });
    },
  };
}

export function attachCameraControls(element, rig, onChange) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const pointers = new Map();
  let previousGap = 0;
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    element.setPointerCapture(event.pointerId);
    previousGap = 0;
  }, options);
  element.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      if (event.shiftKey) rig.pan(dx, dy, element.clientHeight);
      else rig.orbit(dx, dy);
    } else {
      const [a, b] = [...pointers.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (previousGap > 0 && gap > 0) rig.zoom(previousGap / gap);
      previousGap = gap;
    }
    onChange();
  }, options);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(name, event => { pointers.delete(event.pointerId); previousGap = 0; }, options);
  }
  element.addEventListener('wheel', event => {
    event.preventDefault();
    rig.zoom(Math.exp(clamp(event.deltaY * .001, -2, 2)));
    onChange();
  }, { ...options, passive: false });
  return { dispose() { listeners.abort(); pointers.clear(); } };
}
