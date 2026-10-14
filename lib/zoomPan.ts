// Zoom and pan maths for the photo viewer. A transform is applied around the centre of the box:
// translate(x, y) scale(scale). Points are in pixels relative to that centre.
export interface ZoomPan {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export const IDENTITY: ZoomPan = { scale: 1, x: 0, y: 0 };

// Keep the scale in range and the image covering the box (no empty edges).
export function clampZoomPan(t: ZoomPan, width: number, height: number): ZoomPan {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale));
  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return { scale, x: Math.min(maxX, Math.max(-maxX, t.x)), y: Math.min(maxY, Math.max(-maxY, t.y)) };
}

// Zoom by `factor` keeping the point (cx, cy) under the finger / cursor.
export function zoomAt(t: ZoomPan, factor: number, cx: number, cy: number, width: number, height: number): ZoomPan {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
  const ratio = scale / t.scale;
  return clampZoomPan({ scale, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio }, width, height);
}

export function panBy(t: ZoomPan, dx: number, dy: number, width: number, height: number): ZoomPan {
  return clampZoomPan({ ...t, x: t.x + dx, y: t.y + dy }, width, height);
}

// Double tap: zoom in to 2.5x on the tapped point, or back out if already zoomed.
export function toggleZoom(t: ZoomPan, cx: number, cy: number, width: number, height: number): ZoomPan {
  return t.scale > 1.05 ? IDENTITY : zoomAt(t, 2.5, cx, cy, width, height);
}
