/* ============================================================
   PokéTactics – Kampagne, Speicherstand, Bildschirm-Flows
   ============================================================ */
"use strict";

const Game = {
  save: null,
  pendingBattle: null,
  selectedParty: [],
};

/* ---------- Speicherstand ---------- */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* defekter Speicherstand -> neu */ }
  return null;
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.save)); } catch (e) {}
}
function newSave() {
  Game.save = {
    roster: START_ROSTER.map((e) => ({ sp: e.sp, lvl: e.lvl, exp: 0 })),
    cleared: [],
  };
  writeSave();
}
function isUnlocked(battleId) {
  return battleId === 0 || Game.save.cleared.includes(battleId - 1);
}

/* ---------- Titelbild-Animation ---------- */
function startTitleCanvas() {
  const cv = $("#title-canvas");
  const ctx = cv.getContext("2d");
  const heroes = ["pikachu", "glumanda", "schiggy", "bisasam", "evoli"];
  let t = 0;
  function frame() {
    if (!$("#screen-title").classList.contains("active")) {
      requestAnimationFrame(frame);
      return;
    }
    t += 0.03;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    // Boden-Rauten
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

/* ---------- Schlachten-Liste ---------- */
function renderBattleList() {
  const el = $("#battle-list");
  el.innerHTML = "";
  for (const b of BATTLES) {
    const done = Game.save.cleared.includes(b.id);
    const unlocked = isUnlocked(b.id);
    const item = document.createElement("div");
    item.className = "battle-item" + (done ? " done" : "") + (!unlocked ? " locked" : "");
    item.innerHTML = `
      <div class="bi-num">${b.icon}</div>
      <div class="bi-main">
        <div class="bi-name">${b.id + 1}. ${b.name}</div>
        <div class="bi-desc">${b.desc}</div>
      </div>
      <div class="bi-state">${done ? "✅" : unlocked ? "▶" : "🔒"}</div>`;
    if (unlocked) {
      item.addEventListener("click", () => { Sfx.select(); openPartySelect(b); });
    }
    el.appendChild(item);
  }
}

/* ---------- Roster-Kachel ---------- */
function unitTile(entry, opts = {}) {
  const sp = SPECIES[entry.sp];
  const tile = document.createElement("div");
  tile.className = "unit-tile";
  const hp = Math.round(sp.base[0] + sp.grow[0] * (entry.lvl - 1));
  tile.innerHTML = `
    <span class="ut-lvl">Lv.${entry.lvl}</span>
    <canvas width="64" height="64"></canvas>
    <div class="ut-name">${sp.name}</div>
    <div class="ut-role">${sp.role}</div>
    <div class="ut-type">${sp.types.map(typeChipHtml).join("")}</div>
    <div class="ut-hp">KP ${hp} · EP ${entry.exp || 0}/${EXP_PER_LEVEL}</div>`;
  SpriteCache.drawInto(tile.querySelector("canvas"), entry.sp);
  if (opts.onClick) tile.addEventListener("click", () => opts.onClick(tile));
  return tile;
}

function renderRoster() {
  const el = $("#roster-list");
  el.innerHTML = "";
  for (const entry of Game.save.roster) el.appendChild(unitTile(entry));
}

/* ---------- Trupp-Auswahl ---------- */
function openPartySelect(battleDef) {
  Game.pendingBattle = battleDef;
  Game.selectedParty = [];
  $("#party-title").textContent = `${battleDef.icon} ${battleDef.name}`;
  const info = $("#party-info");
  const update = () => {
    info.innerHTML = `Wähle bis zu <b>${battleDef.partySize}</b> Pokémon · ausgewählt: <b>${Game.selectedParty.length}</b><br><span style="color:var(--ink-dim);font-size:.8rem">${battleDef.desc}</span>`;
    $("#btn-party-start").disabled = Game.selectedParty.length === 0;
  };
  const el = $("#party-list");
  el.innerHTML = "";
  for (const entry of Game.save.roster) {
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

/* ---------- Schlacht starten & Ergebnis ---------- */
async function startBattle() {
  const def = Game.pendingBattle;
  const party = Game.selectedParty;
  const result = await BattleUI.run(def, party);

  if (result === 1) {
    const lines = [];
    const firstClear = !Game.save.cleared.includes(def.id);
    lines.push(`<div class="res-line">⭐ Jedes eingesetzte Pokémon erhält <b>${def.exp} EP</b></div>`);
    for (const entry of party) {
      entry.exp = (entry.exp || 0) + def.exp;
      let leveled = 0;
      while (entry.exp >= EXP_PER_LEVEL) {
        entry.exp -= EXP_PER_LEVEL;
        entry.lvl++;
        leveled++;
      }
      if (leveled) {
        Sfx.levelup();
        lines.push(`<div class="res-line">📈 <b>${SPECIES[entry.sp].name}</b> erreicht Level ${entry.lvl}!</div>`);
      }
      const sp = SPECIES[entry.sp];
      if (sp.evoLvl && entry.lvl >= sp.evoLvl && sp.evoTo) {
        const oldName = sp.name;
        entry.sp = sp.evoTo;
        lines.push(`<div class="res-line evo">✨ <b>${oldName}</b> entwickelt sich zu <b>${SPECIES[entry.sp].name}</b>!</div>`);
      }
    }
    if (firstClear) {
      Game.save.cleared.push(def.id);
      if (def.recruit) {
        Game.save.roster.push({ sp: def.recruit.sp, lvl: def.recruit.lvl, exp: 0 });
        lines.push(`<div class="res-line evo">🤝 <b>${SPECIES[def.recruit.sp].name}</b> (${SPECIES[def.recruit.sp].role}) schließt sich deinem Team an!</div>`);
      }
      if (def.id === BATTLES.length - 1) {
        lines.push(`<div class="res-line evo">👑 <b>Du hast Mewtu bezwungen und bist Champion von PokéTactics!</b><br>Spiele frühere Schlachten erneut, um dein Team weiter aufzuleveln.</div>`);
      }
    }
    writeSave();
    $("#result-title").textContent = "🏆 Sieg!";
    $("#result-title").className = "win";
    $("#result-body").innerHTML = lines.join("");
  } else if (result === 2) {
    $("#result-title").textContent = "Niederlage …";
    $("#result-title").className = "lose";
    $("#result-body").innerHTML = `<div class="res-line">Dein Team wurde besiegt – aber niemand ist verloren!<br>Versuche es mit anderer Aufstellung oder level in früheren Schlachten.</div>`;
  } else {
    // geflohen
    showScreen("#screen-map");
    renderBattleList();
    return;
  }
  showScreen("#screen-result");
}

/* ---------- Init ---------- */
function init() {
  SpriteCache.preloadAll();
  BattleUI.init();
  Game.save = loadSave();
  if (Game.save) $("#btn-continue").classList.remove("hidden");
  startTitleCanvas();

  $("#btn-newgame").addEventListener("click", () => {
    if (Game.save && !confirm("Vorhandenen Spielstand überschreiben?")) return;
    Sfx.select();
    newSave();
    renderBattleList();
    showScreen("#screen-map");
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
    if (Game.save) $("#btn-continue").classList.remove("hidden");
    showScreen("#screen-title");
  });
  $("#btn-roster").addEventListener("click", () => { Sfx.tap(); renderRoster(); showScreen("#screen-roster"); });
  $("#btn-roster-back").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-map"); });
  $("#btn-party-back").addEventListener("click", () => { Sfx.cancel(); showScreen("#screen-map"); });
  $("#btn-party-start").addEventListener("click", () => { Sfx.select(); startBattle(); });
  $("#btn-result-next").addEventListener("click", () => {
    Sfx.tap();
    renderBattleList();
    showScreen("#screen-map");
  });
}

document.addEventListener("DOMContentLoaded", init);
