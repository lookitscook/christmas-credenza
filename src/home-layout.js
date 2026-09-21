const menu = document.querySelector('.home-menu');
const selector = document.getElementById('pad-stage');
const scene = document.querySelector('.home-feature .scene-stage');
let cropWidth = 0;
let frame = 0;

function updateDivider() {
  frame = 0;
  const ring = selector.querySelector('.pad-intensity-ring');
  if (!ring || !cropWidth) return;
  const menuRect = menu.getBoundingClientRect();
  const selectorRect = selector.getBoundingClientRect();
  const ringRect = ring.getBoundingClientRect();
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
    observer.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener('pageshow', schedule);
  }
});
