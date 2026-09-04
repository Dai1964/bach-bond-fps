// ===== player.js =====
// First-person controller: pointer-lock mouse look + WASD movement,
// simple circle-vs-AABB collision against the level's collider list,
// plus health/armour state and an optional N64-style "tank controls"
// toggle (no mouse look — turn with A/D like the original pad).

const Player = (() => {

  const EYE_HEIGHT = 1.7;
  const RADIUS = 0.4;
  const BASE_SPEED = 6.0; // units/sec
  const SPRINT_MULT = 1.5;
  const TURN_SPEED = 2.4; // rad/sec, used only in analog/tank mode

  function create(camera) {
    return {
      camera,
      x: 0, z: 0, y: EYE_HEIGHT,
      yaw: 0, pitch: 0,
      health: 100, maxHealth: 100,
      armour: 0, maxArmour: 100,
      analogMode: false, // N64-style toggle (see toggleAnalogMode)
      shieldCharges: 0,  // "Local ale" one-hit shield
      drunkTimer: 0,     // >0 while singing/blurred debuff active
      slowmoTimer: 0,    // Brains S.A. buff
      nightVisionTimer: 0, // Pint of Dark buff
      cuppaUsedThisLevel: false,
      stepTimer: 0,
      alive: true,
      _keys: {},
    };
  }

  function setSpawn(p, spawn) {
    p.x = spawn.x;
    p.z = spawn.z;
    p.yaw = spawn.ry || 0;
    p.pitch = 0;
    p.y = EYE_HEIGHT;
  }

  function toggleAnalogMode(p) {
    p.analogMode = !p.analogMode;
    return p.analogMode;
  }

  function onMouseMove(p, dx, dy) {
    if (p.analogMode) return; // mouse look disabled in tank-control mode
    const sens = 0.0022;
    p.yaw -= dx * sens;
    p.pitch -= dy * sens;
    p.pitch = Utils.clamp(p.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  // Resolve player movement against axis-aligned box colliders using a
  // simple push-out (treat player as a circle of radius RADIUS).
  function collideAndSlide(p, nx, nz, colliders) {
    let x = nx, z = nz;
    for (const c of colliders) {
      const closestX = Utils.clamp(x, c.minX, c.maxX);
      const closestZ = Utils.clamp(z, c.minZ, c.maxZ);
      const dx = x - closestX, dz = z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < RADIUS * RADIUS && distSq > 1e-8) {
        const d = Math.sqrt(distSq);
        const push = (RADIUS - d);
        x += (dx / d) * push;
        z += (dz / d) * push;
      } else if (distSq <= 1e-8) {
        // Dead-center overlap (rare) — push along the shortest exit axis.
        x += RADIUS;
      }
    }
    return { x, z };
  }

  function update(p, dt, colliders, otherEntitiesAsColliders) {
    if (!p.alive) return;

    // timers
    if (p.drunkTimer > 0) p.drunkTimer -= dt;
    if (p.slowmoTimer > 0) p.slowmoTimer -= dt;
    if (p.nightVisionTimer > 0) p.nightVisionTimer -= dt;

    const keys = p._keys;
    if (p.analogMode) {
      if (keys['KeyA']) p.yaw += TURN_SPEED * dt;
      if (keys['KeyD']) p.yaw -= TURN_SPEED * dt;
    }

    const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const strafe = p.analogMode ? 0 : (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const sprinting = !!keys['ShiftLeft'] || !!keys['ShiftRight'];

    let speed = BASE_SPEED * (sprinting ? SPRINT_MULT : 1);
    if (p.drunkTimer > 0) speed *= 0.6; // stumbling

    const sinY = Math.sin(p.yaw), cosY = Math.cos(p.yaw);
    // Forward vector (camera looks down -Z at yaw 0 in our convention)
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;

    let mx = fx * forward + rx * strafe;
    let mz = fz * forward + rz * strafe;
    const mlen = Math.hypot(mx, mz);
    if (mlen > 0) { mx /= mlen; mz /= mlen; }

    let nx = p.x + mx * speed * dt;
    let nz = p.z + mz * speed * dt;

    const allColliders = otherEntitiesAsColliders ? colliders.concat(otherEntitiesAsColliders) : colliders;
    const resolved = collideAndSlide(p, nx, nz, allColliders);
    const moved = Math.hypot(resolved.x - p.x, resolved.z - p.z) > 0.001;
    p.x = resolved.x;
    p.z = resolved.z;

    if (moved && mlen > 0) {
      p.stepTimer -= dt;
      if (p.stepTimer <= 0) {
        Audio1.step();
        p.stepTimer = sprinting ? 0.28 : 0.42;
      }
    }

    // Apply to camera
    p.camera.position.set(p.x, p.y, p.z);
    p.camera.rotation.set(0, 0, 0);
    p.camera.rotateY(p.yaw);
    p.camera.rotateX(p.pitch);
  }

  function takeDamage(p, amount, ui) {
    if (!p.alive) return;
    if (p.shieldCharges > 0) {
      p.shieldCharges--;
      UI.subtitle("That'll do you now, mind.");
      UI.flashDamage(0.15);
      return;
    }
    let remaining = amount;
    if (p.armour > 0) {
      const absorbed = Math.min(p.armour, remaining);
      p.armour -= absorbed;
      remaining -= absorbed;
    }
    p.health -= remaining;
    Audio1.hurt();
    UI.flashDamage(1);
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
    }
  }

  function heal(p, amount) {
    p.health = Utils.clamp(p.health + amount, 0, p.maxHealth);
  }

  function giveArmour(p, amount) {
    p.armour = Utils.clamp(p.armour + amount, 0, p.maxArmour);
  }

  function cuppa(p) {
    if (p.cuppaUsedThisLevel) return false;
    p.health = p.maxHealth;
    p.cuppaUsedThisLevel = true;
    return true;
  }

  return {
    EYE_HEIGHT, RADIUS,
    create, setSpawn, toggleAnalogMode, onMouseMove, update,
    takeDamage, heal, giveArmour, cuppa,
  };
})();
