// ===== npc.js =====
// Non-hostile NPCs: Sheep (corridor-blocking, comic-faint on being hit) and
// Villagers (easily-led ladies in traditional dress who follow whoever
// spoke to them last — including enemy guards).

const NPC = (() => {

  // ---------------- SHEEP ----------------
  // isRobot sheep (Dai Hard's clockwork replicas, used on the Sheep Farm
  // level) look metallic and don't faint-and-recover like a real sheep —
  // one hit "shorts" them out for good, which is how that level's objective
  // is scored (see main.js counting sheep with .isRobot && .destroyed).
  function buildSheepModel(isRobot) {
    const g = new THREE.Group();
    const wool = new THREE.MeshLambertMaterial({ color: isRobot ? 0xb8c4c8 : 0xf3f1e8 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.9), wool);
    body.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.3), dark);
    head.position.set(0, 0.42, 0.55);
    g.add(body, head);
    for (const [x, z] of [[-0.22, 0.3], [0.22, 0.3], [-0.22, -0.3], [0.22, -0.3]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), dark);
      leg.position.set(x, 0.17, z);
      g.add(leg);
    }
    if (isRobot) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4),
        new THREE.MeshLambertMaterial({ color: 0x333333 }));
      antenna.position.set(0, 0.62, 0.5);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xc8102e }));
      tip.position.set(0, 0.72, 0.5);
      g.add(antenna, tip);
    }
    return g;
  }

  function createSheep(scene, x, z, isRobot = false) {
    const mesh = buildSheepModel(isRobot);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const sheep = {
      type: 'sheep', mesh, origin: { x, z },
      state: 'idle', // idle | walk | fainted | destroyed
      target: null, stateTimer: Utils.randRange(1, 3),
      faintTimer: 0,
      isRobot, destroyed: false,
      alive: true,
    };
    mesh.userData.entityRef = sheep;
    sheep.onHit = () => (isRobot ? destroyRobot(sheep) : faint(sheep));
    return sheep;
  }

  function faint(sheep) {
    if (sheep.state === 'fainted') return;
    sheep.state = 'fainted';
    sheep.faintTimer = Utils.randRange(2.5, 4);
    sheep.mesh.rotation.z = Math.PI / 2;
    sheep.mesh.position.y = 0.25;
  }

  function destroyRobot(sheep) {
    if (sheep.destroyed) return;
    sheep.destroyed = true;
    sheep.state = 'destroyed';
    Audio1.robotZap();
    UI.subtitle(Utils.choice([
      'CLANG. "BAAAA— SYSTEM FAILURE."',
      'Sparks fly. The impostor sheep seizes up.',
      '"ERROR — WOOL.EXE HAS STOPPED WORKING."',
    ]));
    sheep.mesh.rotation.z = Math.PI / 2;
    sheep.mesh.position.y = 0.25;
  }

  function updateSheep(sheep, dt) {
    if (sheep.state === 'destroyed') return; // robot sheep stay down for good
    if (sheep.state === 'fainted') {
      sheep.faintTimer -= dt;
      if (sheep.faintTimer <= 0) {
        sheep.state = 'walk';
        sheep.mesh.rotation.z = 0;
        sheep.mesh.position.y = 0;
        // scatter away from origin
        const angle = Math.random() * Math.PI * 2;
        sheep.target = {
          x: sheep.origin.x + Math.cos(angle) * Utils.randRange(3, 6),
          z: sheep.origin.z + Math.sin(angle) * Utils.randRange(3, 6),
        };
        sheep.stateTimer = 2.5;
      }
      return;
    }

    sheep.stateTimer -= dt;
    if (sheep.state === 'idle' && sheep.stateTimer <= 0) {
      sheep.state = 'walk';
      const angle = Math.random() * Math.PI * 2;
      sheep.target = {
        x: sheep.origin.x + Math.cos(angle) * Utils.randRange(1.5, 4),
        z: sheep.origin.z + Math.sin(angle) * Utils.randRange(1.5, 4),
      };
      sheep.stateTimer = Utils.randRange(2, 4);
    } else if (sheep.state === 'walk') {
      if (sheep.target) {
        const dx = sheep.target.x - sheep.mesh.position.x;
        const dz = sheep.target.z - sheep.mesh.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const speed = 0.8;
          sheep.mesh.position.x += (dx / d) * speed * dt;
          sheep.mesh.position.z += (dz / d) * speed * dt;
          sheep.mesh.rotation.y = Math.atan2(dx, dz);
        } else {
          sheep.stateTimer = -1;
        }
      }
      if (sheep.stateTimer <= 0) {
        sheep.state = 'idle';
        sheep.stateTimer = Utils.randRange(1.5, 3.5);
      }
    }
  }

  function sheepCollider(sheep) {
    const p = sheep.mesh.position;
    const r = 0.35;
    return { minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r };
  }

  // ---------------- VILLAGERS ----------------
  function buildVillagerModel() {
    const g = new THREE.Group();
    const cloak = new THREE.MeshLambertMaterial({ color: 0xb01030 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8c7a0 });
    const hatMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    const apron = new THREE.MeshLambertMaterial({ color: 0xf2ecd8 });

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), cloak);
    body.position.y = 0.75;
    const apronMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), apron);
    apronMesh.position.set(0, 0.6, 0.32);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), skin);
    head.position.y = 1.42;
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 10), hatMat);
    hatBrim.position.y = 1.55;
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.32, 10), hatMat);
    hatTop.position.y = 1.72;
    g.add(body, apronMesh, head, hatBrim, hatTop);
    return g;
  }

  function createVillager(scene, x, z, name) {
    const mesh = buildVillagerModel();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const villager = {
      type: 'villager', mesh, name: name || 'A Local',
      origin: { x, z },
      followTarget: null, // set to player or an enemy object
      leadCooldown: 0,
      alive: true,
    };
    mesh.userData.entityRef = villager;
    villager.onHit = () => {}; // villagers can't be harmed — comic invulnerability
    return villager;
  }

  function updateVillager(villager, dt, player, enemies) {
    // Enemies can absent-mindedly lead a villager astray just by being close.
    if (!villager.followTarget || villager.followTarget !== player) {
      villager.leadCooldown -= dt;
      if (villager.leadCooldown <= 0) {
        for (const e of enemies) {
          if (!e.alive) continue;
          const d = Utils.dist2D(villager.mesh.position.x, villager.mesh.position.z, e.mesh.position.x, e.mesh.position.z);
          if (d < 2.5 && Math.random() < 0.02) {
            villager.followTarget = e;
            break;
          }
        }
        villager.leadCooldown = 0.5;
      }
    }

    if (villager.followTarget) {
      const t = villager.followTarget;
      const tx = t === player ? player.x : t.mesh.position.x;
      const tz = t === player ? player.z : t.mesh.position.z;
      const dx = tx - villager.mesh.position.x;
      const dz = tz - villager.mesh.position.z;
      const d = Math.hypot(dx, dz);
      const followDist = 1.6;
      if (d > followDist) {
        const speed = 2.2;
        villager.mesh.position.x += (dx / d) * speed * dt;
        villager.mesh.position.z += (dz / d) * speed * dt;
        villager.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  function persuade(villager, player) {
    villager.followTarget = player;
  }

  return {
    createSheep, updateSheep, sheepCollider, faint,
    createVillager, updateVillager, persuade,
  };
})();
