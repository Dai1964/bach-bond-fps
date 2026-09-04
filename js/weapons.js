// ===== weapons.js =====
// The only three weapons in the game: Leeks (melee), Throwing Dragons
// (bouncing KO projectile) and Daffodils (pollen-cloud daze projectile).
// Viewmodels are simple low-poly primitives built at runtime — no external
// art assets needed, keeping with the N64 greybox aesthetic.

const Weapons = (() => {

  const NAMES = ['LEEKS', 'THROWING DRAGONS', 'DAFFODILS'];
  const THROW_SPEED = 16;
  const GRAVITY = -18;

  function buildLeekModel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x9fd66b });
    const bulbMat = new THREE.MeshLambertMaterial({ color: 0xf3f1e6 });
    function oneLeek(xOff) {
      const leek = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.55, 6), mat);
      stalk.position.set(0, 0.15, 0);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), bulbMat);
      bulb.position.set(0, -0.28, 0);
      leek.add(stalk, bulb);
      leek.position.set(xOff, -0.32, -0.55);
      leek.rotation.z = xOff < 0 ? 0.3 : -0.3;
      leek.rotation.x = 0.5;
      return leek;
    }
    const left = oneLeek(-0.28);
    const right = oneLeek(0.28);
    right.visible = false; // shown only in dual-wield mode
    g.add(left, right);
    g.userData.left = left;
    g.userData.right = right;
    return g;
  }

  function buildDragonModel() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc8102e });
    const bellyMat = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bodyMat);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bellyMat);
    belly.position.set(0, -0.04, 0.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bodyMat);
    head.position.set(0, 0.08, 0.18);
    g.add(body, belly, head);
    g.position.set(0.3, -0.35, -0.5);
    return g;
  }

  function buildDaffodilModel() {
    const g = new THREE.Group();
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x3c8a3c });
    const petalMat = new THREE.MeshLambertMaterial({ color: 0xf5d33c });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6), stemMat);
    const flower = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 6), petalMat);
    flower.position.set(0, 0.25, 0);
    flower.rotation.x = Math.PI;
    g.add(stem, flower);
    g.position.set(0.28, -0.3, -0.5);
    g.rotation.x = 0.3;
    return g;
  }

  function create(camera) {
    const viewRig = new THREE.Group();
    camera.add(viewRig);

    const models = [buildLeekModel(), buildDragonModel(), buildDaffodilModel()];
    models.forEach((m, i) => { m.visible = i === 0; viewRig.add(m); });

    return {
      camera, viewRig, models,
      currentIndex: 0,
      dualLeek: false,
      cooldown: 0,
      ammo: { dragon: 8, daffodil: 8 },
      projectiles: [], // active thrown items in the world
      pollenClouds: [], // active daze zones
      bobT: 0,
    };
  }

  function currentName(w) {
    return NAMES[w.currentIndex];
  }

  function switchTo(w, index) {
    if (index < 0 || index > 2) return;
    w.models[w.currentIndex].visible = false;
    w.currentIndex = index;
    w.models[index].visible = true;
    Audio1.blip();
  }

  function toggleDualLeek(w) {
    w.dualLeek = !w.dualLeek;
    const leekModel = w.models[0];
    leekModel.userData.right.visible = w.dualLeek;
    return w.dualLeek;
  }

  // ---- viewmodel bob/sway, purely cosmetic ----
  function updateViewmodel(w, dt, isMoving) {
    if (w.cooldown > 0) w.cooldown -= dt;
    w.bobT += dt * (isMoving ? 8 : 2);
    const model = w.models[w.currentIndex];
    const bobY = Math.sin(w.bobT) * (isMoving ? 0.015 : 0.004);
    const bobX = Math.cos(w.bobT * 0.5) * (isMoving ? 0.01 : 0.002);
    model.position.x = bobX;
    model.position.y = bobY;
  }

  // Raycast-based melee swing for the Leeks.
  function meleeAttack(w, camera, hittables) {
    if (w.cooldown > 0) return null;
    w.cooldown = w.dualLeek ? 0.28 : 0.45;
    Audio1.leekWhack();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = 2.4;
    const meshes = hittables.map(h => h.mesh).filter(Boolean);
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length > 0) {
      const hitMesh = findEntityMesh(hits[0].object);
      const entity = hitMesh && hitMesh.userData.entityRef;
      if (entity) return entity;
    }
    return null;
  }

  function findEntityMesh(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData && cur.userData.entityRef) return cur;
      cur = cur.parent;
    }
    return null;
  }

  function throwCurrent(w, scene, camera) {
    const kind = w.currentIndex === 1 ? 'dragon' : w.currentIndex === 2 ? 'daffodil' : null;
    if (!kind) return; // leeks don't throw
    if (w.ammo[kind] <= 0) { Audio1.blip(); return; }
    if (w.cooldown > 0) return;
    w.cooldown = 0.5;
    w.ammo[kind]--;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    origin.addScaledVector(dir, 0.6);

    const geo = kind === 'dragon'
      ? new THREE.SphereGeometry(0.22, 8, 6)
      : new THREE.ConeGeometry(0.15, 0.3, 6);
    const mat = new THREE.MeshLambertMaterial({ color: kind === 'dragon' ? 0xc8102e : 0xf5d33c });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);

    w.projectiles.push({
      kind, mesh,
      vel: dir.clone().multiplyScalar(THROW_SPEED).add(new THREE.Vector3(0, 3, 0)),
      bounces: 0,
      life: 6,
    });

    if (kind === 'dragon') Audio1.dragonBounce();
    else Audio1.daffodilPop();
  }

  function spawnPollenCloud(w, scene, pos) {
    const geo = new THREE.SphereGeometry(0.4, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5d33c, transparent: true, opacity: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    w.pollenClouds.push({ mesh, radius: 0.4, maxRadius: 3.2, life: 3.5, maxLife: 3.5 });
    Audio1.daffodilPop();
  }

  // Update all in-flight projectiles: gravity, ground/wall bounce, and
  // collision against enemies (dragon = KO on solid hit) or expiry
  // (daffodil = pollen cloud on impact/timeout).
  function updateProjectiles(w, dt, scene, colliders, enemyLike, onDragonHit, onDaffodilLand) {
    for (let i = w.projectiles.length - 1; i >= 0; i--) {
      const p = w.projectiles[i];
      p.life -= dt;
      p.vel.y += GRAVITY * dt;
      const next = p.mesh.position.clone().addScaledVector(p.vel, dt);

      // Ground bounce
      if (next.y < 0.2) {
        next.y = 0.2;
        p.vel.y *= -0.45;
        p.vel.x *= 0.7; p.vel.z *= 0.7;
        p.bounces++;
        if (p.kind === 'dragon') Audio1.dragonBounce();
      }

      // Wall bounce (very rough — reflect on first colliding axis)
      for (const c of colliders) {
        if (next.x > c.minX && next.x < c.maxX && next.z > c.minZ && next.z < c.maxZ) {
          p.vel.x *= -0.6; p.vel.z *= -0.6;
          p.bounces++;
          break;
        }
      }

      p.mesh.position.copy(next);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;

      let consumed = false;

      if (p.kind === 'dragon') {
        for (const e of enemyLike) {
          if (!e.alive || e.koTimer > 0) continue;
          const d = p.mesh.position.distanceTo(e.mesh.position);
          if (d < 0.9) {
            onDragonHit(e);
            consumed = true;
            break;
          }
        }
        if (p.bounces > 4 || p.life <= 0) consumed = true;
      } else {
        // Daffodil: pop on first bounce/wall hit or timeout.
        if (p.bounces > 0 || p.life <= 0) {
          onDaffodilLand(p.mesh.position.clone());
          consumed = true;
        }
      }

      if (consumed) {
        scene.remove(p.mesh);
        w.projectiles.splice(i, 1);
      }
    }

    // Pollen clouds: grow briefly, then persist, then fade; daze anyone inside.
    for (let i = w.pollenClouds.length - 1; i >= 0; i--) {
      const c = w.pollenClouds[i];
      c.life -= dt;
      c.radius = Utils.lerp(c.radius, c.maxRadius, dt * 4);
      c.mesh.scale.setScalar(c.radius / 0.4);
      c.mesh.material.opacity = Utils.clamp(c.life / c.maxLife, 0, 1) * 0.55;
      for (const e of enemyLike) {
        if (!e.alive) continue;
        const d = c.mesh.position.distanceTo(e.mesh.position);
        if (d < c.radius) e.daze && e.daze(2.5);
      }
      if (c.life <= 0) {
        scene.remove(c.mesh);
        w.pollenClouds.splice(i, 1);
      }
    }
  }

  return {
    NAMES, create, currentName, switchTo, toggleDualLeek,
    updateViewmodel, meleeAttack, throwCurrent, spawnPollenCloud, updateProjectiles,
  };
})();
