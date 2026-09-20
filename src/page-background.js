export const DEFAULT_PAGE_BACKGROUND = '#f3f0e6';
export const LOGO_STORAGE_KEY = 'christmas-credenza-logo-v1';

export function readPageBackground(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(LOGO_STORAGE_KEY) ?? 'null');
    if (/^#[\da-f]{6}$/i.test(saved?.background)) return saved.background.toLowerCase();
  } catch { /* Use the logo's default when storage is unavailable or invalid. */ }
  return DEFAULT_PAGE_BACKGROUND;
}

export function pageForeground(background) {
  const rgb = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .179 ? '#062627' : '#ffffff';
}

export function applyPageBackground(background, root = document.documentElement) {
  const foreground = pageForeground(background);
  root.style.setProperty('--page-background', background);
  root.style.setProperty('--page-foreground', foreground);
  root.style.colorScheme = foreground === '#ffffff' ? 'dark' : 'light';
  return background;
}
