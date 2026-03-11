// src/game/engine.js
import { getLevel } from "./levels.js";
import { clamp, dist, len, norm } from "./physics.js";
import { renderFrame } from "./render.js";

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createGravityGolfEngine(canvas, callbacks) {
  const ctx = canvas.getContext("2d", { alpha: true });

  const cb = {
    onHud: callbacks?.onHud ?? (() => {}),
    onMessage: callbacks?.onMessage ?? (() => {}),
    onWin: callbacks?.onWin ?? (() => {}),
  };

  const view = { w: 0, h: 0 };
  let dpr = 1;

  // Core physics
  const G = 190;            // overall gravity strength (mild)
  const SOFT = 300;         // softening to avoid close-range spikes
  const MAX_V = 1850;
  const REST = 0.58;

  // Shots
  const SHOT_SPEED = 1200;  // slingshot speed (fast again)
  const MAX_DRAG = 0.24;    // drag distance fraction of min(view)

  // Stop and re-shoot behavior
  const STOP_V = 26;        // below this considered "slow"
  const STOP_HOLD = 0.14;   // seconds under STOP_V to snap stop
  const CAPTURE_V = 95;     // must be slow to enter wormhole
const WORMHOLE_CORE_FACTOR = 0.72; // matches render core size (black center)
  // Gravity only works close to planets
  const PLANET_INNER = 1.10;     // radii where gravity is full
  const PLANET_OUTER = 2.35;     // radii where gravity fades to 0
  const PLANET_MASS_SCALE = 0.14;

  // Orbit assist (makes the vibe): only close, but strong enough to show circles
  const ORBIT_MIN_SPEED = 30;
  const ORBIT_MAX_SPEED = 2000;
  const ORBIT_INNER = 1.12;
  const ORBIT_OUTER = 3.05;

  // Black hole: only meaningful when close
  const BH_OUTER_SCALE = 0.42;   // fraction of pullR used for gravity
  const BH_MASS_SCALE = 0.18;

  // Drag profile: low when fast, high when slow so ball stops
  function applySpeedDrag(dt, nearAny) {
    const v = len(ball.vx, ball.vy);

    // Low drag at high speed so shots keep punchy
    // High drag at low speed so it settles and you can shoot again
    let rate;
    if (v > 700) rate = 0.14;
    else if (v > 420) rate = 0.26;
    else if (v > 220) rate = 0.55;
    else if (v > 110) rate = 1.15;
    else rate = nearAny ? 1.65 : 2.65;

    const k = Math.exp(-dt * rate);
    ball.vx *= k;
    ball.vy *= k;
  }

  let raf = 0;
  let running = false;

  let levelIndex = 0;
  let levelName = "Sector 1";
  let strokes = 0;
  let completed = false;
  let usedBlackHole = false;

  const ball = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 10,
    trail: [],
  };

  const aim = {
    active: false,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    power: 0,
  };

  let planets = [];
  let wormhole = null;
  let blackhole = null;

  const stars = Array.from({ length: 180 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.6,
    tw: Math.random() * 10,
  }));

  let trajPts = [];
  let portalLockMs = 0;
  let lastHudTs = 0;

  let stillTime = 0;

  function resize() {
    dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();

    view.w = Math.max(1, Math.floor(rect.width));
    view.h = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ball.r = clamp(Math.min(view.w, view.h) * 0.012, 8, 12);
    loadLevel(levelIndex);
  }

  function toPxX(nx) { return nx * view.w; }
  function toPxY(ny) { return ny * view.h; }
  function toPxR(nr) { return nr * Math.min(view.w, view.h); }

  function loadLevel(i) {
    levelIndex = Math.max(0, i);
    completed = false;
    stillTime = 0;

    const L = getLevel(levelIndex);
    levelName = L.name || `Sector ${levelIndex + 1}`;

    ball.x = toPxX(L.start.x);
    ball.y = toPxY(L.start.y);
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];

    planets = (L.planets || []).map((p) => ({
      x: toPxX(p.x),
      y: toPxY(p.y),
      r: toPxR(p.r),
      mass: p.mass,
      theme: p.theme,
    }));

    wormhole = L.wormhole
      ? { x: toPxX(L.wormhole.x), y: toPxY(L.wormhole.y), r: toPxR(L.wormhole.r) }
      : null;

    blackhole = L.blackhole
      ? {
          x: toPxX(L.blackhole.x),
          y: toPxY(L.blackhole.y),
          eventR: toPxR(L.blackhole.eventR),
          pullR: toPxR(L.blackhole.pullR),
          mass: 1400,
        }
      : null;

    aim.active = false;
    trajPts = [];

    pushHud(true);
    cb.onMessage("Drag to aim, release to shoot. Planets only affect you close-up. Orbit works again. Ball stops after shots.");
  }

  function pushHud(force = false) {
    const t = performance.now();
    if (!force && t - lastHudTs < 120) return;
    lastHudTs = t;

    const canShoot = len(ball.vx, ball.vy) < STOP_V && !completed;
    cb.onHud({
      levelIndex,
      levelName,
      strokes,
      canShoot,
      completed,
      usedBlackHole,
    });
  }

  function resetShot() {
    const L = getLevel(levelIndex);
    ball.x = toPxX(L.start.x);
    ball.y = toPxY(L.start.y);
    ball.vx = 0;
    ball.vy = 0;
    ball.trail = [];
    aim.active = false;
    trajPts = [];
    completed = false;
    stillTime = 0;
    pushHud(true);
    cb.onMessage("Shot reset.");
  }

  function restartLevel() {
    strokes = 0;
    usedBlackHole = false;
    loadLevel(levelIndex);
    cb.onMessage("Level restarted.");
  }

  function nextLevel() {
    strokes = 0;
    usedBlackHole = false;
    loadLevel(levelIndex + 1);
  }

  function skipLevel() {
    usedBlackHole = true;
    strokes = 0;
    loadLevel(levelIndex + 2);
    cb.onMessage("Black hole warp! You skipped a level.");
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function canShootNow() {
    return len(ball.vx, ball.vy) < STOP_V && !completed;
  }

  function influenceWeight(d, inner, outer) {
    if (d <= inner) return 1;
    if (d >= outer) return 0;
    return 1 - smoothstep(inner, outer, d);
  }

  function gravityAccelTo(x, y, massEff, innerR, outerR) {
    const dx = x - ball.x;
    const dy = y - ball.y;
    const d = Math.hypot(dx, dy);

    const w = influenceWeight(d, innerR, outerR);
    if (w <= 0) return { ax: 0, ay: 0, near: false, w: 0, d };

    const r2 = dx * dx + dy * dy + SOFT;
    const inv = 1 / Math.sqrt(r2);
    const f = (G * massEff * w) / r2;

    return { ax: dx * inv * f, ay: dy * inv * f, near: true, w, d };
  }

  function buildTrajectoryPreview(vx, vy) {
    const steps = 92;
    const dt = 1 / 60;

    let x = ball.x;
    let y = ball.y;
    let svx = vx;
    let svy = vy;

    const pts = [];

    for (let i = 0; i < steps; i++) {
      let ax = 0;
      let ay = 0;
      let nearAny = false;

      for (const p of planets) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.hypot(dx, dy);

        const inner = p.r * PLANET_INNER;
        const outer = p.r * PLANET_OUTER;
        const w = influenceWeight(d, inner, outer);
        if (w <= 0) continue;

        nearAny = true;

        const r2 = dx * dx + dy * dy + SOFT;
        const inv = 1 / Math.sqrt(r2);
        const massEff = p.mass * PLANET_MASS_SCALE;
        const f = (G * massEff * w) / r2;

        ax += dx * inv * f;
        ay += dy * inv * f;
      }

      if (blackhole) {
        const dx = blackhole.x - x;
        const dy = blackhole.y - y;
        const d = Math.hypot(dx, dy);

        const inner = blackhole.eventR * 1.15;
        const outer = blackhole.pullR * BH_OUTER_SCALE;
        const w = influenceWeight(d, inner, outer);
        if (w > 0) {
          nearAny = true;
          const r2 = dx * dx + dy * dy + SOFT * 0.9;
          const inv = 1 / Math.sqrt(r2);
          const massEff = blackhole.mass * BH_MASS_SCALE;
          const f = (G * massEff * w) / r2;
          ax += dx * inv * f;
          ay += dy * inv * f;
        }
      }

      // apply same drag profile logic in preview (approx)
      const v = Math.hypot(svx, svy);
      let rate;
      if (v > 700) rate = 0.14;
      else if (v > 420) rate = 0.26;
      else if (v > 220) rate = 0.55;
      else if (v > 110) rate = 1.15;
      else rate = nearAny ? 1.65 : 2.65;

      const drag = Math.exp(-dt * rate);

      svx = (svx + ax * dt) * drag;
      svy = (svy + ay * dt) * drag;

      x += svx * dt;
      y += svy * dt;

      if (i % 3 === 0) pts.push({ x, y });
      if (x < -60 || y < -60 || x > view.w + 60 || y > view.h + 60) break;
    }

    trajPts = pts;
  }

  function onPointerDown(e) {
    if (e.cancelable) e.preventDefault();
    if (!canShootNow()) return;

    const p = pointerPos(e);
    aim.active = true;
    aim.startX = p.x;
    aim.startY = p.y;
    aim.x = p.x;
    aim.y = p.y;
    aim.power = 0;
    trajPts = [];
  }

  function onPointerMove(e) {
    if (!aim.active) return;

    const p = pointerPos(e);
    aim.x = p.x;
    aim.y = p.y;

    const dx = aim.startX - aim.x;
    const dy = aim.startY - aim.y;
    const d = Math.hypot(dx, dy);

    const maxDrag = Math.min(view.w, view.h) * MAX_DRAG;
    aim.power = clamp(d / maxDrag, 0, 1);

    const n = norm(dx, dy);
    const shotSpeed = SHOT_SPEED * aim.power;
    buildTrajectoryPreview(n.x * shotSpeed, n.y * shotSpeed);
  }

  function onPointerUp() {
    if (!aim.active) return;
    aim.active = false;

    const dx = aim.startX - aim.x;
    const dy = aim.startY - aim.y;
    const n = norm(dx, dy);

    const shotSpeed = SHOT_SPEED * clamp(aim.power, 0, 1);

    ball.vx = n.x * shotSpeed;
    ball.vy = n.y * shotSpeed;

    strokes += 1;
    trajPts = [];
    stillTime = 0;

    pushHud(true);
  }

  function applyGravityAndOrbit(dt) {
    let ax = 0;
    let ay = 0;
    let nearAny = false;

    // PLANETS close gravity
    for (const p of planets) {
      const g = gravityAccelTo(
        p.x,
        p.y,
        p.mass * PLANET_MASS_SCALE,
        p.r * PLANET_INNER,
        p.r * PLANET_OUTER
      );
      ax += g.ax;
      ay += g.ay;
      if (g.near) nearAny = true;
    }

    // BLACK HOLE close gravity
    if (blackhole) {
      const g = gravityAccelTo(
        blackhole.x,
        blackhole.y,
        blackhole.mass * BH_MASS_SCALE,
        blackhole.eventR * 1.15,
        blackhole.pullR * BH_OUTER_SCALE
      );
      ax += g.ax;
      ay += g.ay;
      if (g.near) nearAny = true;
    }

    // Wormhole: no suction

    ball.vx += ax * dt;
    ball.vy += ay * dt;

    // Orbit assist: near planets only, makes circular motion visible
    const speed = len(ball.vx, ball.vy);
    if (speed >= ORBIT_MIN_SPEED && speed <= ORBIT_MAX_SPEED) {
      let best = null;
      let bestK = 0;

      for (const p of planets) {
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const d = Math.hypot(dx, dy);

        const inner = p.r * ORBIT_INNER;
        const outer = p.r * ORBIT_OUTER;
        if (d <= inner || d >= outer) continue;

        const k = influenceWeight(d, inner, outer);
        if (k > bestK) {
          bestK = k;
          best = { p, d, dx, dy, k };
        }
      }

      if (best && best.k > 0.001) {
        const p = best.p;
        const d = best.d;

        const rN = norm(best.dx, best.dy);
        const cross = best.dx * ball.vy - best.dy * ball.vx;
        const sign = cross >= 0 ? 1 : -1;
        const tang = { x: -rN.y * sign, y: rN.x * sign };

        const mu = G * (p.mass * PLANET_MASS_SCALE);

        // Make orbit speed visible and stable
        let vIdeal = Math.sqrt(mu / (d + SOFT * 0.30));
        vIdeal = clamp(vIdeal * 1.35, 140, 1350);

        const strength = best.k;

        // Stronger blend so you actually see orbit when close
        const blend = (1 - Math.exp(-dt * (5.2 + 12.0 * strength))) * 0.85;

        const targetVx = tang.x * vIdeal;
        const targetVy = tang.y * vIdeal;

        ball.vx += (targetVx - ball.vx) * blend;
        ball.vy += (targetVy - ball.vy) * blend;

        // Reduce radial drift so it circles instead of spiraling forever
        const radialSpeed = ball.vx * rN.x + ball.vy * rN.y;
        ball.vx -= rN.x * radialSpeed * blend * 0.45;
        ball.vy -= rN.y * radialSpeed * blend * 0.45;

        nearAny = true;
      }
    }

    return nearAny;
  }

  function collidePlanets() {
    for (const p of planets) {
      const d = dist(ball.x, ball.y, p.x, p.y);
      const minD = ball.r + p.r;

      if (d < minD) {
        const nx = (ball.x - p.x) / (d || 1);
        const ny = (ball.y - p.y) / (d || 1);

        const push = (minD - d) + 0.5;
        ball.x += nx * push;
        ball.y += ny * push;

        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= (1 + REST) * vn * nx;
          ball.vy -= (1 + REST) * vn * ny;
          ball.vx *= 0.98;
          ball.vy *= 0.98;
        }
      }
    }
  }

function portalChecks(now) {
  if (now < portalLockMs) return;

  if (wormhole) {
    const d = dist(ball.x, ball.y, wormhole.x, wormhole.y);

    // Instant capture if you touch the black core, even if flying fast
    if (d < wormhole.r * WORMHOLE_CORE_FACTOR) {
      completed = true;
      ball.vx = 0;
      ball.vy = 0;
      stillTime = 0;

      pushHud(true);
      cb.onMessage("Wormhole core captured. Level complete.");
      cb.onWin();

      portalLockMs = now + 1200;
      return;
    }

    // Optional: still allow “slow sink” near the rim (your old behavior)
    const v = len(ball.vx, ball.vy);
    if (d < wormhole.r * 0.92 && v < CAPTURE_V) {
      completed = true;
      ball.vx = 0;
      ball.vy = 0;
      stillTime = 0;

      pushHud(true);
      cb.onMessage("Wormhole captured. Level complete.");
      cb.onWin();

      portalLockMs = now + 1200;
      return;
    }
  }

  if (blackhole && !usedBlackHole) {
    const d = dist(ball.x, ball.y, blackhole.x, blackhole.y);
    if (d < blackhole.eventR) {
      portalLockMs = now + 1200;
      skipLevel();
    }
  }
}

  function step(ts) {
    if (!running) return;

    if (!step.last) step.last = ts;
    const dtRaw = (ts - step.last) / 1000;
    const dt = clamp(dtRaw, 0, 0.02);
    step.last = ts;

    if (!completed) {
      const nearAny = applyGravityAndOrbit(dt);

      const v = len(ball.vx, ball.vy);
      if (v > MAX_V) {
        const n = norm(ball.vx, ball.vy);
        ball.vx = n.x * MAX_V;
        ball.vy = n.y * MAX_V;
      }

      applySpeedDrag(dt, nearAny);

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      collidePlanets();

      // Snap-stop so each shot ends
      const v2 = len(ball.vx, ball.vy);
      if (v2 < STOP_V) stillTime += dt;
      else stillTime = 0;

      if (stillTime > STOP_HOLD) {
        ball.vx = 0;
        ball.vy = 0;
        stillTime = 0;
      }

      const pad = 90;
      if (ball.x < -pad || ball.y < -pad || ball.x > view.w + pad || ball.y > view.h + pad) {
        resetShot();
        cb.onMessage("Lost in space. Shot reset.");
      }

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 28) ball.trail.shift();

      portalChecks(ts);
    }

    pushHud(false);
    renderFrame(
      ctx,
      view,
      { planets, wormhole, blackhole, ball, aim, stars, trajPts, scale: 1 },
      ts
    );

    raf = requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;

    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    canvas.addEventListener("pointercancel", onPointerUp, { passive: true });

    loadLevel(levelIndex);
    raf = requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);

    window.removeEventListener("resize", resize);

    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  return {
    start,
    stop,
    resetShot,
    restartLevel,
    nextLevel,
  };
}