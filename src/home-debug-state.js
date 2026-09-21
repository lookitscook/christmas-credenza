import { SCENE_HATCH_DEFAULTS, SCENE_HATCH_SLIDERS } from './cross-hatch.js';

export const HOME_SCENE_STORAGE_KEY = 'christmas-credenza-home-hatch-v1';
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
  const state = { effect: 'cross-hatch', hatch: { ...SCENE_HATCH_DEFAULTS } };
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(HOME_SCENE_STORAGE_KEY));
    if (['none', 'cross-hatch'].includes(saved?.effect)) state.effect = saved.effect;
    for (const { key, min, max } of SCENE_HATCH_SLIDERS) {
      const value = saved?.hatch?.[key];
      if (Number.isFinite(value)) state.hatch[key] = Math.max(min, Math.min(max, value));
    }
  } catch { /* Missing, corrupt, or unavailable storage uses project defaults. */ }
  return state;
}
