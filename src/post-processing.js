import { CrossHatchEffect, SCENE_HATCH_DEFAULTS, SCENE_HATCH_SLIDERS } from './cross-hatch.js';
import { DEFAULT_PAGE_BACKGROUND } from './page-background.js';

export function createPostProcessing(renderer, root, invalidate, panels, backgroundColor = DEFAULT_PAGE_BACKGROUND) {
  const select = root.querySelector('[data-action="effect"]');
  const grid = root.querySelector('[data-hatch-sliders]');
  const ink = root.querySelector('[data-hatch-ink]');
  const params = { ...SCENE_HATCH_DEFAULTS };
  const controls = new Map();
  let effect = null;
  let active = false;
  let width = 1, height = 1;

  for (const { key, label, min, max, percent } of SCENE_HATCH_SLIDERS) {
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
  ink.value = params.inkColor;

  function setEffect(name, openPanel = false) {
    select.value = name;
    active = name === 'cross-hatch';
    if (active && openPanel) panels.setOpen('hatch', true);
    if (active && !effect) {
      effect = new CrossHatchEffect(renderer, { backgroundColor });
      effect.setSize(width, height);
      for (const { key } of SCENE_HATCH_SLIDERS) effect.setParameter(key, params[key]);
      effect.setParameter('inkColor', params.inkColor);
    }
    invalidate();
  }
  select.addEventListener('change', () => setEffect(select.value, true));
  ink.addEventListener('input', () => {
    params.inkColor = ink.value;
    effect?.setParameter('inkColor', params.inkColor);
    invalidate();
  });
  function setParameters(values) {
    for (const [key, update] of controls) update(values[key] ?? SCENE_HATCH_DEFAULTS[key]);
    params.inkColor = values.inkColor;
    ink.value = params.inkColor;
    effect?.setParameter('inkColor', params.inkColor);
    invalidate();
  }
  root.querySelector('[data-action="reset-hatch"]').addEventListener('click', () => setParameters(SCENE_HATCH_DEFAULTS));
  select.disabled = false;

  return {
    getState() { return { effect: active ? 'cross-hatch' : 'none', hatch: { ...params } }; },
    setState(state) { setParameters(state.hatch); setEffect(state.effect); },
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
