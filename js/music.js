// ===== music.js =====
// Background music: a single looping ambient track, playing continuously
// from the title screen through every mission. Separate from audio.js
// (which only handles short synthesized SFX) since music has its own
// lifecycle — one persistent <audio> element, a mute preference saved
// across sessions, and the autoplay-permission dance browsers require.

const Music = (() => {
  const STORAGE_KEY = 'bachbond_music_muted';
  let el = null;
  let startAttempted = false;

  function init() {
    el = document.getElementById('bgm');
    if (!el) return;
    el.volume = 0.35; // sits under the SFX, never drowns them out
    if (isMuted()) el.muted = true;
    attemptStart();
  }

  function attemptStart() {
    if (!el || startAttempted) return;
    startAttempted = true;
    const p = el.play();
    if (p && p.catch) {
      p.catch(() => {
        // Autoplay blocked without a user gesture — retry on the first
        // click/keypress anywhere, which every path into the game passes
        // through anyway (title screen buttons, etc).
        startAttempted = false;
        const retry = () => { attemptStart(); };
        document.addEventListener('pointerdown', retry, { once: true });
        document.addEventListener('keydown', retry, { once: true });
      });
    }
  }

  function isMuted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setMuted(muted) {
    if (el) el.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (e) {
      // localStorage unavailable (private browsing etc) — mute still
      // applies for this session, it just won't be remembered.
    }
  }

  function toggleMute() {
    const next = !(el && el.muted);
    setMuted(next);
    return next;
  }

  return { init, toggleMute, isMuted };
})();
