/* ============================================================
   PokéTactics – Audio: Einstellungen, Sound-Samples, Musik
   SFX: Kenney Audio (CC0) + Beatscribe Jingles (CC0)
   Musik: eigener WebAudio-Chiptune-Sequencer (lizenzfrei)
   ============================================================ */
"use strict";

/* ---------- Einstellungen (persistent) ---------- */
const Settings = (() => {
  const KEY = "poketactics_settings_v1";
  const data = { music: .45, sfx: .8, vibration: true, fast: false, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(data, JSON.parse(raw));
  } catch (e) {}
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  return {
    data,
    set(key, val) {
      data[key] = val;
      save();
      if (key === "music" || key === "muted") Music.applyVolume();
      if (key === "sfx" || key === "muted") Sfx.applyVolume();
    },
  };
})();

/* ---------- Gemeinsamer AudioContext ---------- */
let _audioCtx = null;
function audioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

/* ============================================================
   Soundeffekte: echte Samples mit Synth-Fallback
   ============================================================ */
const Sfx = (() => {
  const SAMPLES = {
    tap: "tap", select: "select", cancel: "cancel",
    hit: "hit", crit: "crit", heal: "heal", ko: "ko",
    coins: "coins", equip: "equip", page: "page",
    zap: "zap", whoosh: "whoosh", beam: "beam", rumble: "rumble",
    chime: "chime", buff: "buff",
    win: "j_victory", lose: "j_gameover", battlestart: "j_start",
    boss: "j_boss", treasure: "j_treasure", reveal: "j_reveal",
    champion: "j_champion",
    step1: "step1", step2: "step2",
  };
  const buffers = {};
  let gain = null;
  let loading = false;

  function ensureGain() {
    const c = audioCtx();
    if (!c) return null;
    if (!gain) {
      gain = c.createGain();
      gain.connect(c.destination);
      applyVolume();
    }
    return gain;
  }

  function applyVolume() {
    if (gain) gain.gain.value = Settings.data.muted ? 0 : Settings.data.sfx;
  }

  async function preload() {
    if (loading) return;
    loading = true;
    const c = audioCtx();
    if (!c) return;
    for (const file of new Set(Object.values(SAMPLES))) {
      try {
        const res = await fetch("assets/audio/" + file + ".ogg");
        const buf = await res.arrayBuffer();
        buffers[file] = await c.decodeAudioData(buf);
      } catch (e) { /* Fallback bleibt Synth */ }
    }
  }

  function playSample(name, vol = 1, rate = 1) {
    const c = audioCtx();
    const g = ensureGain();
    const file = SAMPLES[name];
    if (!c || !g || !file || !buffers[file]) return false;
    const src = c.createBufferSource();
    src.buffer = buffers[file];
    src.playbackRate.value = rate;
    const vg = c.createGain();
    vg.gain.value = vol;
    src.connect(vg).connect(g);
    src.start();
    return true;
  }

  /* --- Synth-Fallbacks (und Spezialklänge ohne Sample) --- */
  function tone(freq, dur, type = "square", vol = 0.08, slide = 0, delay = 0) {
    const c = audioCtx();
    const g = ensureGain();
    if (!c || !g) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const vg = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    vg.gain.setValueAtTime(vol, t0);
    vg.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(vg).connect(g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.1, delay = 0) {
    const c = audioCtx();
    const g = ensureGain();
    if (!c || !g) return;
    const t0 = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const vg = c.createGain();
    vg.gain.setValueAtTime(vol, t0);
    src.connect(vg).connect(g);
    src.start(t0);
  }
  const S = (name, vol, rate) => playSample(name, vol, rate);

  /* --- Elementar-Synthese: gefiltertes Rauschen --- */
  function noiseShaped({ dur = .4, vol = .1, delay = 0, type = "lowpass", f0 = 800, f1 = null, q = 1, attack = .01 }) {
    const c = audioCtx();
    const g = ensureGain();
    if (!c || !g) return;
    const t0 = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    filt.Q.value = q;
    const vg = c.createGain();
    vg.gain.setValueAtTime(0.001, t0);
    vg.gain.linearRampToValueAtTime(vol, t0 + attack);
    vg.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt).connect(vg).connect(g);
    src.start(t0);
  }

  /* ⚡ Strom: Knistern aus kurzen Knacksern + fallender Zap */
  function elElectric() {
    for (let i = 0; i < 10; i++) {
      noiseShaped({ dur: .015 + Math.random() * .02, vol: .14, delay: Math.random() * .28, type: "highpass", f0: 2500, q: 2, attack: .002 });
    }
    tone(2200, .25, "sawtooth", .05, -1900);
    tone(90, .12, "square", .08, -30);
  }
  /* 🔥 Feuer: auffauchende Flamme + Glut-Knacken */
  function elFire(big) {
    noiseShaped({ dur: big ? .7 : .45, vol: .16, type: "lowpass", f0: 300, f1: 2400, q: .8, attack: .06 });
    noiseShaped({ dur: big ? .5 : .35, vol: .12, delay: .12, type: "lowpass", f0: 2200, f1: 350, q: .8 });
    for (let i = 0; i < 5; i++) {
      noiseShaped({ dur: .02, vol: .1, delay: .08 + Math.random() * (big ? .5 : .3), type: "bandpass", f0: 800 + Math.random() * 2500, q: 6, attack: .002 });
    }
  }
  /* 💧 Wasser: Blubbern + Platscher */
  function elWater(big) {
    for (let i = 0; i < (big ? 5 : 3); i++) {
      tone(520 + Math.random() * 260, .08, "sine", .07, 180, .03 + i * .06);
    }
    noiseShaped({ dur: big ? .55 : .35, vol: .15, delay: .1, type: "bandpass", f0: 1600, f1: 500, q: 1.2, attack: .03 });
    noiseShaped({ dur: .3, vol: .08, delay: .22, type: "lowpass", f0: 900, f1: 250 });
  }
  /* 🍃 Pflanze: Blätter-Rascheln + Peitschenknall */
  function elGrass() {
    for (let i = 0; i < 3; i++) {
      noiseShaped({ dur: .09, vol: .09, delay: i * .07, type: "highpass", f0: 3200, q: 1.5, attack: .01 });
    }
    noiseShaped({ dur: .04, vol: .16, delay: .22, type: "bandpass", f0: 1500, q: 3, attack: .002 });
    tone(1100, .07, "triangle", .05, -500, .22);
  }
  /* 🧠 Psycho: schwebende Schwebung + Glitzern */
  function elPsychic() {
    tone(480, .55, "sine", .06, 420);
    tone(486, .55, "sine", .06, 430);
    for (let i = 0; i < 3; i++) tone(1400 + i * 350, .1, "sine", .04, 200, .25 + i * .09);
  }
  /* 👻 Geist: unheimliches Heulen abwärts + Hauch */
  function elGhost() {
    tone(420, .6, "sawtooth", .035, -260);
    tone(424, .6, "sine", .06, -270);
    noiseShaped({ dur: .55, vol: .05, type: "bandpass", f0: 600, f1: 250, q: 2, attack: .15 });
  }
  /* 🪨 Boden/Gestein: Felsschläge + Grollen */
  function elRock(big) {
    for (let i = 0; i < (big ? 4 : 2); i++) {
      noiseShaped({ dur: .1, vol: .2, delay: i * .11, type: "lowpass", f0: 240, f1: 70, attack: .003 });
    }
    noiseShaped({ dur: big ? .8 : .45, vol: .12, type: "lowpass", f0: 140, f1: 60, attack: .04 });
  }
  /* 🌬 Flug: Windböe */
  function elWind() {
    noiseShaped({ dur: .45, vol: .13, type: "bandpass", f0: 500, f1: 2200, q: 1.5, attack: .1 });
    noiseShaped({ dur: .3, vol: .08, delay: .25, type: "bandpass", f0: 2200, f1: 700, q: 1.5 });
  }
  /* ☠ Gift: zähes Blubbern */
  function elPoison() {
    for (let i = 0; i < 5; i++) {
      tone(180 + Math.random() * 160, .1, "sine", .07, 120, i * .07);
    }
    noiseShaped({ dur: .4, vol: .07, type: "lowpass", f0: 500, f1: 200, attack: .05 });
  }

  return {
    preload, applyVolume,
    toggle() { Settings.set("muted", !Settings.data.muted); return Settings.data.muted; },
    get muted() { return Settings.data.muted; },

    /* Elementar-Sound passend zum Attacken-Typ */
    element(type, big = false) {
      switch (type) {
        case "electric": elElectric(); break;
        case "fire":     elFire(big); break;
        case "water":    elWater(big); break;
        case "grass":    elGrass(); break;
        case "psychic":  elPsychic(); break;
        case "ghost":    elGhost(); break;
        case "rock": case "ground": elRock(big); break;
        case "flying":   elWind(); break;
        case "poison":   elPoison(); break;
        default: this.whoosh();
      }
    },

    tap()    { S("tap", .9) || tone(660, .06, "square", .05); },
    select() { S("select", .9) || (tone(520, .07, "square", .06), tone(780, .07, "square", .05, 0, .07)); },
    cancel() { S("cancel", .9) || tone(420, .08, "square", .05, -120); },
    move()   { S(Math.random() < .5 ? "step1" : "step2", .7, .95 + Math.random() * .15) || (tone(330, .05, "triangle", .06), tone(392, .05, "triangle", .06, 0, .06)); },
    hit()    { S("hit", 1) || (noise(.12, .12), tone(180, .12, "sawtooth", .08, -80)); },
    crit()   { S("crit", 1) || (noise(.16, .15), tone(120, .2, "sawtooth", .1, -60)); },
    heal()   { S("heal", .8) || (tone(523, .1, "sine", .07), tone(659, .1, "sine", .07, 0, .1), tone(784, .14, "sine", .07, 0, .2)); },
    status() { tone(300, .12, "sawtooth", .06, 80); },
    miss()   { tone(500, .08, "triangle", .05, -200); },
    ko()     { S("ko", 1) || (tone(220, .3, "sawtooth", .09, -160), noise(.2, .08, .05)); },
    turn()   { tone(587, .06, "square", .035); },
    whoosh() { S("whoosh", .7, 1.2) || tone(240, .2, "triangle", .06, 320); },
    zap()    { S("zap", .8) || (tone(1400, .16, "sawtooth", .07, -1100), noise(.07, .06)); },
    beam()   { S("beam", .8) || (tone(160, .35, "sawtooth", .05, 260), noise(.3, .045)); },
    rumble() { S("rumble", .9, .8) || (noise(.4, .13), tone(55, .4, "sine", .12, -15)); },
    chime()  { S("chime", .7) || (tone(880, .14, "sine", .05), tone(1320, .18, "sine", .04, 0, .07)); },
    buff()   { S("buff", .7) || tone(700, .15, "square", .05, 200); },
    coins()  { S("coins", .9) || (tone(900, .08, "square", .06), tone(1200, .1, "square", .05, 0, .08)); },
    equip()  { S("equip", .8) || tone(500, .08, "square", .05); },
    page()   { S("page", .8) || tone(400, .06, "triangle", .04); },
    win()    { Music.duck(4.5); S("win", 1) || [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, "square", .07, 0, i * .14)); },
    lose()   { Music.duck(5); S("lose", 1) || [392, 330, 262, 196].forEach((f, i) => tone(f, .22, "triangle", .07, 0, i * .18)); },
    battlestart() { S("battlestart", .8); },
    boss()   { Music.duck(3); S("boss", 1); },
    treasure(){ S("treasure", .9) || this.levelup(); },
    reveal() { S("reveal", 1); },
    champion(){ Music.duck(6); S("champion", 1); },
    levelup(){ [659, 784, 988, 1319].forEach((f, i) => tone(f, .12, "square", .06, 0, i * .1)); },
    evolve() {
      for (let i = 0; i < 10; i++) tone(330 + i * 70, .22, "sine", .04, 60, i * .28);
      tone(140, 2.8, "sine", .03, 120);
    },
  };
})();

/* ============================================================
   Hintergrundmusik: Chiptune-Sequencer (WebAudio)
   Themes: title (Karte/Menü), battle, dark (Spuk/Zitadelle)
   ============================================================ */
const Music = (() => {
  /* Notennamen -> Frequenz */
  const N = {};
  (() => {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    for (let oct = 1; oct <= 6; oct++) {
      names.forEach((n, i) => {
        N[n + oct] = 440 * Math.pow(2, (i - 9) / 12 + (oct - 4));
      });
    }
  })();

  /* Kompositionsformat: 16 Steps pro Takt.
     lead/acc/bass: je Takt ein Array aus [step, note, lenInSteps]
     drums: String je Takt, 16 Zeichen: k=Kick, h=Hat, s=Snare, .=Pause */
  const THEMES = {
    title: {
      bpm: 104, swing: 0,
      bars: 4,
      bass: [
        [[0, "C2", 6], [8, "G2", 6]],
        [[0, "G1", 6], [8, "D2", 6]],
        [[0, "A1", 6], [8, "E2", 6]],
        [[0, "F1", 6], [8, "C2", 6]],
      ],
      acc: [
        [[0, "E3", 2], [4, "G3", 2], [8, "C4", 2], [12, "G3", 2]],
        [[0, "D3", 2], [4, "G3", 2], [8, "B3", 2], [12, "G3", 2]],
        [[0, "E3", 2], [4, "A3", 2], [8, "C4", 2], [12, "A3", 2]],
        [[0, "F3", 2], [4, "A3", 2], [8, "C4", 2], [12, "A3", 2]],
      ],
      lead: [
        [[0, "E4", 3], [4, "G4", 3], [8, "C5", 4], [14, "B4", 2]],
        [[0, "G4", 3], [4, "B4", 3], [8, "D5", 6]],
        [[0, "C5", 3], [4, "B4", 1], [6, "A4", 4], [12, "E4", 3]],
        [[0, "F4", 3], [4, "A4", 3], [8, "G4", 6]],
      ],
      drums: ["k.h.h.h.k.h.h.h.", "k.h.h.h.k.h.h.h.", "k.h.h.h.k.h.h.h.", "k.h.h.h.k.h.s.h."],
    },
    battle: {
      bpm: 138, swing: 0,
      bars: 4,
      bass: [
        [[0, "A1", 2], [2, "A1", 2], [4, "A2", 2], [6, "A1", 2], [8, "A1", 2], [10, "A1", 2], [12, "G1", 2], [14, "G1", 2]],
        [[0, "F1", 2], [2, "F1", 2], [4, "F2", 2], [6, "F1", 2], [8, "F1", 2], [10, "F1", 2], [12, "E1", 2], [14, "E1", 2]],
        [[0, "G1", 2], [2, "G1", 2], [4, "G2", 2], [6, "G1", 2], [8, "G1", 2], [10, "G1", 2], [12, "A1", 2], [14, "B1", 2]],
        [[0, "E1", 2], [2, "E1", 2], [4, "E2", 2], [6, "E1", 2], [8, "E2", 2], [10, "E1", 2], [12, "E2", 2], [14, "E1", 2]],
      ],
      acc: [
        [[0, "A3", 1], [4, "C4", 1], [8, "E4", 1], [12, "C4", 1]],
        [[0, "A3", 1], [4, "C4", 1], [8, "F4", 1], [12, "C4", 1]],
        [[0, "B3", 1], [4, "D4", 1], [8, "G4", 1], [12, "D4", 1]],
        [[0, "B3", 1], [4, "E4", 1], [8, "G#3", 1], [12, "E4", 1]],
      ],
      lead: [
        [[0, "A4", 2], [3, "C5", 1], [4, "B4", 2], [8, "E5", 3], [12, "C5", 2], [14, "B4", 2]],
        [[0, "A4", 2], [3, "C5", 1], [4, "D5", 2], [8, "C5", 3], [12, "A4", 4]],
        [[0, "B4", 2], [3, "D5", 1], [4, "G4", 2], [8, "B4", 3], [12, "D5", 2], [14, "E5", 2]],
        [[0, "E5", 4], [6, "D5", 2], [8, "B4", 3], [12, "G#4", 4]],
      ],
      drums: ["k.h.s.h.k.h.s.h.", "k.h.s.h.k.h.s.h.", "k.h.s.h.k.h.s.h.", "k.h.s.h.k.k.s.s."],
    },
    dark: {
      bpm: 92, swing: 0,
      bars: 4,
      bass: [
        [[0, "D2", 12]],
        [[0, "A#1", 12]],
        [[0, "G1", 12]],
        [[0, "A1", 6], [8, "C#2", 6]],
      ],
      acc: [
        [[0, "D3", 2], [6, "F3", 2], [12, "A3", 2]],
        [[0, "A#2", 2], [6, "D3", 2], [12, "F3", 2]],
        [[0, "G2", 2], [6, "A#2", 2], [12, "D3", 2]],
        [[0, "A2", 2], [6, "C#3", 2], [12, "E3", 2]],
      ],
      lead: [
        [[0, "D5", 6], [8, "C#5", 4], [12, "D5", 4]],
        [[0, "F5", 8], [10, "E5", 2], [12, "D5", 4]],
        [[0, "A#4", 6], [8, "A4", 6]],
        [[0, "A4", 10], [12, "C#5", 4]],
      ],
      drums: ["k.......h.......", "k.......h.......", "k.......h...h...", "k.....k...h.h.h."],
    },
  };

  let master = null;
  let current = null;     // {name, timer, nextTime, pos}
  let pending = null;

  function ensureMaster() {
    const c = audioCtx();
    if (!c) return null;
    if (!master) {
      master = c.createGain();
      master.connect(c.destination);
      applyVolume();
    }
    return master;
  }

  function applyVolume() {
    if (master) {
      master.gain.cancelScheduledValues(audioCtx().currentTime);
      master.gain.value = Settings.data.muted ? 0 : Settings.data.music * .5;
    }
  }

  /* Einen Step einplanen */
  function scheduleStep(theme, bar, step, when, stepDur) {
    const c = audioCtx();
    const out = ensureMaster();
    const playNote = (note, len, type, vol) => {
      const f = N[note];
      if (!f) return;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const dur = len * stepDur * .92;
      g.gain.setValueAtTime(vol, when);
      g.gain.setValueAtTime(vol, when + dur * .6);
      g.gain.linearRampToValueAtTime(0.001, when + dur);
      osc.connect(g).connect(out);
      osc.start(when);
      osc.stop(when + dur + .02);
    };
    for (const [s, note, len] of theme.lead[bar]) if (s === step) playNote(note, len, "square", .16);
    for (const [s, note, len] of theme.acc[bar]) if (s === step) playNote(note, len, "square", .055);
    for (const [s, note, len] of theme.bass[bar]) if (s === step) playNote(note, len, "triangle", .3);
    const d = theme.drums[bar][step];
    if (d && d !== ".") {
      const len = Math.floor(c.sampleRate * (d === "k" ? .1 : d === "s" ? .12 : .04));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = d === "k" ? .5 : d === "s" ? .3 : .12;
      if (d === "k") {
        const filt = c.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 220;
        src.connect(filt).connect(g).connect(out);
      } else {
        const filt = c.createBiquadFilter();
        filt.type = "highpass";
        filt.frequency.value = d === "s" ? 1400 : 5000;
        src.connect(filt).connect(g).connect(out);
      }
      src.start(when);
    }
  }

  function startTheme(name) {
    const c = audioCtx();
    if (!c || !THEMES[name]) return;
    stop(0.1);
    ensureMaster();
    applyVolume();
    const theme = THEMES[name];
    const stepDur = 60 / theme.bpm / 4;
    const state = { name, pos: 0, nextTime: c.currentTime + .08, timer: null };
    state.timer = setInterval(() => {
      try {
        if (!_audioCtx || _audioCtx.state !== "running") return;
        while (state.nextTime < c.currentTime + .25) {
          const bar = Math.floor(state.pos / 16) % theme.bars;
          const step = state.pos % 16;
          scheduleStep(theme, bar, step, state.nextTime, stepDur);
          state.nextTime += stepDur;
          state.pos++;
        }
      } catch (e) { /* Musik darf nie crashen */ }
    }, 90);
    current = state;
  }

  function stop(fade = .4) {
    if (current) {
      clearInterval(current.timer);
      current = null;
    }
    if (master && _audioCtx) {
      const t = _audioCtx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => applyVolume(), (fade + .15) * 1000);
    }
  }

  return {
    applyVolume,
    /* Theme anfordern; startet erst nach erster Nutzer-Interaktion */
    play(name) {
      pending = name;
      if (current && current.name === name) return;
      if (!_audioCtx) return; // wartet auf unlock()
      startTheme(name);
    },
    stop,
    /* Musik kurz leise drehen (für Jingles) */
    duck(seconds = 3) {
      if (!master || !_audioCtx) return;
      const t = _audioCtx.currentTime;
      const back = Settings.data.muted ? 0 : Settings.data.music * .5;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(.02, t);
      master.gain.setValueAtTime(.02, t + seconds);
      master.gain.linearRampToValueAtTime(back, t + seconds + 1);
    },
    /* Nach erster Interaktion aufrufen (Autoplay-Sperre) */
    unlock() {
      audioCtx();
      Sfx.preload();
      if (pending && (!current || current.name !== pending)) startTheme(pending);
    },
    battleTheme: "battle",
  };
})();

/* Autoplay-Sperre: erster Tap schaltet Audio frei */
window.addEventListener("pointerdown", () => Music.unlock(), { once: true });
