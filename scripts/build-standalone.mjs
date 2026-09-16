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
const areaLight = (await read('vendor/lights/RectAreaLightUniformsLib.js')).replace("'../three.module.js'", "'three'");
const crtShader = await read('src/crt-shader.js');
const crtControls = (await read('src/crt-controls.js')).replace("'./crt-shader.js'", "'crt-shader'");
const panels = await read('src/effect-panels.js');
const cameraControls = (await read('src/camera-controls.js')).replace("'../vendor/three.module.js'", "'three'");
const sceneState = (await read('src/scene-state.js'))
  .replace("'./crt-shader.js'", "'crt-shader'")
  .replace("'./cross-hatch.js'", "'cross-hatch'");
const crt = (await read('src/crt-screen.js'))
  .replace("'../vendor/three.module.js'", "'three'")
  .replace("'../vendor/lights/RectAreaLightUniformsLib.js'", "'rect-area-light'")
  .replace("'./crt-shader.js'", "'crt-shader'");
const tv = (await read('src/tv-video.js'))
  .replace("'../vendor/three.module.js'", "'three'")
  .replace("'./crt-screen.js'", "'crt-screen'")
  .replace("'./crt-controls.js'", "'crt-controls'");
let scene = (await read('src/scene.js'))
  .replace("'../vendor/three.module.js'", "'three'")
  .replace("'./post-processing.js'", "'post-processing'")
  .replace("'./tv-video.js'", "'tv-video'")
  .replace("'./effect-panels.js'", "'effect-panels'")
  .replace("'./camera-controls.js'", "'camera-controls'")
  .replace("'./scene-state.js'", "'scene-state'");
for (const match of [...scene.matchAll(/new URL\('([^']+\.(mp4|webm|ogv))', import\.meta\.url\)\.href/g)]) {
  const bytes = await readFile(new URL(match[1], new URL('src/', root)));
  const mime = { mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg' }[match[2]];
  scene = scene.replace(match[0], JSON.stringify(`data:${mime};base64,${bytes.toString('base64')}`));
}
const importMap = JSON.stringify({ imports: {
  three: moduleURL(three),
  'cross-hatch': moduleURL(hatch),
  'post-processing': moduleURL(post),
  'tv-video': moduleURL(tv),
  'crt-screen': moduleURL(crt),
  'rect-area-light': moduleURL(areaLight),
  'crt-shader': moduleURL(crtShader),
  'crt-controls': moduleURL(crtControls),
  'effect-panels': moduleURL(panels),
  'camera-controls': moduleURL(cameraControls),
  'scene-state': moduleURL(sceneState),
} });
let html = await read('index.html');
for (const path of ['vendor/app-block-sandbox.css', 'src/styles.css']) {
  html = html.replace(`<link rel="stylesheet" href="./${path}">`, `<style>\n${await read(path)}\n</style>`);
}
html = html.replace('<script type="module" src="./src/scene.js"></script>',
  `<script type="importmap">${importMap}</script>\n<script type="module">\n${scene}\n</script>`);
const licenses = await Promise.all([
  'vendor/THREE-LICENSE.txt', 'vendor/TAILWIND-LICENSE.txt', 'vendor/cross-hatch/LICENSE.txt', 'vendor/crt/LICENSE.txt',
].map(read));
html = html.replace('</head>', `<!-- Third-party licenses\n${licenses.join('\n\n')}\n-->\n</head>`);
await writeFile(new URL('standalone.html', root), html);
console.log(`Built standalone.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB, all assets embedded).`);
