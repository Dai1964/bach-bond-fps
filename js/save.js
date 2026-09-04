// ===== save.js =====
// Single save slot, per the brief: "Under the Illtud".
// Stored as JSON in localStorage under one fixed key.

const SaveSystem = (() => {
  const KEY = 'bachbond_save_under_the_illtud';

  function save(state) {
    const payload = {
      slotName: 'Under the Illtud',
      savedAt: Date.now(),
      levelIndex: state.levelIndex,
      health: state.health,
      armour: state.armour,
      weapon: state.currentWeapon,
      ammo: state.ammo,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return payload;
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Save data corrupt, ignoring.', e);
      return null;
    }
  }

  function hasSave() {
    return !!localStorage.getItem(KEY);
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  return { save, load, hasSave, clear };
})();
