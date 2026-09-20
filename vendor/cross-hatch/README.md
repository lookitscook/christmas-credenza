# Cross-hatch II

Effect adapted from [Post Cross-hatch II](https://spite.github.io/sketch/post-cross-hatch-ii/index.html)
by [spite](https://github.com/spite). [Source repository](https://github.com/spite/sketch),
MIT license, copyright (c) 2020 thespite. See LICENSE.txt.

The CMYK line equations, four channel angles, normal-buffer Sobel contours,
and parameter defaults/ranges come from the demo's `post-cross-hatch-ii/post.js`
and `shaders/sobel.js` (retrieved September 14, 2026).
The original shader credits libretro's `misc/cmyk-halftone-dot.glsl` for
the CMYK separation: https://github.com/libretro/glsl-shaders/blob/master/misc/cmyk-halftone-dot.glsl.

Integration changes in `src/cross-hatch.js`:

- GLSL 1 syntax and an explicit resolution uniform support the bundled Three.js r160.
- Evaluate the linear full-screen UV derivatives analytically for GLSL compatibility.
- Convert linear scene color using the app's ACES exposure before CMYK separation.
- Keep existing scene materials, lighting, and animation; the demo's sample objects,
  rainbow material, environment controls, and material controls are not part of this post effect.
- Skip sprites and unmasked lines in the mesh-normal pass and restore renderer/scene state afterward.
- Use the normal buffer's alpha as a depth-tested contour mask for the Christmas
  tree, including needle lines, excluding its pixels and neighboring Sobel samples
  from contours. The tree's base and star explicitly retain contours.
- Mask the metal train rails while retaining contours on the wooden track ties.
- Contour zero disables outlines; epsilon guards keep thickness zero well-defined.
- Composite ink over the shared solid page color, or emit ink with transparent
  gaps for logo exports. The original paper image layer has been removed.
- Process the logo's edge fade and the scene's viewport-edge fade as ink density
  before generating hatch strokes, including contour ink.
- Ink picker colors are used in display RGB for the final composite.
