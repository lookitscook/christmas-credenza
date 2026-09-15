import * as THREE from '../vendor/three.module.js';

export function createTVVideo({ src, screen, root, invalidate }) {
  const fallbackMaterial = screen.material;
  const status = root.querySelector('[data-tv-status]');
  const video = document.createElement('video');
  video.dataset.tvVideo = '';
  video.hidden = true;
  video.autoplay = true;
  video.loop = true;
  video.defaultMuted = true;
  video.muted = true;
  video.volume = 0;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  root.append(video);

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshPhysicalMaterial({
    color: '#080808',
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 1,
    roughness: .17,
    metalness: .05,
    clearcoat: 1,
    clearcoatRoughness: .08,
    envMap: fallbackMaterial.envMap,
    envMapIntensity: .24,
  });
  // Keep the glass highlights, with the video supplying the screen's own light.
  // Three r160 decodes video color for map, but not for emissiveMap.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #ifdef USE_EMISSIVEMAP
        vec2 tvUV = vEmissiveMapUv;
        vec3 tvColor = texture2D(emissiveMap, tvUV).rgb;
        tvColor = mix(pow((tvColor + 0.055) / 1.055, vec3(2.4)),
          tvColor / 12.92, vec3(lessThanEqual(tvColor, vec3(0.04045))));
        totalEmissiveRadiance *= tvColor;
      #endif
    `);
  };

  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let disposed = false;
  let frameCallback = null;
  let animationFrame = null;
  let lastTime = -1;
  const hasVideoFrames = typeof video.requestVideoFrameCallback === 'function';

  function fitVideo() {
    if (!video.videoWidth || !video.videoHeight) return;
    const screenAspect = .567 / .475;
    const videoAspect = video.videoWidth / video.videoHeight;
    // Center-crop to cover the whole CRT without stretching or letterboxing.
    texture.repeat.set(Math.min(1, screenAspect / videoAspect), Math.min(1, videoAspect / screenAspect));
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
    texture.updateMatrix();
  }

  function updateFrame() {
    frameCallback = null;
    animationFrame = null;
    if (disposed) return;
    if (!root.isConnected) { dispose(); return; }
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      invalidate();
    }
    if (hasVideoFrames) frameCallback = video.requestVideoFrameCallback(updateFrame);
    else if (!video.paused) animationFrame = requestAnimationFrame(updateFrame);
  }

  async function play() {
    if (disposed || video.error || document.hidden) return;
    // All playback attempts remain silent, including a user-gesture retry.
    video.muted = true;
    video.volume = 0;
    try {
      await video.play();
    } catch (error) {
      if (disposed || error.name === 'AbortError') return;
      status.textContent = error.name === 'NotAllowedError'
        ? 'Click the scene to start the TV video.'
        : 'The TV video could not play. Check that the video file is available and supported.';
    }
  }

  video.addEventListener('loadedmetadata', fitVideo, options);
  video.addEventListener('loadeddata', () => {
    fitVideo();
    screen.material = material;
    invalidate();
  }, options);
  video.addEventListener('playing', () => {
    status.textContent = '';
    if (frameCallback === null && animationFrame === null) updateFrame();
  }, options);
  video.addEventListener('error', () => {
    screen.material = fallbackMaterial;
    status.textContent = 'The TV video could not load. Check that the video file is available and supported.';
    invalidate();
  }, options);
  // Muted autoplay normally succeeds; retry on interaction if the browser blocks it.
  const retry = () => { if (video.paused) play(); };
  root.addEventListener('pointerdown', retry, options);
  root.addEventListener('keydown', retry, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else play();
  }, options);
  window.addEventListener('pagehide', () => video.pause(), options);
  window.addEventListener('pageshow', play, options);

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    if (frameCallback !== null) video.cancelVideoFrameCallback(frameCallback);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    screen.material = fallbackMaterial;
    material.dispose();
    texture.dispose();
  }

  video.src = src;
  play();
  return { dispose };
}
