import { SCENE_HATCH_DEFAULTS, SCENE_HATCH_SLIDERS } from './cross-hatch.js';
import { CRT_CONTROLS, CRT_DEFAULTS } from './crt-shader.js';

export const HOME_SCENE_STORAGE_KEY = 'christmas-credenza-home-hatch-v1';
export const HOME_SCENE_SETTINGS_VERSION = 2;
export function isHomeDebug(development, search) {
  return development === true && new URLSearchParams(search).get('debug') === 'true';
}
export function isHomeDevelopment(viteDevelopment, moduleUrl) {
  // Built assets explicitly report false, even when previewed on localhost.
  if (typeof viteDevelopment === 'boolean') return viteDevelopment;
  try {
    const url = new URL(moduleUrl);
    return ['http:', 'https:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && url.pathname.endsWith('/src/home-debug-state.js');
  } catch { return false; }
}
export const HOME_DEBUG_ENABLED = isHomeDebug(
  isHomeDevelopment(import.meta.env?.DEV, import.meta.url), globalThis.location?.search
);

export function readHomeSceneSettings(storage) {
  const state = {
    effect: 'cross-hatch',
    hatch: { ...SCENE_HATCH_DEFAULTS, scale: 1.7 },
    crt: { enabled: true, parameters: { ...CRT_DEFAULTS, brightness: 1 } },
  };
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(HOME_SCENE_STORAGE_KEY));
    if (['none', 'cross-hatch'].includes(saved?.effect)) state.effect = saved.effect;
    for (const { key, min, max } of SCENE_HATCH_SLIDERS) {
      const value = saved?.hatch?.[key];
      if (Number.isFinite(value)) state.hatch[key] = Math.max(min, Math.min(max, value));
    }
    if (typeof saved?.crt?.enabled === 'boolean') state.crt.enabled = saved.crt.enabled;
    for (const { key, min, max, step } of CRT_CONTROLS) {
      const value = saved?.crt?.parameters?.[key];
      if (Number.isFinite(value)) {
        const clamped = Math.max(min, Math.min(max, value));
        state.crt.parameters[key] = step === 1 ? Math.round(clamped) : clamped;
      }
    }
    // Apply changed homepage defaults once to existing v1 settings. Future
    // debug edits carry the current version and remain authoritative.
    if (saved?.version !== HOME_SCENE_SETTINGS_VERSION) {
      state.hatch.scale = 1.7;
      state.crt.parameters.brightness = 1;
    }
  } catch { /* Missing, corrupt, or unavailable storage uses project defaults. */ }
  return state;
}
