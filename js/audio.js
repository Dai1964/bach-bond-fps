// ===== audio.js =====
// Tiny WebAudio synth so the game needs zero external sound assets.
// Every SFX is a short procedural blip/noise burst.

const Audio1 = (() => {
  let ctx = null;

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.2, glideTo = null) {
    const c = ensureCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, c.currentTime + dur);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  function noiseBurst(dur, vol = 0.2, filterFreq = 1500) {
    const c = ensureCtx();
    const bufferSize = c.sampleRate * dur;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
  }

  return {
    // Leek whack — satisfying thwack
    leekWhack() { noiseBurst(0.12, 0.35, 900); tone(180, 0.08, 'square', 0.15); },
    // Dragon plushie bounce/thump
    dragonBounce() { tone(120, 0.1, 'triangle', 0.2, 90); },
    dragonKO() { tone(300, 0.15, 'sawtooth', 0.2, 60); noiseBurst(0.2, 0.2, 600); },
    // Daffodil pollen puff
    daffodilPop() { noiseBurst(0.25, 0.25, 2200); tone(500, 0.15, 'sine', 0.15, 900); },
    // Pickup / heal
    pickup() { tone(660, 0.08, 'square', 0.2, 990); },
    // Startled villager gasp ("Ach y fi!")
    gasp() { tone(700, 0.09, 'sine', 0.18, 1100); },
    // Beer glug
    beerGlug() { tone(220, 0.2, 'sine', 0.2, 160); },
    // Alarm shout
    alarm() { tone(440, 0.3, 'sawtooth', 0.15, 220); },
    // Robot sheep shorting out
    robotZap() { noiseBurst(0.3, 0.25, 3000); tone(700, 0.35, 'sawtooth', 0.18, 40); },
    // Enemy defeated cry pitch
    defeat() { tone(200, 0.25, 'triangle', 0.2, 80); },
    // Player hurt
    hurt() { noiseBurst(0.15, 0.3, 400); },
    // Footstep tick (very subtle)
    step() { noiseBurst(0.03, 0.05, 300); },
    // Menu blip
    blip() { tone(880, 0.05, 'square', 0.12); },
  };
})();
