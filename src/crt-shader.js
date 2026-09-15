// Adapted from Serenity Shader by Matt Sephton (@gingerbeardman), MIT.
// See vendor/crt/ for the original shader, license, and adaptation notes.
export const CRT_DEFAULTS = Object.freeze({
  scanlineIntensity: .15, scanlineCount: 144, adaptiveIntensity: .5, yOffset: 0,
  brightness: 1.1, contrast: 1.05, saturation: 1.1, rgbShift: 0,
  vignetteStrength: .5, curvature: .06, flickerStrength: .01,
  bloomIntensity: .42, bloomThreshold: 0,
});

export const CRT_CONTROLS = [
  { group: 'Scanlines', key: 'scanlineIntensity', label: 'Scanline strength', min: 0, max: 1, step: .01, percent: true },
  { group: 'Scanlines', key: 'scanlineCount', label: 'Scanline count', min: 50, max: 1200, step: 1 },
  { group: 'Scanlines', key: 'adaptiveIntensity', label: 'Adaptive strength', min: 0, max: 1, step: .01, percent: true },
  { group: 'Scanlines', key: 'yOffset', label: 'Scanline offset', min: 0, max: 1, step: .001 },
  { group: 'Color', key: 'brightness', label: 'Brightness', min: .6, max: 1.8, step: .01 },
  { group: 'Color', key: 'contrast', label: 'Contrast', min: .6, max: 1.8, step: .01 },
  { group: 'Color', key: 'saturation', label: 'Saturation', min: 0, max: 2, step: .01 },
  { group: 'Color', key: 'rgbShift', label: 'RGB shift', min: 0, max: 1, step: .01 },
  { group: 'Screen', key: 'vignetteStrength', label: 'TV vignette', min: 0, max: 1, step: .01, percent: true },
  { group: 'Screen', key: 'curvature', label: 'Curvature', min: 0, max: .5, step: .005 },
  { group: 'Screen', key: 'flickerStrength', label: 'Flicker', min: 0, max: .15, step: .001, percent: true },
  { group: 'Edge bloom', key: 'bloomIntensity', label: 'Bloom strength', min: 0, max: 1.5, step: .01 },
  { group: 'Edge bloom', key: 'bloomThreshold', label: 'Bloom threshold', min: 0, max: 1, step: .01 },
];

export const crtUniformName = key => `crt${key[0].toUpperCase()}${key.slice(1)}`;

export function createCRTUniforms(sourceTransform) {
  return {
    ...Object.fromEntries(Object.entries(CRT_DEFAULTS).map(([key, value]) => [crtUniformName(key), { value }])),
    crtEnabled: { value: true },
    crtTime: { value: 0 },
    crtSourceTransform: { value: sourceTransform },
  };
}

export const crtFragment = /* glsl */ `
  uniform bool crtEnabled;
  uniform float crtTime;
  uniform mat3 crtSourceTransform;
  ${CRT_CONTROLS.map(({ key }) => `uniform float ${crtUniformName(key)};`).join('\n  ')}

  const float CRT_PI = 3.14159265;
  const vec3 CRT_LUMA = vec3(0.299, 0.587, 0.114);

  vec3 crtToDisplay(vec3 color) {
    return mix(1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
      color * 12.92, vec3(lessThanEqual(color, vec3(0.0031308))));
  }
  vec3 crtToLinear(vec3 color) {
    color = clamp(color, 0.0, 1.0);
    return mix(pow((color + 0.055) / 1.055, vec3(2.4)),
      color / 12.92, vec3(lessThanEqual(color, vec3(0.04045))));
  }
  vec3 crtSample(vec2 uv) {
    // Warp screen coordinates first, then cover-crop the 256 px source texture.
    vec2 sourceUV = (crtSourceTransform * vec3(uv, 1.0)).xy;
    return texture2D(emissiveMap, sourceUV).rgb;
  }
  vec3 crtPicture(vec2 uv) {
    if (!crtEnabled) return crtSample(uv);
    if (crtCurvature > 0.001) {
      vec2 coords = uv * 2.0 - 1.0;
      coords *= 1.0 + dot(coords, coords) * crtCurvature * 0.25;
      uv = coords * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
    }

    // The reference operates in display RGB; return linear RGB for the glass's
    // physical lighting, reflections, and the scene's existing tone mapping.
    vec3 pixel = crtToDisplay(crtSample(uv));
    if (crtRgbShift > 0.005) {
      float shift = crtRgbShift * 0.005;
      pixel.r += crtToDisplay(crtSample(uv + vec2(shift, 0.0))).r * 0.08;
      pixel.b += crtToDisplay(crtSample(uv - vec2(shift, 0.0))).b * 0.08;
    }
    pixel *= crtBrightness;
    float luminance = dot(pixel, CRT_LUMA);
    pixel = (pixel - 0.5) * crtContrast + 0.5;
    pixel = mix(vec3(luminance), pixel, crtSaturation);

    float lightingMask = 1.0;
    if (crtScanlineIntensity > 0.001) {
      float line = (uv.y + crtYOffset) * crtScanlineCount;
      float pattern = abs(sin(line * CRT_PI));
      // Blend subpixel lines into their average to avoid moire as the TV recedes.
      pattern = mix(pattern, 2.0 / CRT_PI, smoothstep(0.4, 1.0, fwidth(line)));
      float adaptive = 1.0 - (sin(uv.y * 30.0) * 0.5 + 0.5) * crtAdaptiveIntensity * 0.2;
      lightingMask *= 1.0 - pattern * crtScanlineIntensity * adaptive;
    }
    lightingMask *= 1.0 + sin(crtTime * 110.0) * crtFlickerStrength;
    // Retain the existing adjustable vignette without stacking a second mask.
    vec2 edge = (uv - 0.5) * 2.0;
    float vignette = 1.0 - 0.97 * crtVignetteStrength * smoothstep(0.10, 1.0, dot(edge, edge));
    return crtToLinear(pixel * lightingMask) * vignette;
  }
`;
