// DOM coordinates are top-down CSS pixels; shader coordinates are bottom-up
// UVs, with radii measured against the shorter side of the drawing buffer.
export function sceneCircleCutout(stage, circle, feather = 28, control = null) {
  const unit = Math.min(stage.width, stage.height);
  if (unit <= 0) return null;
  const cutout = {
    x: (circle.left + circle.width / 2 - stage.left) / stage.width,
    y: 1 - (circle.top + circle.height / 2 - stage.top) / stage.height,
    radius: Math.min(circle.width, circle.height) / 2 / unit,
    feather: feather / unit,
  };
  if (control) {
    const { rect, padding } = control;
    cutout.box = {
      x: (rect.left + rect.width / 2 - stage.left) / stage.width,
      y: 1 - (rect.top + rect.height / 2 - stage.top) / stage.height,
      halfWidth: rect.width / 2 / unit,
      halfHeight: rect.height / 2 / unit,
      padding: Math.max(0, padding) / unit,
    };
  }
  return cutout;
}
