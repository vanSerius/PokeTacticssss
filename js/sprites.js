/* ============================================================
   PokéTactics – Sprite-Rendering
   Zeichnet 16×16-Pixel-Sprites in Offscreen-Canvases,
   inkl. Umfärbung & Skalierung für Entwicklungen.
   ============================================================ */
"use strict";

const SpriteCache = (() => {
  const cache = new Map();

  function normalizeRows(px) {
    const rows = [];
    for (let i = 0; i < 16; i++) {
      let r = px[i] || "";
      if (r.length < 16) r = r + ".".repeat(16 - r.length);
      rows.push(r.slice(0, 16));
    }
    return rows;
  }

  /* Erzeugt ein Canvas (16×16 logisch, hochskaliert) für eine Spezies */
  function build(speciesId) {
    const sp = SPECIES[speciesId];
    const def = SPRITES[sp.sprite];
    const pal = { ...def.pal };
    if (sp.recolor) {
      for (const key of Object.keys(pal)) {
        if (sp.recolor[pal[key]]) pal[key] = sp.recolor[pal[key]];
      }
    }
    const PX = 4; // interne Auflösung pro Pixel
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

  function get(speciesId) {
    if (!cache.has(speciesId)) cache.set(speciesId, build(speciesId));
    return cache.get(speciesId);
  }

  /* Zeichnet das Sprite einer Spezies in ein Ziel-Canvas (z. B. UI-Porträts) */
  function drawInto(canvas, speciesId) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = get(speciesId);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  return { get, drawInto };
})();
