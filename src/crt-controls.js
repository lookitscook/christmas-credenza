import { CRT_CONTROLS, CRT_DEFAULTS } from './crt-shader.js';

export function createCRTControls(root, crt, invalidate) {
  const fieldset = root.querySelector('[data-crt-controls]');
  const groups = root.querySelector('[data-crt-groups]');
  const enabled = root.querySelector('[data-crt-enabled]');
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const controls = new Map();
  const parameters = { ...CRT_DEFAULTS };
  const sections = new Map();
  for (const setting of CRT_CONTROLS) {
    const { group, key, label, min, max, step, percent } = setting;
    if (!sections.has(group)) {
      const section = document.createElement('fieldset');
      section.className = 'settings-group';
      const legend = document.createElement('legend');
      legend.textContent = group;
      const grid = document.createElement('div');
      grid.className = 'hatch-grid';
      section.append(legend, grid);
      groups.append(section);
      sections.set(group, grid);
    }
    const control = document.createElement('div');
    control.className = 'hatch-control';
    const caption = document.createElement('label');
    caption.htmlFor = `crt-${key}`;
    caption.textContent = label;
    const output = document.createElement('output');
    output.htmlFor = caption.htmlFor;
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', className: 'form-range', id: caption.htmlFor, name: key, min, max, step });
    const decimals = step === 1 ? 0 : step < .01 ? 3 : 2;
    function update(value) {
      parameters[key] = value;
      input.value = value;
      output.value = percent ? `${Number((value * 100).toFixed(1))}%` : value.toFixed(decimals);
      input.setAttribute('aria-valuetext', output.value);
      crt.setParameter(key, value);
    }
    update(CRT_DEFAULTS[key]);
    input.addEventListener('input', () => { update(input.valueAsNumber); invalidate(); }, options);
    control.append(caption, output, input);
    sections.get(group).append(control);
    controls.set(key, update);
  }
  enabled.addEventListener('change', () => { crt.setShaderEnabled(enabled.checked); invalidate(); }, options);
  root.querySelector('[data-action="reset-crt"]').addEventListener('click', () => {
    for (const [key, update] of controls) update(CRT_DEFAULTS[key]);
    enabled.checked = true;
    crt.setShaderEnabled(true);
    invalidate();
  }, options);
  return {
    getState() { return { enabled: enabled.checked, parameters: { ...parameters } }; },
    setState(state) {
      for (const [key, update] of controls) update(state.parameters[key]);
      enabled.checked = state.enabled;
      crt.setShaderEnabled(state.enabled);
      invalidate();
    },
    setAvailable(available) { fieldset.disabled = !available; },
    dispose() { listeners.abort(); fieldset.disabled = true; },
  };
}
