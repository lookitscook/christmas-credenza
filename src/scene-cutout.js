// DOM coordinates are top-down CSS pixels; shader coordinates are bottom-up
// UVs, with radii measured against the shorter side of the drawing buffer.
export function sceneCircleCutout(stage, circle, feather = 28) {
  const unit = Math.min(stage.width, stage.height);
  if (unit <= 0) return null;
  return {
    x: (circle.left + circle.width / 2 - stage.left) / stage.width,
    y: 1 - (circle.top + circle.height / 2 - stage.top) / stage.height,
    radius: Math.min(circle.width, circle.height) / 2 / unit,
    feather: feather / unit,
  };
}
