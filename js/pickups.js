// ===== pickups.js =====
// Health/armour pickups, the mission MacGuffin (manifest), and pub beer
// dispensers with the three temporary buffs + the "too many beers" penalty.

const Pickups = (() => {

  const BEER_TYPES = ['brains', 'dark', 'ale'];

  function healthCrossModel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4d4d });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.5), mat);
    g.add(a, b);
    g.position.y = 1;
    return g;
  }

  function armourModel() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x2f8fc4 });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), mat);
    mesh.position.y = 1;
    return mesh;
  }

  function pubModel() {
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10),
      new THREE.MeshLambertMaterial({ color: 0x6b4423 })
    );
    barrel.position.y = 0.5;
    const tap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6),
      new THREE.MeshLambertMaterial({ color: 0xd4af37 })
    );
    tap.position.set(0, 0.5, 0.4);
    tap.rotation.x = Math.PI / 2;
    g.add(barrel, tap);
    return g;
  }

  function manifestModel() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.4), mat);
    mesh.position.y = 0.9;
    return mesh;
  }

  function create(scene, level) {
    const items = [];
    for (const spawn of level.pickupSpawns || []) {
      const model = spawn.type === 'health' ? healthCrossModel() : armourModel();
      model.position.x = spawn.x;
      model.position.z = spawn.z;
      scene.add(model);
      items.push({ kind: spawn.type, mesh: model, collected: false, spinT: Math.random() * 10 });
    }

    const pubs = [];
    for (const spawn of level.pubSpawns || []) {
      const model = pubModel();
      model.position.set(spawn.x, 0, spawn.z);
      scene.add(model);
      pubs.push({ mesh: model, wasInside: false });
    }

    let manifest = null;
    if (level.manifestSpawn) {
      const model = manifestModel();
      model.position.x = level.manifestSpawn.x;
      model.position.z = level.manifestSpawn.z;
      scene.add(model);
      manifest = { mesh: model, collected: false, spinT: 0 };
    }

    return { items, pubs, manifest, scene };
  }

  function update(state, dt, player, gameState) {
    for (const item of state.items) {
      if (item.collected) continue;
      item.spinT += dt * 2;
      item.mesh.rotation.y = item.spinT;
      item.mesh.position.y = 0.9 + Math.sin(item.spinT * 2) * 0.08;
      const d = Utils.dist2D(player.x, player.z, item.mesh.position.x, item.mesh.position.z);
      if (d < 1.1) collect(item, player, gameState);
    }

    if (state.manifest && !state.manifest.collected) {
      const m = state.manifest;
      m.spinT += dt * 1.5;
      m.mesh.rotation.y = m.spinT;
      const d = Utils.dist2D(player.x, player.z, m.mesh.position.x, m.mesh.position.z);
      if (d < 1.3) {
        m.collected = true;
        state.scene.remove(m.mesh);
        gameState.hasManifest = true;
        UI.subtitle('Manifest acquired. Tidy.');
        UI.completeObjective('manifest');
        Audio1.pickup();
      }
    }

    for (const pub of state.pubs) {
      const d = Utils.dist2D(player.x, player.z, pub.mesh.position.x, pub.mesh.position.z);
      const inside = d < 1.6;
      if (inside && !pub.wasInside) drink(player);
      pub.wasInside = inside;
    }
  }

  function collect(item, player, gameState) {
    item.collected = true;
    item.mesh.visible = false;
    Audio1.pickup();
    if (item.kind === 'health') {
      Player.heal(player, 35);
      UI.subtitle('Found a first aid tin. Lovely.');
    } else {
      Player.giveArmour(player, 35);
      UI.subtitle('Bit of armour, there\'s handy.');
    }
  }

  function drink(player) {
    Audio1.beerGlug();
    player.beerCount = (player.beerCount || 0) + 1;

    if (player.beerCount >= 4) {
      player.beerCount = 0;
      player.drunkTimer = 10;
      player.slowmoTimer = 0;
      player.nightVisionTimer = 0;
      UI.subtitle(Welsh.drunkSing);
      UI.setBeerBlur(true);
      UI.alertAllGuards && UI.alertAllGuards();
      return;
    }

    const type = Utils.choice(BEER_TYPES);
    if (type === 'brains') {
      player.slowmoTimer = 8;
      UI.subtitle('Brains S.A. — everything slows right down.');
    } else if (type === 'dark') {
      player.nightVisionTimer = 15;
      UI.subtitle('A pint of Dark — night vision, tidy.');
    } else {
      player.shieldCharges = (player.shieldCharges || 0) + 1;
      UI.subtitle("Local ale — that'll do you now, mind.");
    }
  }

  return { create, update };
})();
