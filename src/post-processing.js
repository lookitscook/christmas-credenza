import { CrossHatchEffect, HATCH_DEFAULTS, HATCH_SLIDERS, PAPER_TEXTURES } from './cross-hatch.js';

export function createPostProcessing(renderer, root, invalidate, panels) {
  const select = root.querySelector('[data-action="effect"]');
  const grid = root.querySelector('[data-hatch-sliders]');
  const paper = root.querySelector('[data-hatch-paper]');
  const ink = root.querySelector('[data-hatch-ink]');
  const status = root.querySelector('[data-hatch-status]');
  const params = { ...HATCH_DEFAULTS };
  let effect = null;
  let active = false;
  let paperRequest = 0;
  let loadedPaper = null;
  let width = 1, height = 1;

  for (const { key, label, min, max } of HATCH_SLIDERS) {
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
    input.value = params[key];
    output.value = Number(input.value).toFixed(2);
    input.addEventListener('input', () => {
      params[key] = input.valueAsNumber;
      output.value = params[key].toFixed(2);
      effect?.setParameter(key, params[key]);
      invalidate();
    });
    control.append(caption, output, input);
    grid.append(control);
  }
  for (const name of Object.keys(PAPER_TEXTURES)) paper.add(new Option(name, name));
  paper.value = params.paper;
  ink.value = params.inkColor;

  async function loadPaper() {
    if (!effect) return;
    const request = ++paperRequest;
    status.textContent = 'Loading paper texture…';
    try {
      if (await effect.setPaper(params.paper) && request === paperRequest) {
        loadedPaper = params.paper;
        status.textContent = '';
        invalidate();
      }
    } catch (error) {
      if (request !== paperRequest) return;
      status.textContent = 'Paper texture could not load. Select a paper to try again.';
      if (loadedPaper) paper.value = params.paper = loadedPaper;
      console.error('Cross-hatch paper texture:', error);
    }
  }

  select.addEventListener('change', () => {
    active = select.value === 'cross-hatch';
    if (active) panels.setOpen('hatch', true);
    if (active && !effect) {
      effect = new CrossHatchEffect(renderer);
      effect.setSize(width, height);
      for (const { key } of HATCH_SLIDERS) effect.setParameter(key, params[key]);
      effect.setParameter('inkColor', params.inkColor);
      loadPaper();
    }
    invalidate();
  });
  paper.addEventListener('change', () => {
    params.paper = paper.value;
    loadPaper();
  });
  ink.addEventListener('input', () => {
    params.inkColor = ink.value;
    effect?.setParameter('inkColor', params.inkColor);
    invalidate();
  });
  root.querySelector('[data-action="reset-hatch"]').addEventListener('click', () => {
    Object.assign(params, HATCH_DEFAULTS);
    for (const { key } of HATCH_SLIDERS) {
      const input = grid.querySelector(`[name="${key}"]`);
      input.value = params[key];
      input.previousElementSibling.value = params[key].toFixed(2);
      effect?.setParameter(key, params[key]);
    }
    ink.value = params.inkColor;
    effect?.setParameter('inkColor', params.inkColor);
    paper.value = params.paper;
    loadPaper();
    invalidate();
  });
  select.disabled = false;

  return {
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
      paperRequest++;
      effect?.dispose();
    },
  };
}
