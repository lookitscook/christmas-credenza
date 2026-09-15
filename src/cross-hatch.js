import * as THREE from '../vendor/three.module.js';

// Adapted from spite/sketch/post-cross-hatch-ii (MIT).
// Source and license: ../vendor/cross-hatch/README.md and LICENSE.txt.
export const HATCH_DEFAULTS = Object.freeze({
  scale: 1.5,
  thickness: 1,
  contour: 4,
  cyan: 1,
  magenta: 1,
  yellow: 1,
  black: 0.2,
  inkColor: '#000000',
  paper: 'Parchment',
});

export const HATCH_SLIDERS = Object.freeze([
  { key: 'scale', label: 'Scale', min: 0.1, max: 2 },
  { key: 'thickness', label: 'Thickness', min: 0, max: 3 },
  { key: 'contour', label: 'Contour', min: 0, max: 10 },
  { key: 'cyan', label: 'Cyan', min: 0, max: 1 },
  { key: 'magenta', label: 'Magenta', min: 0, max: 1 },
  { key: 'yellow', label: 'Yellow', min: 0, max: 1 },
  { key: 'black', label: 'Black', min: 0, max: 1 },
]);

export const PAPER_TEXTURES = Object.freeze({
  'Craft light': new URL('../vendor/cross-hatch/paper/Craft_Light.jpg', import.meta.url).href,
  'Craft rough': new URL('../vendor/cross-hatch/paper/Craft_Rough.jpg', import.meta.url).href,
  'Watercolor cold press': new URL('../vendor/cross-hatch/paper/Watercolor_ColdPress.jpg', import.meta.url).href,
  Parchment: new URL('../vendor/cross-hatch/paper/Parchment.jpg', import.meta.url).href,
});

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
  uniform sampler2D paperTexture;
  uniform vec2 resolution;
  uniform vec3 inkColor;
  uniform float scale;
  uniform float thickness;
  uniform float contour;
  uniform float cyan;
  uniform float magenta;
  uniform float yellow;
  uniform float black;
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  vec3 sobel(vec2 uv, vec2 offset) {
    vec3 tl = texture2D(normalTexture, uv + vec2(-offset.x, -offset.y)).rgb;
    vec3 tc = texture2D(normalTexture, uv + vec2(0.0, -offset.y)).rgb;
    vec3 tr = texture2D(normalTexture, uv + vec2(offset.x, -offset.y)).rgb;
    vec3 ml = texture2D(normalTexture, uv + vec2(-offset.x, 0.0)).rgb;
    vec3 mr = texture2D(normalTexture, uv + vec2(offset.x, 0.0)).rgb;
    vec3 bl = texture2D(normalTexture, uv + vec2(-offset.x, offset.y)).rgb;
    vec3 bc = texture2D(normalTexture, uv + vec2(0.0, offset.y)).rgb;
    vec3 br = texture2D(normalTexture, uv + vec2(offset.x, offset.y)).rgb;
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
    vec3 color = texture2D(colorTexture, vUv).rgb;
    color = LinearTosRGB(vec4(ACESFilmicToneMapping(color), 1.0)).rgb;
    float normalEdge = 1.0;
    if (contour > 0.0) {
      normalEdge = 1.0 - length(sobel(vUv, vec2(contour) / resolution));
      float width = max(thickness, 0.00001);
      normalEdge = smoothstep(0.5 - width, 0.5 + width, normalEdge);
    }
    color *= normalEdge;
    vec3 cmy = 0.5 - 0.5 * clamp(color, 0.0, 1.0);
    float key = min(cmy.x, min(cmy.y, cmy.z));
    vec2 uv = scale * vUv;
    float c = lines(cmy.x, uv, 75.0, thickness * cyan);
    float m = lines(cmy.y, uv, 15.0, thickness * magenta);
    float y = lines(cmy.z, uv, 0.0, thickness * yellow);
    float k = lines(key, uv, 45.0, thickness * black);
    vec3 screen = mix(1.0 - vec3(c, m, y), inkColor, k);
    vec3 paper = texture2D(paperTexture, 0.00025 * vUv * resolution).rgb;
    // These are display-space ink/paper colors: no second tone/color transform.
    gl_FragColor = vec4(min(paper, screen), 1.0);
  }
`;

export class CrossHatchEffect {
  constructor(renderer) {
    this.renderer = renderer;
    this.disposed = false;
    this.paperRequest = 0;
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
    this.normalBackground = new THREE.Color().setRGB(0.5, 0.5, 1);
    this.fallbackPaper = new THREE.DataTexture(new Uint8Array([239, 224, 190, 255]), 1, 1);
    this.fallbackPaper.needsUpdate = true;
    this.uniforms = {
      colorTexture: { value: this.colorTarget.texture },
      normalTexture: { value: this.normalTarget.texture },
      paperTexture: { value: this.fallbackPaper },
      resolution: { value: new THREE.Vector2(1, 1) },
      toneMappingExposure: { value: renderer.toneMappingExposure },
      inkColor: { value: new THREE.Color(HATCH_DEFAULTS.inkColor) },
    };
    for (const { key } of HATCH_SLIDERS) this.uniforms[key] = { value: HATCH_DEFAULTS[key] };
    this.material = new THREE.RawShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCamera = new THREE.Camera();
  }

  setParameter(key, value) {
    if (key === 'inkColor') {
      // The picker and final paper composite both use display-space RGB.
      this.uniforms.inkColor.value.set(value).convertLinearToSRGB();
    } else {
      const slider = HATCH_SLIDERS.find(slider => slider.key === key);
      if (slider && Number.isFinite(value)) {
        this.uniforms[key].value = THREE.MathUtils.clamp(value, slider.min, slider.max);
      }
    }
  }

  async setPaper(name) {
    if (!Object.hasOwn(PAPER_TEXTURES, name)) throw new Error(`Unknown paper: ${name}`);
    const request = ++this.paperRequest;
    const texture = await new THREE.TextureLoader().loadAsync(PAPER_TEXTURES[name]);
    if (this.disposed || request !== this.paperRequest) {
      texture.dispose();
      return false;
    }
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // Keep the original paper's display RGB, as in the reference shader.
    const previous = this.uniforms.paperTexture.value;
    this.uniforms.paperTexture.value = texture;
    if (previous !== this.fallbackPaper) previous.dispose();
    return true;
  }

  setSize(width, height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    this.colorTarget.setSize(width, height);
    this.normalTarget.setSize(width, height);
    this.uniforms.resolution.value.set(width, height);
  }

  render(scene, camera) {
    const renderer = this.renderer;
    const target = renderer.getRenderTarget();
    const overrideMaterial = scene.overrideMaterial;
    const background = scene.background;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const hidden = [];
    try {
      renderer.setRenderTarget(this.colorTarget);
      renderer.render(scene, camera);
      // Mesh normals don't apply to glow sprites or tree-needle line segments.
      // They still contribute their real colors in the first pass.
      scene.traverse(object => {
        if (object.visible && (object.isSprite || object.isLine || object.isPoints || object.userData.excludeFromNormals)) {
          hidden.push(object);
          object.visible = false;
        }
      });
      scene.overrideMaterial = this.normalMaterial;
      scene.background = this.normalBackground;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.normalTarget);
      renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = overrideMaterial;
      scene.background = background;
      for (const object of hidden) object.visible = true;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      renderer.setRenderTarget(target);
    }
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.disposed = true;
    this.paperRequest++;
    this.colorTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
    const paper = this.uniforms.paperTexture.value;
    if (paper !== this.fallbackPaper) paper.dispose();
    this.fallbackPaper.dispose();
  }
}
