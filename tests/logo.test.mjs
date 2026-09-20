import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { LOGO_HATCH_DEFAULTS, HATCH_SLIDERS } from '../src/cross-hatch.js';
import { LOGO_DEFAULTS, SPHERE_CONTROLS, readLogoSettings, LOGO_WIDTH, LOGO_HEIGHT } from '../src/logo-settings.js';
import { LogoSphere } from '../src/logo-sphere.js';
import { createLogoSVG } from '../src/logo-export.js';
import { WORDMARK } from '../src/logo-wordmark.js';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';

test('a live color source retains raw display RGB and crop, reuses its texture, and reallocates after resize', () => {
  const sphere = Object.create(LogoSphere.prototype);
  sphere.uniforms = { useColorSource: { value: false }, colorSource: { value: null },
    sourceCrop: { value: new THREE.Vector4() } };
  const canvas = { width: 552, height: 552 };
  const crop = [.12, .12, .76, .76];
  sphere.setColorSource(canvas, crop);
  const texture = sphere.sourceTexture;
  assert.equal(texture.image, canvas);
  assert.equal(texture.colorSpace, THREE.NoColorSpace);
  assert.equal(texture.flipY, true);
  assert.equal(texture.generateMipmaps, false);
  assert.equal(texture.minFilter, THREE.LinearFilter);
  assert.equal(sphere.uniforms.useColorSource.value, true);
  assert.deepEqual(sphere.uniforms.sourceCrop.value.toArray(), crop);
  const version = texture.version;
  sphere.setColorSource(canvas, crop);
  assert.equal(sphere.sourceTexture, texture);
  assert.ok(texture.version > version);
  let disposed = false;
  texture.addEventListener('dispose', () => { disposed = true; });
  canvas.width = 716;
  sphere.setColorSource(canvas, [.1, .2, .8, .6]);
  assert.ok(disposed);
  assert.notEqual(sphere.sourceTexture, texture);
  let replacementDisposed = false;
  sphere.sourceTexture.addEventListener('dispose', () => { replacementDisposed = true; });
  sphere.setColorSource(null);
  assert.ok(replacementDisposed);
  assert.equal(sphere.uniforms.useColorSource.value, false);
  assert.equal(sphere.uniforms.colorSource.value, null);
});

test('logo uses its captured hatch defaults and safely restores partial settings', () => {
  const settings = readLogoSettings({ color1: '#ABCDEF', thickness: 999, scale: -1, injected: '<script>' });
  for (const [key, value] of Object.entries(LOGO_HATCH_DEFAULTS)) assert.equal(LOGO_DEFAULTS[key], value);
  for (const { key } of HATCH_SLIDERS) assert.equal(typeof settings[key], 'number');
  assert.equal(settings.color1, '#abcdef');
  assert.equal(settings.thickness, 3);
  assert.equal(settings.scale, .1);
  assert.equal(settings.injected, undefined);
  assert.deepEqual(readLogoSettings(JSON.parse(JSON.stringify(LOGO_DEFAULTS))), LOGO_DEFAULTS);
  for (const bad of [null, [], { color1: '<script>' }, { scale: NaN },
    { hatchEnabled: 'true' }, { exportScale: 100 }]) assert.throws(() => readLogoSettings(bad));
});

test('retired logo controls keep their defaults when restoring older settings', () => {
  for (const input of [0, 45, 175, -5, 250, NaN, Infinity, null, 'obsolete']) {
    const settings = readLogoSettings({ saturation: input, grain: input, inkColor: input, black: input, color1: '#123456' });
    assert.equal(settings.saturation, 100);
    assert.equal(settings.grain, 0);
    assert.equal(settings.black, 0);
    assert.equal(settings.inkColor, '#000000');
    assert.equal(settings.color1, '#123456');
    assert.deepEqual(readLogoSettings(JSON.parse(JSON.stringify(settings))), settings);
  }
});

test('preview and export use fixed saturation and grain even with legacy settings', () => {
  const sphere = Object.create(LogoSphere.prototype);
  sphere.uniforms = Object.fromEntries(SPHERE_CONTROLS.map(({ key }) => [key, { value: 0 }]));
  for (const key of ['saturation', 'grain']) sphere.uniforms[key] = { value: 0 };
  for (const key of ['color1', 'color2', 'color3']) sphere.uniforms[key] = { value: new THREE.Color() };
  let rendered, sourceSaturation, dimensions;
  function capture(mode) { rendered = mode; sourceSaturation = sphere.uniforms.saturation.value; }
  sphere.renderer = {
    setSize(width, height) { dimensions = [width, height]; },
    render() { capture('smooth'); },
  };
  sphere.effect = {
    setSize() {}, setParameter() {},
    render() { capture('hatch'); },
  };
  for (const saturation of [0, 100, 175]) {
    for (const hatchEnabled of [false, true]) {
      for (const scale of [1, 3]) {
        sphere.render({ saturation, grain: 25, hatchEnabled }, scale);
        assert.equal(rendered, hatchEnabled ? 'hatch' : 'smooth');
        assert.equal(sourceSaturation, 1);
        assert.equal(sphere.uniforms.grain.value, hatchEnabled ? 0 : .08);
        assert.deepEqual(dimensions, [LOGO_WIDTH * scale, LOGO_HEIGHT * scale]);
      }
    }
  }
});

test('restored logo settings always use full CMY weights and preserve other controls', () => {
  for (const saved of [
    { cyan: 0, magenta: .25, yellow: .75 },
    { cyan: null, magenta: 'obsolete', yellow: -5 },
    {},
  ]) {
    const settings = readLogoSettings({ ...saved, black: .35, scale: 1.2 });
    assert.equal(settings.cyan, 1);
    assert.equal(settings.magenta, 1);
    assert.equal(settings.yellow, 1);
    assert.equal(settings.black, 0);
    assert.equal(settings.scale, 1.2);
  }
});

test('copying Christmas hatch settings does not add a viewport fade to the logo', () => {
  const settings = readLogoSettings({ ...LOGO_DEFAULTS, edgeFade: .5, thickness: 2 });
  assert.equal(settings.thickness, 2);
  assert.equal(Object.hasOwn(settings, 'edgeFade'), false);
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
