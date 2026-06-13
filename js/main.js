/* ============================================================
   PokéTactics – Roguelike-Run, Speicherstand, Bildschirm-Flows
   Permadeath, persistente KP, Zufallsbegegnungen, Münzen
   ============================================================ */
"use strict";

const Game = {
  save: null,          // { best: {stage, wins}, run: {...} | null }
  pendingBattle: null,
  selectedParty: [],
  onResultNext: null,
};

/* ---------- Helfer ---------- */
function sample(arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function defaultMoves(sp, lvl) {
  return SPECIES[sp].learn.filter(([l]) => l <= lvl).map(([, id]) => id).slice(-4);
}

/* Roster-Eintrag eines Runs (hp bleibt zwischen Kämpfen erhalten) */
function mkEntry(sp, lvl) {
  const e = { sp, lvl, exp: 0, moves: defaultMoves(sp, lvl), bonus: { hp: 0, atk: 0, def: 0, spd: 0, mov: 0 } };
  e.hp = entryStats(e).hp;
  return e;
}

function entryStats(e) {
  const sp = SPECIES[e.sp];
  const st = (i) => Math.round(sp.base[i] + sp.grow[i] * (e.lvl - 1));
  return {
    hp: st(0) + e.bonus.hp, atk: st(1) + e.bonus.atk,
    def: st(2) + e.bonus.def, spd: sp.base[3] + e.bonus.spd,
  };
}

function healEntry(e, amount) {
  e.hp = Math.min(entryStats(e).hp, Math.max(1, (e.hp || 0) + amount));
}

/* ============================================================
   Verzweigte Weltkarte (Slay-the-Spire-Stil) auf Pergament
   ============================================================ */
const MAP_COLS = 5;
const MAP_ROWS = 13;          // Reihe 0 = Start unten, Reihe 12 = Boss oben
const MAP_PATHS = 7;

const NODE_META = {
  battle:   { icon: "⚔", label: "Kampf" },
  elite:    { icon: "⭐", label: "Elite" },
  legend:   { icon: "✨", label: "Legende" },
  shop:     { icon: "🎏", label: "Pokéshop" },
  merchant: { icon: "🛒", label: "Händler" },
  camp:     { icon: "🏕", label: "Lager" },
  center:   { icon: "🏥", label: "Center" },
  treasure: { icon: "🎁", label: "Schatz" },
  boss:     { icon: "👑", label: "Mewtu" },
};
const MAP_TIERS = { early: [0, 1, 7, 8], mid: [2, 3, 9, 10], late: [4, 5, 11, 12] };

function mapBattleId(row, elite) {
  const f = row / (MAP_ROWS - 2);
  let pool;
  if (elite) pool = f < 0.45 ? MAP_TIERS.mid : MAP_TIERS.late;
  else pool = f < 0.32 ? MAP_TIERS.early : f < 0.62 ? MAP_TIERS.mid : MAP_TIERS.late;
  return sample(pool, 1)[0];
}
// Gegner-Verstärkung: die ersten Reihen ganz sanft, danach langsam steigend
function mapRowBoost(row) { return Math.max(0, Math.floor((row - 3) / 2)); }

function nodeJitter(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return (h / 0xffff - 0.5);
}

function generateMap(loop = 0) {
  const rows = Array.from({ length: MAP_ROWS }, () => []);
  const nodes = {};
  const edges = {};
  const colNode = Array.from({ length: MAP_ROWS }, () => ({}));
  let nextId = 0;
  const ensure = (row, col) => {
    if (colNode[row][col] !== undefined) return colNode[row][col];
    const id = "n" + (nextId++);
    nodes[id] = { id, row, col };
    edges[id] = [];
    rows[row].push(id);
    colNode[row][col] = id;
    return id;
  };
  const bossCol = Math.floor(MAP_COLS / 2);
  const bossId = ensure(MAP_ROWS - 1, bossCol);
  nodes[bossId].type = "boss";

  for (let p = 0; p < MAP_PATHS; p++) {
    let col = Math.floor(Math.random() * MAP_COLS);
    let prev = ensure(0, col);
    for (let row = 1; row < MAP_ROWS; row++) {
      let nc;
      if (row === MAP_ROWS - 1) nc = bossCol;
      else { const d = [-1, 0, 1][Math.floor(Math.random() * 3)]; nc = Math.max(0, Math.min(MAP_COLS - 1, col + d)); }
      const cur = ensure(row, nc);
      if (!edges[prev].includes(cur)) edges[prev].push(cur);
      col = nc; prev = cur;
    }
  }

  // Verbindungs-Pass: mehr Quer-Verzweigungen, damit man die Spur wechseln kann.
  const crosses = (row, a, b) => {
    // Kante (row,a)->(row+1,b); kreuzt eine bestehende Kante mit umgekehrter Seite?
    for (const id of rows[row]) {
      const fa = nodes[id].col;
      if (fa === a) continue;
      for (const cid of edges[id]) {
        if (nodes[cid].row !== row + 1) continue;
        const tb = nodes[cid].col;
        if ((a < fa && b > tb) || (a > fa && b < tb)) return true;
      }
    }
    return false;
  };
  for (let row = 0; row < MAP_ROWS - 1; row++) {
    for (const id of [...rows[row]].sort((x, y) => nodes[x].col - nodes[y].col)) {
      if (row === MAP_ROWS - 2) {                    // letzte Reihe -> immer zum Boss
        if (!edges[id].includes(bossId)) edges[id].push(bossId);
        continue;
      }
      const a = nodes[id].col;
      const cand = [];
      for (let d = -1; d <= 1; d++) {
        const c = colNode[row + 1][a + d];
        if (c !== undefined && !edges[id].includes(c) && !crosses(row, a, a + d)) cand.push(c);
      }
      // mindestens 2 Wege nach oben, falls möglich
      while (edges[id].length < 2 && cand.length) {
        edges[id].push(cand.shift());
      }
    }
  }

  const parents = {};
  for (const id in edges) for (const c of edges[id]) (parents[c] = parents[c] || []).push(id);

  // Typen zuweisen – mit Shop-Pity (im Schnitt ~alle 2 Reihen ein Pokéshop)
  let lastShop = 0;
  for (let row = 1; row < MAP_ROWS - 1; row++) {
    const rowIds = [...rows[row]];
    if (row === MAP_ROWS - 2) { for (const id of rowIds) nodes[id].type = "camp"; continue; }
    // Shop-Pity: zu lange kein Pokéshop -> einen erzwingen
    if (row - lastShop >= 2 && rowIds.length) {
      const pick = rowIds[Math.floor(Math.random() * rowIds.length)];
      nodes[pick].type = "shop"; lastShop = row;
    }
    for (const id of rowIds) {
      if (nodes[id].type) continue;
      const ptypes = (parents[id] || []).map((p) => nodes[p].type);
      const w = {
        battle: 42,
        elite: row >= 4 ? 15 : 0,
        shop: 20,
        merchant: 10,
        camp: 7,
        center: row >= 2 ? 10 : 0,
        treasure: 7,
      };
      if (ptypes.includes("elite")) w.elite = 0;
      for (const t of ["shop", "merchant", "camp", "center", "treasure"]) if (ptypes.includes(t)) w[t] = Math.round(w[t] * 0.2);
      let tot = 0; for (const k in w) tot += w[k];
      let r = Math.random() * tot, pick = "battle";
      for (const k in w) { r -= w[k]; if (r <= 0) { pick = k; break; } }
      nodes[id].type = pick;
      if (pick === "shop") lastShop = row;
    }
  }
  // Reihe 0 = Kämpfe (Einstieg)
  for (const id of rows[0]) nodes[id].type = "battle";

  // Genau einen Legenden-Boss-Knoten in der mittleren/oberen Kartenhälfte platzieren
  const legCand = [];
  for (let row = 4; row <= MAP_ROWS - 4; row++) for (const id of rows[row]) if (nodes[id].type === "battle") legCand.push(id);
  if (legCand.length) {
    const lid = legCand[Math.floor(Math.random() * legCand.length)];
    const sp = LEGENDARIES[Math.floor(Math.random() * LEGENDARIES.length)];
    nodes[lid].type = "legend";
    nodes[lid].legendSp = sp;
  }

  // Kampf-/Elite-/Legenden-Karten + Positionen
  const topM = 0.045, botM = 0.05, leftM = 0.13;
  for (const id in nodes) {
    const n = nodes[id];
    if (n.type === "battle" || n.type === "elite") { n.mapId = mapBattleId(n.row, n.type === "elite"); n.elite = n.type === "elite"; }
    if (n.type === "legend") { n.mapId = LEGEND_BATTLE[n.legendSp]; }
    if (n.type === "boss") { n.mapId = 6; }
    const jit = n.type === "boss" ? 0 : nodeJitter(id) * 0.04;
    n.nx = n.type === "boss" ? 0.5 : leftM + (n.col + 0.5) / MAP_COLS * (1 - 2 * leftM) + jit;
    n.nx = Math.max(0.07, Math.min(0.93, n.nx));
    n.ny = topM + (1 - n.row / (MAP_ROWS - 1)) * (1 - topM - botM);
  }
  return { rows, nodes, edges, bossId, loop };
}

function mapBoost(node) {
  const run = Game.save.run;
  return mapRowBoost(node.row) + (node.elite ? 2 : 0) + (node.type === "legend" ? 2 : 0) + (run.loop || 0) * 6;
}
function availableNodes() {
  const run = Game.save.run;
  if (!run.map) return [];
  if (run.node == null) return run.map.rows[0];
  return run.map.edges[run.node] || [];
}

function runDepth() {
  const run = Game.save.run;
  const n = run.node != null && run.map ? run.map.nodes[run.node] : null;
  return (n ? n.row : 0) + (run.loop || 0) * MAP_ROWS;
}

/* Einen Karten-Knoten betreten */
async function enterNode(id) {
  const run = Game.save.run;
  const n = run.map.nodes[id];
  Game.pendingNode = id;
  if (n.type === "battle" || n.type === "elite" || n.type === "boss" || n.type === "legend") {
    openPartySelect(BATTLES[n.mapId], n.type === "elite" || n.type === "legend", id);
    return;
  }
  // Nicht-Kampf-Knoten: Ereignis abspielen, dann vorrücken
  if (n.type === "shop") await runRecruitChoice([]);
  else if (n.type === "merchant") await eventShop();
  else if (n.type === "camp") await eventCampfire();
  else if (n.type === "center") await eventPokecenter();
  else if (n.type === "treasure") await runRelicChoice();
  advanceNode(id);
  renderBattleList();
  showScreen("#screen-map");
}

/* Knoten als erledigt markieren und Position setzen */
function advanceNode(id) {
  const run = Game.save.run;
  if (!run.cleared.includes(id)) run.cleared.push(id);
  run.node = id;
  run.battleState = null;
  writeSave();
}

/* Lagerfeuer: heilen ODER ein Pokémon aufleveln */
async function eventCampfire() {
  const run = Game.save.run;
  const i = await showChoice({
    title: "🏕 Lagerfeuer",
    sub: "Das Team rastet. Was tun?",
    cards: [
      { icon: "💖", title: "Ausruhen", desc: "Heilt das ganze Team um 50 % der max. KP." },
      { icon: "📈", title: "Trainieren", desc: "Ein Pokémon erhält +50 EP (mit Verbesserungs-Wahl)." },
    ],
  });
  if (i === 0) {
    for (const e of run.roster) healEntry(e, Math.round(entryStats(e).hp * 0.5));
  } else {
    const t = await pickTarget("📈 Wer trainiert?", "");
    if (t) { const lv = []; awardExp(t, 50, lv); await runLevelUpChoices(lv); }
  }
  writeSave();
}

/* Alte Runs ohne neue Felder nachrüsten */
function migrateRun(run) {
  if (!run) return;
  if (!run.relics) run.relics = [];
  if (run.phoenixUsed === undefined) run.phoenixUsed = false;
  if (run.endless === undefined) run.endless = false;
  // Verzweigte Karte nachrüsten (alte lineare Runs erhalten eine frische Karte)
  if (!run.map) {
    run.map = generateMap(0);
    run.node = null;
    run.cleared = [];
    run.loop = run.loop || 0;
  }
}

function hasRelic(id) {
  const run = Game.save && Game.save.run;
  return !!(run && run.relics && run.relics.includes(id));
}


function avgRosterLvl() {
  const r = Game.save.run.roster;
  if (!r.length) return 3;
  return Math.round(r.reduce((s, e) => s + e.lvl, 0) / r.length);
}

/* ---------- Speicherstand ---------- */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* defekt -> neu */ }
  return null;
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.save)); } catch (e) {}
}
function ensureSave() {
  if (!Game.save) Game.save = { best: { stage: 0, wins: 0 }, run: null };
  if (!Game.save.legends) Game.save.legends = [];   // jemals besiegte Legendäre (im Shop freigeschaltet)
}

/* ---------- Generischer Auswahl-Bildschirm ----------
   cards: [{ speciesId?, icon?, title, desc, chips?, dim? }]
   Rückgabe: Index der Karte oder -1 (Skip) */
function showChoice({ title, sub, cards, skipLabel }) {
  return new Promise((resolve) => {
    $("#choice-title").innerHTML = title;
    $("#choice-sub").innerHTML = sub || "";
    const cont = $("#choice-cards");
    cont.innerHTML = "";
    let hasSpecial = false;
    cards.forEach((c, i) => {
      const el = document.createElement("div");
      const rar = c.rarity && (c.rarity === "rare" || c.rarity === "legend") ? " " + c.rarity : "";
      if (rar) hasSpecial = true;
      el.className = "choice-card" + (c.dim ? " dead" : "") + rar;
      const left = c.speciesId
        ? `<div class="cc-left"><canvas width="64" height="64"></canvas></div>`
        : `<div class="cc-left">${c.icon || "✦"}</div>`;
      el.innerHTML = `${left}
        <div class="cc-main">
          <div class="cc-title">${c.title}${c.flair ? ` <span class="cc-flair">${c.flair}</span>` : ""}</div>
          <div class="cc-desc">${c.desc || ""}</div>
          ${c.chips ? `<div class="cc-chips">${c.chips}</div>` : ""}
        </div>`;
      if (c.speciesId) SpriteCache.drawInto(el.querySelector("canvas"), c.speciesId);
      el.addEventListener("click", () => { Sfx.select(); resolve(i); });
      cont.appendChild(el);
    });
    // Glückstreffer-Banner bei seltener/legendärer Begegnung
    const banner = $("#choice-rare-banner");
    if (banner) {
      if (hasSpecial) {
        const legend = cards.some((c) => c.rarity === "legend");
        banner.textContent = legend ? "★ LEGENDÄRE BEGEGNUNG! Glück gehabt!" : "✦ Seltene Begegnung!";
        banner.className = "choice-rare-banner" + (legend ? " legend" : "");
        banner.classList.remove("hidden");
        try { (legend ? Sfx.champion : Sfx.reveal).call(Sfx); } catch (e) {}
      } else {
        banner.classList.add("hidden");
      }
    }
    const skip = $("#btn-choice-skip");
    if (skipLabel) {
      skip.textContent = skipLabel;
      skip.classList.remove("hidden");
      skip.onclick = () => { Sfx.cancel(); resolve(-1); };
    } else {
      skip.classList.add("hidden");
    }
    showScreen("#screen-choice");
  });
}

function pokemonCard(entry, extra = "") {
  const sp = SPECIES[entry.sp];
  const st = entryStats(entry);
  return {
    speciesId: entry.sp,
    title: `${sp.name} – Lv.${entry.lvl}`,
    desc: `${sp.role} · KP ${entry.hp !== undefined ? entry.hp + "/" : ""}${st.hp} · ANG ${st.atk} · VER ${st.def}` +
          (extra ? `<br>${extra}` : `<br>${entry.moves.map((id) => MOVES[id].name).join(" · ")}`),
    chips: sp.types.map(typeChipHtml).join(""),
  };
}

/* ---------- Titelbild-Animation ---------- */
function startTitleCanvas() {
  const cv = $("#title-canvas");
  const ctx = cv.getContext("2d");
  const heroes = sample(PLAYER_POOL, 5);
  let t = 0;
  function frame() {
    if (!$("#screen-title").classList.contains("active")) {
      requestAnimationFrame(frame);
      return;
    }
    t += 0.03;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 5; i++) {
      const x = 32 + i * 64, y = 96;
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 28, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 28, y);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "#2d3250" : "#3a4068";
      ctx.fill();
    }
    heroes.forEach((sp, i) => {
      const bob = Math.sin(t * 2 + i) * 4;
      SpriteCache.draw(ctx, sp, 4 + i * 62, 34 + bob, 56, 56);
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function updateTitle() {
  const hasRun = !!(Game.save && Game.save.run);
  $("#btn-continue").classList.toggle("hidden", !hasRun);
  const rec = $("#title-record");
  const best = Game.save && Game.save.best;
  if (best && (best.stage > 0 || best.wins > 0)) {
    rec.classList.remove("hidden");
    rec.textContent = (best.wins > 0
      ? `🏆 Champion-Siege: ${best.wins}`
      : `📜 Geschaffte Knoten: ${best.stage}`)
      + (best.endless ? ` · 🔥 Schleife ${best.endless}` : "");
  } else {
    rec.classList.add("hidden");
  }
}

/* ---------- Run-Start: Starter wählen ---------- */
async function startNewRun() {
  ensureSave();
  const offers = sample(PLAYER_POOL, 3).map((sp) => mkEntry(sp, 4));
  const i = await showChoice({
    title: "🎲 Wähle deinen Starter!",
    sub: "Dein Anführer startet auf Level 4. Drei zufällige Gefährten begleiten dich.",
    cards: offers.map((e) => pokemonCard(e)),
  });
  const starter = offers[i];
  const comps = sample(PLAYER_POOL.filter((s) => s !== starter.sp), 3).map((s) => mkEntry(s, 3));
  Game.save.run = {
    roster: [starter, ...comps], graveyard: [],
    coins: 30, battleState: null,
    map: generateMap(0), node: null, cleared: [], loop: 0, endless: false,
    relics: [], phoenixUsed: false,
  };
  writeSave();
  await showChoice({
    title: "🤝 Dein Team",
    sub: "Diese Gefährten schließen sich deinem Run an:",
    cards: comps.map((e) => pokemonCard(e)).concat([{ icon: "⚔", title: "Los geht's!", desc: "Zum Feldzug" }]),
  });
  renderBattleList();
  showScreen("#screen-map");
}

/* ---------- Etappen-Liste ---------- */
function renderBattleList() {
  const run = Game.save.run;
  migrateRun(run);
  const loop = run.loop || 0;
  $(".map-head h2").innerHTML = loop > 0
    ? `🔥 Schleife ${loop} · 🪙 ${run.coins} · 👥 ${run.roster.length}`
    : `🗺 Feldzug · 🪙 ${run.coins} · 👥 ${run.roster.length}`;
  // Relikt-Zeile
  const relicRow = $("#relic-row");
  if (run.relics.length) {
    relicRow.classList.remove("hidden");
    relicRow.innerHTML = run.relics.map((id) => `<span title="${RELICS[id].name}">${RELICS[id].icon}</span>`).join("");
    relicRow.onclick = async () => {
      Sfx.tap();
      await showChoice({
        title: "🎒 Deine Relikte",
        sub: "Passive Boni für diesen Run:",
        cards: run.relics.map((id) => ({ icon: RELICS[id].icon, title: RELICS[id].name, desc: RELICS[id].desc })),
      });
      renderBattleList();
      showScreen("#screen-map");
    };
  } else {
    relicRow.classList.add("hidden");
  }
  drawMap(run);
  $("#btn-endquit").classList.toggle("hidden", !run.endless);
}

/* Verzweigte Karte zeichnen */
function drawMap(run) {
  const m = run.map;
  const avail = new Set(availableNodes());
  const svg = $("#map-edges");
  const layer = $("#map-nodes");
  // Kanten
  let paths = "";
  const VW = 1000, VH = VW * (MAP_ROWS ? 3 : 3); // viewBox 1000x3000 (Bild-Seitenverh. 1:3)
  for (const id in m.edges) {
    const a = m.nodes[id];
    for (const cid of m.edges[id]) {
      const b = m.nodes[cid];
      const hot = (id === run.node && avail.has(cid)) || (run.node == null && a.row === 0);
      const lit = run.cleared.includes(id) && run.cleared.includes(cid);
      const col = hot ? "#ffcb05" : lit ? "#8a6a32" : "#5e4424";
      const wdt = hot ? 7 : 5;
      const dash = hot ? "" : ' stroke-dasharray="14 10"';
      paths += `<line x1="${(a.nx*1000).toFixed(1)}" y1="${(a.ny*3000).toFixed(1)}" x2="${(b.nx*1000).toFixed(1)}" y2="${(b.ny*3000).toFixed(1)}" stroke="${col}" stroke-width="${wdt}" stroke-linecap="round"${dash}/>`;
    }
  }
  // Start-Markierung -> Reihe-0-Knoten
  for (const id of m.rows[0]) {
    const a = m.nodes[id];
    const hot = run.node == null;
    paths += `<line x1="500" y1="2960" x2="${(a.nx*1000).toFixed(1)}" y2="${(a.ny*3000).toFixed(1)}" stroke="${hot ? "#ffcb05" : "#5e4424"}" stroke-width="${hot ? 7 : 5}" stroke-linecap="round"${hot ? "" : ' stroke-dasharray="14 10"'}/>`;
  }
  svg.innerHTML = paths;

  // Knoten
  layer.innerHTML = "";
  // Start-Punkt
  const startEl = document.createElement("div");
  startEl.className = "map-node n-start" + (run.node == null ? " current" : " done");
  startEl.style.left = "50%"; startEl.style.top = (2960/3000*100).toFixed(2) + "%";
  startEl.innerHTML = `🚩<div class="nlabel">Start</div>`;
  layer.appendChild(startEl);

  let firstAvail = null;
  for (const id in m.nodes) {
    const n = m.nodes[id];
    const meta = NODE_META[n.type] || NODE_META.battle;
    const isAvail = avail.has(id);
    const isDone = run.cleared.includes(id);
    const isCurrent = run.node === id;
    const el = document.createElement("div");
    el.className = "map-node n-" + n.type
      + (isAvail ? " available" : "")
      + (isDone ? " done" : "")
      + (isCurrent ? " current" : "")
      + (!isAvail && !isDone && !isCurrent ? " locked" : "");
    el.style.left = (n.nx * 100).toFixed(2) + "%";
    el.style.top = (n.ny * 100).toFixed(2) + "%";
    let badge = "";
    if ((n.type === "battle" || n.type === "elite") && BATTLES[n.mapId]) badge = `<div class="nlabel">${meta.label}</div>`;
    else badge = `<div class="nlabel">${meta.label}</div>`;
    el.innerHTML = `${meta.icon}${badge}`;
    if (isAvail) {
      if (!firstAvail) firstAvail = n;
      el.addEventListener("click", () => { Sfx.select(); enterNode(id); });
    }
    layer.appendChild(el);
  }

  // an die richtige Stelle scrollen
  requestAnimationFrame(() => {
    const sc = $("#map-scroll");
    if (!sc) return;
    const targetNy = firstAvail ? firstAvail.ny : (run.node == null ? 0.97 : 0.5);
    sc.scrollTop = sc.scrollHeight * targetNy - sc.clientHeight * 0.55;
  });
}

/* ---------- Roster-Kachel ---------- */
function unitTile(entry, opts = {}) {
  const sp = SPECIES[entry.sp];
  const st = entryStats(entry);
  const tile = document.createElement("div");
  tile.className = "unit-tile" + (opts.dead ? " dead" : "");
  const hpPct = Math.round(((entry.hp !== undefined ? entry.hp : st.hp) / st.hp) * 100);
  const hpColor = hpPct > 50 ? "var(--good)" : hpPct > 25 ? "#facc15" : "var(--danger)";
  tile.innerHTML = `
    <span class="ut-lvl">Lv.${entry.lvl}</span>
    <canvas width="64" height="64"></canvas>
    <div class="ut-name">${sp.name}</div>
    <div class="ut-role">${sp.role}</div>
    <div class="ut-type">${sp.types.map(typeChipHtml).join("")}</div>
    <div class="ut-hp">${opts.dead ? "💀 gefallen" : `KP <b style="color:${hpColor}">${entry.hp}/${st.hp}</b> · EP ${entry.exp || 0}/${EXP_PER_LEVEL}`}</div>
    <div class="ut-moves">${entry.moves.map((id) => MOVES[id].name).join(" · ")}</div>`;
  SpriteCache.drawInto(tile.querySelector("canvas"), entry.sp);
  if (opts.onClick) tile.addEventListener("click", () => opts.onClick(tile));
  return tile;
}

function renderRoster() {
  const run = Game.save.run;
  const el = $("#roster-list");
  el.innerHTML = "";
  for (const entry of run.roster) el.appendChild(unitTile(entry));
  if (run.graveyard.length) {
    const div = document.createElement("div");
    div.className = "roster-divider";
    div.textContent = "💀 Gefallene (im Pokécenter wiederbelebbar)";
    el.appendChild(div);
    for (const entry of run.graveyard) el.appendChild(unitTile(entry, { dead: true }));
  }
}

/* ---------- Trupp-Auswahl ---------- */
function openPartySelect(battleDef, elite = false, nodeId = Game.pendingNode) {
  Game.pendingBattle = battleDef;
  Game.pendingElite = elite;
  Game.pendingNode = nodeId;
  Game.selectedParty = [];
  const run = Game.save.run;
  const weakened = run.battleState && run.battleState.node === Game.pendingNode;
  $("#party-title").innerHTML = `${battleDef.icon} ${battleDef.name}${elite ? " <span class='elite-badge'>⭐ ELITE</span>" : ""}`;
  const info = $("#party-info");
  const update = () => {
    info.innerHTML = `Wähle bis zu <b>${battleDef.partySize}</b> Pokémon · ausgewählt: <b>${Game.selectedParty.length}</b><br>` +
      `<span style="color:var(--ink-dim);font-size:.8rem">${weakened ? "⚔ Die Gegner behalten ihre Wunden aus dem letzten Versuch!" : "💀 Wer im Kampf fällt, ist erst mal tot – KP bleiben nach dem Kampf erhalten."}</span>`;
    $("#btn-party-start").disabled = Game.selectedParty.length === 0;
  };
  const el = $("#party-list");
  el.innerHTML = "";
  for (const entry of run.roster) {
    const tile = unitTile(entry, {
      onClick: (tileEl) => {
        Sfx.tap();
        const idx = Game.selectedParty.indexOf(entry);
        if (idx >= 0) {
          Game.selectedParty.splice(idx, 1);
          tileEl.classList.remove("selected");
        } else if (Game.selectedParty.length < battleDef.partySize) {
          Game.selectedParty.push(entry);
          tileEl.classList.add("selected");
        }
        update();
      },
    });
    el.appendChild(tile);
  }
  update();
  showScreen("#screen-party");
}

/* ---------- EP & Level-Ups ---------- */
function awardExp(entry, amount, levelups) {
  entry.exp = (entry.exp || 0) + amount;
  while (entry.exp >= EXP_PER_LEVEL) {
    entry.exp -= EXP_PER_LEVEL;
    const before = entryStats(entry).hp;
    entry.lvl++;
    const after = entryStats(entry).hp;
    healEntry(entry, after - before); // Level-Up heilt den KP-Zuwachs
    levelups.push(entry);
  }
}

/* 3 Level-Up-Karten für einen Eintrag erzeugen */
function levelUpCards(entry) {
  const sp = SPECIES[entry.sp];
  const st = entryStats(entry);
  const gens = [];

  let movePool = sp.learn.map(([, id]) => id).filter((id) => !entry.moves.includes(id));
  if (!movePool.length) {
    movePool = Object.keys(MOVES).filter((id) =>
      id !== "hieb" && !entry.moves.includes(id) && sp.types.includes(MOVES[id].type));
  }
  if (movePool.length) {
    const newMove = movePool[Math.floor(Math.random() * movePool.length)];
    const full = entry.moves.length >= 4;
    const replaceIdx = full ? Math.floor(Math.random() * entry.moves.length) : -1;
    const m = MOVES[newMove];
    gens.push({
      weight: 34,
      card: {
        icon: "✨",
        title: `Neue Attacke: ${m.name}`,
        desc: `${m.desc} · RW ${m.rng === 0 ? "Umkreis" : m.rng}${m.aoe ? " · Fläche" : ""}` +
              (full ? `<br><b style="color:var(--danger)">ersetzt ${MOVES[entry.moves[replaceIdx]].name}</b>` : ""),
        chips: typeChipHtml(m.type),
      },
      apply: () => {
        if (full) entry.moves[replaceIdx] = newMove;
        else entry.moves.push(newMove);
      },
    });
  }

  const hpUp = Math.max(4, Math.round(st.hp * 0.12));
  gens.push({ weight: 20, card: { icon: "❤️", title: `+${hpUp} max. KP`, desc: "Zähigkeit für lange Schlachten." }, apply: () => { entry.bonus.hp += hpUp; healEntry(entry, hpUp); } });
  const atkUp = Math.max(2, Math.round(st.atk * 0.12));
  gens.push({ weight: 16, card: { icon: "⚔", title: `+${atkUp} Angriff`, desc: "Mehr Schaden mit allen Attacken." }, apply: () => { entry.bonus.atk += atkUp; } });
  const defUp = Math.max(2, Math.round(st.def * 0.12));
  gens.push({ weight: 16, card: { icon: "🛡", title: `+${defUp} Verteidigung`, desc: "Weniger Schaden durch Treffer." }, apply: () => { entry.bonus.def += defUp; } });
  gens.push({ weight: 9, card: { icon: "💨", title: "+1 Tempo", desc: "Ist öfter am Zug, weicht besser aus." }, apply: () => { entry.bonus.spd += 1; } });
  if ((entry.bonus.mov || 0) < 1) {
    gens.push({ weight: 5, card: { icon: "👣", title: "+1 Bewegung", desc: "Selten! Erreicht entferntere Felder." }, apply: () => { entry.bonus.mov = (entry.bonus.mov || 0) + 1; } });
  }

  const picks = [];
  const pool = [...gens];
  while (picks.length < 3 && pool.length) {
    const total = pool.reduce((s, g) => s + g.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].weight; if (r <= 0) break; }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return picks;
}

async function runLevelUpChoices(levelups) {
  for (const entry of levelups) {
    // gestorben, bevor die Wahl dran war? (z. B. EP nach Tod)
    if (!Game.save.run.roster.includes(entry)) continue;
    const picks = levelUpCards(entry);
    if (!picks.length) continue;
    const sp = SPECIES[entry.sp];
    const i = await showChoice({
      title: `📈 ${sp.name} erreicht Lv.${entry.lvl}!`,
      sub: "Wähle eine Verbesserung:",
      cards: picks.map((p) => p.card),
    });
    picks[i].apply();
    writeSave();
  }
  // Entwicklung anbieten (ab Lv.5): Reset auf Lv.1, höhere Basiswerte
  for (const entry of [...new Set(levelups)]) {
    if (!Game.save.run.roster.includes(entry)) continue;
    const sp = SPECIES[entry.sp];
    if (!sp.evoTo || entry.lvl < EVO_LEVEL) continue;
    const evo = SPECIES[sp.evoTo];
    const i = await showChoice({
      title: `✨ ${sp.name} will sich entwickeln!`,
      sub: `Entwicklung setzt auf <b>Level 1</b> zurück – dafür deutlich höhere Basiswerte, neues Basis-Moveset und schnellere Level-Ups. Karten-Boni bleiben erhalten.`,
      cards: [
        {
          speciesId: sp.evoTo,
          title: `Ja! Zu ${evo.name} entwickeln`,
          desc: `${evo.role} · KP-Basis ${evo.base[0]} (statt ${sp.base[0]}) · ANG-Basis ${evo.base[1]} (statt ${sp.base[1]})<br>Startet auf Lv.1 mit ${defaultMoves(sp.evoTo, 1).map((id) => MOVES[id].name).join(" · ")}`,
          chips: evo.types.map(typeChipHtml).join(""),
        },
        {
          speciesId: entry.sp,
          title: `Nein, ${sp.name} bleiben`,
          desc: `Bleibt auf Lv.${entry.lvl} – die Frage kommt beim nächsten Level-Up erneut.`,
          chips: sp.types.map(typeChipHtml).join(""),
        },
      ],
    });
    if (i === 0) {
      await playEvolutionAnim(entry.sp, sp.evoTo);
      entry.sp = sp.evoTo;
      entry.lvl = 1;
      entry.exp = 0;
      entry.moves = defaultMoves(entry.sp, 1);
      entry.hp = entryStats(entry).hp; // frisch entwickelt = topfit
      writeSave();
      await showChoice({
        title: "🎉 Glückwunsch!",
        sub: "",
        cards: [pokemonCard(entry)],
      });
    }
  }
}

/* ---------- Entwicklungs-Animation (klassisch: Pulsieren -> Blitz -> Reveal) ---------- */
function playEvolutionAnim(fromSp, toSp) {
  return new Promise((resolve) => {
    const overlay = $("#evo-overlay");
    const cv = $("#evo-canvas");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    overlay.classList.remove("hidden");
    $("#evo-text").textContent = `${SPECIES[fromSp].name} entwickelt sich …`;
    Sfx.evolve();

    /* Weiße Silhouette eines Sprites vorbereiten */
    function silhouette(spId) {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const cc = c.getContext("2d");
      SpriteCache.draw(cc, spId, W * .15, H * .15, W * .7, H * .7);
      cc.globalCompositeOperation = "source-in";
      cc.fillStyle = "#ffffff";
      cc.fillRect(0, 0, W, H);
      return c;
    }
    const silFrom = silhouette(fromSp);
    const silTo = silhouette(toSp);

    let t = 0, last = performance.now(), done = false, sparks = [], revealed = false;
    function finish() {
      if (done) return;
      done = true;
      overlay.classList.add("hidden");
      overlay.onclick = null;
      resolve();
    }
    overlay.onclick = () => { Sfx.tap(); finish(); };

    function frame(now) {
      if (done) return;
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      t += dt;
      ctx.clearRect(0, 0, W, H);
      // Glühen im Hintergrund
      const glow = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * .55);
      const gi = Math.min(1, t / 2.5);
      glow.addColorStop(0, `rgba(255,255,255,${(0.12 + gi * .25).toFixed(2)})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      if (t < 1.1) {
        // Phase 1: Original pulsiert weiß
        SpriteCache.draw(ctx, fromSp, W * .15, H * .15, W * .7, H * .7);
        ctx.globalAlpha = .5 + .5 * Math.sin(t * 8);
        ctx.drawImage(silFrom, 0, 0);
        ctx.globalAlpha = 1;
      } else if (t < 3.0) {
        // Phase 2: Silhouetten wechseln immer schneller
        const k = (t - 1.1) / 1.9;
        const freq = 3 + k * 14;
        const which = Math.floor(t * freq) % 2 === 0 ? silFrom : silTo;
        const scale = 1 + Math.sin(t * freq * Math.PI) * .04;
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(scale, scale);
        ctx.drawImage(which, -W / 2, -H / 2);
        ctx.restore();
      } else if (t < 3.35) {
        // Phase 3: Blitz!
        if (!sparks.length) {
          $("#evo-text").textContent = "✨";
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
            sparks.push({ x: W / 2, y: H / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .9 + Math.random() * .6, t: 0 });
          }
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
      } else {
        // Phase 4: Enthüllung + Funken
        if (!revealed) { revealed = true; Sfx.reveal(); }
        $("#evo-text").textContent = `🎉 ${SPECIES[toSp].name}!`;
        SpriteCache.draw(ctx, toSp, W * .15, H * .15, W * .7, H * .7);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const s of sparks) {
          s.t += dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          s.vy += 30 * dt;
          if (s.t < s.life) {
            ctx.globalAlpha = Math.max(0, 1 - s.t / s.life);
            ctx.fillStyle = Math.random() < .5 ? "#ffd84d" : "#ffffff";
            ctx.beginPath();
            ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        if (t > 5.2) { finish(); return; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

/* ---------- Rekruten-Angebot ---------- */
/* Fortschritt 0..1 des aktuellen Runs (für Seltenheits-/Stufen-Gating) */
function runProgress() {
  const run = Game.save.run;
  const stage = run.node != null && run.map ? run.map.nodes[run.node].row : 0;
  return Math.min(1, stage / (MAP_ROWS - 2) + (run.loop || 0));
}

/* Erlaubte Seltenheiten je Fortschritt: früh nur common, ab Hälfte 2. Stufe, spät Endstufen */
function allowedRarities(prog) {
  const set = ["common"];
  if (prog >= 0.40) set.push("uncommon");   // ~ab der Hälfte: Entwicklungsstufe 2
  if (prog >= 0.72) set.push("rare");        // spät: Endstufen
  return set;
}

/* Gewichtete Rekruten-Angebote nach Seltenheit & Fortschritt (Legendäre nur wenn freigeschaltet) */
function recruitOffers(count) {
  const run = Game.save.run;
  const prog = runProgress();
  const allowed = allowedRarities(prog);
  const inTeam = new Set(run.roster.map((e) => e.sp));
  const weightFor = { common: 100, uncommon: 55, rare: 26, legend: 8 };
  let pool = RECRUIT_POOL.filter((s) => !inTeam.has(s) && allowed.includes(rarityOf(s)));
  // freigeschaltete Legendäre spät beimischen
  if (prog >= 0.6) for (const s of (Game.save.legends || [])) if (!inTeam.has(s) && !pool.includes(s)) pool.push(s);
  if (pool.length < count) pool = RECRUIT_POOL.filter((s) => !inTeam.has(s));
  if (pool.length < count) pool = RECRUIT_POOL.slice();
  // gewichtetes Ziehen ohne Wiederholung
  const picks = [];
  const work = pool.slice();
  while (picks.length < count && work.length) {
    let tot = 0; for (const s of work) tot += weightFor[rarityOf(s)] || 100;
    let r = Math.random() * tot, idx = 0;
    for (; idx < work.length; idx++) { r -= weightFor[rarityOf(work[idx])] || 100; if (r <= 0) break; }
    picks.push(work.splice(Math.min(idx, work.length - 1), 1)[0]);
  }
  const lvl = Math.max(3, 3 + Math.round(runDepth() * 0.7));
  return picks.map((s) => mkEntry(s, lvl));
}

async function runRecruitChoice(levelups) {
  const run = Game.save.run;
  const offers = recruitOffers(3);
  const i = await showChoice({
    title: "🤝 Pokéshop – ein Neuzugang!",
    sub: "Wähle einen Begleiter – oder lehne ab und dein Team erhält je 25 EP.",
    cards: offers.map((e) => recruitCard(e)),
    skipLabel: "Ablehnen (+25 EP für alle)",
  });
  if (i === -1) {
    for (const e of run.roster) awardExp(e, 25, levelups);
  } else {
    Sfx.treasure();
    run.roster.push(offers[i]);
  }
  writeSave();
}

/* Rekruten-Karte mit Seltenheits-Flair */
function recruitCard(entry) {
  const c = pokemonCard(entry);
  const rar = rarityOf(entry.sp);
  c.rarity = rar;
  if (rar === "rare") { c.flair = "✦ SELTEN"; }
  else if (rar === "legend") { c.flair = "★ LEGENDÄR"; }
  return c;
}

/* Garantiertes Legendären-Angebot nach Sieg über einen Legenden-Boss */
async function offerLegendRecruit(sp, levelups) {
  const run = Game.save.run;
  if (!Game.save.legends.includes(sp)) Game.save.legends.push(sp);
  const lvl = Math.max(6, 3 + Math.round(runDepth() * 0.7));
  if (run.roster.some((e) => e.sp === sp)) {
    // schon im Team -> stattdessen EP-Bonus
    for (const e of run.roster) awardExp(e, 60, levelups);
    return;
  }
  const legend = mkEntry(sp, lvl);
  const other = recruitOffers(1)[0];
  const cards = [recruitCard(legend)];
  if (other) cards.push(recruitCard(other));
  const i = await showChoice({
    title: "★ Legendäre Belohnung!",
    sub: `${SPECIES[sp].name} ist beeindruckt von deiner Stärke und will sich anschließen!`,
    cards,
    skipLabel: "Ablehnen (+60 EP für alle)",
  });
  if (i === -1) { for (const e of run.roster) awardExp(e, 60, levelups); }
  else { Sfx.champion(); run.roster.push(i === 0 ? legend : other); }
  writeSave();
}

/* ============================================================
   Zufallsbegegnungen (alle 2–3 Etappen)
   ============================================================ */
async function pickTarget(title, sub, filter) {
  const run = Game.save.run;
  const targets = run.roster.filter(filter || (() => true));
  if (!targets.length) return null;
  const i = await showChoice({
    title, sub,
    cards: targets.map((e) => pokemonCard(e)),
    skipLabel: "Abbrechen",
  });
  return i === -1 ? null : targets[i];
}

async function eventPokecenter() {
  const run = Game.save.run;
  const cards = [{ icon: "💖", title: "Team vollständig heilen", desc: "Alle Pokémon werden auf volle KP gebracht." }];
  if (run.graveyard.length) {
    cards.push({ icon: "🕯", title: "Gefallenes Pokémon wiederbeleben", desc: `${run.graveyard.length} gefallen · kehrt mit halben KP zurück` });
  }
  const i = await showChoice({
    title: "🏥 Pokécenter!",
    sub: "Schwester Joy hat genau eine Behandlung frei. Wähle weise:",
    cards,
  });
  if (i === 0) {
    for (const e of run.roster) e.hp = entryStats(e).hp;
    await showChoice({ title: "💖 Alle geheilt!", sub: "", cards: [{ icon: "✅", title: "Das Team ist wieder topfit.", desc: "Weiter geht's!" }] });
  } else {
    const j = await showChoice({
      title: "🕯 Wen wiederbeleben?",
      sub: "",
      cards: run.graveyard.map((e) => pokemonCard(e, "💀 gefallen")),
    });
    const e = run.graveyard.splice(j, 1)[0];
    e.hp = Math.max(1, Math.round(entryStats(e).hp / 2));
    run.roster.push(e);
    await showChoice({ title: "🕯 Willkommen zurück!", sub: "", cards: [pokemonCard(e)] });
  }
}

async function eventShop() {
  const run = Game.save.run;
  const priceMul = 1 + runDepth() * 0.05;
  const P = (base) => Math.round(base * priceMul / 5) * 5;
  const allItems = [
    { id: "trank", icon: "🧪", price: P(35), title: "Trank", desc: "Heilt ein Pokémon vollständig.",
      can: () => run.roster.some((e) => e.hp < entryStats(e).hp),
      use: async () => {
        const t = await pickTarget("🧪 Wen heilen?", "", (e) => e.hp < entryStats(e).hp);
        if (!t) return false;
        t.hp = entryStats(t).hp;
        return true;
      } },
    { id: "supertrank", icon: "💧", price: P(70), title: "Supertrank", desc: "Heilt das ganze Team um 50 %.",
      can: () => run.roster.some((e) => e.hp < entryStats(e).hp),
      use: async () => {
        for (const e of run.roster) healEntry(e, Math.round(entryStats(e).hp * 0.5));
        return true;
      } },
    { id: "beleber", icon: "🕯", price: P(90), title: "Beleber", desc: "Belebt ein gefallenes Pokémon wieder (50 % KP).",
      can: () => run.graveyard.length > 0,
      use: async () => {
        const j = await showChoice({
          title: "🕯 Wen wiederbeleben?", sub: "",
          cards: run.graveyard.map((e) => pokemonCard(e, "💀 gefallen")),
          skipLabel: "Abbrechen",
        });
        if (j === -1) return false;
        const e = run.graveyard.splice(j, 1)[0];
        e.hp = Math.max(1, Math.round(entryStats(e).hp / 2));
        run.roster.push(e);
        return true;
      } },
    { id: "protein", icon: "💪", price: P(55), title: "Protein", desc: "+4 Angriff für ein Pokémon (dauerhaft).",
      can: () => run.roster.length > 0,
      use: async () => {
        const t = await pickTarget("💪 Wer wird stärker?", "");
        if (!t) return false;
        t.bonus.atk += 4;
        return true;
      } },
    { id: "eisen", icon: "🛡", price: P(55), title: "Eisen", desc: "+4 Verteidigung für ein Pokémon (dauerhaft).",
      can: () => run.roster.length > 0,
      use: async () => {
        const t = await pickTarget("🛡 Wer wird zäher?", "");
        if (!t) return false;
        t.bonus.def += 4;
        return true;
      } },
    { id: "relikt", icon: "🎒", price: P(130), title: "Relikt-Beutel", desc: "Ein zufälliges Relikt (passiver Run-Bonus).",
      can: () => Object.keys(RELICS).some((id) => !run.relics.includes(id)),
      use: async () => {
        const pool = Object.keys(RELICS).filter((id) => !run.relics.includes(id));
        const id = sample(pool, 1)[0];
        run.relics.push(id);
        await showChoice({ title: "🎒 Relikt erhalten!", sub: "", cards: [{ icon: RELICS[id].icon, title: RELICS[id].name, desc: RELICS[id].desc }] });
        return true;
      } },
    { id: "bonbon", icon: "🍬", price: P(85), title: "Sonderbonbon", desc: "+1 Level für ein Pokémon (mit Verbesserungs-Wahl).",
      can: () => run.roster.length > 0,
      use: async () => {
        const t = await pickTarget("🍬 Wer levelt auf?", "");
        if (!t) return false;
        const levelups = [];
        const before = entryStats(t).hp;
        t.lvl++;
        healEntry(t, entryStats(t).hp - before);
        levelups.push(t);
        await runLevelUpChoices(levelups);
        return true;
      } },
  ];
  const offers = sample(allItems, 4);

  for (let visits = 0; visits < 12; visits++) {
    const available = offers.filter((it) => it.price <= run.coins && it.can());
    if (!available.length) {
      await showChoice({
        title: "🛒 Wanderhändler",
        sub: `🪙 ${run.coins} – ${run.coins < Math.min(...offers.map(i => i.price)) ? "Dafür kannst du dir nichts mehr leisten." : "Nichts Passendes mehr im Angebot."}`,
        cards: [{ icon: "👋", title: "Weiterziehen", desc: "Der Händler packt zusammen." }],
      });
      return;
    }
    const i = await showChoice({
      title: "🛒 Wanderhändler",
      sub: `„Beste Ware, faire Preise!" · Du hast <b>🪙 ${run.coins}</b>`,
      cards: available.map((it) => ({
        icon: it.icon,
        title: `${it.title} – 🪙 ${it.price}`,
        desc: it.desc,
      })),
      skipLabel: "Verlassen",
    });
    if (i === -1) return;
    const item = available[i];
    const used = await item.use();
    if (used) {
      run.coins -= item.price;
      Sfx.coins();
      writeSave();
    }
  }
}

async function eventRast() {
  const run = Game.save.run;
  for (const e of run.roster) healEntry(e, Math.round(entryStats(e).hp * 0.4));
  await showChoice({
    title: "🏕 Rast am Lagerfeuer",
    sub: "Dein Team ruht sich aus und heilt 40 % der max. KP.",
    cards: [{ icon: "🔥", title: "Gut erholt!", desc: "Weiter auf dem Pfad zum Champion." }],
  });
}

/* Relikt-Wahl: 1 aus 3 zufälligen, noch nicht besessenen */
async function runRelicChoice() {
  const run = Game.save.run;
  const pool = Object.keys(RELICS).filter((id) => !run.relics.includes(id));
  if (!pool.length) return;
  const offers = sample(pool, Math.min(3, pool.length));
  const i = await showChoice({
    title: "🎒 Wähle ein Relikt!",
    sub: "Ein passiver Bonus für den Rest des Runs:",
    cards: offers.map((id) => ({ icon: RELICS[id].icon, title: RELICS[id].name, desc: RELICS[id].desc })),
  });
  run.relics.push(offers[i]);
  Sfx.treasure();
  writeSave();
}

async function eventSchrein() {
  await showChoice({
    title: "⛩ Ein alter Schrein!",
    sub: "Im Moos glitzert etwas Uraltes …",
    cards: [{ icon: "⛩", title: "Näher treten", desc: "Der Schrein bietet dir ein Relikt an." }],
  });
  await runRelicChoice();
}

async function eventDojo() {
  const t = await pickTarget("🥋 Trainings-Dojo", "Ein Meister bietet einem Pokémon hartes Training (+60 EP):");
  if (!t) return;
  const levelups = [];
  awardExp(t, 60, levelups);
  Sfx.treasure();
  writeSave();
  await runLevelUpChoices(levelups);
}

async function eventEi() {
  const run = Game.save.run;
  const sp = sample(PLAYER_POOL, 1)[0];
  const e = mkEntry(sp, 1);
  await showChoice({
    title: "🥚 Ein mysteriöses Ei!",
    sub: "Es wackelt … und schlüpft direkt in deine Arme!",
    cards: [pokemonCard(e)],
  });
  run.roster.push(e);
  Sfx.treasure();
  writeSave();
  // Frisch geschlüpft: eine Verbesserungs-Karte gratis
  await runLevelUpChoices([e]);
}

async function eventCasino() {
  const run = Game.save.run;
  if (run.coins < 30) return eventRast();
  const i = await showChoice({
    title: "🎰 Mauzi-Casino",
    sub: `Mauzi schnurrt: „30 🪙 Einsatz – Kopf verdoppelt, Zahl kassiere ich!" (Du hast 🪙 ${run.coins})`,
    cards: [{ icon: "🪙", title: "30 Münzen setzen", desc: "50 % Chance: verdoppeln oder verlieren." }],
    skipLabel: "Lieber nicht",
  });
  if (i === -1) return;
  if (Math.random() < 0.5) {
    run.coins += 30;
    Sfx.coins();
    await showChoice({ title: "🎉 Gewonnen!", sub: "", cards: [{ icon: "🪙", title: "+30 Münzen", desc: `Du hast jetzt 🪙 ${run.coins}.` }] });
  } else {
    run.coins -= 30;
    Sfx.cancel();
    await showChoice({ title: "😿 Verloren …", sub: "", cards: [{ icon: "💸", title: "-30 Münzen", desc: `Mauzi verschwindet kichernd. Übrig: 🪙 ${run.coins}.` }] });
  }
  writeSave();
}

async function eventAltar() {
  const run = Game.save.run;
  const targets = run.roster.filter((e) => e.hp > 10);
  if (!targets.length) return eventRast();
  const i = await showChoice({
    title: "🗿 Verfluchter Altar",
    sub: "Eine raue Stimme: „Opfere Lebenskraft – ernte Stärke.“",
    cards: [{ icon: "🩸", title: "Opfer darbringen", desc: "Ein Pokémon verliert 30 % seiner aktuellen KP und erhält sofort +1 Level (mit Karten-Wahl)." }],
    skipLabel: "Weitergehen",
  });
  if (i === -1) return;
  const t = await pickTarget("🩸 Wer opfert sich?", "", (e) => e.hp > 10);
  if (!t) return;
  t.hp = Math.max(1, t.hp - Math.round(t.hp * 0.3));
  const levelups = [];
  const before = entryStats(t).hp;
  t.lvl++;
  healEntry(t, entryStats(t).hp - before);
  levelups.push(t);
  Sfx.status();
  writeSave();
  await runLevelUpChoices(levelups);
}

async function maybeRandomEvent() {
  const run = Game.save.run;
  run.sinceEvent = (run.sinceEvent || 0) + 1;
  if (run.sinceEvent < 2) return;
  if (run.sinceEvent === 2 && Math.random() < 0.4) return; // manchmal erst nach 3
  run.sinceEvent = 0;
  const events = [eventPokecenter, eventPokecenter, eventShop, eventShop, eventRast,
                  eventSchrein, eventDojo, eventEi, eventCasino, eventAltar];
  await events[Math.floor(Math.random() * events.length)]();
  writeSave();
}

/* ============================================================
   Schlacht & Ergebnis
   ============================================================ */
function processCasualties(battle) {
  const run = Game.save.run;
  const fallen = [];
  for (const u of battle.units) {
    if (u.team !== 0 || !u.rosterRef) continue;
    const entry = u.rosterRef;
    if (u.alive) {
      entry.hp = Math.max(1, Math.min(u.hp, entryStats(entry).hp));
    } else if (hasRelic("phoenixfeder") && !run.phoenixUsed) {
      // Phönixfeder: kehrt sofort mit 30 % KP zurück
      run.phoenixUsed = true;
      entry.hp = Math.max(1, Math.round(entryStats(entry).hp * 0.3));
      entry.phoenixSaved = true;
    } else {
      entry.hp = 0;
      const idx = run.roster.indexOf(entry);
      if (idx >= 0) run.roster.splice(idx, 1);
      run.graveyard.push(entry);
      fallen.push(entry);
    }
  }
  return fallen;
}

function saveEnemyState(def, battle) {
  const run = Game.save.run;
  const node = Game.pendingNode;
  const old = (run.battleState && run.battleState.node === node) ? run.battleState.enemies : null;
  const enemies = def.enemies.map((e, i) => {
    const u = battle.units.find((x) => x.enemyIdx === i);
    if (!u) return old ? old[i] : 0;      // war in diesem Versuch gar nicht dabei
    return u.alive ? u.hp : 0;
  });
  run.battleState = { node, enemies };
}

async function startBattle() {
  const def = Game.pendingBattle;
  const elite = !!Game.pendingElite;
  const nodeId = Game.pendingNode;
  const party = Game.selectedParty;
  const run = Game.save.run;
  const node = run.map.nodes[nodeId];
  const depth = node.row + (run.loop || 0) * MAP_ROWS;
  const lvlBoost = mapBoost(node);
  const enemyState = (run.battleState && run.battleState.node === nodeId) ? run.battleState.enemies : null;
  const { result, battle } = await BattleUI.run(def, party, enemyState, run.relics, { lvlBoost });

  const fallen = processCasualties(battle);
  let fallenLines = fallen.map((e) =>
    `<div class="res-line">💀 <b>${SPECIES[e.sp].name}</b> ist gefallen! (Pokécenter/Beleber kann helfen)</div>`).join("");
  for (const e of run.roster) {
    if (e.phoenixSaved) {
      delete e.phoenixSaved;
      fallenLines += `<div class="res-line evo">🪶 Die <b>Phönixfeder</b> hat ${SPECIES[e.sp].name} gerettet!</div>`;
    }
  }

  if (result === 1) {
    run.battleState = null;
    advanceNode(nodeId);
    const rewardMult = elite ? 1.5 : 1;
    let exp = Math.round((100 + depth * 14) * rewardMult);
    if (hasRelic("epanhaenger")) exp = Math.round(exp * 1.2);
    let coins = Math.round((28 + depth * 5) * rewardMult);
    if (hasRelic("gluecksmuenze")) coins = Math.round(coins * 1.4);
    run.coins += coins;
    const levelups = [];
    for (const entry of run.roster) {
      awardExp(entry, party.includes(entry) ? exp : Math.round(exp / 2), levelups);
    }
    const healPct = 0.25 + (hasRelic("wundsalbe") ? 0.10 : 0);
    for (const entry of run.roster) {
      if (party.includes(entry)) healEntry(entry, Math.round(entryStats(entry).hp * healPct));
    }
    const finale = node.type === "boss";
    writeSave();

    const lines = [
      node.type === "legend" ? `<div class="res-line evo">★ <b>LEGENDÄR bezwungen!</b> ${SPECIES[node.legendSp].name} schließt sich an!</div>` : "",
      elite && node.type !== "legend" ? `<div class="res-line evo">⭐ <b>ELITE bezwungen!</b> 1,5× Beute + Relikt-Wahl</div>` : "",
      `<div class="res-line">⭐ Trupp erhält <b>${exp} EP</b>, Ersatzbank <b>${Math.round(exp / 2)} EP</b> · 🪙 <b>+${coins}</b></div>`,
      `<div class="res-line">💖 Überlebende verschnaufen (+${Math.round(healPct*100)} % KP)</div>`,
      fallenLines,
    ];
    if (levelups.length) lines.push(`<div class="res-line">📈 <b>${levelups.length} Level-Up${levelups.length > 1 ? "s" : ""}</b> – gleich wählst du Verbesserungen!</div>`);
    if (finale) lines.push(`<div class="res-line evo">👑 <b>Mewtu ist bezwungen!</b></div>`);

    $("#result-title").textContent = finale ? "👑 Champion!" : "🏆 Sieg!";
    $("#result-title").className = "win";
    $("#result-body").innerHTML = lines.join("");
    Game.onResultNext = async () => {
      if (node.type === "legend") await offerLegendRecruit(node.legendSp, levelups);
      if (elite) await runRelicChoice();
      await runLevelUpChoices(levelups);
      writeSave();
      if (finale) {
        Game.save.best.wins++;
        Game.save.best.endless = Math.max(Game.save.best.endless || 0, run.loop || 0);
        writeSave();
        Sfx.champion();
        const i = await showChoice({
          title: "👑 CHAMPION!",
          sub: `Mewtu ist bezwungen – Champion-Sieg Nr. <b>${Game.save.best.wins}</b>! Wie soll es weitergehen?`,
          cards: [
            { icon: "🔥", title: "Weiterziehen (Endlos)", desc: "Eine neue, gefährlichere Karte erwartet dich – immer stärkere Gegner. Wie tief kommst du?" },
            { icon: "🏁", title: "Run glorreich beenden", desc: "Zurück zum Titel – Zeit für einen neuen Starter." },
          ],
        });
        if (i === 0) {
          run.loop = (run.loop || 0) + 1;
          run.endless = true;
          run.map = generateMap(run.loop);
          run.node = null;
          run.cleared = [];
          run.battleState = null;
          // Belohnung fürs Weiterziehen: Team voll heilen
          for (const e of run.roster) e.hp = entryStats(e).hp;
          writeSave();
          renderBattleList();
          showScreen("#screen-map");
        } else {
          Game.save.run = null;
          writeSave();
          updateTitle();
          showScreen("#screen-title");
        }
      } else {
        renderBattleList();
        showScreen("#screen-map");
      }
    };
    showScreen("#screen-result");
    return;
  }

  // Niederlage oder Flucht: Gegner behalten ihre Wunden
  saveEnemyState(def, battle);
  writeSave();

  if (run.roster.length === 0) {
    Game.save.best.stage = Math.max(Game.save.best.stage, run.cleared.length);
    Game.save.run = null;
    writeSave();
    $("#result-title").textContent = "💀 Run beendet";
    $("#result-title").className = "lose";
    $("#result-body").innerHTML = `
      <div class="res-line">Dein letztes Pokémon ist gefallen.</div>
      <div class="res-line">Geschaffte Knoten: <b>${run.cleared.length}</b>${Game.save.best.wins ? ` · 👑 Siege: <b>${Game.save.best.wins}</b>` : ""}</div>
      <div class="res-line">Jeder Run ist anders: neuer Starter, neue Rekruten, neue Wege. Versuch's gleich nochmal!</div>`;
    Game.onResultNext = () => { updateTitle(); showScreen("#screen-title"); };
    showScreen("#screen-result");
    return;
  }

  if (result === 2) {
    const left = run.battleState.enemies.filter((h) => h > 0).length;
    $("#result-title").textContent = "⚔ Rückschlag!";
    $("#result-title").className = "lose";
    $("#result-body").innerHTML = `
      ${fallenLines}
      <div class="res-line">Noch <b>${left} Gegner</b> übrig – sie behalten ihre Wunden!</div>
      <div class="res-line">Dir bleiben <b>${run.roster.length} Pokémon</b>. Stell den nächsten Trupp auf!</div>`;
    Game.onResultNext = () => { renderBattleList(); openPartySelect(def, elite, nodeId); };
    showScreen("#screen-result");
  } else {
    // Flucht
    renderBattleList();
    showScreen("#screen-map");
  }
}

/* ---------- Init ---------- */
function init() {
  SpriteCache.preloadAll();
  BattleUI.init();
  Game.save = loadSave();
  ensureSave();
  updateTitle();
  startTitleCanvas();

  $("#btn-newgame").addEventListener("click", () => {
    if (Game.save.run && !confirm("Laufenden Run aufgeben und neu starten?")) return;
    Sfx.select();
    startNewRun();
  });
  $("#btn-continue").addEventListener("click", () => {
    Sfx.select();
    renderBattleList();
    showScreen("#screen-map");
  });
  $("#btn-howto").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-howto"); });
  // --- Einstellungen ---
  let settingsReturn = "#screen-title";
  const openSettings = (from) => {
    settingsReturn = from;
    $("#set-music").value = Math.round(Settings.data.music * 100);
    $("#set-sfx").value = Math.round(Settings.data.sfx * 100);
    $("#set-vibration").checked = Settings.data.vibration;
    $("#set-fast").checked = Settings.data.fast;
    showScreen("#screen-settings");
  };
  $("#btn-settings").addEventListener("click", () => { Sfx.tap(); openSettings("#screen-title"); });
  $("#btn-map-settings").addEventListener("click", () => { Sfx.tap(); openSettings("#screen-map"); });
  $("#btn-settings-back").addEventListener("click", () => { Sfx.select(); showScreen(settingsReturn); });
  $("#set-music").addEventListener("input", (e) => Settings.set("music", e.target.value / 100));
  $("#set-sfx").addEventListener("change", (e) => { Settings.set("sfx", e.target.value / 100); Sfx.select(); });
  $("#set-vibration").addEventListener("change", (e) => {
    Settings.set("vibration", e.target.checked);
    if (e.target.checked && navigator.vibrate) navigator.vibrate(30);
  });
  $("#set-fast").addEventListener("change", (e) => Settings.set("fast", e.target.checked));
  $("#btn-wipe").addEventListener("click", () => {
    if (!confirm("Wirklich ALLES löschen (Run + Rekorde)?")) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
    Game.save = null;
    ensureSave();
    writeSave();
    updateTitle();
    Sfx.cancel();
    showScreen("#screen-title");
  });
  $("#btn-howto-back").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-title"); });
  $("#btn-map-title").addEventListener("click", () => {
    Sfx.tap();
    updateTitle();
    showScreen("#screen-title");
  });
  $("#btn-roster").addEventListener("click", () => { Sfx.tap(); renderRoster(); showScreen("#screen-roster"); });
  $("#btn-endquit").addEventListener("click", () => {
    if (!confirm("Run als Champion beenden?")) return;
    Sfx.select();
    Game.save.run = null;
    writeSave();
    updateTitle();
    showScreen("#screen-title");
  });
  $("#btn-roster-back").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-map"); });
  $("#btn-party-back").addEventListener("click", () => { Sfx.cancel(); showScreen("#screen-map"); });
  $("#btn-party-start").addEventListener("click", () => { Sfx.select(); startBattle(); });
  $("#btn-result-next").addEventListener("click", () => {
    Sfx.tap();
    if (Game.onResultNext) Game.onResultNext();
  });
}

document.addEventListener("DOMContentLoaded", init);
