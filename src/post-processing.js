import { CrossHatchEffect, SCENE_HATCH_DEFAULTS, SCENE_HATCH_SLIDERS } from './cross-hatch.js';
import { DEFAULT_PAGE_BACKGROUND } from './page-background.js';

export function createPostProcessing(renderer, root, invalidate, panels, backgroundColor = DEFAULT_PAGE_BACKGROUND) {
  const select = root.querySelector('[data-action="effect"]');
  const grid = root.querySelector('[data-hatch-sliders]');
  const params = { ...SCENE_HATCH_DEFAULTS };
  const controls = new Map();
  let effect = null;
  let active = false;
  let width = 1, height = 1;
  let circleCutout = null;

  for (const { key, label, min, max, percent } of SCENE_HATCH_SLIDERS) {
    // A presentation uses the same effect and settings without editor widgets.
    if (!grid) {
      controls.set(key, value => { params[key] = value; effect?.setParameter(key, value); });
      continue;
    }
    const control = document.createElement('label');
    control.className = 'hatch-control';
    control.htmlFor = `hatch-${key}`;
    const caption = document.createElement('span');
    caption.textContent = label;
    const output = document.createElement('output');
    output.htmlFor = control.htmlFor;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'form-range';
    input.id = control.htmlFor;
    input.name = key;
    input.min = min;
    input.max = max;
    input.step = '0.01';
    function update(value) {
      params[key] = value;
      input.value = value;
      output.value = percent ? `${Math.round(value * 100)}%` : value.toFixed(2);
      input.setAttribute('aria-valuetext', output.value);
      effect?.setParameter(key, params[key]);
    }
    update(params[key]);
    controls.set(key, update);
    input.addEventListener('input', () => { update(input.valueAsNumber); invalidate(); });
    control.append(caption, output, input);
    grid.append(control);
  }

  function setEffect(name, openPanel = false) {
    if (select) select.value = name;
    active = name === 'cross-hatch';
    if (active && openPanel) panels.setOpen('hatch', true);
    if (active && !effect) {
      effect = new CrossHatchEffect(renderer, { backgroundColor });
      effect.setSize(width, height);
      effect.setCircleCutout(circleCutout);
      for (const { key } of SCENE_HATCH_SLIDERS) effect.setParameter(key, params[key]);
    }
    invalidate();
  }
  select?.addEventListener('change', () => setEffect(select.value, true));
  function setParameters(values) {
    for (const [key, update] of controls) update(values[key] ?? SCENE_HATCH_DEFAULTS[key]);
    invalidate();
  }
  root.querySelector('[data-action="reset-hatch"]')?.addEventListener('click', () => setParameters(SCENE_HATCH_DEFAULTS));
  if (select) select.disabled = false;

  return {
    getState() { return { effect: active ? 'cross-hatch' : 'none', hatch: { ...params } }; },
    setState(state) { setParameters(state.hatch); setEffect(state.effect); },
    setCircleCutout(value) {
      circleCutout = value;
      effect?.setCircleCutout(value);
      invalidate();
    },
    setBackground(color) {
      backgroundColor = color;
      effect?.setBackground(color);
      invalidate();
    },
    setSize(w, h) {
      width = w;
      height = h;
      effect?.setSize(w, h);
    },
    render(scene, camera) {
      if (active) effect.render(scene, camera);
      else renderer.render(scene, camera);
    },
    dispose() {
      effect?.dispose();
    },
  };
}
