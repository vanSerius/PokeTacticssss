/* ============================================================
   PokéTactics – Sprite-Rendering
   Lädt offizielle Gen-5-Sprites (PokéAPI, lokal in assets/),
   inkl. Rücken-Sprites für die Blickrichtung.
   Fallback: eingebaute 16×16-Pixel-Art, falls ein Bild fehlt.
   ============================================================ */
"use strict";

const SpriteCache = (() => {
  const pxCache = new Map();   // Pixel-Art-Fallback (Canvas)
  const imgCache = new Map();  // speciesId -> { front: slot, back: slot }
  const pending = [];          // Canvases, die nach dem Laden neu gezeichnet werden
  const BASE = "assets/sprites/";

  /* ---------- Pixel-Art-Fallback ---------- */
  function normalizeRows(px) {
    const rows = [];
    for (let i = 0; i < 16; i++) {
      let r = px[i] || "";
      if (r.length < 16) r = r + ".".repeat(16 - r.length);
      rows.push(r.slice(0, 16));
    }
    return rows;
  }

  function buildPx(speciesId) {
    const sp = SPECIES[speciesId];
    const def = SPRITES[sp.sprite];
    const pal = { ...def.pal };
    if (sp.recolor) {
      for (const key of Object.keys(pal)) {
        if (sp.recolor[pal[key]]) pal[key] = sp.recolor[pal[key]];
      }
    }
    const PX = 4;
    const cv = document.createElement("canvas");
    cv.width = 16 * PX; cv.height = 16 * PX;
    const ctx = cv.getContext("2d");
    const rows = normalizeRows(def.px);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = rows[y][x];
        if (ch === "." || !pal[ch]) continue;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    return cv;
  }

  function getPx(speciesId) {
    if (!pxCache.has(speciesId)) pxCache.set(speciesId, buildPx(speciesId));
    return pxCache.get(speciesId);
  }

  /* ---------- PokéAPI-Bilder ---------- */
  /* Transparenten Rand ermitteln, damit alle Sprites einheitlich sitzen */
  function trimBox(img) {
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let minX = cv.width, minY = cv.height, maxX = -1, maxY = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (data[(y * cv.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { sx: 0, sy: 0, sw: img.width, sh: img.height };
    return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
  }

  function makeSlot(url) {
    const img = new Image();
    const slot = { img, ready: false, box: null };
    img.onload = () => {
      try { slot.box = trimBox(img); } catch (e) { slot.box = { sx: 0, sy: 0, sw: img.width, sh: img.height }; }
      slot.ready = true;
      flushPending();
    };
    img.src = url;
    return slot;
  }

  function load(speciesId) {
    if (imgCache.has(speciesId)) return imgCache.get(speciesId);
    const sp = SPECIES[speciesId];
    const entry = sp.dex
      ? { front: makeSlot(BASE + sp.dex + ".png"), back: makeSlot(BASE + "back/" + sp.dex + ".png") }
      : { front: { ready: false }, back: { ready: false } };
    imgCache.set(speciesId, entry);
    return entry;
  }

  function preloadAll() {
    for (const id of Object.keys(SPECIES)) load(id);
  }

  /* Einheitliche Zeichenquelle: PokéAPI-Bild oder Pixel-Art */
  function getDrawable(speciesId, side = "front") {
    const entry = load(speciesId);
    const slot = entry[side].ready ? entry[side] : (entry.front.ready ? entry.front : null);
    if (slot) {
      return { source: slot.img, ...slot.box, pixel: true };
    }
    const cv = getPx(speciesId);
    return { source: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height, pixel: true };
  }

  /* Sprite in einen Bereich einpassen (contain, unten verankert) */
  function draw(ctx, speciesId, x, y, w, h, side = "front", flip = false) {
    const d = getDrawable(speciesId, side);
    const scale = Math.min(w / d.sw, h / d.sh);
    const dw = d.sw * scale, dh = d.sh * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x + w / 2, y + h);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(d.source, d.sx, d.sy, d.sw, d.sh, -dw / 2, -dh, dw, dh);
    ctx.restore();
    return { dw, dh };
  }

  /* UI-Porträts: zeichnet sofort (Fallback) und erneut nach dem Laden */
  function drawInto(canvas, speciesId) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(ctx, speciesId, 0, 0, canvas.width, canvas.height);
    if (!load(speciesId).front.ready) pending.push([canvas, speciesId]);
  }

  function flushPending() {
    for (let i = pending.length - 1; i >= 0; i--) {
      const [canvas, speciesId] = pending[i];
      if (load(speciesId).front.ready) {
        pending.splice(i, 1);
        if (canvas.isConnected) {
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          draw(ctx, speciesId, 0, 0, canvas.width, canvas.height);
        }
      }
    }
  }

  return { preloadAll, getDrawable, draw, drawInto };
})();
