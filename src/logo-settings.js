import { HATCH_DEFAULTS, HATCH_SLIDERS, PAPER_TEXTURES } from './cross-hatch.js';

export const LOGO_WIDTH = 1169;
export const LOGO_HEIGHT = 1142;
export const SPHERE = Object.freeze({ x: 831, y: 337, radius: 268 });
export const LOGO_DEFAULTS = Object.freeze({
  color1: '#d66b87', color2: '#f29459', color3: '#ffda42',
  angle: 45, midpoint: 50, highlight: 18, softness: 22, grain: 8,
  hatchEnabled: false, ...HATCH_DEFAULTS,
  background: '#f3f0e6', transparent: false, exportScale: 2,
});
export const SPHERE_CONTROLS = Object.freeze([
  { key: 'angle', label: 'Direction', min: 0, max: 360, step: 1, unit: '°' },
  { key: 'midpoint', label: 'Color balance', min: 10, max: 90, step: 1, unit: '%' },
  { key: 'highlight', label: 'Highlight', min: 0, max: 70, step: 1, unit: '%' },
  { key: 'softness', label: 'Edge softness', min: 0, max: 50, step: 1, unit: '%' },
  { key: 'grain', label: 'Grain', min: 0, max: 30, step: 1, unit: '%' },
]);
const controls = [...SPHERE_CONTROLS, ...HATCH_SLIDERS];
export function readLogoSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid logo settings.');
  const result = { ...LOGO_DEFAULTS };
  for (const key of Object.keys(result)) {
    if (input[key] === undefined) continue;
    const value = input[key];
    const control = controls.find(item => item.key === key);
    if (control) {
      if (!Number.isFinite(value)) throw new Error(`Invalid ${key}.`);
      result[key] = Math.max(control.min, Math.min(control.max, value));
    } else if (typeof result[key] === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Invalid ${key}.`);
      result[key] = value;
    } else if (key === 'paper') {
      if (!Object.hasOwn(PAPER_TEXTURES, value)) throw new Error('Invalid paper.');
      result[key] = value;
    } else if (key === 'exportScale') {
      if (![1, 2, 3].includes(value)) throw new Error('Invalid export size.');
      result[key] = value;
    } else {
      if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`Invalid ${key}.`);
      result[key] = value.toLowerCase();
    }
  }
  return result;
}
