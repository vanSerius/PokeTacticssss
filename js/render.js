/* ============================================================
   PokéTactics – Isometrischer Renderer + Touch-Kamera
   ============================================================ */
"use strict";

const TILE_W = 64;
const TILE_H = 32;
const H_STEP = 14;

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

  /* ---------- Animations-Helfer (Promises) ---------- */
  animMove(unit, path, stepMs = 170) {
    return new Promise((res) => {
      unit.anim = { type: "path", path, i: 0, t: 0, stepMs, done: res };
    });
  }
  animLunge(unit, tx, ty) {
    return new Promise((res) => {
      unit.anim = { type: "lunge", tx, ty, t: 0, done: res };
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

  /* ---------- Render-Loop ---------- */
  _frame(t) {
    const dt = Math.min(0.05, (t - (this._lt || t)) / 1000);
    this._lt = t;
    this.time += dt;
    this._updateAnims(dt);
    this._draw();
    requestAnimationFrame((tt) => this._frame(tt));
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
          if (q.x > p.x || q.y < p.y) u.flip = false;
          if (q.x < p.x || q.y > p.y) u.flip = true;
        }
      } else if (a.type === "lunge") {
        a.t += dt * 4.5;
        const f = a.t < .5 ? a.t * 2 : Math.max(0, 2 - a.t * 2);
        u.rx = u.x + (a.tx - u.x) * f * .35;
        u.ry = u.y + (a.ty - u.y) * f * .35;
        if (a.t >= 1) { u.rx = u.x; u.ry = u.y; u.anim = null; a.done(); }
      } else if (a.type === "flash") {
        a.t += dt * 1000;
        u.flash = Math.floor(a.t / 70) % 2 === 0;
        if (a.t >= a.ms) { u.flash = false; u.anim = null; a.done(); }
      } else if (a.type === "ko") {
        a.t += dt * 2.2;
        u.alpha = Math.max(0, 1 - a.t);
        if (a.t >= 1) { u.anim = null; a.done(); }
      }
    }
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.1);
    for (const p of this.particles) {
      p.t += dt;
      p.wx += p.vx * dt; p.wy += p.vy * dt;
      p.vy += 220 * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
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
    const s = this.worldToScreen(c.x, c.y - (u.hop || 0));
    const size = 44 * z * (SPECIES[u.species].scale || 1) * (u.boss ? 1.18 : 1);
    const alpha = u.alpha !== undefined ? u.alpha : 1;
    if (alpha <= 0) return;

    // Schatten + Team-Ring
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(s.x, this.worldToScreen(c.x, c.y).y + 2, size * .32, size * .14, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s.x, this.worldToScreen(c.x, c.y).y + 2, size * .36, size * .16, 0, 0, Math.PI * 2);
    ctx.strokeStyle = u.team === 0 ? "rgba(80,160,255,.85)" : "rgba(239,68,68,.85)";
    ctx.lineWidth = 2.4 * z;
    ctx.stroke();

    // Aktiver-Marker
    if (b.active === u) {
      const bob = Math.sin(this.time * 5) * 4 * z;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - size - 14 * z + bob);
      ctx.lineTo(s.x - 7 * z, s.y - size - 24 * z + bob);
      ctx.lineTo(s.x + 7 * z, s.y - size - 24 * z + bob);
      ctx.closePath();
      ctx.fillStyle = "#ffcb05";
      ctx.fill();
    }

    // Sprite
    const img = SpriteCache.get(u.species);
    const idleBob = b.active === u ? Math.sin(this.time * 4) * 2 * z : 0;
    ctx.imageSmoothingEnabled = false;
    if (u.flash) ctx.globalAlpha = alpha * .35;
    ctx.save();
    ctx.translate(s.x, s.y - size / 2 - 4 * z + idleBob);
    if (u.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
    ctx.globalAlpha = alpha;

    // KP-Balken
    const bw = 34 * z;
    const bx = s.x - bw / 2, by = s.y - size - 8 * z;
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
      ctx.fillText(icons, s.x, by - 4 * z);
    }
    if (u.boss) {
      ctx.font = `${Math.round(13 * z)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("👑", s.x + bw / 2 + 8 * z, by + 4 * z);
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
