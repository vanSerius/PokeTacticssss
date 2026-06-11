/* ============================================================
   PokéTactics – Sound (WebAudio, keine Dateien nötig)
   ============================================================ */
"use strict";

const Sfx = (() => {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = "square", vol = 0.08, slide = 0, delay = 0) {
    const c = ac();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.1, delay = 0) {
    const c = ac();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    src.connect(g).connect(c.destination);
    src.start(t0);
  }

  return {
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
    tap()    { tone(660, .06, "square", .05); },
    select() { tone(520, .07, "square", .06); tone(780, .07, "square", .05, 0, .07); },
    cancel() { tone(420, .08, "square", .05, -120); },
    move()   { tone(330, .05, "triangle", .06); tone(392, .05, "triangle", .06, 0, .06); },
    hit()    { noise(.12, .12); tone(180, .12, "sawtooth", .08, -80); },
    crit()   { noise(.16, .15); tone(120, .2, "sawtooth", .1, -60); },
    heal()   { tone(523, .1, "sine", .07); tone(659, .1, "sine", .07, 0, .1); tone(784, .14, "sine", .07, 0, .2); },
    status() { tone(300, .12, "sawtooth", .06, 80); },
    miss()   { tone(500, .08, "triangle", .05, -200); },
    ko()     { tone(220, .3, "sawtooth", .09, -160); noise(.2, .08, .05); },
    turn()   { tone(587, .08, "square", .05); },
    whoosh() { tone(240, .2, "triangle", .06, 320); },
    zap()    { tone(1400, .16, "sawtooth", .07, -1100); noise(.07, .06); },
    beam()   { tone(160, .35, "sawtooth", .05, 260); noise(.3, .045); },
    rumble() { noise(.4, .13); tone(55, .4, "sine", .12, -15); },
    chime()  { tone(880, .14, "sine", .05); tone(1320, .18, "sine", .04, 0, .07); },
    win()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, "square", .07, 0, i * .14)); },
    lose()   { [392, 330, 262, 196].forEach((f, i) => tone(f, .22, "triangle", .07, 0, i * .18)); },
    levelup(){ [659, 784, 988, 1319].forEach((f, i) => tone(f, .12, "square", .06, 0, i * .1)); },
  };
})();
