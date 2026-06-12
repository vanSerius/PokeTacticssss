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

/* Alte Runs ohne neue Felder nachrüsten */
function migrateRun(run) {
  if (!run) return;
  if (!run.battleSeq) run.battleSeq = STAGE_POOLS.map((p) => p[0]);
  if (!run.relics) run.relics = [];
  if (run.phoenixUsed === undefined) run.phoenixUsed = false;
}

function hasRelic(id) {
  const run = Game.save && Game.save.run;
  return !!(run && run.relics && run.relics.includes(id));
}

function stageBattle(stage) {
  return BATTLES[Game.save.run.battleSeq[stage]];
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
    cards.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = "choice-card" + (c.dim ? " dead" : "");
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
    rec.textContent = best.wins > 0
      ? `🏆 Champion-Siege: ${best.wins} · Bester Run: Etappe ${best.stage}/${STAGE_POOLS.length}`
      : `📜 Bester Run: Etappe ${best.stage}/${STAGE_POOLS.length}`;
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
    stage: 0, roster: [starter, ...comps], graveyard: [],
    coins: 30, sinceEvent: 0, battleState: null,
    battleSeq: STAGE_POOLS.map((pool) => sample(pool, 1)[0]),
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
  const el = $("#battle-list");
  el.innerHTML = "";
  $(".map-head h2").innerHTML =
    `🗺 Etappe ${Math.min(run.stage + 1, STAGE_POOLS.length)}/${STAGE_POOLS.length} · 🪙 ${run.coins} · 👥 ${run.roster.length}`;
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
  for (let stage = 0; stage < STAGE_POOLS.length; stage++) {
    const b = stageBattle(stage);
    const done = stage < run.stage;
    const current = stage === run.stage;
    const weakened = current && run.battleState && run.battleState.stage === b.id;
    const item = document.createElement("div");
    item.className = "battle-item" + (done ? " done" : "") + (!done && !current ? " locked" : "");
    item.innerHTML = `
      <div class="bi-num">${b.icon}</div>
      <div class="bi-main">
        <div class="bi-name">${stage + 1}. ${b.name}</div>
        <div class="bi-desc">${weakened ? "⚔ Die Gegner sind bereits verwundet – weiter geht's!" : b.desc}</div>
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
function openPartySelect(battleDef) {
  Game.pendingBattle = battleDef;
  Game.selectedParty = [];
  const run = Game.save.run;
  const weakened = run.battleState && run.battleState.stage === battleDef.id;
  $("#party-title").textContent = `${battleDef.icon} ${battleDef.name}`;
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
async function runRecruitChoice(levelups) {
  const run = Game.save.run;
  const lvl = Math.max(3, 3 + run.stage - 1);
  const inTeam = new Set(run.roster.map((e) => e.sp));
  let pool = RECRUIT_POOL.filter((s) => !inTeam.has(s));
  if (pool.length < 2) pool = RECRUIT_POOL;
  const offers = sample(pool, 2).map((s) => mkEntry(s, lvl));
  const i = await showChoice({
    title: "🤝 Ein Rekrut möchte beitreten!",
    sub: "Wähle einen Neuzugang – oder lehne ab und dein Team erhält je 25 EP.",
    cards: offers.map((e) => pokemonCard(e)),
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
  const priceMul = 1 + run.stage * 0.08;
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
  const old = (run.battleState && run.battleState.stage === def.id) ? run.battleState.enemies : null;
  const enemies = def.enemies.map((e, i) => {
    const u = battle.units.find((x) => x.enemyIdx === i);
    if (!u) return old ? old[i] : 0;      // war in diesem Versuch gar nicht dabei
    return u.alive ? u.hp : 0;
  });
  run.battleState = { stage: def.id, enemies };
}

async function startBattle() {
  const def = Game.pendingBattle;
  const party = Game.selectedParty;
  const run = Game.save.run;
  const clearedStage = run.stage;
  const enemyState = (run.battleState && run.battleState.stage === def.id) ? run.battleState.enemies : null;
  const { result, battle } = await BattleUI.run(def, party, enemyState, run.relics);

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
    let exp = STAGE_EXP[clearedStage] || 150;
    if (hasRelic("epanhaenger")) exp = Math.round(exp * 1.2);
    let coins = 30 + 12 * clearedStage;
    if (hasRelic("gluecksmuenze")) coins = Math.round(coins * 1.4);
    run.coins += coins;
    const levelups = [];
    for (const entry of run.roster) {
      awardExp(entry, party.includes(entry) ? exp : Math.round(exp / 2), levelups);
    }
    // Verschnaufpause: Überlebende heilen 25 % der max. KP (Wundsalbe: +10 %)
    const healPct = 0.25 + (hasRelic("wundsalbe") ? 0.10 : 0);
    for (const entry of run.roster) {
      if (party.includes(entry)) healEntry(entry, Math.round(entryStats(entry).hp * healPct));
    }
    const finale = !!def.finale;
    run.stage = clearedStage + 1;
    Game.save.best.stage = Math.max(Game.save.best.stage, run.stage);
    writeSave();

    const lines = [
      `<div class="res-line">⭐ Trupp erhält <b>${exp} EP</b>, Ersatzbank <b>${Math.round(exp / 2)} EP</b> · 🪙 <b>+${coins}</b></div>`,
      `<div class="res-line">💖 Überlebende verschnaufen (+25 % KP)</div>`,
      fallenLines,
    ];
    if (levelups.length) lines.push(`<div class="res-line">📈 <b>${levelups.length} Level-Up${levelups.length > 1 ? "s" : ""}</b> – gleich wählst du Verbesserungen!</div>`);
    if (finale) lines.push(`<div class="res-line evo">👑 <b>Mewtu ist bezwungen – dein Run ist geschafft!</b></div>`);

    $("#result-title").textContent = "🏆 Sieg!";
    $("#result-title").className = "win";
    $("#result-body").innerHTML = lines.join("");
    Game.onResultNext = async () => {
      if ([1, 3, 5].includes(clearedStage)) await runRelicChoice();
      if (!finale) await runRecruitChoice(levelups);
      await runLevelUpChoices(levelups);
      if (!finale) await maybeRandomEvent();
      writeSave();
      if (finale) {
        Game.save.best.wins++;
        Game.save.run = null;
        writeSave();
        Sfx.champion();
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
    return;
  }

  // Niederlage oder Flucht: Gegner behalten ihre Wunden
  saveEnemyState(def, battle);
  writeSave();

  if (run.roster.length === 0) {
    // Niemand mehr übrig -> Run ist wirklich vorbei
    Game.save.best.stage = Math.max(Game.save.best.stage, run.stage);
    Game.save.run = null;
    writeSave();
    $("#result-title").textContent = "💀 Run beendet";
    $("#result-title").className = "lose";
    $("#result-body").innerHTML = `
      <div class="res-line">Dein letztes Pokémon ist in <b>Etappe ${clearedStage + 1}</b> gefallen.</div>
      <div class="res-line">Bester Run: <b>Etappe ${Game.save.best.stage}/${STAGE_POOLS.length}</b>${Game.save.best.wins ? ` · 👑 Siege: <b>${Game.save.best.wins}</b>` : ""}</div>
      <div class="res-line">Jeder Run ist anders: neuer Starter, neue Rekruten, neue Karten. Versuch's gleich nochmal!</div>`;
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
    Game.onResultNext = () => { renderBattleList(); openPartySelect(def); };
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
  $("#btn-roster-back").addEventListener("click", () => { Sfx.tap(); showScreen("#screen-map"); });
  $("#btn-party-back").addEventListener("click", () => { Sfx.cancel(); showScreen("#screen-map"); });
  $("#btn-party-start").addEventListener("click", () => { Sfx.select(); startBattle(); });
  $("#btn-result-next").addEventListener("click", () => {
    Sfx.tap();
    if (Game.onResultNext) Game.onResultNext();
  });
}

document.addEventListener("DOMContentLoaded", init);
