import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { CrossHatchEffect } from '../src/cross-hatch.js';
import { LogoSphere } from '../src/logo-sphere.js';
import { HATCH_DEFAULTS, HATCH_SLIDERS } from '../src/cross-hatch.js';
import { LOGO_DEFAULTS, readLogoSettings, LOGO_WIDTH, LOGO_HEIGHT } from '../src/logo-settings.js';
import { createLogoSVG } from '../src/logo-export.js';
import { WORDMARK } from '../src/logo-wordmark.js';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';

test('logo shares the complete credenza defaults and safely restores partial settings', () => {
  const settings = readLogoSettings({ color1: '#ABCDEF', thickness: 999, scale: -1, injected: '<script>' });
  for (const [key, value] of Object.entries(HATCH_DEFAULTS)) assert.equal(LOGO_DEFAULTS[key], value);
  for (const { key } of HATCH_SLIDERS) assert.equal(typeof settings[key], 'number');
  assert.equal(settings.color1, '#abcdef');
  assert.equal(settings.thickness, 3);
  assert.equal(settings.scale, .1);
  assert.equal(settings.injected, undefined);
  assert.deepEqual(readLogoSettings(JSON.parse(JSON.stringify(LOGO_DEFAULTS))), LOGO_DEFAULTS);
  for (const bad of [null, [], { color1: '<script>' }, { paper: '__proto__' }, { scale: NaN },
    { hatchEnabled: 'true' }, { exportScale: 100 }]) assert.throws(() => readLogoSettings(bad));
});

test('transparent SVG has no backdrop, retains sphere alpha and fixed vector lettering', () => {
  const svg = createLogoSVG({ transparent: true, hatchEnabled: true }, pixel, 3);
  assert.ok(svg.includes(`width="${LOGO_WIDTH * 3}" height="${LOGO_HEIGHT * 3}"`));
  assert.ok(svg.includes(`viewBox="0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}"`));
  assert.ok(svg.includes(`xlink:href="${pixel}"`));
  assert.ok(svg.includes(WORDMARK));
  assert.equal((WORDMARK.match(/<path /g) || []).length, 10);
  assert.doesNotMatch(svg, /<rect|<text|<filter|<mask|<pattern|https?:\/\/(?!www\.w3\.org)/);
  assert.ok(svg.indexOf('id="logo-sphere"') < svg.indexOf('id="logo-lettering"'));
  assert.equal(createLogoSVG({ transparent: true, color1: '#112233', scale: 2 }, pixel).includes(WORDMARK), true);
});

test('opaque export uses the chosen backdrop and rejects nonembedded image sources', () => {
  const svg = createLogoSVG({ background: '#aabbcc' }, pixel);
  assert.match(svg, /<rect[^>]+fill="#aabbcc"/);
  for (const image of ['https://example.com/a.png', 'data:image/svg+xml,<svg/>', '" onload="alert(1)']) {
    assert.throws(() => createLogoSVG({}, image));
  }
  assert.throws(() => createLogoSVG({}, pixel, 20));
});

test('returning to the current paper supersedes pending selections and deduplicates identical loads', async t => {
  const pending = [];
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', () => new Promise(resolve => pending.push(resolve)));
  const sphere = Object.create(LogoSphere.prototype);
  Object.assign(sphere, { paper: 'Parchment', paperPromise: null, paperRevision: 0 });
  sphere.effect = new CrossHatchEffect({ capabilities: { isWebGL2: true }, extensions: { has: () => true }, toneMappingExposure: 1 });
  const obsolete = sphere.setPaper('Craft rough');
  const latest = sphere.setPaper('Parchment');
  const duplicate = sphere.setPaper('Parchment');
  assert.equal(pending.length, 2);
  const oldTexture = new THREE.Texture(), newTexture = new THREE.Texture();
  let oldDisposed = false;
  oldTexture.addEventListener('dispose', () => { oldDisposed = true; });
  pending[1](newTexture); await latest; await duplicate;
  pending[0](oldTexture); await obsolete;
  assert.equal(sphere.paper, 'Parchment');
  assert.equal(sphere.effect.uniforms.paperTexture.value, newTexture);
  assert.equal(oldDisposed, true);
  sphere.effect.dispose();
});
