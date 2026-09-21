import { HOME_DEBUG_ENABLED } from './home-debug-state.js';
import { HATCH_SLIDERS } from './cross-hatch.js';
import { LogoSphere } from './logo-sphere.js';
import { LOGO_DEFAULTS, readLogoSettings } from './logo-settings.js';
import { WORDMARK } from './logo-wordmark.js';
import { LOGO_STORAGE_KEY, readPageBackground, applyPageBackground } from './page-background.js';

document.getElementById('home-wordmark').innerHTML = WORDMARK;
applyPageBackground(readPageBackground());
try {
  const sphere = new LogoSphere(document.getElementById('home-logo-sphere'));
  const selector = document.getElementById('pad-stage');
  const listeners = new AbortController();
  let settings, debugControls;
  function loadSettings() {
    settings = LOGO_DEFAULTS;
    try { settings = readLogoSettings(JSON.parse(localStorage.getItem(LOGO_STORAGE_KEY)) ?? {}); }
    catch { /* Unavailable or older settings fall back to the shared defaults. */ }
  }
  function syncLogo(event) {
    try {
      sphere.setColorSource(event.detail.canvas, event.detail.crop);
      sphere.render(settings, .35);
    } catch (error) {
      // A logo graphics failure must not interrupt the sphere selector.
      listeners.abort();
      sphere.dispose();
      console.error(error);
    }
  }
  function refreshLogo() { loadSettings(); debugControls?.sync(settings); selector.requestPadColorFrame?.(); }
  selector.addEventListener('pad-color-frame', syncLogo, { signal: listeners.signal });
  refreshLogo();
  if (HOME_DEBUG_ENABLED) {
    import('./home-debug-controls.js').then(({ createHomeDebugControls }) => {
      if (listeners.signal.aborted) return;
      debugControls = createHomeDebugControls({
        name: 'logo', title: 'Logo crosshatch', signal: listeners.signal, values: settings,
        controls: [
          { key: 'hatchEnabled', label: 'Crosshatch enabled', type: 'checkbox' },
          ...HATCH_SLIDERS,
          { key: 'softness', label: 'Edge softness', min: 0, max: 50, step: 1 },
        ],
        onChange(key, value) {
          settings = readLogoSettings({ ...settings, [key]: value });
          selector.requestPadColorFrame?.();
          try { localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(settings)); return true; }
          catch { return false; }
        },
      });
    }).catch(console.error);
  }
  window.addEventListener('storage', event => {
    if (event.key === LOGO_STORAGE_KEY || event.key === null) refreshLogo();
  }, { signal: listeners.signal });
  window.addEventListener('pageshow', refreshLogo, { signal: listeners.signal });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { listeners.abort(); sphere.dispose(); }
  }, { signal: listeners.signal });
} catch (error) {
  // Keep the outlined wordmark and navigation usable without WebGL.
  console.error(error);
}
