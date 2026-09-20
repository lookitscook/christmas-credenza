import { CRT_CONTROLS, CRT_DEFAULTS } from './crt-shader.js';
import { CAMERA_DEFAULTS } from './camera-controls.js';
import { HATCH_FIXED_PARAMETERS, SCENE_HATCH_DEFAULTS, SCENE_HATCH_SLIDERS } from './cross-hatch.js';

export const STATE_APP = 'christmas-credenza';
export const STATE_VERSION = 1;
export const STATE_COOKIE = 'christmas_credenza_state_v1';
export const MAX_STATE_BYTES = 64 * 1024;

// Captured from the user's local editor settings on 2026-09-20. Existing
// browser saves still take precedence; fresh sessions start with this view.
export const SCENE_DEFAULTS = Object.freeze({
  app: STATE_APP, version: STATE_VERSION, camera: CAMERA_DEFAULTS,
  train: Object.freeze({ running: true, position: 4.721212105999891, wheelTravel: 350.46514699972056 }),
  tv: Object.freeze({ enabled: true, currentTime: 4.445289 }),
  crt: Object.freeze({ enabled: true, parameters: CRT_DEFAULTS }),
  effect: 'cross-hatch', hatch: SCENE_HATCH_DEFAULTS,
  panels: Object.freeze({ crt: false, hatch: true }),
});

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Missing or invalid ${name}.`);
  return value;
}
function number(value, name, min = -1e6, max = 1e6) {
  if (!Number.isFinite(value)) throw new Error(`Invalid number: ${name}.`);
  return Math.max(min, Math.min(max, value));
}
function boolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`Invalid switch: ${name}.`);
  return value;
}
function parameters(value, controls, name) {
  object(value, name);
  return Object.fromEntries(controls.map(({ key, min, max, step = .01 }) => {
    const n = number(value[key], `${name}.${key}`, min, max);
    return [key, Number((min + Math.round((n - min) / step) * step).toFixed(6))];
  }));
}

// Validate the entire file before any live setting is changed. Only known keys
// enter the scene; imported files cannot replace assets or inject markup/code.
export function validateSceneState(value) {
  object(value, 'scene state');
  if (value.app !== STATE_APP || value.version !== STATE_VERSION) throw new Error('Choose a version 1 Christmas credenza settings file.');
  const camera = object(value.camera, 'camera');
  if (!Array.isArray(camera.target) || camera.target.length !== 3) throw new Error('Invalid camera target.');
  const train = object(value.train, 'train');
  const tv = object(value.tv, 'TV');
  const crt = object(value.crt, 'CRT');
  const hatch = object(value.hatch, 'cross-hatch');
  // Older version 1 saves predate the adjustable viewport fade.
  const sceneHatch = { ...hatch, edgeFade: hatch.edgeFade === undefined ? SCENE_HATCH_DEFAULTS.edgeFade : hatch.edgeFade };
  const panels = object(value.panels, 'panels');
  if (!['none', 'cross-hatch'].includes(value.effect)) throw new Error('Invalid post-processing effect.');
  // Ignore retired paper, ink, and channel controls in version 1 snapshots.
  return {
    app: STATE_APP, version: STATE_VERSION,
    camera: {
      yaw: number(camera.yaw, 'camera.yaw', -1.1, 1.1),
      pitch: number(camera.pitch, 'camera.pitch', .05, .92),
      distance: number(camera.distance, 'camera.distance', 1.7, 4.8),
      target: camera.target.map((n, axis) => number(n, 'camera.target', axis === 2 ? -.3 : -5, 5)),
    },
    train: { running: boolean(train.running, 'train.running'), position: number(train.position, 'train.position', 0), wheelTravel: number(train.wheelTravel, 'train.wheelTravel', 0) },
    tv: { enabled: boolean(tv.enabled, 'tv.enabled'), currentTime: number(tv.currentTime, 'tv.currentTime', 0) },
    crt: { enabled: boolean(crt.enabled, 'crt.enabled'), parameters: parameters(crt.parameters, CRT_CONTROLS, 'CRT') },
    effect: value.effect,
    hatch: { ...parameters(sceneHatch, SCENE_HATCH_SLIDERS, 'cross-hatch'), ...HATCH_FIXED_PARAMETERS },
    panels: { crt: boolean(panels.crt, 'panels.crt'), hatch: boolean(panels.hatch, 'panels.hatch') },
  };
}

export function parseSceneState(text) {
  if (text.length > MAX_STATE_BYTES) throw new Error('Settings file is too large (maximum 64 KB).');
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('The file is not valid JSON.'); }
  return validateSceneState(value);
}

export function readStateCookie(doc) {
  const entry = doc.cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${STATE_COOKIE}=`));
  return entry ? parseSceneState(decodeURIComponent(entry.slice(STATE_COOKIE.length + 1))) : null;
}

export function writeStateCookie(doc, state, secure = false) {
  const value = encodeURIComponent(JSON.stringify(state));
  const cookie = `${STATE_COOKIE}=${value}; Max-Age=31536000; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  if (cookie.length > 4000) throw new Error('Scene state exceeds the cookie size limit.');
  doc.cookie = cookie;
  return doc.cookie.split(';').some(item => item.trim() === `${STATE_COOKIE}=${value}`);
}

export function createScenePersistence(root, getState, applyState) {
  const status = root.querySelector('[data-state-status]');
  const exportButton = root.querySelector('[data-action="export-state"]');
  const importButton = root.querySelector('[data-action="import-state"]');
  const input = root.querySelector('[data-state-file]');
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let timer, lastSaved = '', disposed = false;
  let cookieAvailable = location.protocol !== 'file:';
  function save() {
    clearTimeout(timer);
    if (disposed) return false;
    const state = getState();
    const serialized = JSON.stringify(state);
    if (serialized === lastSaved) return true;
    let saved = false;
    if (cookieAvailable) {
      try { saved = writeStateCookie(document, state, location.protocol === 'https:'); }
      catch { /* Fall back to device storage when cookies are unavailable. */ }
      cookieAvailable = saved;
    }
    // File URLs cannot use cookies. Keep a backup for that offline edition and
    // for browsers that disable cookies, without blocking JSON export/import.
    try { localStorage.setItem(STATE_COOKIE, serialized); saved = true; } catch { /* Storage may be disabled. */ }
    if (saved) lastSaved = serialized;
    else status.textContent = 'Automatic saving is unavailable. Use Save JSON to keep your settings.';
    return saved;
  }
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(save, 250);
  }
  try {
    let restored = null;
    try { restored = readStateCookie(document); } catch { /* Try the backup. */ }
    if (!restored) {
      try { const stored = localStorage.getItem(STATE_COOKIE); if (stored) restored = parseSceneState(stored); } catch { /* Start with defaults. */ }
    }
    if (restored) { applyState(restored); status.textContent = 'Saved settings restored.'; }
    else applyState(SCENE_DEFAULTS);
  } catch (error) {
    status.textContent = `Saved settings could not be restored. ${error.message}`;
  }
  exportButton.disabled = importButton.disabled = false;
  exportButton.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'christmas-credenza-settings.json';
    root.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Settings exported as JSON.';
    save();
  }, options);
  importButton.addEventListener('click', () => input.click(), options);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_STATE_BYTES) throw new Error('Settings file is too large (maximum 64 KB).');
      const state = parseSceneState(await file.text());
      if (disposed) return;
      applyState(state);
      status.textContent = 'Settings imported.';
      save();
    } catch (error) { status.textContent = `Could not import settings. ${error.message}`; }
    finally { input.value = ''; }
  }, options);
  for (const name of ['input', 'change', 'click']) root.addEventListener(name, scheduleSave, options);
  // Capture moving train/video state periodically and synchronously on reload
  // or backgrounding; avoid writing a cookie on every rendered video frame.
  const checkpoint = setInterval(save, 2000);
  window.addEventListener('pagehide', save, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); }, options);
  save();
  return {
    scheduleSave,
    dispose() { save(); disposed = true; clearTimeout(timer); clearInterval(checkpoint); listeners.abort(); },
  };
}
