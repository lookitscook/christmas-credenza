# Cross-hatch II

Effect adapted from [Post Cross-hatch II](https://spite.github.io/sketch/post-cross-hatch-ii/index.html)
by [spite](https://github.com/spite). [Source repository](https://github.com/spite/sketch),
MIT license, copyright (c) 2020 thespite. See LICENSE.txt.

The CMYK line equations, four channel angles, normal-buffer Sobel contours,
darken composite, parameter defaults/ranges, and four original paper textures
come from the demo's `post-cross-hatch-ii/post.js`, `shaders/sobel.js`,
`js/paper.js`, and `assets/` (retrieved September 14, 2026).
The original shader credits libretro's `misc/cmyk-halftone-dot.glsl` for
the CMYK separation: https://github.com/libretro/glsl-shaders/blob/master/misc/cmyk-halftone-dot.glsl.

Integration changes in `src/cross-hatch.js`:

- GLSL 1 syntax and an explicit resolution uniform support the bundled Three.js r160.
- Evaluate the linear full-screen UV derivatives analytically for GLSL compatibility.
- Convert linear scene color using the app's ACES exposure before CMYK separation.
- Keep existing scene materials, lighting, and animation; the demo's sample objects,
  rainbow material, environment controls, and material controls are not part of this post effect.
- Skip sprites/lines in the mesh-normal pass and restore renderer/scene state afterward.
- Contour zero disables outlines; epsilon guards keep thickness zero well-defined.
- Load local paper textures on demand, discard superseded loads, and dispose replaced textures.
- Ink picker colors are used in display RGB for the final composite.

Paper JPEGs are unmodified 4096 × 4096 originals from
https://spite.github.io/sketch/assets/.
