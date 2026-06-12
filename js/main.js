/* ============================================================
   PokéTactics – Roguelike-Run, Speicherstand, Bildschirm-Flows
   ============================================================ */
"use strict";

const Game = {
  save: null,          // { best: {stage, wins}, run: {stage, roster[]} | null }
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

/* Roster-Eintrag eines Runs */
function mkEntry(sp, lvl) {
  return { sp, lvl, exp: 0, moves: defaultMoves(sp, lvl), bonus: { hp: 0, atk: 0, def: 0, spd: 0, mov: 0 } };
}

function entryStats(e) {
  const sp = SPECIES[e.sp];
  const st = (i) => Math.round(sp.base[i] + sp.grow[i] * (e.lvl - 1));
  return {
    hp: st(0) + e.bonus.hp, atk: st(1) + e.bonus.atk,
    def: st(2) + e.bonus.def, spd: sp.base[3] + e.bonus.spd,
  };
}

function avgRosterLvl() {
  const r = Game.save.run.roster;
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
}

/* ---------- Generischer Auswahl-Bildschirm ----------
   cards: [{ speciesId?, icon?, title, desc, chips? }]
   Rückgabe: Index der Karte oder -1 (Skip) */
function showChoice({ title, sub, cards, skipLabel }) {
  return new Promise((resolve) => {
    $("#choice-title").textContent = title;
    $("#choice-sub").innerHTML = sub || "";
    const cont = $("#choice-cards");
    cont.innerHTML = "";
    cards.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = "choice-card";
      const left = c.speciesId
        ? `<div class="cc-left"><canvas width="64" height="64"></canvas></div>`
        : `<div class="cc-left">${c.icon || "✦"}</div>`;
      el.innerHTML = `${left}
        <div class="cc-main">
          <div class="cc-title">${c.title}</div>
          <div class="cc-desc">${c.desc || ""}</div>
          ${c.chips ? `<div class="cc-chips">${c.chips}</div>` : ""}
        </div>`;
      if (c.speciesId) SpriteCache.drawInto(el.querySelector("canvas"), c.speciesId);
      el.addEventListener("click", () => { Sfx.select(); resolve(i); });
      cont.appendChild(el);
    });
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

function pokemonCard(entry) {
  const sp = SPECIES[entry.sp];
  const st = entryStats(entry);
  return {
    speciesId: entry.sp,
    title: `${sp.name} – Lv.${entry.lvl}`,
    desc: `${sp.role} · KP ${st.hp} · ANG ${st.atk} · VER ${st.def}<br>` +
          entry.moves.map((id) => MOVES[id].name).join(" · "),
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
    rec.textContent = best.wins > 0
      ? `🏆 Champion-Siege: ${best.wins} · Bester Run: Etappe ${best.stage}/${BATTLES.length}`
      : `📜 Bester Run: Etappe ${best.stage}/${BATTLES.length}`;
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
    sub: "Dein Anführer startet auf Level 4. Zwei zufällige Gefährten begleiten dich.",
    cards: offers.map(pokemonCard),
  });
  const starter = offers[i];
  const comps = sample(PLAYER_POOL.filter((s) => s !== starter.sp), 2).map((s) => mkEntry(s, 3));
  Game.save.run = { stage: 0, roster: [starter, ...comps] };
  writeSave();
  await showChoice({
    title: "🤝 Dein Team",
    sub: "Diese Gefährten schließen sich deinem Run an:",
    cards: comps.map(pokemonCard).concat([{ icon: "⚔", title: "Los geht's!", desc: "Zum Feldzug" }]),
  });
  renderBattleList();
  showScreen("#screen-map");
}

/* ---------- Etappen-Liste ---------- */
function renderBattleList() {
  const run = Game.save.run;
  const el = $("#battle-list");
  el.innerHTML = "";
  $(".map-head h2").innerHTML = `🗺 Run – Etappe ${Math.min(run.stage + 1, BATTLES.length)}/${BATTLES.length}`;
  for (const b of BATTLES) {
    const done = b.id < run.stage;
    const current = b.id === run.stage;
    const item = document.createElement("div");
    item.className = "battle-item" + (done ? " done" : "") + (!done && !current ? " locked" : "");
    item.innerHTML = `
      <div class="bi-num">${b.icon}</div>
      <div class="bi-main">
        <div class="bi-name">${b.id + 1}. ${b.name}</div>
        <div class="bi-desc">${b.desc}</div>
      </div>
      <div class="bi-state">${done ? "✅" : current ? "▶" : "🔒"}</div>`;
    if (current) {
      item.addEventListener("click", () => { Sfx.select(); openPartySelect(b); });
    }
    el.appendChild(item);
  }
}

/* ---------- Roster-Kachel ---------- */
function unitTile(entry, opts = {}) {
  const sp = SPECIES[entry.sp];
  const st = entryStats(entry);
  const tile = document.createElement("div");
  tile.className = "unit-tile";
  tile.innerHTML = `
    <span class="ut-lvl">Lv.${entry.lvl}</span>
    <canvas width="64" height="64"></canvas>
    <div class="ut-name">${sp.name}</div>
    <div class="ut-role">${sp.role}</div>
    <div class="ut-type">${sp.types.map(typeChipHtml).join("")}</div>
    <div class="ut-hp">KP ${st.hp} · ANG ${st.atk} · EP ${entry.exp || 0}/${EXP_PER_LEVEL}</div>
    <div class="ut-moves">${entry.moves.map((id) => MOVES[id].name).join(" · ")}</div>`;
  SpriteCache.drawInto(tile.querySelector("canvas"), entry.sp);
  if (opts.onClick) tile.addEventListener("click", () => opts.onClick(tile));
  return tile;
}

function renderRoster() {
  const el = $("#roster-list");
  el.innerHTML = "";
  for (const entry of Game.save.run.roster) el.appendChild(unitTile(entry));
}

/* ---------- Trupp-Auswahl ---------- */
function openPartySelect(battleDef) {
  Game.pendingBattle = battleDef;
  Game.selectedParty = [];
  $("#party-title").textContent = `${battleDef.icon} ${battleDef.name}`;
  const info = $("#party-info");
  const update = () => {
    info.innerHTML = `Wähle bis zu <b>${battleDef.partySize}</b> Pokémon · ausgewählt: <b>${Game.selectedParty.length}</b><br><span style="color:var(--ink-dim);font-size:.8rem">⚠ Niederlage beendet den Run! Ersatzbank erhält halbe EP.</span>`;
    $("#btn-party-start").disabled = Game.selectedParty.length === 0;
  };
  const el = $("#party-list");
  el.innerHTML = "";
  for (const entry of Game.save.run.roster) {
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
    entry.lvl++;
    levelups.push(entry);
  }
}

/* 3 Level-Up-Karten für einen Eintrag erzeugen */
function levelUpCards(entry) {
  const sp = SPECIES[entry.sp];
  const st = entryStats(entry);
  const gens = [];

  // Neue Attacke (aus dem Lernset, sonst aus passenden Typ-Attacken)
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
  gens.push({ weight: 20, card: { icon: "❤️", title: `+${hpUp} max. KP`, desc: "Zähigkeit für lange Schlachten." }, apply: () => { entry.bonus.hp += hpUp; } });
  const atkUp = Math.max(2, Math.round(st.atk * 0.12));
  gens.push({ weight: 16, card: { icon: "⚔", title: `+${atkUp} Angriff`, desc: "Mehr Schaden mit allen Attacken." }, apply: () => { entry.bonus.atk += atkUp; } });
  const defUp = Math.max(2, Math.round(st.def * 0.12));
  gens.push({ weight: 16, card: { icon: "🛡", title: `+${defUp} Verteidigung`, desc: "Weniger Schaden durch Treffer." }, apply: () => { entry.bonus.def += defUp; } });
  gens.push({ weight: 9, card: { icon: "💨", title: "+1 Tempo", desc: "Ist öfter am Zug, weicht besser aus." }, apply: () => { entry.bonus.spd += 1; } });
  if ((entry.bonus.mov || 0) < 1) {
    gens.push({ weight: 5, card: { icon: "👣", title: "+1 Bewegung", desc: "Selten! Erreicht entferntere Felder." }, apply: () => { entry.bonus.mov = (entry.bonus.mov || 0) + 1; } });
  }

  // 3 verschiedene Karten gewichtet ziehen
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
  // Entwicklungen prüfen (nach allen Level-Ups)
  for (const entry of [...new Set(levelups)]) {
    let sp = SPECIES[entry.sp];
    while (sp.evoLvl && entry.lvl >= sp.evoLvl && sp.evoTo) {
      const oldName = sp.name;
      entry.sp = sp.evoTo;
      sp = SPECIES[entry.sp];
      Sfx.levelup();
      await showChoice({
        title: "✨ Entwicklung!",
        sub: "",
        cards: [{
          speciesId: entry.sp,
          title: `${oldName} entwickelt sich zu ${sp.name}!`,
          desc: `${sp.role} · die Attacken bleiben erhalten`,
          chips: sp.types.map(typeChipHtml).join(""),
        }],
      });
      writeSave();
    }
  }
}

/* ---------- Rekruten-Angebot ---------- */
async function runRecruitChoice(levelups) {
  const run = Game.save.run;
  const lvl = Math.max(3, avgRosterLvl());
  const inTeam = new Set(run.roster.map((e) => e.sp));
  let pool = RECRUIT_POOL.filter((s) => !inTeam.has(s));
  if (pool.length < 2) pool = RECRUIT_POOL;
  const offers = sample(pool, 2).map((s) => {
    const e = mkEntry(s, lvl);
    // hochstufige Rekruten kommen bereits entwickelt
    let sp = SPECIES[e.sp];
    while (sp.evoLvl && e.lvl >= sp.evoLvl && sp.evoTo) {
      e.sp = sp.evoTo;
      sp = SPECIES[e.sp];
      e.moves = defaultMoves(e.sp, e.lvl);
    }
    return e;
  });
  const i = await showChoice({
    title: "🤝 Ein Rekrut möchte beitreten!",
    sub: "Wähle einen Neuzugang – oder lehne ab und dein Team erhält je 25 EP.",
    cards: offers.map(pokemonCard),
    skipLabel: "Ablehnen (+25 EP für alle)",
  });
  if (i === -1) {
    for (const e of run.roster) awardExp(e, 25, levelups);
  } else {
    run.roster.push(offers[i]);
  }
  writeSave();
}

/* ---------- Schlacht & Ergebnis ---------- */
async function startBattle() {
  const def = Game.pendingBattle;
  const party = Game.selectedParty;
  const run = Game.save.run;
  const result = await BattleUI.run(def, party);

  if (result === 1) {
    const exp = STAGE_EXP[def.id] || 150;
    const levelups = [];
    for (const entry of run.roster) {
      awardExp(entry, party.includes(entry) ? exp : Math.round(exp / 2), levelups);
    }
    const finale = def.id === BATTLES.length - 1;
    run.stage = def.id + 1;
    Game.save.best.stage = Math.max(Game.save.best.stage, run.stage);
    writeSave();

    const lines = [
      `<div class="res-line">⭐ Trupp erhält <b>${exp} EP</b>, Ersatzbank <b>${Math.round(exp / 2)} EP</b></div>`,
    ];
    if (levelups.length) lines.push(`<div class="res-line">📈 <b>${levelups.length} Level-Up${levelups.length > 1 ? "s" : ""}</b> – gleich wählst du Verbesserungen!</div>`);
    if (finale) lines.push(`<div class="res-line evo">👑 <b>Mewtu ist bezwungen – dein Run ist geschafft!</b></div>`);

    $("#result-title").textContent = "🏆 Sieg!";
    $("#result-title").className = "win";
    $("#result-body").innerHTML = lines.join("");
    Game.onResultNext = async () => {
      if (!finale) await runRecruitChoice(levelups);
      await runLevelUpChoices(levelups);
      writeSave();
      if (finale) {
        Game.save.best.wins++;
        Game.save.run = null;
        writeSave();
        $("#result-title").textContent = "👑 CHAMPION!";
        $("#result-title").className = "win";
        $("#result-body").innerHTML = `<div class="res-line evo">Du hast den Run gemeistert – Champion-Sieg Nr. <b>${Game.save.best.wins}</b>!<br>Starte einen neuen Run mit anderem Starter und anderen Karten.</div>`;
        Game.onResultNext = () => { updateTitle(); showScreen("#screen-title"); };
        showScreen("#screen-result");
      } else {
        renderBattleList();
        showScreen("#screen-map");
      }
    };
    showScreen("#screen-result");
  } else if (result === 2) {
    // Niederlage = Run vorbei (Roguelike!)
    const reached = run.stage;
    Game.save.best.stage = Math.max(Game.save.best.stage, reached);
    Game.save.run = null;
    writeSave();
    $("#result-title").textContent = "💀 Run beendet";
    $("#result-title").className = "lose";
    $("#result-body").innerHTML = `
      <div class="res-line">Dein Team wurde in <b>Etappe ${reached + 1}</b> besiegt.</div>
      <div class="res-line">Bester Run: <b>Etappe ${Game.save.best.stage}/${BATTLES.length}</b>${Game.save.best.wins ? ` · 👑 Siege: <b>${Game.save.best.wins}</b>` : ""}</div>
      <div class="res-line">Jeder Run ist anders: neuer Starter, neue Rekruten, neue Karten. Versuch's gleich nochmal!</div>`;
    Game.onResultNext = () => { updateTitle(); showScreen("#screen-title"); };
    showScreen("#screen-result");
  } else {
    // Flucht: zurück zur Karte, kein Fortschritt
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
  $("#btn-howto-back").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-title"); });
  $("#btn-map-title").addEventListener("click", () => {
    Sfx.tap();
    updateTitle();
    showScreen("#screen-title");
  });
  $("#btn-roster").addEventListener("click", () => { Sfx.tap(); renderRoster(); showScreen("#screen-roster"); });
  $("#btn-roster-back").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-map"); });
  $("#btn-party-back").addEventListener("click", () => { Sfx.cancel(); showScreen("#screen-map"); });
  $("#btn-party-start").addEventListener("click", () => { Sfx.select(); startBattle(); });
  $("#btn-result-next").addEventListener("click", () => {
    Sfx.tap();
    if (Game.onResultNext) Game.onResultNext();
  });
}

document.addEventListener("DOMContentLoaded", init);
