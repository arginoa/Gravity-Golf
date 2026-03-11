export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function len(x, y) {
  return Math.hypot(x, y);
}

export function norm(x, y) {
  const l = Math.hypot(x, y);
  if (l <= 1e-9) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}