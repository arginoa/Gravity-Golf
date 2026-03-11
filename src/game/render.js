import { clamp, norm } from "./physics.js";

function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const v = parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function planetTheme(theme) {
  switch (theme) {
    case "gasRing":
      return { base: "#caa3ff", deep: "#3f1c6b", glow: "#b06dff", ring: true };
    case "azureRing":
      return { base: "#6ad5ff", deep: "#0c2e63", glow: "#48bfff", ring: true };
    case "emerald":
      return { base: "#34c759", deep: "#0b3d1d", glow: "#6cff9a", ring: false };
    case "violet":
      return { base: "#bf5af2", deep: "#2a0f3a", glow: "#e39bff", ring: false };
    case "lava":
      return { base: "#ff453a", deep: "#4b0c0c", glow: "#ff9a74", ring: false };
    case "ice":
      return { base: "#7dd3fc", deep: "#0b2b3d", glow: "#baf0ff", ring: false };
    case "sand":
    default:
      return { base: "#ffd60a", deep: "#533d00", glow: "#fff2a6", ring: false };
  }
}

function drawStars(ctx, w, h, stars, t) {
  ctx.save();
  ctx.globalAlpha = 1;
  for (const s of stars) {
    const tw = 0.55 + 0.45 * Math.sin(t * 0.001 + s.tw);
    ctx.fillStyle = `rgba(255,255,255,${0.15 + tw * 0.35})`;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlanet(ctx, p, lightDir, scale) {
  const theme = planetTheme(p.theme);
  const r = p.r * scale;

  const lx = lightDir.x;
  const ly = lightDir.y;

  const hx = p.x + lx * r * 0.35;
  const hy = p.y + ly * r * 0.35;

  // Atmosphere glow
  const glow = ctx.createRadialGradient(p.x, p.y, r * 0.7, p.x, p.y, r * 1.55);
  glow.addColorStop(0, rgba(theme.glow, 0.22));
  glow.addColorStop(1, rgba(theme.glow, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.55, 0, Math.PI * 2);
  ctx.fill();

  // Body shading
  const g = ctx.createRadialGradient(hx, hy, r * 0.2, p.x, p.y, r);
  g.addColorStop(0, theme.base);
  g.addColorStop(0.65, rgba(theme.base, 0.75));
  g.addColorStop(1, theme.deep);

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.stroke();

  // Rings
  if (theme.ring) {
    const a = Math.atan2(lightDir.y, lightDir.x);
    const rx = r * 1.75;
    const ry = r * 0.65;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a * 0.6);

    // Back ring
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = rgba(theme.glow, 0.65);
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Front ring
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = rgba(theme.base, 0.75);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }
}

function drawWormhole(ctx, wh, t, scale) {
  const r = wh.r * scale;

  // Outer glow
  const g = ctx.createRadialGradient(wh.x, wh.y, r * 0.1, wh.x, wh.y, r * 2.2);
  g.addColorStop(0, "rgba(170,220,255,0.45)");
  g.addColorStop(0.55, "rgba(120,170,255,0.18)");
  g.addColorStop(1, "rgba(120,170,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(wh.x, wh.y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Swirl rings
  ctx.save();
  ctx.translate(wh.x, wh.y);
  ctx.rotate(t * 0.0012);
  for (let i = 0; i < 18; i++) {
    const k = i / 18;
    ctx.strokeStyle = `rgba(210,240,255,${0.25 + 0.35 * (1 - k)})`;
    ctx.lineWidth = Math.max(1, r * (0.08 + 0.10 * (1 - k)));
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.65 + k * 0.85), k * 0.8, Math.PI + k * 0.9);
    ctx.stroke();
    ctx.rotate(0.18);
  }
  ctx.restore();

  // Core
  ctx.fillStyle = "rgba(8,10,18,0.95)";
  ctx.beginPath();
  ctx.arc(wh.x, wh.y, r * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  ctx.arc(wh.x, wh.y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBlackHole(ctx, bh, t, scale) {
  const eventR = bh.eventR * scale;
  const pullR = bh.pullR * scale;

  // Lensing halo
  const g = ctx.createRadialGradient(bh.x, bh.y, eventR * 0.2, bh.x, bh.y, pullR * 1.2);
  g.addColorStop(0, "rgba(0,0,0,0.0)");
  g.addColorStop(0.25, "rgba(0,0,0,0.35)");
  g.addColorStop(0.7, "rgba(255,200,120,0.10)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, pullR * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Accretion ring
  ctx.save();
  ctx.translate(bh.x, bh.y);
  ctx.rotate(t * 0.0009);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,190,120,0.55)";
  ctx.lineWidth = Math.max(2, eventR * 0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, eventR * 2.6, eventR * 1.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Event horizon
  ctx.fillStyle = "rgba(0,0,0,0.92)";
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, eventR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(1, eventR * 0.18);
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, eventR * 1.05, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBall(ctx, ball) {
  const r = ball.r;

  // Trail
  if (ball.trail.length > 1) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, r * 0.6);
    ctx.beginPath();
    ctx.moveTo(ball.trail[0].x, ball.trail[0].y);
    for (let i = 1; i < ball.trail.length; i++) ctx.lineTo(ball.trail[i].x, ball.trail[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // Shaded sphere
  const g = ctx.createRadialGradient(ball.x - r * 0.3, ball.y - r * 0.3, r * 0.2, ball.x, ball.y, r);
  g.addColorStop(0, "rgba(255,255,255,0.98)");
  g.addColorStop(0.6, "rgba(220,230,255,0.82)");
  g.addColorStop(1, "rgba(120,130,160,0.55)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.stroke();
}

function drawAim(ctx, aim, ball) {
  if (!aim.active) return;

  // Aim line
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(210,240,255,0.65)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(aim.x, aim.y);
  ctx.stroke();
  ctx.restore();

  // Power bar near ball
  const p = clamp(aim.power, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 1;

  const w = 90;
  const h = 10;
  const bx = ball.x - w * 0.5;
  const by = ball.y + ball.r + 14;

  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(120,200,255,0.75)";
  ctx.beginPath();
  ctx.roundRect(bx, by, w * p, h, 6);
  ctx.fill();

  ctx.restore();
}

function drawTrajectory(ctx, pts) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 10]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

export function renderFrame(ctx, view, state, t) {
  const { planets, wormhole, blackhole, ball, aim, stars, trajPts, scale } = state;

  // Space background
  ctx.clearRect(0, 0, view.w, view.h);

  const bg = ctx.createLinearGradient(0, 0, view.w, view.h);
  bg.addColorStop(0, "rgba(7,9,18,1)");
  bg.addColorStop(0.6, "rgba(8,14,30,1)");
  bg.addColorStop(1, "rgba(6,8,16,1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, view.w, view.h);

  drawStars(ctx, view.w, view.h, stars, t);

  // Light direction (top-left-ish)
  const lightDir = norm(-0.7, -0.6);

  // Draw objects
  for (const p of planets) drawPlanet(ctx, p, lightDir, 1);

  if (blackhole) drawBlackHole(ctx, blackhole, t, 1);
  if (wormhole) drawWormhole(ctx, wormhole, t, 1);

  drawTrajectory(ctx, trajPts);
  drawAim(ctx, aim, ball);
  drawBall(ctx, ball);
}