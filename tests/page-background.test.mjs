import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGE_BACKGROUND, LOGO_STORAGE_KEY, readPageBackground, applyPageBackground } from '../src/page-background.js';
import { LOGO_DEFAULTS, readLogoSettings } from '../src/logo-settings.js';

test('both editors use the saved logo color with a safe fallback for unavailable storage', () => {
  assert.equal(DEFAULT_PAGE_BACKGROUND, LOGO_DEFAULTS.background);
  assert.equal(readPageBackground({ getItem(key) {
    assert.equal(key, LOGO_STORAGE_KEY);
    return '{"background":"#AABBCC","paper":"Parchment"}';
  } }), '#aabbcc');
  for (const value of [null, '{}', '{broken', '{"background":"url(image.jpg)"}']) {
    assert.equal(readPageBackground({ getItem: () => value }), DEFAULT_PAGE_BACKGROUND);
  }
  assert.equal(readPageBackground({ getItem() { throw new Error('Blocked'); } }), DEFAULT_PAGE_BACKGROUND);
});

test('page colors stay synchronized and controls switch contrast for dark backgrounds', () => {
  const properties = new Map();
  const root = { style: { setProperty: (key, value) => properties.set(key, value) } };
  applyPageBackground(DEFAULT_PAGE_BACKGROUND, root);
  assert.equal(properties.get('--page-background'), DEFAULT_PAGE_BACKGROUND);
  assert.equal(properties.get('--page-foreground'), '#062627');
  assert.equal(root.style.colorScheme, 'light');
  applyPageBackground('#000000', root);
  assert.equal(properties.get('--page-background'), '#000000');
  assert.equal(properties.get('--page-foreground'), '#ffffff');
  assert.equal(root.style.colorScheme, 'dark');
});

test('legacy logo paper settings are ignored without losing colors or transparency', () => {
  const expected = { ...LOGO_DEFAULTS, background: '#aabbcc', transparent: true, thickness: 2 };
  assert.deepEqual(readLogoSettings({ ...expected, paper: 'Craft rough' }), expected);
});
