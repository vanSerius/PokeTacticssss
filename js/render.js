/* ============================================================
   PokéTactics – Isometrischer Renderer + Touch-Kamera
   ============================================================ */
"use strict";

const TILE_W = 64;
const TILE_H = 32;
const H_STEP = 14;

/* Welche Attacke bekommt welchen Effekt?
   kind: beam | projectile | bolt | fall | ring | rise | slash | quake | drainbeam
   "_typ" = Fallback für alle Attacken eines Typs */
const MOVE_VFX = {
  // Normal / Kampf / Flug (Nahkampf & Treffer)
  hieb:         { kind: "slash" },
  tackle:       { kind: "slash" },
  ruckzuck:     { kind: "slash", color: "#fff" },
  bodyslam:     { kind: "quake", color: "#cbd5e1" },
  biss:         { kind: "slash", color: "#e5e7eb" },
  karateschlag: { kind: "slash", color: "#fca5a5" },
  geowurf:      { kind: "quake", color: "#fca5a5" },
  schnabel:     { kind: "slash", color: "#c7d2fe" },
  fluegelschlag:{ kind: "slash", color: "#c7d2fe" },
  windstoss:    { kind: "beam", color: "#c7d2fe", width: 6, dur: .45 },
  sternschauer: { kind: "projectile", color: "#fde047", arc: 60, size: 6 },
  heuler:       { kind: "ring", color: "#cbd5e1" },
  superschall:  { kind: "ring", color: "#e0e7ff" },
  erholung:     { kind: "rise", color: "#86efac" },
  protzer:      { kind: "rise", color: "#fca5a5" },

  // Elektro
  donnerschock: { kind: "bolt" },
  donnerblitz:  { kind: "bolt" },
  donnerwelle:  { kind: "bolt", color: "#fef9c3" },
  funkensprung: { kind: "bolt" },

  // Feuer
  glut:         { kind: "projectile", color: "#fb923c", size: 8, arc: 30 },
  flammenwurf:  { kind: "beam", color: "#f97316", width: 10 },
  feuerwirbel:  { kind: "rise", color: "#fb923c", n: 18 },

  // Wasser
  aquaknarre:   { kind: "beam", color: "#60a5fa", width: 6, dur: .45 },
  blubbstrahl:  { kind: "projectile", color: "#93c5fd", size: 9, arc: 26 },
  hydropumpe:   { kind: "beam", color: "#3b82f6", width: 14, dur: .7 },
  panzerschutz: { kind: "ring", color: "#93c5fd" },

  // Pflanze
  rankenhieb:   { kind: "slash", color: "#4ade80" },
  rasierblatt:  { kind: "fall", shape: "leaf", color: "#4ade80", n: 6 },
  megasauger:   { kind: "drainbeam", color: "#86efac" },
  schlafpuder:  { kind: "fall", shape: "drop", color: "#d8b4fe", n: 8, dur: .9 },

  // Psycho
  konfusion:    { kind: "ring" },
  psystrahl:    { kind: "beam+ring", color: "#f0abfc", width: 8 },
  psychokinese: { kind: "ring", rings: 4, dur: .8 },
  psychoklinge: { kind: "beam+ring", color: "#e879f9", width: 12, dur: .7 },
  genesung:     { kind: "rise", color: "#86efac" },
  heilwoge:     { kind: "rise", color: "#86efac", n: 16 },
  barriere:     { kind: "ring", color: "#93c5fd" },
  hypnose:      { kind: "ring", color: "#a5b4fc", rings: 4, dur: .9 },

  // Geist
  schlecker:    { kind: "slash", color: "#c084fc" },
  nachtnebel:   { kind: "projectile", color: "#6d28d9", size: 9, arc: 18 },
  spukball:     { kind: "projectile+ring", color: "#a855f7", size: 10, arc: 24 },

  // Gestein / Boden
  steinwurf:    { kind: "projectile", color: "#a8a29e", size: 8, arc: 70 },
  steinhagel:   { kind: "fall", shape: "rock", color: "#a8a29e", n: 5 },
  haertner:     { kind: "ring", color: "#d6d3d1" },
  knochenkeule: { kind: "slash", color: "#e7e5e4" },
  knochmerang:  { kind: "projectile", color: "#e7e5e4", size: 7, arc: 55 },
  intensitaet:  { kind: "quake", color: "#d97706" },
  schaufler:    { kind: "quake", color: "#d97706" },

  // Gift
  giftstachel:  { kind: "projectile", color: "#a855f7", size: 6, arc: 30 },
  saeure:       { kind: "fall", shape: "drop", color: "#a855f7", n: 7 },

  // Typ-Fallbacks
  _normal:   { kind: "slash" },
  _fighting: { kind: "slash", color: "#fca5a5" },
  _electric: { kind: "bolt" },
  _fire:     { kind: "projectile", color: "#fb923c" },
  _water:    { kind: "beam", color: "#60a5fa" },
  _grass:    { kind: "fall", shape: "leaf", color: "#4ade80" },
  _psychic:  { kind: "ring" },
  _ghost:    { kind: "projectile", color: "#a855f7" },
  _rock:     { kind: "projectile", color: "#a8a29e", arc: 70 },
  _ground:   { kind: "quake" },
  _flying:   { kind: "slash", color: "#c7d2fe" },
  _poison:   { kind: "projectile", color: "#a855f7" },
};

class IsoRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.targetCam = null;
    this.battle = null;
    this.highlights = new Map();   // "x,y" -> 'move'|'attack'|'aoe'|'path'
    this.cursor = null;            // {x,y}
    this.popups = [];
    this.particles = [];
    this.fx = [];                  // Attacken-Effekte
    this.time = 0;
    this.onTap = null;
    this._setupInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    requestAnimationFrame((t) => this._frame(t));
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
  }

  resize() { this._resize(); if (this.battle) this.fitCamera(); }

  setBattle(battle) {
    this.battle = battle;
    this.highlights.clear();
    this.cursor = null;
    this.popups = [];
    this.particles = [];
    this.fitCamera();
  }

  /* Kamera so setzen, dass die Karte komplett sichtbar ist */
  fitCamera() {
    const b = this.battle;
    if (!b) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const mapW = (b.w + b.h) * TILE_W / 2;
    const mapH = (b.w + b.h) * TILE_H / 2 + 5 * H_STEP + 60;
    const zoom = Math.max(0.5, Math.min(w / (mapW + 40), (h - 200) / mapH, 1.6));
    this.cam.zoom = zoom;
    const c = this._tileCenterWorld((b.w - 1) / 2, (b.h - 1) / 2, 1);
    this.cam.x = c.x;
    this.cam.y = c.y + 30;
  }

  /* ---------- Koordinaten ---------- */
  _tileCenterWorld(x, y, h) {
    return { x: (x - y) * TILE_W / 2, y: (x + y) * TILE_H / 2 - h * H_STEP };
  }
  worldToScreen(wx, wy) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return {
      x: (wx - this.cam.x) * this.cam.zoom + w / 2,
      y: (wy - this.cam.y) * this.cam.zoom + h / 2,
    };
  }
  screenToWorld(sx, sy) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return {
      x: (sx - w / 2) / this.cam.zoom + this.cam.x,
      y: (sy - h / 2) / this.cam.zoom + this.cam.y,
    };
  }
  /* Welcher Tile liegt unter dem Bildschirmpunkt? (oberste zuerst) */
  pickTile(sx, sy) {
    const b = this.battle;
    if (!b) return null;
    const wpt = this.screenToWorld(sx, sy);
    const tiles = [];
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) tiles.push({ x, y, s: x + y });
    tiles.sort((a, c) => c.s - a.s); // vorderste zuerst prüfen
    for (const t of tiles) {
      const hgt = b.heightAt(t.x, t.y);
      const c = this._tileCenterWorld(t.x, t.y, hgt);
      const dx = Math.abs(wpt.x - c.x), dy = Math.abs(wpt.y - c.y);
      if (dx / (TILE_W / 2) + dy / (TILE_H / 2) <= 1) return { x: t.x, y: t.y };
    }
    return null;
  }

  centerOnTile(x, y, instant = false) {
    const b = this.battle;
    const h = b ? b.heightAt(x, y) : 0;
    const c = this._tileCenterWorld(x, y, h);
    if (instant) { this.cam.x = c.x; this.cam.y = c.y; }
    else this.targetCam = { x: c.x, y: c.y };
  }

  /* ---------- Eingabe (Pan/Pinch/Tap) ---------- */
  _setupInput() {
    const cv = this.canvas;
    const pointers = new Map();
    let panStart = null, camStart = null, pinchStart = null, moved = false;

    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.targetCam = null;
      if (pointers.size === 1) {
        panStart = { x: e.clientX, y: e.clientY };
        camStart = { x: this.cam.x, y: this.cam.y };
        moved = false;
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchStart = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          zoom: this.cam.zoom,
        };
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1 && panStart) {
        const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (moved) {
          this.cam.x = camStart.x - dx / this.cam.zoom;
          this.cam.y = camStart.y - dy / this.cam.zoom;
        }
      } else if (pointers.size === 2 && pinchStart) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.cam.zoom = Math.max(0.4, Math.min(2.6, pinchStart.zoom * d / pinchStart.dist));
        moved = true;
      }
    });
    const up = (e) => {
      if (pointers.has(e.pointerId)) {
        const wasTap = pointers.size === 1 && !moved;
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (pointers.size === 0) {
          panStart = null;
          if (wasTap && this.onTap) {
            const tile = this.pickTile(e.clientX, e.clientY);
            this.onTap(tile);
          }
        }
      }
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
  }

  /* ---------- Effekte ---------- */
  addPopup(x, y, text, color = "#fff", big = false) {
    const b = this.battle;
    const c = this._tileCenterWorld(x, y, b.heightAt(x, y));
    this.popups.push({ wx: c.x, wy: c.y - 40, text, color, t: 0, big });
  }
  burst(x, y, color, n = 14) {
    const b = this.battle;
    const c = this._tileCenterWorld(x, y, b.heightAt(x, y));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
      this.particles.push({
        wx: c.x, wy: c.y - 20,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
        life: .5 + Math.random() * .4, t: 0,
        color, size: 2 + Math.random() * 3,
      });
    }
  }
  shake(strength = 6) { this._shake = { t: 0, s: strength }; }
  /* Aufsteigende Partikel (Seele beim K.O., Heilung) */
  riseBurst(x, y, color, n = 12) {
    const b = this.battle;
    const c = this._tileCenterWorld(x, y, b.heightAt(x, y));
    for (let i = 0; i < n; i++) {
      this.particles.push({
        wx: c.x + (Math.random() - .5) * 30, wy: c.y - 8 - Math.random() * 20,
        vx: (Math.random() - .5) * 24, vy: -36 - Math.random() * 50,
        grav: -22, life: .7 + Math.random() * .5, t: 0,
        color, size: 1.6 + Math.random() * 2.4,
      });
    }
  }

  /* ============================================================
     Attacken-Effekte (VFX)
     Jeder Effekt: Promise, gezeichnet in _draw über der Szene.
     ============================================================ */
  _addFx(dur, drawFn) {
    const f = { t: 0, dur, draw: drawFn, done: null };
    const p = new Promise((res) => { f.done = res; });
    this.fx.push(f);
    return p;
  }
  _wpt(tile) { // Weltpunkt über der Kachelmitte (Brusthöhe)
    const c = this._tileCenterWorld(tile.x, tile.y, this.battle.heightAt(tile.x, tile.y));
    return { x: c.x, y: c.y - 18 };
  }

  /* Projektil mit Bogen & Schweif (Glut, Steinwurf, Spukball …) */
  fxProjectile(from, to, opt = {}) {
    const a = this._wpt(from), b = this._wpt(to);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const dur = Math.max(.28, dist / 420);
    const arc = opt.arc !== undefined ? opt.arc : 40;
    const color = opt.color || "#fff";
    const size = opt.size || 7;
    return this._addFx(dur, (ctx, r, k) => {
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * arc;
      const s = r.worldToScreen(x, y);
      const z = r.cam.zoom;
      for (let i = 1; i <= 3; i++) { // Schweif
        const kk = Math.max(0, k - i * .06);
        const tx = a.x + (b.x - a.x) * kk, ty = a.y + (b.y - a.y) * kk - Math.sin(kk * Math.PI) * arc;
        const ts = r.worldToScreen(tx, ty);
        ctx.globalAlpha = .35 / i;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(ts.x, ts.y, size * z * (1 - i * .2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, size * 1.6 * z);
      g.addColorStop(0, "#fff"); g.addColorStop(.45, color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, size * 1.6 * z, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* Strahl (Hydropumpe, Flammenwurf, Psystrahl …) */
  fxBeam(from, to, opt = {}) {
    const a = this._wpt(from), b = this._wpt(to);
    const color = opt.color || "#3b82f6";
    const width = opt.width || 9;
    const dur = opt.dur || .55;
    const spray = opt.spray !== false;
    return this._addFx(dur, (ctx, r, k) => {
      const p1 = r.worldToScreen(a.x, a.y), p2 = r.worldToScreen(b.x, b.y);
      const z = r.cam.zoom;
      const head = Math.min(1, k * 2.6);           // Strahl wächst zum Ziel
      const hx = p1.x + (p2.x - p1.x) * head, hy = p1.y + (p2.y - p1.y) * head;
      const pulse = .7 + .3 * Math.sin(k * 40);
      const alpha = k > .75 ? (1 - k) / .25 : 1;
      ctx.globalAlpha = alpha * .45;
      ctx.strokeStyle = color; ctx.lineCap = "round";
      ctx.lineWidth = width * 1.9 * z * pulse;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width * z * pulse;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = width * .38 * z;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.globalAlpha = 1;
      if (spray && head >= 1 && Math.random() < .6) {
        this.particles.push({
          wx: b.x, wy: b.y,
          vx: (Math.random() - .5) * 130, vy: -Math.random() * 110,
          life: .4, t: 0, color, size: 2 + Math.random() * 2.5,
        });
      }
    });
  }

  /* Blitzschlag aus dem Himmel (Elektro) */
  fxBolt(tile, opt = {}) {
    const b = this._wpt(tile);
    const color = opt.color || "#fde047";
    const dur = opt.dur || .5;
    return this._addFx(dur, (ctx, r, k) => {
      const z = r.cam.zoom;
      const top = r.worldToScreen(b.x, b.y - 230);
      const bot = r.worldToScreen(b.x, b.y + 10);
      const alpha = k < .15 ? k / .15 : Math.max(0, 1 - (k - .15) / .6);
      ctx.globalAlpha = alpha;
      for (const [lw, col] of [[7, "rgba(253,224,71,.4)"], [3.4, color], [1.4, "#fff"]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw * z; ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        const segs = 6;
        for (let i = 1; i <= segs; i++) {
          const yy = top.y + (bot.y - top.y) * (i / segs);
          const xx = top.x + (i === segs ? 0 : (Math.random() - .5) * 26 * z);
          ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      // Aufprall-Glühen
      const g = ctx.createRadialGradient(bot.x, bot.y, 0, bot.x, bot.y, 26 * z);
      g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(.4, color); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha * .8;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bot.x, bot.y, 26 * z, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  /* Fallende Objekte auf Felder (Steinhagel, Rasierblatt, Säure) */
  fxFall(tiles, opt = {}) {
    const shape = opt.shape || "rock";
    const color = opt.color || "#a16207";
    const dur = opt.dur || .8;
    const items = [];
    for (const t of tiles) {
      const w = this._wpt(t);
      const n = opt.n || 4;
      for (let i = 0; i < n; i++) {
        items.push({
          x: w.x + (Math.random() - .5) * 36, yEnd: w.y + 6 + Math.random() * 10,
          delay: Math.random() * .35, rot: Math.random() * Math.PI,
          spin: (Math.random() - .5) * 9, size: 3.5 + Math.random() * 3.5,
        });
      }
    }
    return this._addFx(dur, (ctx, r, k) => {
      const z = r.cam.zoom;
      for (const it of items) {
        const lk = Math.min(1, Math.max(0, (k * dur - it.delay) / (dur * .55)));
        if (lk <= 0) continue;
        const y = it.yEnd - 190 * (1 - lk);
        const s = r.worldToScreen(it.x, y);
        ctx.globalAlpha = lk >= 1 ? Math.max(0, 1 - (k - .7) / .3) : 1;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(it.rot + it.spin * k);
        ctx.fillStyle = color;
        if (shape === "leaf") {
          ctx.beginPath(); ctx.ellipse(0, 0, it.size * 1.5 * z, it.size * .55 * z, 0, 0, Math.PI * 2); ctx.fill();
        } else if (shape === "drop") {
          ctx.beginPath(); ctx.arc(0, 0, it.size * .8 * z, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-it.size * z, 0); ctx.lineTo(0, -it.size * z);
          ctx.lineTo(it.size * z, 0); ctx.lineTo(0, it.size * .8 * z);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });
  }

  /* Pulsierende Ringe (Psycho, Buffs, Status) */
  fxRing(tile, opt = {}) {
    const w = this._wpt(tile);
    const color = opt.color || "#ec4899";
    const dur = opt.dur || .6;
    const rings = opt.rings || 3;
    return this._addFx(dur, (ctx, r, k) => {
      const z = r.cam.zoom;
      const ground = r.worldToScreen(w.x, w.y + 18);
      for (let i = 0; i < rings; i++) {
        const rk = Math.max(0, Math.min(1, k * 1.4 - i * .18));
        if (rk <= 0) continue;
        ctx.globalAlpha = (1 - rk) * .9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.6 * z;
        ctx.beginPath();
        ctx.ellipse(ground.x, ground.y, 34 * rk * z, 15 * rk * z, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  /* Aufsteigende Funken/Glitzer (Heilung, Stärkung, Feuerwirbel) */
  fxRise(tile, opt = {}) {
    const w = this._wpt(tile);
    const color = opt.color || "#4ade80";
    const dur = opt.dur || .7;
    const sparks = [];
    for (let i = 0; i < (opt.n || 12); i++) {
      sparks.push({
        x: w.x + (Math.random() - .5) * 34, y0: w.y + 16,
        speed: 55 + Math.random() * 60, delay: Math.random() * .3,
        size: 1.8 + Math.random() * 2.4, wob: Math.random() * Math.PI * 2,
      });
    }
    return this._addFx(dur, (ctx, r, k) => {
      const z = r.cam.zoom;
      for (const sp of sparks) {
        const lk = Math.max(0, k - sp.delay / dur);
        if (lk <= 0) continue;
        const y = sp.y0 - sp.speed * lk * dur;
        const x = sp.x + Math.sin(sp.wob + lk * 9) * 5;
        const s = r.worldToScreen(x, y);
        ctx.globalAlpha = Math.max(0, 1 - lk * 1.3);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(s.x, s.y, sp.size * z, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  /* Hieb-Bögen (Nahkampf) */
  fxSlash(tile, opt = {}) {
    const w = this._wpt(tile);
    const color = opt.color || "#fff";
    const dur = opt.dur || .32;
    const ang = Math.random() * .8 - .4;
    return this._addFx(dur, (ctx, r, k) => {
      const z = r.cam.zoom;
      const s = r.worldToScreen(w.x, w.y);
      const alpha = Math.sin(Math.min(1, k) * Math.PI);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(ang);
      for (const [off, lw] of [[0, 4.5], [.5, 3]]) {
        const start = -1.1 + k * 1.6 + off;
        ctx.globalAlpha = alpha * (off ? .55 : 1);
        ctx.strokeStyle = off ? color : "#fff";
        ctx.lineWidth = lw * z;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, 0, 26 * z, start, start + 1.1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  /* ---------- Zuordnung Attacke -> Effekt ---------- */
  async animAttackFx(moveId, fromTile, toTile, aoeTiles) {
    const m = MOVES[moveId];
    const color = TYPES[m.type].color;
    const spec = MOVE_VFX[moveId] || MOVE_VFX["_" + m.type] ||
      (m.cat === "p" ? { kind: "slash" } : m.rng > 1 ? { kind: "projectile" } : { kind: "ring" });
    const o = { color, ...spec };
    const sfxByKind = {
      beam: "beam", "beam+ring": "beam", drainbeam: "beam",
      projectile: "whoosh", "projectile+ring": "whoosh", fall: "whoosh", slash: "whoosh",
      bolt: "zap", quake: "rumble", ring: "chime", rise: "chime",
    };
    const sfx = sfxByKind[spec.kind];
    if (sfx && typeof Sfx !== "undefined" && Sfx[sfx]) Sfx[sfx]();
    const jobs = [];
    switch (spec.kind) {
      case "beam":
        jobs.push(this.fxBeam(fromTile, toTile, o));
        break;
      case "drainbeam": // vom Ziel zum Anwender
        jobs.push(this.fxBeam(toTile, fromTile, { ...o, width: 5, dur: .6 }));
        break;
      case "projectile":
        jobs.push(this.fxProjectile(fromTile, toTile, o));
        break;
      case "bolt":
        aoeTiles.forEach((t, i) => {
          jobs.push(this.wait(i * 90).then(() => this.fxBolt(t, o)));
        });
        break;
      case "fall":
        jobs.push(this.fxFall(aoeTiles, o));
        break;
      case "ring":
        for (const t of aoeTiles) jobs.push(this.fxRing(t, o));
        break;
      case "rise":
        for (const t of aoeTiles) jobs.push(this.fxRise(t, o));
        break;
      case "slash":
        jobs.push(this.fxSlash(toTile, o));
        break;
      case "quake":
        this.shake(8);
        jobs.push(this.fxFall(aoeTiles, { ...o, shape: "rock", n: 3 }));
        for (const t of aoeTiles) jobs.push(this.fxRing(t, { ...o, dur: .5, rings: 2 }));
        break;
      case "projectile+ring":
        jobs.push(this.fxProjectile(fromTile, toTile, o).then(() => this.fxRing(toTile, o)));
        break;
      case "beam+ring":
        jobs.push(this.fxBeam(fromTile, toTile, o));
        for (const t of aoeTiles) jobs.push(this.wait(280).then(() => this.fxRing(t, o)));
        break;
    }
    await Promise.all(jobs);
  }
  animMove(unit, path, stepMs = 170) {
    return new Promise((res) => {
      // sofort in Laufrichtung schauen, nicht erst nach dem ersten Frame
      if (path.length > 1) this._faceStep(unit, path[0], path[1]);
      unit.anim = { type: "path", path, i: 0, t: 0, stepMs, done: res };
    });
  }
  _faceStep(u, p, q) {
    if (q.x > p.x) u.facing = { x: 1, y: 0 };
    else if (q.x < p.x) u.facing = { x: -1, y: 0 };
    else if (q.y > p.y) u.facing = { x: 0, y: 1 };
    else if (q.y < p.y) u.facing = { x: 0, y: -1 };
  }
  animLunge(unit, tx, ty, strength = .35) {
    return new Promise((res) => {
      unit.anim = { type: "lunge", tx, ty, t: 0, strength, done: res };
    });
  }
  animFlash(unit, ms = 260) {
    return new Promise((res) => {
      unit.anim = { type: "flash", t: 0, ms, done: res };
    });
  }
  animKO(unit) {
    return new Promise((res) => {
      unit.anim = { type: "ko", t: 0, done: res };
    });
  }
  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* ---------- Render-Loop ----------
     Wichtig: rAF wird ZUERST geplant und alles in try/catch gekapselt –
     ein einzelner Fehler darf das Spiel niemals einfrieren. */
  _frame(t) {
    requestAnimationFrame((tt) => this._frame(tt));
    try {
      const dt = Math.min(0.05, (t - (this._lt || t)) / 1000);
      this._lt = t;
      this.time += dt;
      this._updateAnims(dt);
      this._draw();
    } catch (e) {
      console.error("Render-Fehler (Frame übersprungen):", e);
    }
  }

  _updateAnims(dt) {
    if (this.targetCam) {
      this.cam.x += (this.targetCam.x - this.cam.x) * Math.min(1, dt * 7);
      this.cam.y += (this.targetCam.y - this.cam.y) * Math.min(1, dt * 7);
      if (Math.hypot(this.targetCam.x - this.cam.x, this.targetCam.y - this.cam.y) < 2)
        this.targetCam = null;
    }
    if (this._shake) {
      this._shake.t += dt;
      if (this._shake.t > .35) this._shake = null;
    }
    const b = this.battle;
    if (!b) return;
    for (const u of b.units) {
      if (!u.anim) continue;
      const a = u.anim;
      if (a.type === "path") {
        a.t += dt * 1000;
        const idx = Math.floor(a.t / a.stepMs);
        if (idx >= a.path.length - 1) {
          const last = a.path[a.path.length - 1];
          u.rx = last.x; u.ry = last.y; u.hop = 0;
          u.anim = null; a.done();
        } else {
          const p = a.path[idx], q = a.path[idx + 1];
          const f = (a.t % a.stepMs) / a.stepMs;
          u.rx = p.x + (q.x - p.x) * f;
          u.ry = p.y + (q.y - p.y) * f;
          u.hop = Math.sin(f * Math.PI) * 8;
          this._faceStep(u, p, q);
        }
      } else if (a.type === "lunge") {
        a.t += dt * 4.5;
        const f = a.t < .5 ? a.t * 2 : Math.max(0, 2 - a.t * 2);
        u.rx = u.x + (a.tx - u.x) * f * a.strength;
        u.ry = u.y + (a.ty - u.y) * f * a.strength;
        if (a.t >= 1) { u.rx = u.x; u.ry = u.y; u.anim = null; a.done(); }
      } else if (a.type === "flash") {
        a.t += dt * 1000;
        u.flash = Math.floor(a.t / 70) % 2 === 0;
        if (a.t >= a.ms) { u.flash = false; u.anim = null; a.done(); }
      } else if (a.type === "ko") {
        // Todesanimation: blinken -> versinken & verblassen
        a.t += dt;
        const k = a.t / 0.95;
        if (k < 0.3) {
          u.flash = Math.floor(a.t / 0.08) % 2 === 0;
          u.alpha = 1;
        } else {
          u.flash = false;
          const s = (k - 0.3) / 0.7;
          u.koSink = s * 16;
          u.alpha = Math.max(0, 1 - s);
        }
        if (k >= 1) { u.flash = false; u.alpha = 0; u.anim = null; a.done(); }
      }
    }
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.1);
    for (const p of this.particles) {
      p.t += dt;
      p.wx += p.vx * dt; p.wy += p.vy * dt;
      p.vy += (p.grav !== undefined ? p.grav : 220) * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const f of this.fx) {
      f.t += dt;
      if (f.t >= f.dur && f.done) { f.done(); f.done = null; }
    }
    this.fx = this.fx.filter((f) => f.t < f.dur);
  }

  _draw() {
    const ctx = this.ctx, b = this.battle;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#171a2e");
    grad.addColorStop(1, "#0c0e1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    if (!b) return;

    if (this._shake) {
      const s = this._shake.s * (1 - this._shake.t / .35);
      ctx.translate((Math.random() - .5) * s, (Math.random() - .5) * s);
    }

    // Reihenfolge: hinten -> vorne
    const order = [];
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) order.push({ x, y });
    order.sort((a, c) => (a.x + a.y) - (c.x + c.y));

    for (const t of order) this._drawTile(t.x, t.y);
    for (const t of order) {
      for (const u of b.unitsRenderAt(t.x, t.y)) this._drawUnit(u);
    }
    for (const f of this.fx) {
      try { f.draw(ctx, this, Math.min(1, f.t / f.dur)); } catch (e) { /* Effekt überspringen */ }
    }
    this._drawParticles();
    this._drawPopups();
  }

  _drawTile(x, y) {
    const ctx = this.ctx, b = this.battle;
    const hgt = b.heightAt(x, y);
    const ter = TERRAIN[b.terrainAt(x, y)] || TERRAIN.g;
    const z = this.cam.zoom;
    const c = this._tileCenterWorld(x, y, hgt);
    const s = this.worldToScreen(c.x, c.y);
    const hw = TILE_W / 2 * z, hh = TILE_H / 2 * z;
    const hs = H_STEP * z;

    // Seitenflächen (Sockel)
    const depth = (hgt + 1) * hs + 4 * z;
    ctx.beginPath();
    ctx.moveTo(s.x - hw, s.y);
    ctx.lineTo(s.x, s.y + hh);
    ctx.lineTo(s.x, s.y + hh + depth);
    ctx.lineTo(s.x - hw, s.y + depth);
    ctx.closePath();
    ctx.fillStyle = ter.side;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s.x + hw, s.y);
    ctx.lineTo(s.x, s.y + hh);
    ctx.lineTo(s.x, s.y + hh + depth);
    ctx.lineTo(s.x + hw, s.y + depth);
    ctx.closePath();
    ctx.fillStyle = ter.side2;
    ctx.fill();

    // Deckfläche
    let top = (x + y) % 2 === 0 ? ter.top : ter.top2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - hh);
    ctx.lineTo(s.x + hw, s.y);
    ctx.lineTo(s.x, s.y + hh);
    ctx.lineTo(s.x - hw, s.y);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
    if (ter.water) {
      const a = 0.18 + 0.1 * Math.sin(this.time * 2.2 + x * 1.3 + y * .9);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Markierungen
    const key = x + "," + y;
    const hl = this.highlights.get(key);
    if (hl) {
      const colors = {
        move:   "rgba(64,156,255,.5)",
        attack: "rgba(239,68,68,.5)",
        aoe:    "rgba(255,170,40,.6)",
        path:   "rgba(120,220,255,.65)",
        ally:   "rgba(74,222,128,.5)",
      };
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - hh + 2);
      ctx.lineTo(s.x + hw - 3, s.y);
      ctx.lineTo(s.x, s.y + hh - 2);
      ctx.lineTo(s.x - hw + 3, s.y);
      ctx.closePath();
      ctx.fillStyle = colors[hl] || colors.move;
      ctx.fill();
    }
    if (this.cursor && this.cursor.x === x && this.cursor.y === y) {
      const pulse = 1 + Math.sin(this.time * 6) * .08;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - hh * pulse);
      ctx.lineTo(s.x + hw * pulse, s.y);
      ctx.lineTo(s.x, s.y + hh * pulse);
      ctx.lineTo(s.x - hw * pulse, s.y);
      ctx.closePath();
      ctx.strokeStyle = "#ffcb05";
      ctx.lineWidth = 3 * this.cam.zoom;
      ctx.stroke();
    }
  }

  _drawUnit(u) {
    const ctx = this.ctx, b = this.battle, z = this.cam.zoom;
    const tx = u.rx, ty = u.ry;
    // Höhe interpolieren
    const h0 = b.heightAt(Math.round(tx), Math.round(ty));
    const c = this._tileCenterWorld(tx, ty, h0);
    const ground = this.worldToScreen(c.x, c.y);   // Fußpunkt auf der Kachel
    const size = 52 * z * (SPECIES[u.species].scale || 1) * (u.boss ? 1.15 : 1);
    const alpha = u.alpha !== undefined ? u.alpha : 1;
    if (alpha <= 0) return;

    // Blickrichtung -> Front-/Rücken-Sprite + Spiegelung
    const f = u.facing || { x: 0, y: 1 };
    const side = (f.x < 0 || f.y < 0) ? "back" : "front";
    const flip = (f.x > 0 || f.y < 0);

    // Schatten + Team-Ring
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y + 2, size * .3, size * .13, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y + 2, size * .34, size * .15, 0, 0, Math.PI * 2);
    ctx.strokeStyle = u.team === 0 ? "rgba(80,160,255,.85)" : "rgba(239,68,68,.85)";
    ctx.lineWidth = 2.4 * z;
    ctx.stroke();

    // Sprite (unten verankert, hüpft bei Bewegung/aktivem Zug, versinkt beim K.O.)
    const idleBob = b.active === u ? Math.sin(this.time * 4) * 2 * z : 0;
    const footY = ground.y + 3 * z - (u.hop || 0) * z + idleBob + (u.koSink || 0) * z;
    if (u.flash) ctx.globalAlpha = alpha * .35;
    const { dh } = SpriteCache.draw(ctx, u.species, ground.x - size / 2, footY - size, size, size, side, flip);
    ctx.globalAlpha = alpha;
    const topY = footY - dh;

    // Aktiver-Marker
    if (b.active === u) {
      const bob = Math.sin(this.time * 5) * 4 * z;
      ctx.beginPath();
      ctx.moveTo(ground.x, topY - 16 * z + bob);
      ctx.lineTo(ground.x - 7 * z, topY - 26 * z + bob);
      ctx.lineTo(ground.x + 7 * z, topY - 26 * z + bob);
      ctx.closePath();
      ctx.fillStyle = "#ffcb05";
      ctx.fill();
    }

    // KP-Balken
    const bw = 34 * z;
    const bx = ground.x - bw / 2, by = topY - 9 * z;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(bx - 1, by - 1, bw + 2, 5 * z + 2);
    const r = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = r > .5 ? "#4ade80" : r > .25 ? "#facc15" : "#ef4444";
    ctx.fillRect(bx, by, bw * r, 5 * z);

    // Status-Icons
    if (u.statuses && u.statuses.length) {
      ctx.font = `${Math.round(11 * z)}px sans-serif`;
      ctx.textAlign = "center";
      const icons = u.statuses.map((st) => STATUS[st.id].icon).join("");
      ctx.fillText(icons, ground.x, by - 4 * z);
    }
    if (u.boss) {
      ctx.font = `${Math.round(13 * z)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("👑", ground.x + bw / 2 + 8 * z, by + 4 * z);
    }
    ctx.restore();
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const s = this.worldToScreen(p.wx, p.wy);
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size * this.cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawPopups() {
    const ctx = this.ctx;
    for (const p of this.popups) {
      const s = this.worldToScreen(p.wx, p.wy - p.t * 34);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p.t - .6) * 2.5);
      const fs = (p.big ? 26 : 19) * Math.min(this.cam.zoom + .3, 1.4);
      ctx.font = `900 ${fs}px "Avenir Next", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,.7)";
      ctx.strokeText(p.text, s.x, s.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }
}
