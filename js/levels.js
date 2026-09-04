// ===== levels.js =====
// Level definitions + procedural low-poly geometry builders.
//
// HOW TO ADD A NEW LEVEL:
//   1. Add a new entry to the LEVELS array below, following the shape of
//      LEVELS[0] (the village). Only `build()` and the spawn lists are
//      required to differ; everything else (player, weapons, enemy AI,
//      NPCs, pickups, UI) is level-agnostic and will "just work".
//   2. `build(scene)` must return { colliders, spawn, extraction }.
//      - colliders: array of {minX,maxX,minZ,maxZ} axis-aligned boxes used
//        for simple player/entity collision (no physics engine — this is
//        an N64-era style greybox game).
//      - spawn: {x,z,ry} where the player appears.
//      - extraction: {x,z,radius} the zone that completes the level once
//        all objectives are done.
//   3. List enemySpawns / sheepSpawns / villagerSpawns / pickupSpawns /
//      pubSpawns / objectives as data — main.js turns these into live
//      entities via enemy.js / npc.js / pickups.js.

const Levels = (() => {

  // ---- shared texture cache (created once THREE is available) ----
  let TEX = null;
  function textures() {
    if (TEX) return TEX;
    TEX = {
      grass: Utils.makeCheckerTexture('#3c6e35', '#356030', 40),
      stone: Utils.makeCheckerTexture('#8d8577', '#7a7266', 6),
      stoneDark: Utils.makeCheckerTexture('#5a5650', '#4c4842', 6),
      roof: Utils.makeCheckerTexture('#5b2e2e', '#4a2424', 6),
      path: Utils.makeCheckerTexture('#9c9280', '#8c8272', 10),
      wood: Utils.makeSolidTexture('#5a3d22'),
      red: Utils.makeSolidTexture('#c8102e'),
      white: Utils.makeSolidTexture('#e8e2d0'),
      black: Utils.makeSolidTexture('#151515'),
      mountain: Utils.makeSolidTexture('#4a5a52'),
      rock: Utils.makeCheckerTexture('#3a3632', '#2c2925', 6),
      rockDark: Utils.makeCheckerTexture('#232019', '#1a1712', 6),
      metal: Utils.makeCheckerTexture('#8a8f94', '#6d7378', 5),
      hay: Utils.makeCheckerTexture('#c9a227', '#b8901f', 10),
      tarmac: Utils.makeCheckerTexture('#3a3a3a', '#333333', 12),
      turf: Utils.makeCheckerTexture('#2f7a3c', '#2a6e36', 8),
      barnRed: Utils.makeCheckerTexture('#7a2e26', '#6a261f', 6),
    };
    Object.values(TEX).forEach(t => { t.repeat.set(4, 4); });
    return TEX;
  }

  function box(w, h, d, tex, x, y, z, ry = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    return mesh;
  }

  function cone(radius, height, tex, x, y, z) {
    const geo = new THREE.ConeGeometry(radius, height, 6);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // A simple rectangular building: walls + pyramid roof.
  // Returns its footprint collider so the player can't walk through it.
  function building(scene, cx, cz, w, d, h, ry, roofColor) {
    const t = textures();
    const wallMat = t.stone;
    const walls = box(w, h, d, wallMat, cx, h / 2, cz, ry);
    walls.userData.isWall = true;
    scene.add(walls);

    const roof = cone(Math.max(w, d) * 0.75, h * 0.6, roofColor || t.roof, cx, h + (h * 0.3), cz);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);

    // Footprint collider in world space (accounting for rotation is skipped —
    // village buildings are axis-aligned for simplicity).
    return {
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
    };
  }

  function ground(scene, size, tex) {
    const t = textures();
    const groundTex = tex || t.grass;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: groundTex });
    groundTex.repeat.set(size / 4, size / 4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, 0);
    scene.add(mesh);
  }

  function path(scene, cx, cz, w, d, ry = 0) {
    const t = textures();
    const geo = new THREE.PlaneGeometry(w, d);
    const mat = new THREE.MeshLambertMaterial({ map: t.path });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = ry;
    mesh.position.set(cx, 0.02, cz);
    scene.add(mesh);
  }

  function backdropMountains(scene) {
    const t = textures();
    const ring = 8;
    for (let i = 0; i < ring; i++) {
      const angle = (i / ring) * Math.PI * 2;
      const r = 140 + Utils.randRange(-10, 20);
      const h = Utils.randRange(50, 90);
      const m = cone(60, h, t.mountain, Math.cos(angle) * r, h / 2 - 2, Math.sin(angle) * r);
      m.userData.decorative = true;
      scene.add(m);
    }
  }

  function boundaryWalls(scene, half) {
    // Invisible collision walls around the playable map edge.
    return [
      { minX: -half - 1, maxX: -half, minZ: -half, maxZ: half },
      { minX: half, maxX: half + 1, minZ: -half, maxZ: half },
      { minX: -half, maxX: half, minZ: -half - 1, maxZ: -half },
      { minX: -half, maxX: half, minZ: half, maxZ: half + 1 },
    ];
  }

  // Non-square variant of boundaryWalls, for levels whose spawn/extraction
  // aren't symmetric around the origin (mine, farm, pub street, clubhouse).
  function rectBoundary(minX, maxX, minZ, maxZ) {
    return [
      { minX: minX - 1, maxX: minX, minZ, maxZ },
      { minX: maxX, maxX: maxX + 1, minZ, maxZ },
      { minX, maxX, minZ: minZ - 1, maxZ: minZ },
      { minX, maxX, minZ: maxZ, maxZ: maxZ + 1 },
    ];
  }

  // A roofless rock pillar/wall block — used to carve winding paths out of
  // an otherwise open cavern (coal mine) instead of hand-fitting corridor
  // corners. Returns its footprint collider.
  function rockPillar(scene, cx, cz, w, d, h, tex) {
    const t = textures();
    const mesh = box(w, h, d, tex || t.rock, cx, h / 2, cz);
    mesh.userData.isWall = true;
    scene.add(mesh);
    return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
  }

  function mineCartProp(scene, x, z) {
    const t = textures();
    const g = new THREE.Group();
    const body = box(1.4, 0.7, 2.2, t.metal, 0, 0.5, 0);
    g.add(body);
    for (const [wx, wz] of [[-0.6, 0.9], [0.6, 0.9], [-0.6, -0.9], [0.6, -0.9]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 8), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.25, wz);
      g.add(wheel);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function silo(scene, x, z) {
    const t = textures();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 8, 10), new THREE.MeshLambertMaterial({ map: t.metal }));
    body.position.set(x, 4, z);
    body.userData.isWall = true;
    scene.add(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.8, 10), new THREE.MeshLambertMaterial({ color: 0x5a5f63 }));
    cap.position.set(x, 8.9, z);
    scene.add(cap);
    return { minX: x - 2.2, maxX: x + 2.2, minZ: z - 2.2, maxZ: z + 2.2 };
  }

  function farmGate(scene, x, z, ry = 0) {
    const t = textures();
    const g = new THREE.Group();
    const postL = box(0.2, 1.6, 0.2, t.wood, -1.6, 0.8, 0);
    const postR = box(0.2, 1.6, 0.2, t.wood, 1.6, 0.8, 0);
    const beam = box(3.4, 0.15, 0.15, t.wood, 0, 1.5, 0);
    g.add(postL, postR, beam);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
    return g;
  }

  function goalPost(scene, x, z, ry = 0) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xf2ecd8 });
    const g = new THREE.Group();
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), mat);
    postL.position.set(-1.4, 2, 0);
    const postR = postL.clone();
    postR.position.x = 1.4;
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), mat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 2, 0);
    g.add(postL, postR, crossbar);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
  }

  function taxiSign(scene, x, z) {
    const t = textures();
    const g = new THREE.Group();
    const post = box(0.1, 1.8, 0.1, t.black, 0, 0.9, 0);
    const sign = box(0.6, 0.4, 0.05, t.white, 0, 1.7, 0);
    g.add(post, sign);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function phoneBox(scene, x, z) {
    const t = textures();
    const g = new THREE.Group();
    const body = box(1.2, 2.6, 1.2, t.red, 0, 1.3, 0);
    g.add(body);
    const roofBit = box(1.4, 0.2, 1.4, t.red, 0, 2.7, 0);
    g.add(roofBit);
    const sign = box(0.8, 0.3, 0.05, t.white, 0, 2.35, 0.63);
    g.add(sign);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }

  function fencePost(scene, x, z, ry = 0) {
    const t = textures();
    const post = box(0.15, 1.1, 0.15, t.wood, x, 0.55, z, ry);
    scene.add(post);
  }

  function fenceLine(scene, x1, z1, x2, z2, count) {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      fencePost(scene, Utils.lerp(x1, x2, t), Utils.lerp(z1, z2, t));
    }
    // rails
    const t = textures();
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);
    const rail = box(len, 0.08, 0.05, t.wood, (x1 + x2) / 2, 0.75, (z1 + z2) / 2, -angle);
    scene.add(rail);
  }

  // ================= LEVEL 0: THE MOUNTAIN VILLAGE =================
  function buildVillage(scene) {
    const t = textures();
    ground(scene, 200);
    backdropMountains(scene);

    scene.fog = new THREE.Fog(0x9fb8a8, 20, 95);
    scene.background = new THREE.Color(0x9fb8a8);

    const colliders = [];

    // Village square paths
    path(scene, 0, 0, 8, 60);
    path(scene, 0, 0, 60, 8);

    // Ring of cottages around the square
    colliders.push(building(scene, -14, -10, 7, 7, 4.2, 0));
    colliders.push(building(scene, 14, -10, 7, 7, 4.2, 0));
    colliders.push(building(scene, -14, 10, 7, 7, 4.2, 0));
    colliders.push(building(scene, 20, 16, 8, 6, 4.5, 0.3));

    // The pub — "Y Ddraig Feddw" (The Drunken Dragon)
    colliders.push(building(scene, -22, 18, 10, 8, 5, 0, t.stoneDark));
    {
      const sign = box(2.2, 0.8, 0.1, t.wood, -22, 5.6, 13.9);
      scene.add(sign);
    }

    // Chapel with bell tower (flavor / backdrop, up near the top of the map)
    colliders.push(building(scene, 0, -34, 9, 14, 6, 0));
    colliders.push(building(scene, 0, -34, 3, 3, 11, 0)); // bell tower

    // Sheep pen (corridor-blocking flock lives here / wanders out)
    fenceLine(scene, 8, 22, 8, 34, 6);
    fenceLine(scene, 8, 34, 26, 34, 8);
    fenceLine(scene, 26, 34, 26, 22, 6);
    fenceLine(scene, 8, 22, 26, 22, 8);

    // Extraction point: red phone box at the north exit road
    const exX = 0, exZ = -46;
    phoneBox(scene, exX, exZ);

    // Boundary
    colliders.push(...boundaryWalls(scene, 70));

    return {
      colliders,
      spawn: { x: 0, z: 44, ry: 0 }, // facing -Z, i.e. north into the village square
      extraction: { x: exX, z: exZ, radius: 4 },

      enemySpawns: [
        { x: -8, z: -2, ry: 0, patrol: [{ x: -8, z: -2 }, { x: -16, z: -2 }, { x: -16, z: 6 }, { x: -8, z: 6 }] },
        { x: 8, z: -2, ry: Math.PI, patrol: [{ x: 8, z: -2 }, { x: 16, z: -2 }, { x: 16, z: 6 }, { x: 8, z: 6 }] },
        { x: -18, z: 22, ry: 0, patrol: [{ x: -18, z: 22 }, { x: -26, z: 22 }, { x: -26, z: 10 }] },
        { x: 4, z: -30, ry: Math.PI, patrol: [{ x: 4, z: -30 }, { x: -4, z: -30 }, { x: -4, z: -20 }, { x: 4, z: -20 }] },
      ],

      sheepSpawns: [
        { x: 12, z: 26 }, { x: 16, z: 28 }, { x: 20, z: 30 },
        { x: 14, z: 32 }, { x: 0, z: 2 }, { x: -2, z: -6 },
      ],

      villagerSpawns: [
        { x: -10, z: 2 },
        { x: 10, z: 30 },
      ],

      pickupSpawns: [
        { x: 6, z: 6, type: 'health' },
        { x: -6, z: -6, type: 'armour' },
        { x: 18, z: 18, type: 'health' },
        { x: 0, z: -20, type: 'armour' },
      ],

      pubSpawns: [
        { x: -22, z: 16 },
      ],

      // The MacGuffin the player must retrieve from inside the pub before
      // the extraction zone will register as complete.
      manifestSpawn: { x: -22, z: 20 },

      // Only real checklist items go here — reaching the extraction zone is
      // checked separately (main.js) once every objective below is done, so
      // don't add an "extract" entry or the level could never complete.
      objectives: [
        { id: 'manifest', text: "Find Dai Hard's delivery manifest in the pub, then get to the phone box on the north road" },
      ],

      briefing:
        "Bore da, Agent Bach Bond.\n\n" +
        "Dai Hard has been seen swapping the village's sheep for clockwork " +
        "replicas. Slip into Llanfair-on-Sea, recover his delivery manifest " +
        "from the pub, and get out via the north road.\n\n" +
        "Guards will shout when they clock you — but by all accounts they're " +
        "in no hurry. Don't push your luck all the same, mun.",
    };
  }

  // ================= LEVEL 1: THE COAL MINE =================
  // Instead of hand-fitting corridor-corner geometry, this cavern is one
  // open rock hall with pillars scattered through it — the pillars block
  // sightlines and force winding paths, which reads as "mine tunnels"
  // without needing precise wall-junction math.
  function buildCoalMine(scene) {
    const t = textures();
    ground(scene, 140, t.rockDark);
    scene.fog = new THREE.Fog(0x120f0c, 6, 32);
    scene.background = new THREE.Color(0x0a0806);

    const colliders = [];
    const pillars = [
      [-8, 35, 4, 4, 6], [9, 32, 5, 4, 6], [-6, 20, 4, 5, 6], [7, 14, 4, 4, 6],
      [0, 10, 3, 3, 6], [-9, 4, 5, 4, 6], [6, -4, 4, 5, 6], [-7, -14, 4, 4, 6],
      [8, -20, 5, 4, 6], [-5, -30, 4, 4, 6], [9, -36, 4, 5, 6], [-8, -44, 5, 4, 6],
    ];
    for (const [x, z, w, d, h] of pillars) colliders.push(rockPillar(scene, x, z, w, d, h));

    mineCartProp(scene, 0, -60);
    colliders.push(...rectBoundary(-18, 18, -68, 58));

    return {
      colliders,
      spawn: { x: 0, z: 50, ry: 0 },
      extraction: { x: 0, z: -60, radius: 4 },
      lighting: { ambientColor: 0x554a3f, ambientIntensity: 0.35, sunColor: 0x3a2f24, sunIntensity: 0.2 },

      // Patrol lanes deliberately hug x = ±12/±13 — outside every pillar's
      // footprint (all pillars sit within |x| <= 9.5) — so guards never get
      // stuck trying to path through rock they can't cross.
      enemySpawns: [
        { x: 12, z: 26, ry: Math.PI, patrol: [{ x: 12, z: 26 }, { x: 12, z: 10 }] },
        { x: -12, z: 0, ry: 0, patrol: [{ x: -12, z: 0 }, { x: -12, z: -16 }] },
        { x: 12, z: -14, ry: Math.PI, patrol: [{ x: 12, z: -14 }, { x: 12, z: -30 }] },
        { x: -8, z: -50, ry: 0, patrol: [{ x: -8, z: -50 }, { x: 8, z: -50 }] },
      ],

      sheepSpawns: [{ x: 5, z: 9 }], // one very lost sheep

      villagerSpawns: [],

      pickupSpawns: [
        { x: -6, z: 27, type: 'health' },
        { x: 9, z: -2, type: 'armour' },
        { x: -6, z: -35, type: 'health' },
      ],

      pubSpawns: [],
      manifestSpawn: { x: 0, z: -50 },

      objectives: [
        { id: 'manifest', text: "Recover the clockwork-sheep blueprints from the assembly cavern, then reach the mine cart" },
      ],

      briefing:
        "Right then, Bach.\n\n" +
        "The village sheep are being swapped out down here — Dai Hard's " +
        "converted the old drift mine into a clockwork assembly line. Get " +
        "down to the cavern, grab the blueprints proving it, and get out " +
        "on the mine cart.\n\n" +
        "It's dark, it's tight, and if a miner spots you, you know the " +
        "drill by now: shouting, no urgency.",
    };
  }

  // ================= LEVEL 2: SHEEP FARM =================
  function buildSheepFarm(scene) {
    const t = textures();
    ground(scene, 150, t.grass);
    scene.fog = new THREE.Fog(0xb9c9a6, 20, 90);
    scene.background = new THREE.Color(0xb9c9a6);

    const colliders = [];
    colliders.push(building(scene, 0, -10, 12, 9, 5.5, 0, t.barnRed)); // the big barn
    colliders.push(silo(scene, 9, -10));

    // Fenced pens
    fenceLine(scene, -24, -20, -24, 4, 8);
    fenceLine(scene, -24, 4, -4, 4, 6);
    fenceLine(scene, -4, 4, -4, -20, 8);
    fenceLine(scene, -24, -20, -4, -20, 6);

    fenceLine(scene, 12, 6, 12, 26, 6);
    fenceLine(scene, 12, 26, 30, 26, 6);
    fenceLine(scene, 30, 26, 30, 6, 6);
    fenceLine(scene, 12, 6, 30, 6, 6);

    farmGate(scene, 0, -55);
    colliders.push(...rectBoundary(-45, 45, -60, 45));

    return {
      colliders,
      spawn: { x: 0, z: 40, ry: 0 },
      extraction: { x: 0, z: -55, radius: 4 },

      // First patrol kept south of the barn (barn footprint is x:-6..6,
      // z:-14.5..-5.5) so the guard isn't spawned inside its own obstacle.
      enemySpawns: [
        { x: -6, z: 0, ry: 0, patrol: [{ x: -6, z: 0 }, { x: 6, z: 0 }, { x: 6, z: -4 }, { x: -6, z: -4 }] },
        { x: 20, z: 16, ry: Math.PI, patrol: [{ x: 20, z: 16 }, { x: 20, z: 30 }, { x: 8, z: 30 }] },
        { x: 0, z: 20, ry: 0, patrol: [{ x: 0, z: 20 }, { x: -14, z: 20 }, { x: -14, z: 10 }] },
      ],

      // Three of these are Dai Hard's clockwork decoys — spot the antenna.
      sheepSpawns: [
        { x: -14, z: -4 }, { x: -18, z: -10 }, { x: -10, z: -16 },
        { x: 18, z: 12, isRobot: true }, { x: 22, z: 20 }, { x: 26, z: 14 },
        { x: -14, z: -2, isRobot: true }, { x: -20, z: -14 },
        { x: 6, z: 34, isRobot: true }, { x: 10, z: 30 },
      ],

      villagerSpawns: [{ x: 14, z: -8 }], // the farmer's wife, easily distracted

      pickupSpawns: [
        { x: -8, z: -10, type: 'health' },
        { x: 8, z: -6, type: 'armour' },
        { x: 20, z: 22, type: 'health' },
      ],

      pubSpawns: [{ x: 9.5, z: -6 }], // the cider shed round the side of the barn

      manifestSpawn: null,

      // Win condition here is custom: destroy all 3 clockwork decoys,
      // tracked each frame by scanning the live sheep array (see main.js,
      // which calls this hook every frame while playing).
      objectives: [
        { id: 'robots', text: 'Find and destroy the 3 clockwork decoy sheep hidden in the flock' },
      ],
      updateObjectives(ctx) {
        const robots = ctx.sheep.filter(s => s.isRobot);
        if (robots.length > 0 && robots.every(s => s.destroyed)) UI.completeObjective('robots');
      },

      briefing:
        "Bore da again, Bach.\n\n" +
        "Ianto's farm has three clockwork sheep hidden in with the real " +
        "flock — near enough perfect copies, bar the little aerial on the " +
        "head. Find all three and put them out of commission, then get " +
        "out through the front gate.\n\n" +
        "Mind how you go with the real ones. They've done nothing wrong.",
    };
  }

  // ================= LEVEL 3: PUB CRAWL DISTRICT =================
  function buildPubCrawl(scene) {
    const t = textures();
    ground(scene, 140, t.tarmac);
    scene.fog = new THREE.Fog(0x1b1d26, 12, 60);
    scene.background = new THREE.Color(0x14151c);

    path(scene, 0, 0, 10, 120);
    const colliders = [];

    // Buildings lining the high street, alternating sides. Kept at
    // |x| >= 9 (half-width 3) so a clear ~4-unit sidewalk stays open
    // between the street (|x| <= 5) and every frontage.
    const frontages = [
      [-12, 40, 6, 6, 5], [12, 34, 6, 6, 5],
      [-12, 18, 6, 6, 5], [12, 12, 6, 6, 5],
      [-12, -4, 6, 6, 5], [12, -10, 6, 6, 5],
      [-12, -26, 6, 6, 5], [12, -32, 6, 6, 5],
    ];
    for (const [x, z, w, d, h] of frontages) colliders.push(building(scene, x, z, w, d, h, 0, t.stoneDark));

    // Three of those frontages are pubs with a beer barrel out front, just
    // clear of the building's street-facing wall — only the middle one is
    // hiding Dai Hard's informant (the manifest).
    const pubs = [[-9, 40], [9, 12], [-9, -26]];
    for (const [x, z] of pubs) {
      const sign = box(1.8, 0.6, 0.1, t.wood, x, 4.4, z);
      scene.add(sign);
    }

    taxiSign(scene, 0, -55);
    colliders.push(...rectBoundary(-16, 16, -60, 48));

    return {
      colliders,
      spawn: { x: 0, z: 45, ry: 0 },
      extraction: { x: 0, z: -55, radius: 4 },
      lighting: { ambientColor: 0x8f97b0, ambientIntensity: 0.5, sunColor: 0x445, sunIntensity: 0.3 },

      enemySpawns: [
        { x: -6, z: 26, ry: 0, patrol: [{ x: -6, z: 26 }, { x: 6, z: 26 }, { x: 6, z: 20 }, { x: -6, z: 20 }] },
        { x: 6, z: 2, ry: Math.PI, patrol: [{ x: 6, z: 2 }, { x: -6, z: 2 }, { x: -6, z: -4 }, { x: 6, z: -4 }] },
        { x: -6, z: -18, ry: 0, patrol: [{ x: -6, z: -18 }, { x: 6, z: -18 }, { x: 6, z: -24 }, { x: -6, z: -24 }] },
      ],

      sheepSpawns: [],

      villagerSpawns: [
        { x: 3, z: 15 }, { x: -3, z: -8 },
      ],

      pickupSpawns: [
        { x: 4, z: 30, type: 'health' },
        { x: -4, z: -12, type: 'armour' },
      ],

      pubSpawns: [{ x: -9, z: 40 }, { x: 9, z: 12 }, { x: -9, z: -26 }],

      // The middle pub is the correct one — reuses the generic manifest
      // pickup as "the informant's tip-off note".
      manifestSpawn: { x: 9, z: 10 },

      objectives: [
        { id: 'manifest', text: "Find Dai Hard's informant in one of the three pubs on the high street, then get to the taxi rank" },
      ],

      briefing:
        "Right, pub crawl, Bach — try to keep your dignity this time.\n\n" +
        "One of these three pubs is hiding one of Dai Hard's informants. " +
        "Have a look round each, get what you need, and get yourself to " +
        "the taxi rank at the end of the street.\n\n" +
        "Fair warning: they're all serving. Pace yourself, mun.",
    };
  }

  // ================= LEVEL 4: DAI HARD'S RUGBY CLUBHOUSE LAIR =================
  function buildRugbyClubhouse(scene) {
    const t = textures();
    ground(scene, 140, t.turf);
    scene.fog = new THREE.Fog(0x1a2418, 10, 55);
    scene.background = new THREE.Color(0x121a10);

    const colliders = [];
    colliders.push(building(scene, 0, 20, 16, 10, 6, 0, t.stoneDark)); // clubhouse entrance block
    colliders.push(building(scene, 0, -10, 10, 8, 5, 0, t.stoneDark)); // trophy hall

    goalPost(scene, 0, -55);
    goalPost(scene, 0, 40, Math.PI);

    colliders.push(...rectBoundary(-30, 30, -70, 50));

    return {
      colliders,
      spawn: { x: 0, z: 45, ry: 0 },
      extraction: { x: 0, z: -65, radius: 5 },
      lighting: { ambientColor: 0x8fae86, ambientIntensity: 0.55, sunColor: 0xdcefc8, sunIntensity: 0.6 },

      enemySpawns: [
        { x: -6, z: 8, ry: 0, patrol: [{ x: -6, z: 8 }, { x: 6, z: 8 }] },
        { x: 6, z: -18, ry: Math.PI, patrol: [{ x: 6, z: -18 }, { x: -6, z: -18 }] },
        // Dai Hard himself — stands his ground until spotted, takes 4 hits,
        // and gets his own lines instead of the usual Welsh phrase banks.
        {
          x: 0, z: -40, ry: Math.PI, patrol: [{ x: 0, z: -40 }],
          isBoss: true, bossName: 'DAI HARD', hp: 4, scale: 1.3, uniformColor: 0x8a1424,
          linesSpot: ["Ah, Agent Bach Bond. I wondered when you'd show, boyo."],
          linesArriving: ["Get him, boys! ...well — in a minute, obviously."],
          linesDefeat: ["Duw... you've got me. The sheep... were never meant to know..."],
        },
      ],

      sheepSpawns: [],
      villagerSpawns: [],

      pickupSpawns: [
        { x: -6, z: 10, type: 'health' },
        { x: 6, z: -12, type: 'armour' },
        { x: -6, z: -35, type: 'health' },
      ],

      pubSpawns: [],
      manifestSpawn: null,

      objectives: [
        { id: 'boss', text: 'Defeat Dai Hard in the trophy hall' },
      ],
      updateObjectives(ctx) {
        const boss = ctx.enemies.find(e => e.isBoss);
        if (boss && !boss.alive) UI.completeObjective('boss');
      },

      briefing:
        "This is it, Bach.\n\n" +
        "Dai Hard's holed up in the trophy hall, under the clubhouse, with " +
        "the mainframe running every clockwork sheep in Wales. Get through " +
        "his guards, put him down, and get off the pitch via the far " +
        "try-line.\n\n" +
        "He won't come quiet. Then again, going by everyone else you've " +
        "met this week, he probably won't come at all for half a minute.",
    };
  }

  const LEVELS = [
    { name: 'Llanfair-on-Sea (Mountain Village)', build: (scene) => buildVillage(scene) },
    { name: 'The Coal Mine', build: (scene) => buildCoalMine(scene) },
    { name: 'Sheep Farm', build: (scene) => buildSheepFarm(scene) },
    { name: 'Pub Crawl District', build: (scene) => buildPubCrawl(scene) },
    { name: "Dai Hard's Rugby Clubhouse Lair", build: (scene) => buildRugbyClubhouse(scene) },
  ];

  return { LEVELS, textures };
})();
