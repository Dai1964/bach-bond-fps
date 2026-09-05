// ===== enemy.js =====
// Guard AI. States: PATROL -> ALERT (spots player, shouts, but — the joke —
// stands around "arriving in a minute" for ALERT_DELAY seconds) -> CHASE ->
// ATTACK. Guards are knocked out (permanently) by a Leek whack or a direct
// Throwing Dragon hit, or briefly DAZED by a Daffodil pollen cloud.

const Enemy = (() => {

  const SIGHT_RANGE = 14;
  const SIGHT_FOV = Math.PI / 3; // half-angle either side of facing
  const ALERT_DELAY = 30; // seconds of comic non-arrival, per the brief
  const CHASE_SPEED = 3.2;
  const PATROL_SPEED = 1.4;
  const ATTACK_RANGE = 4.5;
  const ATTACK_DAMAGE = 8;
  const ATTACK_INTERVAL = 1.1;
  const GIVEUP_TIME = 14;

  function buildGuardModel(scale = 1, uniformColor = 0x2e3a4d) {
    const g = new THREE.Group();
    const uniform = new THREE.MeshLambertMaterial({ color: uniformColor });
    const skin = new THREE.MeshLambertMaterial({ color: 0xdcb68a });
    const cap = new THREE.MeshLambertMaterial({ color: 0x1c2430 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), uniform);
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), skin);
    head.position.y = 1.55;
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), cap);
    hat.position.y = 1.72;

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), uniform);
    legL.position.set(-0.13, 0.3, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), uniform);
    armL.position.set(-0.32, 1.05, 0);
    const armR = armL.clone();
    armR.position.x = 0.32;

    g.add(body, head, hat, legL, legR, armL, armR);
    g.userData.legL = legL;
    g.userData.legR = legR;
    g.userData.hitFlashMats = [uniform, skin]; // flashed briefly on a non-lethal hit
    g.userData.hitFlashBaseColors = [uniform.color.getHex(), skin.color.getHex()];
    g.scale.setScalar(scale);
    return g;
  }

  // def can additionally carry: hp, sightRange, alertDelay, isBoss, scale,
  // uniformColor, linesSpot/linesArriving/linesDefeat (arrays overriding the
  // default Welsh phrase banks) — used by the rugby-clubhouse boss.
  function create(scene, def) {
    const mesh = buildGuardModel(def.scale || 1, def.uniformColor);
    mesh.position.set(def.x, 0, def.z);
    mesh.rotation.y = def.ry || 0;
    scene.add(mesh);

    const enemy = {
      type: 'guard', mesh,
      patrol: def.patrol && def.patrol.length ? def.patrol : [{ x: def.x, z: def.z }],
      patrolIndex: 0,
      state: 'PATROL',
      alertTimer: 0,
      attackCooldown: 0,
      giveupTimer: 0,
      dazeTimer: 0,
      staggerTimer: 0,
      koTimer: 0, // >0 (Infinity once truly KO'd) means "down, harmless"
      alive: true,
      walkT: Math.random() * 10,
      lastShout: 0,
      isBoss: !!def.isBoss,
      bossName: def.bossName,
      hp: def.hp || 1,
      maxHp: def.hp || 1,
      sightRange: def.sightRange || SIGHT_RANGE,
      alertDelay: def.alertDelay != null ? def.alertDelay : ALERT_DELAY,
      linesSpot: def.linesSpot || Welsh.spot,
      linesArriving: def.linesArriving || Welsh.arrivingLie,
      linesDefeat: def.linesDefeat || Welsh.defeatCry,
    };
    mesh.userData.entityRef = enemy;

    enemy.onHit = (source) => damage(enemy, source);
    enemy.daze = (dur) => {
      if (enemy.koTimer > 0) return;
      enemy.dazeTimer = Math.max(enemy.dazeTimer, dur);
      UI.subtitle(Utils.choice(['Whoa now!', 'Ych a fi, pollen!', "I can't see, mun!"]));
    };
    return enemy;
  }

  // Regular guards go down in one hit (hp defaults to 1); the boss has more
  // hp so leek/dragon hits stagger him a few times before he's actually KO'd.
  function damage(enemy, source) {
    if (enemy.koTimer > 0) return;
    enemy.hp--;
    if (enemy.hp <= 0) {
      knockOut(enemy, source);
    } else {
      enemy.staggerTimer = 0.5;
      enemy.mesh.rotation.x = -0.35; // knocked back — recovers in update()
      flashHit(enemy);
      Audio1.hurt();
      UI.subtitle(Utils.choice(['Duw, that stings!', "You'll have to do better than that!", 'Right, now you\'ve done it.']));
    }
  }

  // Briefly flash a non-lethally-hit guard's materials white, so a hit that
  // didn't finish him off is still visibly, unmistakably a hit — not silence.
  // Cancels any flash already in progress so rapid repeat hits can't leave
  // the guard stuck white (a second flash capturing "white" as its own
  // "original" color to revert to, once the first timeout already fired).
  function flashHit(enemy) {
    const mats = enemy.mesh.userData.hitFlashMats;
    const originals = enemy.mesh.userData.hitFlashBaseColors;
    if (!mats) return;
    if (enemy.flashTimeoutId) clearTimeout(enemy.flashTimeoutId);
    mats.forEach(m => m.color.setHex(0xffffff));
    enemy.flashTimeoutId = setTimeout(() => {
      mats.forEach((m, i) => m.color.setHex(originals[i]));
      enemy.flashTimeoutId = null;
    }, 120);
  }

  function knockOut(enemy, source) {
    if (enemy.koTimer > 0) return;
    enemy.koTimer = Infinity;
    enemy.alive = false;
    enemy.state = 'KO';
    Audio1.defeat();
    UI.subtitle(Utils.choice(enemy.linesDefeat));
    // comic flop
    enemy.mesh.rotation.x = Math.PI / 2;
    enemy.mesh.position.y = 0.15;
  }

  function hasLineOfSight(enemy, player, wallMeshes) {
    const from = enemy.mesh.position.clone();
    from.y = 1.5;
    const to = new THREE.Vector3(player.x, Player.EYE_HEIGHT, player.z);
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    if (dist > enemy.sightRange) return false;

    const facing = new THREE.Vector3(-Math.sin(enemy.mesh.rotation.y), 0, -Math.cos(enemy.mesh.rotation.y));
    const flatDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const angle = facing.angleTo(flatDir);
    if (angle > SIGHT_FOV && enemy.state === 'PATROL') return false; // must be in cone to *notice*

    if (wallMeshes.length) {
      const ray = new THREE.Raycaster(from, dir, 0, dist);
      const hits = ray.intersectObjects(wallMeshes, false);
      if (hits.length > 0) return false;
    }
    return true;
  }

  function update(enemy, dt, player, wallMeshes, colliders) {
    if (enemy.koTimer === Infinity) return; // permanently down

    if (enemy.dazeTimer > 0) {
      enemy.dazeTimer -= dt;
      return; // dazed guards don't act at all
    }
    if (enemy.staggerTimer > 0) {
      enemy.staggerTimer -= dt;
      if (enemy.staggerTimer <= 0) enemy.mesh.rotation.x = 0; // recover from the knockback tilt
      return; // boss reeling from a hit that didn't quite finish him
    }

    const seesPlayer = player.alive && hasLineOfSight(enemy, player, wallMeshes);

    switch (enemy.state) {
      case 'PATROL': {
        patrolMove(enemy, dt, colliders);
        if (seesPlayer) enterAlert(enemy);
        break;
      }
      case 'ALERT': {
        // Face the player but — per the joke — do not actually move yet.
        faceToward(enemy, player.x, player.z);
        enemy.alertTimer -= dt;
        enemy.lastShout -= dt;
        if (enemy.lastShout <= 0) {
          UI.subtitle(Utils.choice(enemy.linesArriving));
          enemy.lastShout = Utils.randRange(4, 6);
        }
        if (enemy.alertTimer <= 0) {
          enemy.state = 'CHASE';
          enemy.giveupTimer = GIVEUP_TIME;
        }
        break;
      }
      case 'CHASE': {
        const d = Utils.dist2D(enemy.mesh.position.x, enemy.mesh.position.z, player.x, player.z);
        if (d < ATTACK_RANGE) {
          enemy.state = 'ATTACK';
          break;
        }
        moveToward(enemy, player.x, player.z, CHASE_SPEED, dt, colliders);
        enemy.giveupTimer -= dt;
        if (!seesPlayer) {
          enemy.giveupTimer -= dt;
        } else {
          enemy.giveupTimer = GIVEUP_TIME;
        }
        if (enemy.giveupTimer <= 0) enemy.state = 'PATROL';
        break;
      }
      case 'ATTACK': {
        faceToward(enemy, player.x, player.z);
        const d = Utils.dist2D(enemy.mesh.position.x, enemy.mesh.position.z, player.x, player.z);
        if (d > ATTACK_RANGE * 1.2) { enemy.state = 'CHASE'; break; }
        enemy.attackCooldown -= dt;
        if (enemy.attackCooldown <= 0 && seesPlayer) {
          enemy.attackCooldown = ATTACK_INTERVAL;
          Player.takeDamage(player, ATTACK_DAMAGE, UI);
        }
        break;
      }
    }

    animateWalk(enemy, dt);
  }

  function enterAlert(enemy) {
    enemy.state = 'ALERT';
    enemy.alertTimer = enemy.alertDelay;
    enemy.lastShout = 0.1;
    Audio1.alarm();
    UI.subtitle(Utils.choice(enemy.linesSpot));
  }

  function faceToward(enemy, x, z) {
    const dx = x - enemy.mesh.position.x;
    const dz = z - enemy.mesh.position.z;
    enemy.mesh.rotation.y = Math.atan2(dx, dz);
  }

  function moveToward(enemy, x, z, speed, dt, colliders) {
    const dx = x - enemy.mesh.position.x;
    const dz = z - enemy.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const nx = enemy.mesh.position.x + (dx / d) * speed * dt;
    const nz = enemy.mesh.position.z + (dz / d) * speed * dt;
    if (!blockedByColliders(nx, nz, colliders)) {
      enemy.mesh.position.x = nx;
      enemy.mesh.position.z = nz;
    }
    enemy.mesh.rotation.y = Math.atan2(dx, dz);
  }

  function patrolMove(enemy, dt, colliders) {
    const wp = enemy.patrol[enemy.patrolIndex];
    const d = Utils.dist2D(enemy.mesh.position.x, enemy.mesh.position.z, wp.x, wp.z);
    if (d < 0.3) {
      enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
      return;
    }
    moveToward(enemy, wp.x, wp.z, PATROL_SPEED, dt, colliders);
  }

  function blockedByColliders(x, z, colliders) {
    for (const c of colliders) {
      if (x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) return true;
    }
    return false;
  }

  function animateWalk(enemy, dt) {
    const moving = enemy.state === 'PATROL' || enemy.state === 'CHASE';
    enemy.walkT += dt * (moving ? 6 : 1);
    const swing = moving ? Math.sin(enemy.walkT) * 0.4 : 0;
    if (enemy.mesh.userData.legL) enemy.mesh.userData.legL.rotation.x = swing;
    if (enemy.mesh.userData.legR) enemy.mesh.userData.legR.rotation.x = -swing;
  }

  function collider(enemy) {
    const p = enemy.mesh.position;
    const r = 0.35;
    return { minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r };
  }

  return { create, update, collider, SIGHT_RANGE };
})();
