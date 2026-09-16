import * as THREE from '../vendor/three.module.js';
import { createCRTScreen } from './crt-screen.js';
import { createCRTControls } from './crt-controls.js';

const MAX_VIDEO_TEXTURE_SIZE = 256;

const linearChannel = Float32Array.from({ length: 256 }, (_, byte) => {
  const value = byte / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});

export function createTVVideo({ src, screen, root, invalidate }) {
  const status = root.querySelector('[data-tv-status]');
  const toggle = root.querySelector('[data-action="tv-video"]');
  const stage = root.querySelector('.scene-stage');
  const videoDescription = stage.getAttribute('aria-label');
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

  // Downsample the complete frame before the texture's cover crop is applied.
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frameCanvas.height = 1;
  const frameContext = frameCanvas.getContext('2d', { alpha: false });
  if (!frameContext) throw new Error('A 2D canvas is required for the TV video texture.');
  const texture = new THREE.CanvasTexture(frameCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const crt = createCRTScreen(screen, texture);
  const controls = createCRTControls(root, crt, invalidate);
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 16;
  sampleCanvas.height = 12;
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  const frameColor = new THREE.Color();
  let canSample = Boolean(sampleContext);
  let lastLightSample = -Infinity;

  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let disposed = false;
  let enabled = true;
  let hasFrame = false;
  let frameCallback = null;
  let animationFrame = null;
  let lastTime = -1;
  let pendingTime = null;
  const hasVideoFrames = typeof video.requestVideoFrameCallback === 'function';

  function updateLight() {
    const now = performance.now();
    if (!canSample || now - lastLightSample < 100) return;
    lastLightSample = now;
    try {
      sampleContext.drawImage(frameCanvas, texture.offset.x * frameCanvas.width,
        texture.offset.y * frameCanvas.height, texture.repeat.x * frameCanvas.width,
        texture.repeat.y * frameCanvas.height, 0, 0, 16, 12);
      const pixels = sampleContext.getImageData(0, 0, 16, 12).data;
      let red = 0, green = 0, blue = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        red += linearChannel[pixels[i]];
        green += linearChannel[pixels[i + 1]];
        blue += linearChannel[pixels[i + 2]];
      }
      crt.updateColor(frameColor.setRGB(red / 192, green / 192, blue / 192));
    } catch {
      // If a future remote video disallows pixel reads, keep the default warm light.
      canSample = false;
    }
  }

  function stopFrameUpdates() {
    if (frameCallback !== null) video.cancelVideoFrameCallback(frameCallback);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    frameCallback = animationFrame = null;
  }

  function setEnabled(value) {
    if (disposed) return;
    enabled = value;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'TV video: On' : 'TV video: Off';
    stage.setAttribute('aria-label', enabled ? videoDescription
      : videoDescription.replace('playing a silent looping video', 'displaying its original reflective screen texture'));
    crt.setEnabled(enabled && hasFrame && !video.error);
    controls.setAvailable(enabled && hasFrame && !video.error);
    status.textContent = '';
    if (enabled) play();
    else { video.pause(); stopFrameUpdates(); }
    invalidate();
  }

  function fitVideo() {
    if (!video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, MAX_VIDEO_TEXTURE_SIZE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (frameCanvas.width !== width || frameCanvas.height !== height) {
      // Reallocate GPU storage if the source dimensions change after an upload.
      texture.dispose();
      frameCanvas.width = width;
      frameCanvas.height = height;
      frameContext.imageSmoothingEnabled = true;
      frameContext.imageSmoothingQuality = 'high';
      lastTime = -1;
    }
    const screenAspect = .567 / .475;
    const videoAspect = video.videoWidth / video.videoHeight;
    // Center-crop to cover the whole CRT without stretching or letterboxing.
    texture.repeat.set(Math.min(1, screenAspect / videoAspect), Math.min(1, videoAspect / screenAspect));
    texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
    texture.updateMatrix();
  }

  function copyFrame() {
    frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    texture.needsUpdate = true;
    lastTime = video.currentTime;
    crt.setTime(lastTime);
  }

  function updateFrame() {
    frameCallback = null;
    animationFrame = null;
    if (disposed || !enabled) return;
    if (!root.isConnected) { dispose(); return; }
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.currentTime !== lastTime) {
      copyFrame();
      updateLight();
      invalidate();
    }
    if (hasVideoFrames) frameCallback = video.requestVideoFrameCallback(updateFrame);
    else if (!video.paused) animationFrame = requestAnimationFrame(updateFrame);
  }

  async function play() {
    if (disposed || !enabled || video.error || document.hidden) return;
    // All playback attempts remain silent, including a user-gesture retry.
    video.muted = true;
    video.volume = 0;
    try {
      await video.play();
    } catch (error) {
      if (disposed || !enabled || error.name === 'AbortError') return;
      status.textContent = error.name === 'NotAllowedError'
        ? 'Click the scene to start the TV video.'
        : 'The TV video could not play. Check that the video file is available and supported.';
    }
  }

  function restoreTime() {
    if (pendingTime === null || video.readyState < video.HAVE_METADATA || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = pendingTime % video.duration;
    pendingTime = null;
    lastTime = -1;
  }
  video.addEventListener('loadedmetadata', () => { fitVideo(); restoreTime(); }, options);
  video.addEventListener('seeked', () => {
    if (video.readyState < video.HAVE_CURRENT_DATA) return;
    copyFrame();
    if (enabled) updateLight();
    invalidate();
  }, options);
  video.addEventListener('resize', fitVideo, options);
  video.addEventListener('loadeddata', () => {
    fitVideo();
    copyFrame();
    hasFrame = true;
    if (enabled) updateLight();
    crt.setEnabled(enabled);
    controls.setAvailable(enabled);
    invalidate();
  }, options);
  video.addEventListener('playing', () => {
    if (!enabled) { video.pause(); return; }
    status.textContent = '';
    if (frameCallback === null && animationFrame === null) updateFrame();
  }, options);
  video.addEventListener('error', () => {
    hasFrame = false;
    crt.setEnabled(false);
    controls.setAvailable(false);
    stopFrameUpdates();
    if (enabled) status.textContent = 'The TV video could not load. Check that the video file is available and supported.';
    invalidate();
  }, options);
  toggle.addEventListener('click', () => setEnabled(!enabled), options);
  toggle.disabled = false;
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
    stopFrameUpdates();
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    crt.dispose();
    texture.dispose();
    frameCanvas.width = frameCanvas.height = 1;
    toggle.disabled = true;
    controls.dispose();
  }

  video.src = src;
  play();
  return {
    dispose, setEnabled,
    getState() {
      return { tv: { enabled, currentTime: pendingTime ?? video.currentTime }, crt: controls.getState() };
    },
    setState(state) {
      controls.setState(state.crt);
      pendingTime = state.tv.currentTime;
      restoreTime();
      setEnabled(state.tv.enabled);
    },
  };
}
