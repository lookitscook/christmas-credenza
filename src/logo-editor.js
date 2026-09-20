import { HATCH_DEFAULTS, HATCH_SLIDERS, PAPER_TEXTURES } from './cross-hatch.js';
import { LOGO_WIDTH, LOGO_HEIGHT, LOGO_DEFAULTS, SPHERE_CONTROLS, readLogoSettings } from './logo-settings.js';
import { LogoSphere } from './logo-sphere.js';
import { WORDMARK } from './logo-wordmark.js';
import { createLogoSVG, logoPNG } from './logo-export.js';
import { STATE_COOKIE, parseSceneState, readStateCookie } from './scene-state.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'christmas-credenza-logo-v1';
let settings = { ...LOGO_DEFAULTS }, sphere, frame, paperRequest = 0, exporting = false, contextLost = false;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) settings = readLogoSettings(JSON.parse(stored));
} catch { /* A corrupt or inaccessible saved value must not prevent editing. */ }

for (const [index, label] of ['Rose', 'Coral', 'Gold'].entries()) {
  const key = `color${index + 1}`;
  const row = document.createElement('div'); row.className = 'color-control';
  const caption = document.createElement('label'); caption.htmlFor = key; caption.textContent = label;
  const input = document.createElement('input');
  input.type = 'color'; input.name = input.id = key;
  const hex = document.createElement('input');
  Object.assign(hex, { type: 'text', id: `${key}-hex`, maxLength: 7, spellcheck: false });
  hex.dataset.setting = key; hex.setAttribute('aria-label', `${label} hex color`);
  row.append(caption, input, hex); $('sphere-colors').append(row);
}
for (const control of [...SPHERE_CONTROLS, ...HATCH_SLIDERS]) {
  const { key, label, min, max, step = .01, unit = '' } = control;
  const row = document.createElement('div'); row.className = 'slider-control';
  const caption = document.createElement('label'); caption.htmlFor = key; caption.textContent = label;
  const numberGroup = document.createElement('span'); numberGroup.className = 'number-control';
  const number = document.createElement('input');
  Object.assign(number, { type: 'number', id: `${key}-number`, min, max, step });
  number.dataset.setting = key; number.setAttribute('aria-label', `${label} value`);
  const suffix = document.createElement('span'); suffix.textContent = unit;
  numberGroup.append(number, suffix);
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', id: key, name: key, min, max, step });
  row.append(caption, numberGroup, input);
  $(SPHERE_CONTROLS.includes(control) ? 'sphere-controls' : 'hatch-sliders').append(row);
}
for (const name of Object.keys(PAPER_TEXTURES)) $('paper').add(new Option(name, name));
$('wordmark-preview').innerHTML = WORDMARK;

function status(message) { $('logo-status').textContent = message; }
function syncControls(editedInput) {
  for (const [key, value] of Object.entries(settings)) {
    for (const input of [$(key), $(`${key}-number`), $(`${key}-hex`)]) {
      // Preserve partial text and the caret while typing an exact value. The
      // paired picker/slider and preview still update as soon as it is valid.
      if (!input || input === editedInput) continue;
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
      input.removeAttribute('aria-invalid');
    }
  }
  $('hatch-controls').disabled = !settings.hatchEnabled;
  $('hatch-controls').hidden = !settings.hatchEnabled;
  $('background').disabled = settings.transparent;
}
function render() {
  frame = null;
  if (!sphere || contextLost) return;
  sphere.render(settings);
  $('logo-preview').style.backgroundColor = settings.background;
  $('logo-preview').classList.toggle('is-transparent', settings.transparent);
}
function invalidate() { if (!frame) frame = requestAnimationFrame(render); }
async function loadPaper() {
  if (!sphere || contextLost) return;
  const request = ++paperRequest;
  try {
    await sphere.setPaper(settings.paper);
    if (request === paperRequest) invalidate();
  } catch {
    if (request === paperRequest) status('Paper texture could not load. Select it again to retry.');
  }
}
function update(next, editedInput) {
  const previousPaper = settings.paper;
  settings = readLogoSettings(next);
  syncControls(editedInput); invalidate();
  if (previousPaper !== settings.paper || sphere?.paper !== settings.paper) loadPaper();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { status('Device storage is unavailable. You can still edit and export.'); }
}
$('logo-controls').addEventListener('submit', event => event.preventDefault());
$('logo-controls').addEventListener('input', event => {
  const input = event.target, key = input.dataset.setting || input.name;
  if (!Object.hasOwn(LOGO_DEFAULTS, key)) return;
  const value = input.type === 'checkbox' ? input.checked
    : typeof LOGO_DEFAULTS[key] === 'number' ? (input.value === '' ? NaN : Number(input.value)) : input.value;
  try {
    if (input.type === 'number' && !input.validity.valid) throw new Error('Invalid value.');
    readLogoSettings({ ...settings, [key]: value });
    input.removeAttribute('aria-invalid');
    update({ ...settings, [key]: value }, input);
  } catch { input.setAttribute('aria-invalid', 'true'); }
});
$('logo-controls').addEventListener('focusout', event => {
  if (event.target.dataset.setting) syncControls();
});
$('reset-logo').addEventListener('click', () => {
  update({ ...LOGO_DEFAULTS, background: settings.background, transparent: settings.transparent, exportScale: settings.exportScale });
  status('Sphere reset to the reference colors. Background and export preferences kept.');
});
$('reset-hatch').addEventListener('click', () => { update({ ...settings, ...HATCH_DEFAULTS }); status('Cross-hatch defaults restored.'); });
$('use-scene-hatch').addEventListener('click', () => {
  try {
    let saved;
    try { saved = readStateCookie(document); } catch { /* Try the local backup. */ }
    if (!saved) {
      const stored = localStorage.getItem(STATE_COOKIE);
      if (stored) saved = parseSceneState(stored);
    }
    if (!saved) { status('No saved credenza settings yet. Adjust its effect first, then return here.'); return; }
    update({ ...settings, ...saved.hatch, hatchEnabled: true });
    status('Applied the credenza’s saved Cross-hatch II settings.');
  } catch { status('Could not read the saved credenza settings.'); }
});

async function exportLogo(format) {
  if (!sphere || exporting || contextLost) return;
  exporting = true;
  // Snapshot all settings before asynchronous paper loading or image decoding.
  const snapshot = { ...settings };
  const controls = [...document.querySelectorAll('input, select, button')];
  const disabled = controls.map(input => input.disabled);
  controls.forEach(input => { input.disabled = true; });
  status(`Preparing ${format.toUpperCase()}…`);
  try {
    if (snapshot.hatchEnabled) await sphere.setPaper(snapshot.paper);
    if (contextLost) throw new Error('Reload to restore the graphics connection.');
    sphere.render(snapshot, snapshot.exportScale);
    const png = sphere.renderer.domElement.toDataURL('image/png');
    const svg = createLogoSVG(snapshot, png, snapshot.exportScale);
    const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      : await logoPNG(svg, LOGO_WIDTH * snapshot.exportScale, LOGO_HEIGHT * snapshot.exportScale);
    if (contextLost) throw new Error('Reload to restore the graphics connection.');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `big-feeling${snapshot.transparent ? '-transparent' : ''}.${format}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status(`${format.toUpperCase()} exported with the full wordmark.`);
  } catch (error) { status(`Export failed. ${error.message}`); }
  finally {
    exporting = false;
    controls.forEach((input, i) => { input.disabled = disabled[i]; });
    if (contextLost) $('export-svg').disabled = $('export-png').disabled = true;
    syncControls(); invalidate();
  }
}
$('export-svg').addEventListener('click', () => exportLogo('svg'));
$('export-png').addEventListener('click', () => exportLogo('png'));
syncControls();
try {
  sphere = new LogoSphere($('sphere-preview'));
  render(); loadPaper();
  $('export-svg').disabled = $('export-png').disabled = false;
  status('Ready. Settings save on this device.');
  $('sphere-preview').addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true;
    $('export-svg').disabled = $('export-png').disabled = true;
    status('The graphics connection was lost. Reload to restore the logo.');
  });
} catch (error) { status(`The sphere needs WebGL to render. ${error.message}`); }
