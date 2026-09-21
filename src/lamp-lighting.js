export function createLampLighting({ point, wash, coverMaterial, bulbMaterial, invalidate = () => {} }) {
  if (!point || !wash || !coverMaterial || !bulbMaterial) {
    throw new TypeError('Lamp lighting requires point, wash, cover, and bulb sources.');
  }
  const defaults = {
    point: point.intensity,
    wash: wash.intensity,
    cover: coverMaterial.emissiveIntensity,
    bulb: bulbMaterial.color.clone(),
  };
  let brightness = 1;

  function set(value) {
    if (!Number.isFinite(value)) throw new TypeError('Lamp brightness must be a finite number.');
    brightness = Math.max(0, Math.min(1, value));
    point.intensity = defaults.point * brightness;
    wash.intensity = defaults.wash * brightness;
    coverMaterial.emissiveIntensity = defaults.cover * brightness;
    bulbMaterial.color.copy(defaults.bulb).multiplyScalar(brightness);
    invalidate();
    return brightness;
  }

  return { set, get: () => brightness };
}
