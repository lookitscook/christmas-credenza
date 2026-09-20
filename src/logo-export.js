import { LOGO_WIDTH, LOGO_HEIGHT, readLogoSettings } from './logo-settings.js';
import { WORDMARK } from './logo-wordmark.js';

export function createLogoSVG(input, spherePNG, scale = 1) {
  const settings = readLogoSettings(input);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(spherePNG)) throw new Error('Invalid sphere image.');
  if (![1, 2, 3].includes(scale)) throw new Error('Invalid export size.');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${LOGO_WIDTH * scale}" height="${LOGO_HEIGHT * scale}" viewBox="0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}" role="img" aria-labelledby="logo-title">
<title id="logo-title">Big Feeling</title>
<desc>Fixed Literata wordmark. The sphere embeds the shared Cross-hatch II renderer output.</desc>
${settings.transparent ? '' : `<rect width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" fill="${settings.background}"/>`}
<image id="logo-sphere" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" xlink:href="${spherePNG}"/>
${WORDMARK}
</svg>`;
}

export async function logoPNG(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create the export canvas.');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob)
      : reject(new Error('PNG export failed.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
