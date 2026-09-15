import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const three = await read('vendor/three.module.js');
let hatch = (await read('src/cross-hatch.js')).replace("'../vendor/three.module.js'", "'three'");
// Inline the exact paper files so the single-file edition also works offline.
for (const match of [...hatch.matchAll(/new URL\('([^']+\.jpg)', import\.meta\.url\)\.href/g)]) {
  const bytes = await readFile(new URL(match[1], new URL('src/', root)));
  hatch = hatch.replace(match[0], JSON.stringify(`data:image/jpeg;base64,${bytes.toString('base64')}`));
}
const post = (await read('src/post-processing.js')).replace("'./cross-hatch.js'", "'cross-hatch'");
const scene = (await read('src/scene.js'))
  .replace("'../vendor/three.module.js'", "'three'")
  .replace("'./post-processing.js'", "'post-processing'");
const importMap = JSON.stringify({ imports: {
  three: moduleURL(three),
  'cross-hatch': moduleURL(hatch),
  'post-processing': moduleURL(post),
} });
let html = await read('index.html');
for (const path of ['vendor/app-block-sandbox.css', 'src/styles.css']) {
  html = html.replace(`<link rel="stylesheet" href="./${path}">`, `<style>\n${await read(path)}\n</style>`);
}
html = html.replace('<script type="module" src="./src/scene.js"></script>',
  `<script type="importmap">${importMap}</script>\n<script type="module">\n${scene}\n</script>`);
const licenses = await Promise.all([
  'vendor/THREE-LICENSE.txt', 'vendor/TAILWIND-LICENSE.txt', 'vendor/cross-hatch/LICENSE.txt',
].map(read));
html = html.replace('</head>', `<!-- Third-party licenses\n${licenses.join('\n\n')}\n-->\n</head>`);
await writeFile(new URL('standalone.html', root), html);
console.log(`Built standalone.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB, all assets embedded).`);
