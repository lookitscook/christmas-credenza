import * as THREE from '../vendor/three.module.js';
import { CrossHatchEffect, HATCH_SLIDERS } from './cross-hatch.js';
import { LOGO_WIDTH, LOGO_HEIGHT, SPHERE, readLogoSettings } from './logo-settings.js';

const vertexShader = `
  precision highp float;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  attribute vec3 position;
  varying vec2 spherePosition;
  void main() {
    spherePosition = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  precision highp float;
  varying vec2 spherePosition;
  uniform vec3 color1, color2, color3;
  uniform float angle, midpoint, saturation, highlight, softness, grain;
  uniform bool useColorSource;
  uniform sampler2D colorSource;
  uniform vec4 sourceCrop;
  float noise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = spherePosition;
    vec3 color;
    float sourceOpacity = 1.0;
    if (useColorSource) {
      // This is the selector's display-encoded, pre-sepia color surface. Keep
      // it unaltered until the logo's own edge fade and hatch separation.
      vec4 source = texture2D(colorSource, sourceCrop.xy + (p * 0.5 + 0.5) * sourceCrop.zw);
      color = source.rgb;
      sourceOpacity = source.a;
    } else {
      float t = clamp(0.5 + 0.5 * dot(p, vec2(sin(angle), cos(angle))), 0.0, 1.0);
      color = t < midpoint
        ? mix(color1, color2, smoothstep(0.0, midpoint, t))
        : mix(color2, color3, smoothstep(midpoint, 1.0, t));
      float light = 1.0 - smoothstep(0.0, 1.5, length(p - vec2(0.34, 0.56)));
      color = mix(color, vec3(1.0, 0.96, 0.77), light * highlight);
      color += (noise(floor((p + 1.0) * 268.0)) - 0.5) * grain;
      color = clamp(color, 0.0, 1.0);
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luminance), color, saturation);
    }
    float opacity = softness > 0.0 ? 1.0 - smoothstep(1.0 - softness, 1.0, length(p)) : 1.0;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), opacity * sourceOpacity);
  }
`;

export class LogoSphere {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true,
      premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.effect = new CrossHatchEffect(this.renderer, { transparentBackground: true, displayColorInput: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-LOGO_WIDTH / 2, LOGO_WIDTH / 2, LOGO_HEIGHT / 2, -LOGO_HEIGHT / 2, 1, 2000);
    this.camera.position.z = 1000;
    this.uniforms = Object.fromEntries(['angle', 'midpoint', 'saturation', 'highlight', 'softness', 'grain'].map(key => [key, { value: 0 }]));
    for (const key of ['color1', 'color2', 'color3']) this.uniforms[key] = { value: new THREE.Color() };
    this.uniforms.useColorSource = { value: false };
    this.uniforms.colorSource = { value: null };
    this.uniforms.sourceCrop = { value: new THREE.Vector4(0, 0, 1, 1) };
    this.material = new THREE.RawShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms,
      blending: THREE.NoBlending, toneMapped: false });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), this.material);
    this.sphere.scale.setScalar(SPHERE.radius);
    this.sphere.position.set(SPHERE.x - LOGO_WIDTH / 2, LOGO_HEIGHT / 2 - SPHERE.y, 0);
    this.scene.add(this.sphere);
    this.setScale(1);
  }

  setScale(scale) {
    if (this.outputScale === scale) return;
    this.outputScale = scale;
    this.renderer.setSize(LOGO_WIDTH * scale, LOGO_HEIGHT * scale, false);
    this.effect.setSize(LOGO_WIDTH * scale, LOGO_HEIGHT * scale, LOGO_WIDTH, LOGO_HEIGHT);
  }

  setColorSource(canvas, crop = [0, 0, 1, 1]) {
    if (!canvas) {
      this.sourceTexture?.dispose();
      this.sourceTexture = null;
      this.uniforms.colorSource.value = null;
      this.uniforms.useColorSource.value = false;
      return;
    }
    if (!this.sourceTexture || this.sourceTexture.image !== canvas
      || this.sourceWidth !== canvas.width || this.sourceHeight !== canvas.height) {
      this.sourceTexture?.dispose();
      this.sourceTexture = new THREE.CanvasTexture(canvas);
      // RawShaderMaterial samples display RGB directly, with no second gamma
      // conversion. CSS filters and the selector's overlay canvas are excluded.
      this.sourceTexture.colorSpace = THREE.NoColorSpace;
      this.sourceTexture.minFilter = this.sourceTexture.magFilter = THREE.LinearFilter;
      this.sourceTexture.generateMipmaps = false;
      this.sourceWidth = canvas.width;
      this.sourceHeight = canvas.height;
    }
    this.sourceTexture.needsUpdate = true;
    this.uniforms.colorSource.value = this.sourceTexture;
    this.uniforms.sourceCrop.value.fromArray(crop);
    this.uniforms.useColorSource.value = true;
  }

  render(input, scale = 1) {
    const settings = readLogoSettings(input);
    this.setScale(scale);
    for (const key of ['color1', 'color2', 'color3']) {
      this.uniforms[key].value.set(settings[key]).convertLinearToSRGB();
    }
    this.uniforms.angle.value = THREE.MathUtils.degToRad(settings.angle);
    // Saturation changes the source colors before the hatch separates them into ink.
    for (const key of ['midpoint', 'saturation', 'highlight', 'softness', 'grain']) this.uniforms[key].value = settings[key] / 100;
    for (const { key } of HATCH_SLIDERS) this.effect.setParameter(key, settings[key]);
    if (settings.hatchEnabled) this.effect.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.sourceTexture?.dispose();
    this.effect.dispose();
    this.sphere.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
