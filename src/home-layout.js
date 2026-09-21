const menu = document.querySelector('.home-menu');
const selector = document.getElementById('pad-stage');
const scene = document.querySelector('.home-feature .scene-stage');
const mobile = window.matchMedia('(max-width: 800px)');
const toggle = menu.querySelector('.home-menu-toggle');
const navigation = menu.querySelector('.home-nav');
const listeners = new AbortController();
const options = { signal: listeners.signal };
function setMenuOpen(open) {
  open = mobile.matches && open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  navigation.hidden = mobile.matches && !open;
}
toggle.addEventListener('click', () => setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true'), options);
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) setMenuOpen(false);
}, options);
document.addEventListener('pointerdown', event => {
  if (!navigation.contains(event.target) && !toggle.contains(event.target)) setMenuOpen(false);
}, options);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
    setMenuOpen(false);
    toggle.focus();
  }
}, options);
mobile.addEventListener('change', () => { setMenuOpen(false); schedule(); }, options);
setMenuOpen(false);
let cropWidth = 0;
let frame = 0;

function updateDivider() {
  frame = 0;
  const ring = selector.querySelector('.pad-intensity-ring');
  if (!ring || !cropWidth) return;
  const menuRect = menu.getBoundingClientRect();
  const selectorRect = selector.getBoundingClientRect();
  const ringRect = ring.getBoundingClientRect();
  if (!mobile.matches) {
    document.documentElement.style.setProperty('--home-ring-right', `${ringRect.right}px`);
  }
  const radius = ringRect.width / 2;
  const gap = Math.max(0, radius - selectorRect.width * cropWidth / 2);
  // Keep the fixed sidebar aligned with the image's initial document position.
  const top = scene.getBoundingClientRect().top + window.scrollY - menu.offsetTop;
  const previousEnd = ringRect.top - menuRect.top - gap * 2;
  const dx = menuRect.right - (ringRect.left + radius);
  const ringAtBorder = ringRect.top + radius
    - Math.sqrt(Math.max(0, radius * radius - dx * dx)) - menuRect.top;
  const end = previousEnd + (ringAtBorder - previousEnd) * 2 / 3 - 5;
  menu.style.setProperty('--home-divider-top', `${top}px`);
  menu.style.setProperty('--home-divider-height', `${Math.max(0, end - top)}px`);
  if (mobile.matches) {
    const rule = menu.querySelector('.home-mobile-rule-left');
    const ruleY = rule.getBoundingClientRect().top + .5;
    const dy = ruleY - (ringRect.top + radius);
    // Expand the circular opening by the sphere-to-ring gap, plus the same
    // five-pixel breathing room used by the desktop divider.
    const clearanceRadius = radius + gap + 5;
    const halfOpening = Math.sqrt(Math.max(0, clearanceRadius ** 2 - dy ** 2));
    const center = ringRect.left + radius;
    const inset = parseFloat(getComputedStyle(menu).getPropertyValue('--home-menu-padding'));
    menu.style.setProperty('--home-rule-left-width', `${Math.max(0, center - halfOpening - menuRect.left - inset)}px`);
    menu.style.setProperty('--home-rule-right-width', `${Math.max(0, menuRect.right - inset - center - halfOpening)}px`);
  }
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(updateDivider);
}
const observer = new ResizeObserver(schedule);
for (const element of [menu, selector, scene]) observer.observe(element);
selector.addEventListener('pad-color-frame', event => {
  cropWidth = event.detail.crop[2];
  const ring = selector.querySelector('.pad-intensity-ring');
  if (ring) observer.observe(ring);
  schedule();
}, { once: true });
document.fonts.ready.then(schedule);
window.addEventListener('pageshow', schedule);
window.addEventListener('pagehide', event => {
  if (!event.persisted) {
    listeners.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener('pageshow', schedule);
  }
});
