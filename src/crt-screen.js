import * as THREE from '../vendor/three.module.js';
import { RectAreaLightUniformsLib } from '../vendor/lights/RectAreaLightUniformsLib.js';
import { CRT_CONTROLS, createCRTUniforms, crtFragment, crtUniformName } from './crt-shader.js';

const SCREEN_WIDTH = .567;
const SCREEN_HEIGHT = .475;
const MIN_EMISSION_LUMINANCE = .3;

export function createCRTScreen(screen, videoTexture) {
  if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  const originalMaterial = screen.material;
  const originalGeometry = screen.geometry;
  const geometry = originalGeometry.clone();
  const { position, uv } = geometry.attributes;
  // Video fills the curved glass evenly; the old texture retains its original UVs.
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / SCREEN_WIDTH + .5, position.getY(i) / SCREEN_HEIGHT + .5);
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: '#080a0b',
    emissive: '#ffffff',
    emissiveMap: videoTexture,
    emissiveIntensity: 1,
    roughness: .12,
    metalness: .06,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: .045,
    envMap: originalMaterial.envMap,
    envMapIntensity: .85,
  });
  material.name = 'Reflective CRT video glass';
  material.extensions = { derivatives: true };
  const uniforms = createCRTUniforms(videoTexture.matrix);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCrtUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCrtUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCrtUv;')
      .replace('#include <emissivemap_pars_fragment>', `#include <emissivemap_pars_fragment>\n${crtFragment}`)
      .replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP
          totalEmissiveRadiance *= crtPicture(vCrtUv);
        #endif
      `);
  };

  const light = new THREE.RectAreaLight('#ffd3a5', 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  light.name = 'TV rectangular screen light';
  light.position.z = .022;
  // RectAreaLight emits along local -Z; the CRT faces local +Z.
  light.rotation.y = Math.PI;
  screen.add(light);

  // An additive halo, like the tree-light sprites, following the screen plane.
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: light.color.clone() },
      bloomIntensity: uniforms.crtBloomIntensity,
      bloomThreshold: uniforms.crtBloomThreshold,
    },
    vertexShader: `
      varying vec2 vGlowUv;
      void main() {
        vGlowUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float bloomIntensity;
      uniform float bloomThreshold;
      varying vec2 vGlowUv;
      void main() {
        vec2 p = (vGlowUv - 0.5) * vec2(0.827, 0.735);
        vec2 q = abs(p) - (vec2(0.2835, 0.2375) - 0.035);
        float distanceToEdge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.035;
        float halo = exp(-max(distanceToEdge, 0.0) / 0.035)
          * smoothstep(-0.045, 0.0, distanceToEdge);
        float luminance = dot(glowColor, vec3(0.299, 0.587, 0.114));
        float thresholdMask = smoothstep(bloomThreshold, bloomThreshold + 0.1, luminance);
        gl_FragColor = vec4(glowColor, bloomIntensity * halo * thresholdMask);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(.827, .735), glowMaterial);
  glow.name = 'TV soft screen bloom';
  // Put the halo just behind the glass. Its depth masks the bloom against the
  // actual curved screen silhouette, including when the camera orbits the TV.
  glow.position.z = -.001;
  glow.renderOrder = 2;
  glow.visible = false;
  glow.userData.excludeFromNormals = true;
  screen.add(glow);
  const emissionColor = new THREE.Color();
  const darkFallback = new THREE.Color('#ffd3a5');
  const luminance = color => color.r * .299 + color.g * .587 + color.b * .114;
  darkFallback.multiplyScalar(MIN_EMISSION_LUMINANCE / luminance(darkFallback));

  return {
    setParameter(key, value) {
      const setting = CRT_CONTROLS.find(control => control.key === key);
      if (!setting || !Number.isFinite(value)) return;
      const clamped = THREE.MathUtils.clamp(value, setting.min, setting.max);
      uniforms[crtUniformName(key)].value = setting.step === 1 ? Math.round(clamped) : clamped;
    },
    setShaderEnabled(enabled) { uniforms.crtEnabled.value = Boolean(enabled); },
    setTime(time) { if (Number.isFinite(time)) uniforms.crtTime.value = time; },
    setEnabled(enabled) {
      screen.material = enabled ? material : originalMaterial;
      screen.geometry = enabled ? geometry : originalGeometry;
      light.intensity = enabled ? 14 : 0;
      glow.visible = enabled;
    },
    updateColor(color) {
      emissionColor.copy(color);
      const amount = luminance(emissionColor);
      if (amount > 1e-6 && amount < MIN_EMISSION_LUMINANCE) {
        emissionColor.multiplyScalar(MIN_EMISSION_LUMINANCE / amount);
      } else if (amount <= 1e-6) emissionColor.copy(darkFallback);
      light.color.lerp(emissionColor, .35);
      glowMaterial.uniforms.glowColor.value.copy(light.color);
    },
    dispose() {
      screen.material = originalMaterial;
      screen.geometry = originalGeometry;
      screen.remove(light, glow);
      geometry.dispose();
      material.dispose();
      glow.geometry.dispose();
      glowMaterial.dispose();
    },
  };
}
