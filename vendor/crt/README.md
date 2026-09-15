# Serenity CRT shader

Source: https://github.com/gingerbeardman/webgl-crt-shader/
Demo: https://gingerbeardman.github.io/webgl-crt-shader/
Author: Matt Sephton (@gingerbeardman). MIT; see LICENSE.txt.

`CRTShader.js` is the upstream source downloaded on 2026-09-15. It is retained
for attribution and comparison. Runtime code is adapted in `src/crt-shader.js`.

The adaptation applies scanlines, adaptive modulation, color adjustments, RGB
shift, curvature, and flicker to the TV's emissive picture, retaining the physical
glass reflections. It samples the downscaled canvas through the existing cover
transform, converts between scene-linear and display RGB around the picture
effects, and filters scanlines at subpixel sizes to avoid distant moire.

The scene's adjustable vignette replaces the reference vignette rather than
stacking two masks. Bloom controls affect the existing external halo, with a
threshold on the sampled light color; the glass masks all bloom inside the screen.
Defaults use 144 scanlines for the 256 × 144 video texture, gentle extra curvature,
and the scene's existing vignette and edge-bloom strengths. A native HTML settings
panel replaces the upstream CDN-hosted Tweakpane UI, so no network is needed.
