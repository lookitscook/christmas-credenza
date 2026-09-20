import * as THREE from '../vendor/three.module.js';
import { DEFAULT_PAGE_BACKGROUND } from './page-background.js';

// Adapted from spite/sketch/post-cross-hatch-ii (MIT).
// Source and license: ../vendor/cross-hatch/README.md and LICENSE.txt.
export const HATCH_FIXED_CMY = Object.freeze({ cyan: 1, magenta: 1, yellow: 1 });
export const HATCH_FIXED_PARAMETERS = Object.freeze({ ...HATCH_FIXED_CMY, black: 0, inkColor: '#000000' });
export const HATCH_DEFAULTS = Object.freeze({
  scale: 1.5,
  thickness: 1,
  contour: 0.5,
  ...HATCH_FIXED_PARAMETERS,
});

export const HATCH_SLIDERS = Object.freeze([
  { key: 'scale', label: 'Scale', min: 0.1, max: 2 },
  { key: 'thickness', label: 'Thickness', min: 0, max: 3 },
  { key: 'contour', label: 'Contour', min: 0, max: 10 },
]);

// The logo uses its sphere's own soft edge instead of a viewport fade.
export const LOGO_HATCH_DEFAULTS = Object.freeze({ ...HATCH_DEFAULTS, scale: .25, thickness: 1.5, contour: 1.5 });
export const SCENE_HATCH_DEFAULTS = Object.freeze({ ...HATCH_DEFAULTS, edgeFade: 0.02 });
export const SCENE_HATCH_SLIDERS = Object.freeze([
  ...HATCH_SLIDERS,
  { key: 'edgeFade', label: 'Edge fade', min: 0, max: 0.5, percent: true },
]);

const vertexShader = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D colorTexture;
  uniform sampler2D normalTexture;
  uniform vec3 backgroundColor;
  uniform vec2 resolution;
  uniform vec3 inkColor;
  uniform float scale;
  uniform float thickness;
  uniform float contour;
  uniform float black;
  uniform float edgeFade;
  uniform vec4 circleCutout;
  uniform vec4 cutoutBox;
  uniform float cutoutBoxPadding;
  uniform bool transparentBackground;
  uniform bool displayColorInput;
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  vec3 contourNormal(vec2 uv, vec3 centerNormal) {
    vec4 sampleNormal = texture2D(normalTexture, uv);
    // Masked objects must not introduce silhouettes in nearby contour pixels.
    return mix(centerNormal, sampleNormal.rgb, sampleNormal.a);
  }

  vec3 sobel(vec2 uv, vec2 offset, vec3 centerNormal) {
    vec3 tl = contourNormal(uv + vec2(-offset.x, -offset.y), centerNormal);
    vec3 tc = contourNormal(uv + vec2(0.0, -offset.y), centerNormal);
    vec3 tr = contourNormal(uv + vec2(offset.x, -offset.y), centerNormal);
    vec3 ml = contourNormal(uv + vec2(-offset.x, 0.0), centerNormal);
    vec3 mr = contourNormal(uv + vec2(offset.x, 0.0), centerNormal);
    vec3 bl = contourNormal(uv + vec2(-offset.x, offset.y), centerNormal);
    vec3 bc = contourNormal(uv + vec2(0.0, offset.y), centerNormal);
    vec3 br = contourNormal(uv + vec2(offset.x, offset.y), centerNormal);
    vec3 horizontal = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    vec3 vertical = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    return sqrt(horizontal * horizontal + vertical * vertical);
  }

  vec2 rotateUV(vec2 uv, float degrees) {
    float angle = radians(degrees);
    float s = sin(angle), c = cos(angle);
    return mat2(c, -s, s, c) * uv;
  }

  float lines(float intensity, vec2 uv, float angle, float weight) {
    uv = rotateUV(uv, angle);
    float wave = 0.5 + 0.5 * sin(uv.x * resolution.x * 0.5);
    float value = (wave + weight) * intensity;
    // Full-screen UVs are linear, so these are the exact UV derivatives.
    // Computing them directly also works without the GLSL derivative extension.
    float aa = max(abs(cos(radians(angle))) * scale * length(1.0 / resolution), 0.00001);
    return smoothstep(0.5 - aa, 0.5 + aa, value);
  }

  void main() {
    // Three r160 render targets contain linear light without tone mapping.
    // Match the scene's ACES exposure before separating it into CMYK ink.
    vec4 source = texture2D(colorTexture, vUv);
    vec3 color = source.rgb;
    if (!displayColorInput) {
      color = LinearTosRGB(vec4(ACESFilmicToneMapping(color), 1.0)).rgb;
    }
    float normalEdge = 1.0;
    if (contour > 0.0) {
      vec4 normal = texture2D(normalTexture, vUv);
      normalEdge = 1.0 - length(sobel(vUv, vec2(contour) / resolution, normal.rgb));
      float width = max(thickness, 0.00001);
      normalEdge = smoothstep(0.5 - width, 0.5 + width, normalEdge);
      // Alpha is a depth-tested contour mask, not the source color's opacity.
      normalEdge = mix(1.0, normalEdge, normal.a);
    }
    color *= normalEdge;
    vec3 cmy = 0.5 - 0.5 * clamp(color, 0.0, 1.0);
    if (transparentBackground) {
      // Treat the source's soft edge as diminishing ink density BEFORE the
      // line thresholds. This also fades contour ink into thinner strokes and
      // open gaps, instead of applying a smooth opacity mask to finished ink.
      cmy *= clamp(source.a, 0.0, 1.0);
    }
    if (edgeFade > 0.0) {
      // Fade the scene into the page with the same ink-density treatment as
      // the logo. Equal pixel widths on each side keep the fade even as the
      // viewport changes shape; multiplying the sides softens the corners.
      vec2 edgeDistance = min(vUv, 1.0 - vUv) * resolution;
      float fadeWidth = edgeFade * min(resolution.x, resolution.y);
      vec2 edgeDensity = smoothstep(vec2(0.0), vec2(fadeWidth), edgeDistance);
      cmy *= edgeDensity.x * edgeDensity.y;
    }
    if (circleCutout.z > 0.0) {
      // The opening removes ink density before screening, just like edgeFade.
      // Normalized center, radius, and feather keep it circular at every DPR.
      float unit = min(resolution.x, resolution.y);
      float distanceFromCenter = length((vUv - circleCutout.xy) * resolution);
      float cutoutDistance = distanceFromCenter - circleCutout.z * unit;
      if (cutoutBox.z > 0.0 && cutoutBox.w > 0.0) {
        // Union the circle with the dropdown's padded rectangle. Its straight
        // top and rounded outer corners receive the same ink-density feather.
        vec2 q = abs((vUv - cutoutBox.xy) * resolution) - cutoutBox.zw * unit;
        float boxDistance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)
          - cutoutBoxPadding * unit;
        cutoutDistance = min(cutoutDistance, boxDistance);
      }
      cmy *= smoothstep(0.0, circleCutout.w * unit, cutoutDistance);
    }
    float key = min(cmy.x, min(cmy.y, cmy.z));
    vec2 uv = scale * vUv;
    // CMY weights are always 1 in both editors.
    float c = lines(cmy.x, uv, 75.0, thickness);
    float m = lines(cmy.y, uv, 15.0, thickness);
    float y = lines(cmy.z, uv, 0.0, thickness);
    float k = lines(key, uv, 45.0, thickness * black);
    vec3 screen = mix(1.0 - vec3(c, m, y), inkColor, k);
    // Both editors use the same ink overlay. Empty gaps show the page color;
    // the logo can preserve those gaps as alpha in transparent exports.
    float coverage = 1.0 - min(screen.r, min(screen.g, screen.b));
    vec3 ink = (screen - vec3(1.0 - coverage)) / max(coverage, 0.00001);
    if (transparentBackground) {
      // Alpha comes only from hatch coverage (including line antialiasing).
      // Source alpha has already shaped the strokes above; do not fade twice.
      gl_FragColor = vec4(ink, coverage);
    } else {
      // Display-space colors: no second tone/color transform.
      gl_FragColor = vec4(mix(backgroundColor, ink, coverage), 1.0);
    }
  }
`;

export class CrossHatchEffect {
  constructor(renderer, { transparentBackground = false, displayColorInput = false, backgroundColor = DEFAULT_PAGE_BACKGROUND, edgeFade = 0 } = {}) {
    this.renderer = renderer;
    const halfFloat = renderer.capabilities.isWebGL2
      ? renderer.extensions.has('EXT_color_buffer_float')
      : renderer.extensions.has('EXT_color_buffer_half_float');
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, { stencilBuffer: false });
    this.normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    // NoBlending preserves zero alpha while still writing depth: masked objects block
    // contours behind them without becoming contour sources themselves.
    this.noContourMaterial = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide, opacity: 0, blending: THREE.NoBlending,
    });
    // Needles have no mesh normals, but their visible pixels still mask contours.
    this.noContourLineMaterial = new THREE.LineBasicMaterial({
      color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false,
    });
    this.normalBackground = new THREE.Color().setRGB(0.5, 0.5, 1);
    this.uniforms = {
      colorTexture: { value: this.colorTarget.texture },
      normalTexture: { value: this.normalTarget.texture },
      backgroundColor: { value: new THREE.Color(backgroundColor).convertLinearToSRGB() },
      resolution: { value: new THREE.Vector2(1, 1) },
      toneMappingExposure: { value: renderer.toneMappingExposure },
      transparentBackground: { value: transparentBackground },
      displayColorInput: { value: displayColorInput },
      edgeFade: { value: edgeFade },
      circleCutout: { value: new THREE.Vector4(0, 0, 0, 0) },
      cutoutBox: { value: new THREE.Vector4(0, 0, 0, 0) },
      cutoutBoxPadding: { value: 0 },
      inkColor: { value: new THREE.Color(HATCH_DEFAULTS.inkColor) },
      black: { value: HATCH_DEFAULTS.black },
    };
    for (const { key } of HATCH_SLIDERS) this.uniforms[key] = { value: HATCH_DEFAULTS[key] };
    this.material = new THREE.RawShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCamera = new THREE.Camera();
  }

  setParameter(key, value) {
    const slider = SCENE_HATCH_SLIDERS.find(slider => slider.key === key);
    if (slider && Number.isFinite(value)) {
      this.uniforms[key].value = THREE.MathUtils.clamp(value, slider.min, slider.max);
    }
  }

  setBackground(color) {
    this.uniforms.backgroundColor.value.set(color).convertLinearToSRGB();
  }

  setCircleCutout(cutout = null) {
    if (!cutout) {
      this.uniforms.circleCutout.value.set(0, 0, 0, 0);
      this.uniforms.cutoutBox.value.set(0, 0, 0, 0);
      this.uniforms.cutoutBoxPadding.value = 0;
    }
    else {
      const { x, y, radius, feather } = cutout;
      if (![x, y, radius, feather].every(Number.isFinite)) return;
      this.uniforms.circleCutout.value.set(x, y, Math.max(0, radius), Math.max(.00001, feather));
      const box = cutout.box;
      if (box && [box.x, box.y, box.halfWidth, box.halfHeight, box.padding].every(Number.isFinite)) {
        this.uniforms.cutoutBox.value.set(box.x, box.y, Math.max(0, box.halfWidth), Math.max(0, box.halfHeight));
        this.uniforms.cutoutBoxPadding.value = Math.max(0, box.padding);
      } else {
        this.uniforms.cutoutBox.value.set(0, 0, 0, 0);
        this.uniforms.cutoutBoxPadding.value = 0;
      }
    }
  }

  setSize(width, height, referenceWidth = width, referenceHeight = height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    this.colorTarget.setSize(width, height);
    this.normalTarget.setSize(width, height);
    // A fixed reference size lets exports increase resolution without changing
    // the spacing, weight, or contour of the preview's strokes.
    this.uniforms.resolution.value.set(Math.max(1, referenceWidth), Math.max(1, referenceHeight));
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const target = renderer.getRenderTarget();
    const overrideMaterial = scene.overrideMaterial;
    const background = scene.background;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const hidden = [];
    const materials = new Map();
    const contourExcluded = new Set();
    try {
      renderer.setRenderTarget(this.colorTarget);
      renderer.render(scene, camera);
      // Glows and unmasked lines contribute only their real colors. Masked
      // needles also write depth and zero alpha to protect their visible pixels.
      scene.traverse(object => {
        // An explicit false restores contours for exceptions such as the base.
        const excludeContours = object.userData.excludeFromContours ?? contourExcluded.has(object.parent);
        if (excludeContours) contourExcluded.add(object);
        if (!object.visible) return;
        if (object.isSprite || (object.isLine && !excludeContours) || object.isPoints || object.userData.excludeFromNormals) {
          hidden.push(object);
          object.visible = false;
        } else if (object.isMesh || object.isLine) {
          const material = object.material;
          materials.set(object, material);
          const normalMaterial = object.isLine ? this.noContourLineMaterial
            : excludeContours ? this.noContourMaterial : this.normalMaterial;
          // Preserve material groups and hidden surfaces in the normal pass.
          const replace = original => original.visible ? normalMaterial : original;
          object.material = Array.isArray(material) ? material.map(replace) : replace(material);
        }
      });
      scene.overrideMaterial = null;
      scene.background = this.normalBackground;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.normalTarget);
      renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = overrideMaterial;
      scene.background = background;
      for (const object of hidden) object.visible = true;
      for (const [object, material] of materials) object.material = material;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      renderer.setRenderTarget(target);
    }
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.colorTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.noContourMaterial.dispose();
    this.noContourLineMaterial.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
