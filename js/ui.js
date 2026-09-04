// ===== ui.js =====
// All DOM/HUD glue: screens, subtitles, dialogue (persuasion) box, pause
// menu, HUD bars, damage flash, and buff overlays. Kept separate from
// main.js so the 3D/game-loop code doesn't have to touch the DOM directly.
//
// NOTE: `UI.alertAllGuards` is assigned by main.js once a level's enemies
// exist (needed for the "too many beers" penalty in pickups.js).

const UI = (() => {
  const el = (id) => document.getElementById(id);

  let subtitleTimer = 0;
  let objectives = []; // [{id, text, done}]

  function showScreen(id) {
    ['title-screen', 'briefing-screen', 'gameover-screen', 'win-screen'].forEach(s => {
      el(s).classList.toggle('hidden', s !== id);
    });
    el('game-container').classList.toggle('hidden', true);
  }

  function showGame() {
    ['title-screen', 'briefing-screen', 'gameover-screen', 'win-screen'].forEach(s => el(s).classList.add('hidden'));
    el('game-container').classList.remove('hidden');
  }

  function showBriefing(title, text) {
    showScreen('briefing-screen');
    el('briefing-title').textContent = title;
    el('briefing-text').textContent = text;
  }

  function showGameOver(reason) {
    showScreen('gameover-screen');
    el('gameover-reason').textContent = reason;
  }

  function showWin(text) {
    showScreen('win-screen');
    el('win-text').textContent = text;
  }

  // ---------------- subtitles ----------------
  function subtitle(text, duration = 2.6) {
    el('subtitle-box').textContent = text;
    subtitleTimer = duration;
  }

  function tickSubtitle(dt) {
    if (subtitleTimer > 0) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) el('subtitle-box').textContent = '';
    }
  }

  // ---------------- HUD ----------------
  function updateHUD(player, weaponName, ammoText) {
    el('health-fill').style.width = Utils.clamp(player.health, 0, player.maxHealth) + '%';
    el('armour-fill').style.width = Utils.clamp(player.armour, 0, player.maxArmour) + '%';
    el('weapon-name').textContent = weaponName + (player.analogMode ? '  [ANALOG]' : '');
    el('ammo-count').textContent = ammoText;

    const buffs = [];
    if (player.slowmoTimer > 0) buffs.push('BRAINS S.A. ' + player.slowmoTimer.toFixed(0) + 's');
    if (player.nightVisionTimer > 0) buffs.push('NIGHT VISION ' + player.nightVisionTimer.toFixed(0) + 's');
    if (player.shieldCharges > 0) buffs.push('SHIELD x' + player.shieldCharges);
    if (player.drunkTimer > 0) buffs.push('DRUNK ' + player.drunkTimer.toFixed(0) + 's');
    el('buff-indicator').textContent = buffs.join('  ·  ');

    setNightVision(player.nightVisionTimer > 0);
  }

  // ---------------- damage / buff overlays ----------------
  let flashT = 0;
  function flashDamage() {
    flashT = 0.18;
    el('damage-flash').classList.add('hit');
  }
  function tickFlash(dt) {
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) el('damage-flash').classList.remove('hit');
    }
  }

  function setBeerBlur(on) {
    el('beer-blur').classList.toggle('drunk', on);
  }

  function setNightVision(on) {
    el('game-canvas').style.filter = on ? 'brightness(1.6) sepia(0.3) hue-rotate(70deg) saturate(2)' : '';
  }

  // ---------------- boss health (final level only) ----------------
  function showBossHealth(name) {
    el('boss-health').classList.remove('hidden');
    el('boss-health-name').textContent = name;
  }
  function updateBossHealth(hp, maxHp) {
    el('boss-health-fill').style.width = Utils.clamp((hp / maxHp) * 100, 0, 100) + '%';
  }
  function hideBossHealth() {
    el('boss-health').classList.add('hidden');
  }

  // ---------------- objectives ----------------
  function setObjectives(list) {
    objectives = list.map(o => ({ ...o, done: false }));
    renderObjectives();
  }
  function completeObjective(id) {
    const o = objectives.find(o => o.id === id);
    if (o) o.done = true;
    renderObjectives();
  }
  function allObjectivesComplete() {
    return objectives.every(o => o.done);
  }
  function renderObjectives() {
    const active = objectives.find(o => !o.done);
    el('objective-banner').textContent = active ? ('OBJECTIVE: ' + active.text) : 'All objectives complete — get out!';
  }

  // ---------------- dialogue / persuasion ----------------
  function openDialogue(npcName, prompt, options) {
    el('dialogue-box').classList.remove('hidden');
    el('dialogue-npc-name').textContent = npcName;
    el('dialogue-prompt').textContent = prompt;
    const container = el('dialogue-options');
    container.innerHTML = '';
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'dialogue-option';
      btn.textContent = opt.label;
      btn.onclick = () => { closeDialogue(); opt.onSelect(); };
      container.appendChild(btn);
    });
    document.exitPointerLock && document.exitPointerLock();
  }
  function closeDialogue() {
    el('dialogue-box').classList.add('hidden');
  }
  function isDialogueOpen() {
    return !el('dialogue-box').classList.contains('hidden');
  }

  // ---------------- pause menu ----------------
  function showPause() { el('pause-menu').classList.remove('hidden'); }
  function hidePause() { el('pause-menu').classList.add('hidden'); }
  function isPaused() { return !el('pause-menu').classList.contains('hidden'); }

  function showClickToPlay(on) { el('click-to-play').classList.toggle('hidden', !on); }

  return {
    el,
    showScreen, showGame, showBriefing, showGameOver, showWin,
    subtitle, tickSubtitle,
    updateHUD, flashDamage, tickFlash, setBeerBlur, setNightVision,
    setObjectives, completeObjective, allObjectivesComplete,
    showBossHealth, updateBossHealth, hideBossHealth,
    openDialogue, closeDialogue, isDialogueOpen,
    showPause, hidePause, isPaused, showClickToPlay,
    alertAllGuards: null, // assigned by main.js per-level
  };
})();
