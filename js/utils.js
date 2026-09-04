// ===== utils.js =====
// Small shared helpers used across every module. Load first.

const Utils = (() => {

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function dist2D(ax, az, bx, bz) {
    const dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Simple seeded-ish id generator for save data / entity ids.
  let idCounter = 1;
  function nextId() {
    return idCounter++;
  }

  // Low-poly "pixelated" look: nearest-filter canvas textures generated at runtime,
  // so we don't need any external art assets.
  function makeCheckerTexture(colorA, colorB, size = 8) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size * 2;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
        ctx.fillRect(x * size, y * size, size, size);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function makeSolidTexture(color) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 4, 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  return {
    clamp, lerp, randRange, choice, dist2D, nextId,
    makeCheckerTexture, makeSolidTexture,
  };
})();

// ===== Welsh phrase banks (satire, used for subtitles / shouts) =====
const Welsh = {
  spot: [
    "Yma rwan!", // "Here now!" (alarm cry)
    "Oi, who's coat is this jacket?!",
    "Now in a minute, you're nicked!",
    "Whose shoes are them socks — INTRUDER!",
  ],
  arrivingLie: [
    "I'll be there in a minute!",
    "Hang on, kettle's just boiled!",
    "Now in a minute, mun!",
    "Over by there — I'm coming, mind!",
  ],
  defeatCry: ["Tidy.", "Mamgu!", "Lush.", "Duw duw.", "Cracking.", "There's lovely."],
  idle: [
    "There are only two houses on my street... I live in the middle one.",
    "Who's coat is this jacket?",
    "Been to Barry Island, me. Never again.",
    "Our Ken's sheep's gone missing again.",
    "Ych a fi, it's mizzling again.",
  ],
  persuade: [
    "Duw duw, come by 'ere now.",
    "There's lovely, isn't it.",
    "Now in a minute, love.",
    "Tidy, that is.",
    "Come on now, cwtch up.",
    "Whose shoes are them socks, silly.",
    "Not now in a minute, THIS minute.",
    "Lush, that.",
  ],
  drunkSing: "HEN WLAD FY NHADAU... (singing at the top of his lungs)",
};
