// ===== main.js =====
// Bootstraps Three.js, wires up input, and runs the game loop / state
// machine (title -> briefing -> playing -> paused/dialogue -> gameover|win).
//
// Per-level entity arrays (enemies/sheep/villagers/pickups) live in the
// closure below as `let` variables reassigned by loadLevel(). Everything
// that needs to react to a *new* level (win checks, save data, the "too
// many beers alerts everyone" hook) reads from these current references.

(function () {
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
  const player = Player.create(camera);
  const weapons = Weapons.create(camera); // viewRig attached to camera once, reused across levels

  let scene = new THREE.Scene();
  let currentLevel = null;
  let currentLevelIndex = 0;
  let colliders = [];
  let wallMeshes = [];
  let enemies = [];
  let sheep = [];
  let villagers = [];
  let pickupState = null;
  let gameState = { hasManifest: false };

  let phase = 'menu'; // menu | playing | paused | dialogue | gameover | win
  const clock = new THREE.Clock();

  // ---------------- rendering resolution (N64-style chunky pixels) ----------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const scale = 0.42; // internal render scale, upscaled via CSS pixelation
    renderer.setSize(Math.floor(w * scale), Math.floor(h * scale), false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  window.addEventListener('resize', resize);

  // ---------------- level loading ----------------
  function loadLevel(index) {
    currentLevelIndex = index;
    scene = new THREE.Scene();
    scene.add(camera); // camera must be in the graph for its weapon-viewmodel children to render

    const ambient = new THREE.AmbientLight(0xaabbaa, 0.7);
    const sun = new THREE.DirectionalLight(0xfff2d6, 0.8);
    sun.position.set(30, 60, 10);
    scene.add(ambient, sun);

    const level = Levels.LEVELS[index].build(scene);
    currentLevel = level;

    // Levels can override the default bright-outdoor lighting (e.g. the
    // coal mine wants it dark and close) via a `lighting` object.
    if (level.lighting) {
      if (level.lighting.ambientColor != null) ambient.color.set(level.lighting.ambientColor);
      if (level.lighting.ambientIntensity != null) ambient.intensity = level.lighting.ambientIntensity;
      if (level.lighting.sunColor != null) sun.color.set(level.lighting.sunColor);
      if (level.lighting.sunIntensity != null) sun.intensity = level.lighting.sunIntensity;
    }
    colliders = level.colliders;
    wallMeshes = [];
    scene.traverse(o => { if (o.userData && o.userData.isWall) wallMeshes.push(o); });

    Player.setSpawn(player, level.spawn);
    player.health = player.maxHealth;
    player.armour = 0;
    player.alive = true;
    player.cuppaUsedThisLevel = false;
    player.beerCount = 0;
    player.shieldCharges = 0;
    player.drunkTimer = player.slowmoTimer = player.nightVisionTimer = 0;
    UI.setBeerBlur(false);

    weapons.ammo = { dragon: 8, daffodil: 8 };
    weapons.projectiles.forEach(p => scene.remove(p.mesh));
    weapons.pollenClouds.forEach(c => scene.remove(c.mesh));
    weapons.projectiles = [];
    weapons.pollenClouds = [];
    Weapons.switchTo(weapons, 0);

    enemies = (level.enemySpawns || []).map(def => Enemy.create(scene, def));
    sheep = (level.sheepSpawns || []).map(s => NPC.createSheep(scene, s.x, s.z, s.isRobot));
    villagers = (level.villagerSpawns || []).map(v => NPC.createVillager(scene, v.x, v.z));
    pickupState = Pickups.create(scene, level);
    gameState.hasManifest = !level.manifestSpawn;
    UI.hideBossHealth();

    UI.setObjectives(level.objectives);
    UI.alertAllGuards = () => {
      for (const e of enemies) {
        if (e.alive && e.state === 'PATROL') {
          e.state = 'ALERT';
          e.alertTimer = 30;
          e.lastShout = 0.1;
        }
      }
    };

    resize();
  }

  function enterGameplay() {
    UI.showGame();
    phase = 'playing';
    clock.getDelta(); // discard accumulated time from menus
    requestPointerLock();
  }

  // Browsers throttle/reject rapid repeat pointer-lock requests (especially
  // right after a previous exit), and the "click to resume" overlay stays
  // visible until the async pointerlockchange event confirms success — so
  // without this guard, impatient repeat-clicking just re-requests the lock
  // over and over instead of ever landing a "shoot" click on the canvas.
  let lockRequestPending = false;
  function requestPointerLock() {
    if (!canvas.requestPointerLock || lockRequestPending) return;
    lockRequestPending = true;
    const clear = () => { lockRequestPending = false; };
    try {
      const result = canvas.requestPointerLock();
      if (result && result.then) result.then(clear, clear);
      else setTimeout(clear, 400); // older callback-style API has no promise to hook
    } catch (e) {
      clear();
    }
  }

  // ---------------- input ----------------
  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);

  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.has(e.code)) player._keys[e.code] = true;
    if (e.repeat) return;

    if (phase === 'playing') {
      // Accept the numpad digits too (Numpad1/2/3) — a laptop with NumLock
      // on, or a numpad-equipped keyboard, sends those instead of Digit1/2/3
      // and would otherwise make weapon-switching silently do nothing.
      if (e.code === 'Digit1' || e.code === 'Numpad1') { Weapons.switchTo(weapons, 0); UI.subtitle('Leeks out.', 1); }
      if (e.code === 'Digit2' || e.code === 'Numpad2') { Weapons.switchTo(weapons, 1); UI.subtitle('Throwing Dragons ready.', 1); }
      if (e.code === 'Digit3' || e.code === 'Numpad3') { Weapons.switchTo(weapons, 2); UI.subtitle('Daffodils ready.', 1); }
      if (e.code === 'KeyQ') Weapons.throwCurrent(weapons, scene, camera);
      if (e.code === 'KeyF') {
        const dual = Weapons.toggleDualLeek(weapons);
        UI.subtitle(dual ? 'Dual-wielding leeks. Get you.' : 'Back to one leek, sensible.');
      }
      if (e.code === 'KeyN') {
        const analog = Player.toggleAnalogMode(player);
        UI.subtitle(analog ? 'N64 analog controls: A/D to turn.' : 'Mouse look restored.');
      }
      if (e.code === 'KeyE') tryInteract();
      if (e.code === 'Escape') openPause();
    } else if (phase === 'paused') {
      if (e.code === 'Escape') closePause();
    } else if (phase === 'dialogue') {
      if (e.code === 'Escape') {
        UI.closeDialogue();
        phase = 'playing';
        requestPointerLock();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (MOVE_KEYS.has(e.code)) player._keys[e.code] = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas && phase === 'playing') {
      Player.onMouseMove(player, e.movementX, e.movementY);
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (document.pointerLockElement !== canvas || phase !== 'playing') return;
    if (weapons.currentIndex === 0) {
      const hit = Weapons.meleeAttack(weapons, camera, [...enemies, ...sheep]);
      if (hit) hit.onHit && hit.onHit('leek');
    } else {
      Weapons.throwCurrent(weapons, scene, camera);
    }
  });

  document.addEventListener('pointerlockchange', () => {
    lockRequestPending = false;
    const locked = document.pointerLockElement === canvas;
    UI.showClickToPlay(!locked && phase === 'playing');
  });
  // A failed lock request (denied, or blocked by the embedding context)
  // fires 'pointerlockerror' instead of 'pointerlockchange' — without this,
  // the "click to resume" prompt would never appear and there'd be no way
  // to retry.
  document.addEventListener('pointerlockerror', () => {
    lockRequestPending = false;
    UI.showClickToPlay(phase === 'playing');
  });

  document.getElementById('click-to-play').addEventListener('click', () => {
    if (phase === 'playing') requestPointerLock();
  });

  // E interacts with whatever's closest: a villager to persuade, or — if
  // none's in range — a pub barrel to drink from (see pickups.js: drinking
  // used to auto-trigger on proximity, which meant just walking near the
  // manifest in the village pub could rack up accidental beers).
  function tryInteract() {
    let nearest = null, nearestD = 2.6;
    for (const v of villagers) {
      const d = Utils.dist2D(player.x, player.z, v.mesh.position.x, v.mesh.position.z);
      if (d < nearestD) { nearest = v; nearestD = d; }
    }
    if (!nearest) {
      Pickups.tryDrink(pickupState, player);
      return;
    }
    if (nearest.followTarget === player) {
      UI.subtitle(nearest.name + " is already with me, isn't it.");
      return;
    }
    phase = 'dialogue';
    const idioms = Welsh.persuade.slice().sort(() => Math.random() - 0.5);
    const options = idioms.slice(0, 3).map(line => ({
      label: line,
      onSelect: () => {
        NPC.persuade(nearest, player);
        UI.subtitle(nearest.name + ': "Duw, alright then, love."');
        phase = 'playing';
        requestPointerLock();
      },
    }));
    UI.openDialogue(nearest.name, 'She looks easily led. Try a Welsh idiom on her:', options);
  }

  // ---------------- pause menu ----------------
  function openPause() {
    phase = 'paused';
    UI.showPause();
    document.exitPointerLock && document.exitPointerLock();
  }
  function closePause() {
    phase = 'playing';
    UI.hidePause();
    requestPointerLock();
  }
  document.getElementById('btn-resume').addEventListener('click', closePause);
  document.getElementById('btn-cuppa').addEventListener('click', () => {
    const ok = Player.cuppa(player);
    UI.subtitle(ok ? 'Ah, lovely cup of tea. Right as rain.' : "No more tea this level, mun — you've had your cuppa.");
  });
  document.getElementById('btn-save').addEventListener('click', () => {
    SaveSystem.save({
      levelIndex: currentLevelIndex,
      health: player.health,
      armour: player.armour,
      currentWeapon: weapons.currentIndex,
      ammo: weapons.ammo,
    });
    UI.subtitle('Saved — Under the Illtud.');
  });
  document.getElementById('btn-quit').addEventListener('click', () => {
    UI.hidePause();
    phase = 'menu';
    UI.showScreen('title-screen');
    refreshContinueButton();
  });

  // ---------------- title / briefing / gameover / win screens ----------------
  function refreshContinueButton() {
    document.getElementById('btn-continue').disabled = !SaveSystem.hasSave();
  }

  document.getElementById('btn-new-game').addEventListener('click', () => {
    loadLevel(0);
    UI.showBriefing('MISSION 1: ' + Levels.LEVELS[0].name, currentLevel.briefing);
  });

  document.getElementById('btn-continue').addEventListener('click', () => {
    const data = SaveSystem.load();
    if (!data) return;
    loadLevel(data.levelIndex);
    player.health = data.health;
    player.armour = data.armour;
    weapons.ammo = data.ammo || weapons.ammo;
    Weapons.switchTo(weapons, data.weapon || 0);
    enterGameplay();
    UI.subtitle('Loaded save: Under the Illtud.');
  });

  document.getElementById('btn-start-mission').addEventListener('click', enterGameplay);

  document.getElementById('btn-retry').addEventListener('click', () => {
    loadLevel(currentLevelIndex);
    UI.showBriefing(Levels.LEVELS[currentLevelIndex].name, currentLevel.briefing);
  });
  document.getElementById('btn-title').addEventListener('click', () => {
    phase = 'menu';
    UI.showScreen('title-screen');
    refreshContinueButton();
  });

  document.getElementById('btn-next-mission').addEventListener('click', () => {
    const next = currentLevelIndex + 1;
    if (next >= Levels.LEVELS.length) {
      phase = 'menu';
      UI.showScreen('title-screen');
      refreshContinueButton();
      return;
    }
    loadLevel(next);
    UI.showBriefing('MISSION ' + (next + 1) + ': ' + Levels.LEVELS[next].name, currentLevel.briefing);
  });
  document.getElementById('btn-title-2').addEventListener('click', () => {
    phase = 'menu';
    UI.showScreen('title-screen');
    refreshContinueButton();
  });

  refreshContinueButton();

  // ---------------- background music ----------------
  Music.init();
  const musicBtn = document.getElementById('btn-music-toggle');
  musicBtn.classList.toggle('muted', Music.isMuted());
  musicBtn.addEventListener('click', () => {
    const muted = Music.toggleMute();
    musicBtn.classList.toggle('muted', muted);
  });

  // ---------------- game loop ----------------
  function ammoText() {
    if (weapons.currentIndex === 0) return '∞';
    const kind = weapons.currentIndex === 1 ? 'dragon' : 'daffodil';
    return weapons.ammo[kind] + ' left';
  }

  function checkWinLose(dt) {
    if (!player.alive) {
      phase = 'gameover';
      document.exitPointerLock && document.exitPointerLock();
      UI.showGameOver(Utils.choice([
        'Caught by the guards. "Now in a minute" turned out to be a lie.',
        "Dai Hard's men got there first. Duw duw.",
        'Overwhelmed. The sheep remain unliberated.',
      ]));
      return true;
    }
    if (UI.allObjectivesComplete() && currentLevel.extraction) {
      const d = Utils.dist2D(player.x, player.z, currentLevel.extraction.x, currentLevel.extraction.z);
      if (d < currentLevel.extraction.radius) {
        phase = 'win';
        document.exitPointerLock && document.exitPointerLock();
        const hasNext = currentLevelIndex + 1 < Levels.LEVELS.length;
        UI.showWin(hasNext ? 'Mission complete. On to the next one.' : 'All missions complete. Tidy work, Agent Bond.');
        document.getElementById('btn-next-mission').classList.toggle('hidden', !hasNext);
        return true;
      }
    }
    return false;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    if (phase === 'playing') {
      const enemyDt = dt * (player.slowmoTimer > 0 ? 0.4 : 1);
      const isMoving = player._keys['KeyW'] || player._keys['KeyA'] || player._keys['KeyS'] || player._keys['KeyD'];

      const dynamicColliders = sheep
        .filter(s => s.state !== 'fainted' && s.state !== 'destroyed')
        .map(NPC.sheepCollider);
      Player.update(player, dt, colliders, dynamicColliders);
      Weapons.updateViewmodel(weapons, dt, isMoving);

      for (const e of enemies) Enemy.update(e, enemyDt, player, wallMeshes, colliders);
      for (const s of sheep) NPC.updateSheep(s, dt);
      for (const v of villagers) NPC.updateVillager(v, dt, player, enemies);

      Weapons.updateProjectiles(
        weapons, dt, scene, colliders, [...enemies, ...sheep],
        (e) => e.onHit && e.onHit('dragon'),
        (pos) => Weapons.spawnPollenCloud(weapons, scene, pos)
      );

      Pickups.update(pickupState, dt, player, gameState);

      // Per-level custom objective logic (e.g. "destroy all the robot
      // sheep", "find the right pub", "defeat the boss") — see the
      // `updateObjectives` hook documented in levels.js.
      if (currentLevel.updateObjectives) {
        currentLevel.updateObjectives({ player, enemies, sheep, villagers, gameState });
      }

      const boss = enemies.find(e => e.isBoss);
      if (boss) {
        if (boss.alive) {
          UI.showBossHealth(boss.bossName || 'BOSS');
          UI.updateBossHealth(boss.hp, boss.maxHp);
        } else {
          UI.hideBossHealth();
        }
      }

      UI.tickSubtitle(dt);
      UI.tickFlash(dt);
      UI.updateHUD(player, Weapons.currentName(weapons), ammoText());

      checkWinLose(dt);
    }

    renderer.render(scene, camera);
  }

  resize();
  animate();
})();
