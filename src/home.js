import { LogoSphere } from './logo-sphere.js';
import { LOGO_DEFAULTS, readLogoSettings } from './logo-settings.js';
import { WORDMARK } from './logo-wordmark.js';
import { LOGO_STORAGE_KEY, readPageBackground, applyPageBackground } from './page-background.js';

document.getElementById('home-wordmark').innerHTML = WORDMARK;
applyPageBackground(readPageBackground());
try {
  const sphere = new LogoSphere(document.getElementById('home-logo-sphere'));
  function renderLogo() {
    let settings = LOGO_DEFAULTS;
    try { settings = readLogoSettings(JSON.parse(localStorage.getItem(LOGO_STORAGE_KEY)) ?? {}); }
    catch { /* Unavailable or older settings fall back to the shared defaults. */ }
    sphere.render(settings, .35);
  }
  renderLogo();
  window.addEventListener('storage', event => {
    if (event.key === LOGO_STORAGE_KEY || event.key === null) renderLogo();
  });
  window.addEventListener('pageshow', renderLogo);
} catch (error) {
  // Keep the outlined wordmark and navigation usable without WebGL.
  console.error(error);
}
