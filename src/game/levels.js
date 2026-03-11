// src/game/levels.js

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const THEMES = ["gasRing", "azureRing", "emerald", "violet", "lava", "ice", "sand"];

export const HANDMADE = [
  {
    name: "Warm Orbit",
    start: { x: 0.16, y: 0.62 },
    wormhole: { x: 0.86, y: 0.36, r: 0.036 },
    blackhole: { x: 0.52, y: 0.20, eventR: 0.016, pullR: 0.14 },
    planets: [
      { x: 0.52, y: 0.50, r: 0.085, mass: 420, theme: "azureRing" },
      { x: 0.30, y: 0.30, r: 0.055, mass: 220, theme: "lava" },
    ],
  },
  {
    name: "Twin Pull",
    start: { x: 0.16, y: 0.50 },
    wormhole: { x: 0.86, y: 0.52, r: 0.034 },
    blackhole: { x: 0.50, y: 0.84, eventR: 0.015, pullR: 0.12 },
    planets: [
      { x: 0.50, y: 0.36, r: 0.070, mass: 380, theme: "emerald" },
      { x: 0.50, y: 0.66, r: 0.070, mass: 380, theme: "violet" },
    ],
  },
  {
    name: "Slingshot Alley",
    start: { x: 0.20, y: 0.78 },
    wormhole: { x: 0.80, y: 0.22, r: 0.033 },
    blackhole: { x: 0.50, y: 0.50, eventR: 0.014, pullR: 0.16 },
    planets: [
      { x: 0.36, y: 0.46, r: 0.060, mass: 340, theme: "ice" },
      { x: 0.64, y: 0.54, r: 0.060, mass: 340, theme: "sand" },
    ],
  },
];

function generateProceduralLevel(levelIndex) {
  // Deterministic per level index
  const seed = 1337 + levelIndex * 99991;
  const rnd = mulberry32(seed);

  // Difficulty ramps slowly
  const d = clamp((levelIndex - HANDMADE.length) / 12, 0, 1);

  const name = `Sector ${levelIndex + 1}`;

  // Wormhole smaller as difficulty rises, but never tiny
  const wormR = clamp(0.036 - d * 0.010, 0.024, 0.036);

  // Planet count ramps
  const planetCount = Math.floor(2 + d * 3); // 2..5

  // Start and wormhole placed on opposite sides, randomized
  const start = { x: 0.14, y: clamp(0.25 + rnd() * 0.55, 0.18, 0.82) };
  const wormhole = {
    x: 0.86,
    y: clamp(0.20 + rnd() * 0.60, 0.18, 0.82),
    r: wormR,
  };

  // Optional black hole, more likely later
  const blackChance = 0.20 + d * 0.22;
  const hasBlack = rnd() < blackChance;

  const blackhole = hasBlack
    ? {
        x: clamp(0.35 + rnd() * 0.30, 0.30, 0.70),
        y: clamp(0.18 + rnd() * 0.64, 0.20, 0.80),
        eventR: clamp(0.015 - d * 0.004, 0.010, 0.015),
        pullR: clamp(0.13 + d * 0.08, 0.13, 0.21),
      }
    : null;

  // Place planets with minimum spacing to avoid clutter
  const planets = [];
  const minSep = 0.17; // normalized separation between planet centers
  const tries = 200;

  function validPos(p) {
    const pad = 0.10;
    if (p.x < pad || p.x > 1 - pad || p.y < pad || p.y > 1 - pad) return false;
    if (dist(p, start) < 0.18) return false;
    if (dist(p, wormhole) < 0.18) return false;
    if (blackhole && dist(p, blackhole) < 0.20) return false;
    for (const q of planets) if (dist(p, q) < minSep) return false;
    return true;
  }

  for (let i = 0; i < tries && planets.length < planetCount; i++) {
    const r = clamp(0.050 + rnd() * 0.055, 0.050, 0.105);
    const mass = Math.floor(220 + rnd() * (260 + d * 220)); // heavier later
    const p = {
      x: 0.24 + rnd() * 0.52,
      y: 0.18 + rnd() * 0.64,
      r,
      mass,
      theme: pick(rnd, THEMES),
    };
    if (validPos(p)) planets.push(p);
  }

  // If placement failed, fallback to simple layout
  if (planets.length < 2) {
    planets.length = 0;
    planets.push({ x: 0.50, y: 0.50, r: 0.085, mass: 420, theme: "azureRing" });
    planets.push({ x: 0.34, y: 0.30, r: 0.055, mass: 240, theme: "lava" });
  }

  return { name, start, wormhole, blackhole, planets };
}

export function getLevel(levelIndex) {
  if (levelIndex < HANDMADE.length) return HANDMADE[levelIndex];
  return generateProceduralLevel(levelIndex);
}