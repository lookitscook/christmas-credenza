// Imported only by the development homepage when ?debug=true is present.
export function createHomeDebugControls({ name, title, controls, values, onChange, signal }) {
  let panel = document.getElementById('home-debug');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'home-debug';
    panel.className = 'home-debug';
    panel.setAttribute('aria-label', 'Homepage appearance settings');
    const heading = document.createElement('h2');
    heading.textContent = 'Homepage appearance';
    panel.append(heading);
    document.querySelector('.home-article').append(panel);
  }
  const group = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  group.append(legend);
  const inputs = new Map();
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  for (const { key, label, min, max, step = .01, type = 'range' } of controls) {
    const row = document.createElement('label');
    row.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.name = `${name}-${key}`;
    const output = document.createElement('output');
    if (type !== 'checkbox') Object.assign(input, { min, max, step });
    inputs.set(key, { input, output });
    input.addEventListener('input', () => {
      const value = type === 'checkbox' ? input.checked : input.valueAsNumber;
      if (type !== 'checkbox' && !Number.isFinite(value)) return;
      output.value = type === 'checkbox' ? '' : String(value);
      const saved = onChange(key, value);
      status.textContent = saved === false ? 'Storage unavailable. Changes apply for this visit.' : 'Saved on this device.';
    }, { signal });
    row.append(output, input);
    group.append(row);
  }
  group.append(status);
  panel.append(group);
  function sync(next) {
    for (const [key, { input, output }] of inputs) {
      if (input.type === 'checkbox') input.checked = next[key];
      else { input.value = next[key]; output.value = String(next[key]); }
    }
  }
  sync(values);
  signal?.addEventListener('abort', () => group.remove(), { once: true });
  return { sync };
}
