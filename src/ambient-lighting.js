import * as THREE from '../vendor/three.module.js';

const KEY_POSITION = Object.freeze([-1.5, 3.4, 3.3]);
const KEY_DISTANCE = Math.hypot(...KEY_POSITION);
const DEFAULT_TEMPERATURE = 3800;

export const AMBIENT_LIGHTING_DEFAULTS = Object.freeze({
  brightness: 1,
  temperature: DEFAULT_TEMPERATURE,
  ambientLevel: 1,
  shadowContrast: 1,
  shadowSoftness: 4,
  keyDirection: THREE.MathUtils.radToDeg(Math.atan2(KEY_POSITION[0], KEY_POSITION[2])),
  keyElevation: THREE.MathUtils.radToDeg(Math.atan2(KEY_POSITION[1], Math.hypot(KEY_POSITION[0], KEY_POSITION[2]))),
  fillBalance: 1,
});

const limits = Object.freeze({
  brightness: [0, 4],
  temperature: [1000, 12000],
  ambientLevel: [0, 3],
  shadowContrast: [0, 2],
  shadowSoftness: [0, 12],
  keyDirection: [-180, 180],
  keyElevation: [5, 85],
  fillBalance: [0, 3],
});

function normalize(input, fallback) {
  if (input === undefined) return { ...fallback };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Ambient lighting values must be an object.');
  }
  const result = { ...fallback };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (input[key] === undefined) continue;
    if (!Number.isFinite(input[key])) throw new TypeError(`Invalid ambient lighting value: ${key}.`);
    result[key] = THREE.MathUtils.clamp(input[key], min, max);
  }
  return result;
}

// Approximate a black-body color in display RGB. It is used as a tint over
// the scene's authored light colors, so the default temperature is exact.
function temperatureRgb(kelvin) {
  const temperature = kelvin / 100;
  let red, green, blue;
  if (temperature <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temperature) - 161.1195681661;
    blue = temperature <= 19 ? 0 : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * (temperature - 60) ** -.1332047592;
    green = 288.1221695283 * (temperature - 60) ** -.0755148492;
    blue = 255;
  }
  return [red, green, blue].map(value => THREE.MathUtils.clamp(value, 0, 255) / 255);
}

function temperatureTint(kelvin) {
  const color = new THREE.Color().setRGB(...temperatureRgb(kelvin), THREE.SRGBColorSpace);
  const base = new THREE.Color().setRGB(...temperatureRgb(DEFAULT_TEMPERATURE), THREE.SRGBColorSpace);
  return { r: color.r / base.r, g: color.g / base.g, b: color.b / base.b };
}

function tintedColor(base, kelvin) {
  const tint = temperatureTint(kelvin);
  return base.clone().multiply(tint);
}

function resolve(values, colors) {
  const contrast = 2 ** (values.shadowContrast - 1);
  const direction = THREE.MathUtils.degToRad(values.keyDirection);
  const elevation = THREE.MathUtils.degToRad(values.keyElevation);
  const horizontal = Math.cos(elevation) * KEY_DISTANCE;
  return {
    hemisphereIntensity: .65 * values.brightness * values.ambientLevel / contrast,
    keyIntensity: 1.15 * values.brightness * contrast,
    fillIntensity: .3 * values.brightness * values.fillBalance / contrast,
    skyColor: tintedColor(colors.sky, values.temperature),
    groundColor: tintedColor(colors.ground, values.temperature),
    keyColor: tintedColor(colors.key, values.temperature),
    fillColor: tintedColor(colors.fill, values.temperature),
    keyPosition: new THREE.Vector3(
      Math.sin(direction) * horizontal,
      Math.sin(elevation) * KEY_DISTANCE,
      Math.cos(direction) * horizontal,
    ),
    shadowSoftness: values.shadowSoftness,
  };
}

export function createAmbientLighting({ hemisphere, key, fill, invalidate = () => {} }) {
  if (!hemisphere || !key || !fill) throw new TypeError('Ambient lighting requires hemisphere, key, and fill lights.');
  const colors = {
    sky: hemisphere.color.clone(), ground: hemisphere.groundColor.clone(),
    key: key.color.clone(), fill: fill.color.clone(),
  };
  let current = { ...AMBIENT_LIGHTING_DEFAULTS };
  let target = { ...AMBIENT_LIGHTING_DEFAULTS };
  let mix = 0;

  function apply() {
    const from = resolve(current, colors), to = resolve(target, colors);
    hemisphere.intensity = THREE.MathUtils.lerp(from.hemisphereIntensity, to.hemisphereIntensity, mix);
    key.intensity = THREE.MathUtils.lerp(from.keyIntensity, to.keyIntensity, mix);
    fill.intensity = THREE.MathUtils.lerp(from.fillIntensity, to.fillIntensity, mix);
    hemisphere.color.copy(from.skyColor).lerp(to.skyColor, mix);
    hemisphere.groundColor.copy(from.groundColor).lerp(to.groundColor, mix);
    key.color.copy(from.keyColor).lerp(to.keyColor, mix);
    fill.color.copy(from.fillColor).lerp(to.fillColor, mix);
    key.position.copy(from.keyPosition).lerp(to.keyPosition, mix);
    key.shadow.radius = THREE.MathUtils.lerp(from.shadowSoftness, to.shadowSoftness, mix);
    invalidate();
  }

  function getState() {
    return { current: { ...current }, target: { ...target }, mix };
  }

  return {
    set(values = {}) {
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new TypeError('Ambient lighting configuration must be an object.');
      }
      if (values.current !== undefined) current = normalize(values.current, current);
      if (values.target !== undefined) target = normalize(values.target, target);
      if (values.mix !== undefined) {
        if (!Number.isFinite(values.mix)) throw new TypeError('Invalid ambient lighting mix.');
        mix = THREE.MathUtils.clamp(values.mix, 0, 1);
      }
      apply();
      return getState();
    },
    setMix(value) { return this.set({ mix: value }); },
    getState,
  };
}
