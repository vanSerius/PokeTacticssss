/* ============================================================
   PokéTactics – Kampf-UI & Ablaufsteuerung
   ============================================================ */
"use strict";

const $ = (sel) => document.querySelector(sel);

function typeChipHtml(t) {
  const ty = TYPES[t];
  return `<span class="type-chip" style="background:${ty.color}">${ty.name}</span>`;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* ============================================================
   Kampf-Controller
   ============================================================ */
const BattleUI = (() => {
  let renderer = null;
  let battle = null;
  let abortPlayerTurn = null;

  function init() {
    renderer = new IsoRenderer($("#battle-canvas"));
    // Debug-/Test-Hook
    window.__pt = { get renderer() { return renderer; }, get battle() { return battle; } };
  }

  /* ---------- kleine DOM-Helfer ---------- */
  async function banner(text, ms = 1300) {
    const el = $("#banner");
    el.innerHTML = text.replace(/\n/g, "<br>");
    el.classList.remove("hidden");
    await renderer.wait(ms);
    el.classList.add("hidden");
  }

  function updateTurnOrder() {
    const el = $("#turn-order");
    el.innerHTML = "";
    const list = battle.forecast(7);
    list.forEach((u, i) => {
      const chip = document.createElement("div");
      chip.className = "to-chip " + (u.team === 0 ? "ally" : "enemy") + (i === 0 ? " current" : "");
      const cv = document.createElement("canvas");
      cv.width = 32; cv.height = 32;
      SpriteCache.drawInto(cv, u.species);
      chip.appendChild(cv);
      const hp = document.createElement("div");
      hp.className = "to-hp";
      hp.innerHTML = `<div style="width:${Math.round((u.hp / u.maxHp) * 100)}%"></div>`;
      chip.appendChild(hp);
      el.appendChild(chip);
    });
  }

  function showUnitCard(u) {
    const card = $("#unit-card");
    if (!u) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");
    SpriteCache.drawInto(card.querySelector(".uc-sprite"), u.species);
    card.querySelector(".uc-name").textContent = `${u.name}  Lv.${u.lvl}`;
    card.querySelector(".uc-role").textContent = u.role + (u.team === 1 ? " · Gegner" : "");
    const r = Math.max(0, u.hp / u.maxHp);
    const fill = card.querySelector(".uc-hpfill");
    fill.style.width = (r * 100).toFixed(0) + "%";
    fill.style.background = r > .5 ? "linear-gradient(90deg,#4ade80,#22c55e)"
      : r > .25 ? "linear-gradient(90deg,#fde047,#facc15)" : "linear-gradient(90deg,#f87171,#ef4444)";
    card.querySelector(".uc-hptext").textContent = `${u.hp}/${u.maxHp}`;
    card.querySelector(".uc-stats").innerHTML =
      `<span style="color:#7dd3fc;font-weight:800">⬡ ${u.mana}/${u.manaMax}</span> · ANG ${Math.round(battle.effAtk(u))} · VER ${Math.round(battle.effDef(u))} · BEW ${u.mov}` +
      ` &nbsp; ${u.types.map(typeChipHtml).join(" ")}`;
    card.querySelector(".uc-status").innerHTML = u.statuses
      .map((s) => `<span class="st-chip" style="background:#1f2440;color:${STATUS[s.id].color}">${STATUS[s.id].icon} ${STATUS[s.id].name}</span>`)
      .join("");
  }

  function showInfoModal(u) {
    $("#info-modal").classList.remove("hidden");
    $("#info-modal .im-name").textContent = `${u.name} – ${u.role} (Lv.${u.lvl})`;
    const moves = battle.movesOf(u).map((id) => {
      const m = MOVES[id];
      const c = manaCost(m);
      return `<div class="im-move"><b>${m.name}</b> ${typeChipHtml(m.type)} · RW ${m.rng}${m.aoe ? " · Fläche" : ""} · ${c === 0 ? "gratis" : "⬡ " + c}<br><span style="color:var(--ink-dim)">${m.desc}</span></div>`;
    }).join("");
    $("#info-modal .im-body").innerHTML = `
      <div>${u.types.map(typeChipHtml).join(" ")} ${u.team === 1 ? "· <b style='color:var(--danger)'>Gegner</b>" : ""}</div>
      <div class="im-statgrid">
        <div class="im-stat"><b>${u.hp}/${u.maxHp}</b><span>KP</span></div>
        <div class="im-stat"><b>${Math.round(battle.effAtk(u))}</b><span>Angriff</span></div>
        <div class="im-stat"><b>${Math.round(battle.effDef(u))}</b><span>Vert.</span></div>
        <div class="im-stat"><b>${Math.round(battle.effSpd(u))}</b><span>Tempo</span></div>
        <div class="im-stat"><b>${u.mov}</b><span>Bewegung</span></div>
        <div class="im-stat"><b>${u.fly ? "✓ Flug" : u.jmp}</b><span>Sprung</span></div>
      </div>
      <div class="im-moves">${moves}</div>`;
  }

  function clearMarks() {
    renderer.highlights.clear();
    renderer.cursor = null;
    $("#forecast").classList.add("hidden");
    $("#confirm-bar").classList.add("hidden");
    $("#skill-menu").classList.add("hidden");
  }

  function markTiles(tiles, kind) {
    for (const t of tiles) renderer.highlights.set(t.x + "," + t.y, kind);
  }

  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* Watchdog: keine Animation darf das Spiel je blockieren */
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
  }

  /* ---------- Ereignisse animieren ---------- */
  async function playEvents(events) {
    for (const ev of events) {
      try {
        await playOneEvent(ev);
      } catch (e) {
        console.error("Ereignis-Animation übersprungen:", e);
      }
    }
  }

  async function playOneEvent(ev) {
    const u = ev.unit;
    switch (ev.type) {
        case "dmg": {
          renderer.centerOnTile(u.x, u.y);
          if (ev.crit) { Sfx.crit(); renderer.shake(9); vibrate(40); }
          else { Sfx.hit(); renderer.shake(5); vibrate(20); }
          renderer.burst(u.x, u.y, ev.crit ? "#ffd84d" : "#ff7b54");
          let txt = "-" + ev.val;
          renderer.addPopup(u.x, u.y, txt, ev.crit ? "#ffd84d" : "#fff", ev.crit);
          if (ev.mult >= 2) renderer.addPopup(u.x, u.y, "Sehr effektiv!", "#4ade80");
          else if (ev.mult > 0 && ev.mult < 1) renderer.addPopup(u.x, u.y, "Wenig effektiv …", "#a9a8c0");
          if (ev.dir === "back") renderer.addPopup(u.x, u.y, "Rückenangriff!", "#ffb03a");
          if (ev.guarded) renderer.addPopup(u.x, u.y, "🛡 Geblockt!", "#7dd3fc");
          await withTimeout(renderer.animFlash(u), 1200);
          showUnitCard(battle.active);
          break;
        }
        case "heal":
          Sfx.heal();
          renderer.burst(u.x, u.y, "#4ade80", 10);
          renderer.addPopup(u.x, u.y, "+" + ev.val, "#4ade80");
          await renderer.wait(420);
          break;
        case "miss":
          Sfx.miss();
          renderer.addPopup(u.x, u.y, "Daneben!", "#cbd5e1");
          await renderer.wait(420);
          break;
        case "immune":
          Sfx.miss();
          renderer.addPopup(u.x, u.y, "Wirkungslos …", "#a9a8c0");
          await renderer.wait(420);
          break;
        case "status":
          Sfx.status();
          renderer.addPopup(u.x, u.y, STATUS[ev.st].icon + " " + STATUS[ev.st].name + "!", STATUS[ev.st].color);
          await renderer.wait(480);
          break;
        case "buff":
          Sfx.status();
          renderer.addPopup(u.x, u.y, ev.label, ev.up ? "#4ade80" : "#f87171");
          await renderer.wait(420);
          break;
        case "dot":
          Sfx.status();
          renderer.addPopup(u.x, u.y, `-${ev.val} ${STATUS[ev.st].icon}`, STATUS[ev.st].color);
          await renderer.wait(450);
          break;
        case "asleep":
          renderer.addPopup(u.x, u.y, "💤 schläft …", "#93c5fd");
          await renderer.wait(500);
          break;
        case "wake":
          renderer.addPopup(u.x, u.y, "Aufgewacht!", "#fde047");
          await renderer.wait(420);
          break;
        case "paralyzed":
          renderer.addPopup(u.x, u.y, "⚡ Paralysiert!", "#fde047");
          await renderer.wait(500);
          break;
        case "ko":
          Sfx.ko();
          renderer.shake(7);
          renderer.addPopup(u.x, u.y, "K.O.!", "#ef4444", true);
          renderer.riseBurst(u.x, u.y, "#e2e8f0", 14);
          renderer.fxRing({ x: u.x, y: u.y }, { color: "#94a3b8", dur: .7, rings: 2 });
          await withTimeout(renderer.animKO(u), 2200);
          updateTurnOrder();
          break;
      }
  }

  /* ---------- Aktionsleiste ---------- */
  function buildActionBar(state) {
    const el = $("#action-main");
    el.innerHTML = "";
    const mk = (icon, label, disabled, cb) => {
      const b = document.createElement("button");
      b.className = "ab-btn" + (disabled ? " used" : "");
      b.innerHTML = `<span class="ab-ico">${icon}</span>${label}`;
      b.disabled = disabled;
      b.addEventListener("click", () => { Sfx.tap(); cb(); });
      el.appendChild(b);
      return b;
    };
    mk("👣", "Bewegen", state.moved, state.onMove);
    mk("⚔", "Attacken", state.acted, state.onAttack);
    mk(state.acted ? "⏳" : "🛡", state.acted ? "Warten" : "Blocken", false, state.onWait);
    $("#action-bar").classList.remove("hidden");
  }

  function hideActionBar() { $("#action-bar").classList.add("hidden"); }

  /* ---------- Spielerzug ---------- */
  function playerTurn(u) {
    return new Promise((resolve) => {
      let mode = "idle";          // idle | move | move-confirm | target | aoe-confirm
      let moved = false, acted = false;
      let reach = null, currentMove = null, pendingTile = null, pendingPath = null;

      const refreshBar = () => buildActionBar({
        moved, acted,
        onMove: startMove,
        onAttack: openSkillMenu,
        onWait: startFacing,
      });

      function setIdle() {
        mode = "idle";
        clearMarks();
        hideConfirm();
        if (battle.checkEnd()) { finish(); return; }
        showUnitCard(u);
        refreshBar();
        if (moved && acted) startFacing();
      }

      function finish() {
        clearMarks();
        hideActionBar();
        hideConfirm();
        $("#facing-bar").classList.add("hidden");
        renderer.onTap = null;
        abortPlayerTurn = null;
        resolve({ moved, acted });
      }
      abortPlayerTurn = finish;

      /* --- Blickrichtung am Zugende wählen (wie in FFT) --- */
      function startFacing() {
        if (battle.checkEnd()) { finish(); return; }
        mode = "facing";
        clearMarks();
        hideActionBar();
        hideConfirm();
        showUnitCard(u);
        renderer.centerOnTile(u.x, u.y);
        const bar = $("#facing-bar");
        bar.classList.remove("hidden");
        const markActive = () => {
          bar.querySelectorAll(".fb-btn[data-fx]").forEach((b) => {
            const isActive = u.facing &&
              u.facing.x === parseInt(b.dataset.fx, 10) &&
              u.facing.y === parseInt(b.dataset.fy, 10);
            b.classList.toggle("active", isActive);
          });
        };
        bar.querySelectorAll(".fb-btn[data-fx]").forEach((b) => {
          b.onclick = () => {
            Sfx.tap();
            u.facing = { x: parseInt(b.dataset.fx, 10), y: parseInt(b.dataset.fy, 10) };
            markActive();
          };
        });
        markActive();
        $("#btn-facing-ok").onclick = () => { Sfx.select(); finish(); };
      }

      function hideConfirm() { $("#confirm-bar").classList.add("hidden"); }
      function showConfirm() { $("#confirm-bar").classList.remove("hidden"); hideActionBar(); }

      /* --- Bewegen --- */
      function startMove() {
        mode = "move";
        clearMarks();
        reach = battle.reachable(u);
        markTiles(reach.tiles, "move");
        showConfirm();
        $("#btn-confirm").classList.add("hidden");
      }

      function previewMove(tile) {
        const path = battle.pathTo(reach.nodes, tile.x, tile.y);
        if (!path) return;
        clearMarks();
        markTiles(reach.tiles, "move");
        markTiles(path, "path");
        renderer.cursor = tile;
        pendingTile = tile;
        pendingPath = path;
        mode = "move-confirm";
        showConfirm();
        $("#btn-confirm").classList.remove("hidden");
      }

      async function execMove() {
        mode = "busy";
        clearMarks();
        hideConfirm();
        Sfx.move();
        await withTimeout(renderer.animMove(u, pendingPath), pendingPath.length * 250 + 1500);
        u.x = pendingTile.x; u.y = pendingTile.y;
        u.rx = u.x; u.ry = u.y;
        // automatisch zum nächsten Gegner ausrichten
        const foes = battle.alive(1);
        if (foes.length) {
          let nf = foes[0], bd = Infinity;
          for (const f of foes) {
            const d = Math.abs(f.x - u.x) + Math.abs(f.y - u.y);
            if (d < bd) { bd = d; nf = f; }
          }
          battle.setFacingTowards(u, nf.x, nf.y);
        }
        moved = true;
        updateTurnOrder();
        renderer.centerOnTile(u.x, u.y);
        setIdle();
      }

      /* --- Attacken --- */
      function openSkillMenu() {
        mode = "skillmenu";
        clearMarks();
        const list = $("#skill-list");
        list.innerHTML = "";
        $("#skill-menu .sm-head").firstChild.textContent = `Attacke wählen · ⬡ ${u.mana}/${u.manaMax} `;
        for (const id of battle.movesOf(u)) {
          const m = MOVES[id];
          const cost = manaCost(m);
          const affordable = battle.canAfford(u, id);
          const item = document.createElement("div");
          item.className = "skill-item" + (affordable ? "" : " nopp");
          item.innerHTML = `
            <div class="si-main">
              <div class="si-name">${m.name} ${typeChipHtml(m.type)}</div>
              <div class="si-desc">${m.desc} · RW ${m.rng === 0 ? "Umkreis" : m.rng}${m.aoe ? " · Fläche" : ""}</div>
            </div>
            <div class="si-pp" style="${affordable ? "color:#7dd3fc" : ""}">${cost === 0 ? "gratis" : "⬡ " + cost}</div>`;
          item.addEventListener("click", () => { Sfx.select(); startTarget(id); });
          list.appendChild(item);
        }
        $("#skill-menu").classList.remove("hidden");
        hideActionBar();
        $("#btn-skill-close").onclick = () => { Sfx.cancel(); setIdle(); };
      }

      function startTarget(moveId) {
        currentMove = moveId;
        $("#skill-menu").classList.add("hidden");
        clearMarks();
        mode = "target";
        const m = MOVES[moveId];
        const tiles = battle.tilesInRange(u, moveId);
        markTiles(tiles, m.target === "foe" ? "attack" : "ally");
        showConfirm();
        $("#btn-confirm").classList.add("hidden");
        if (m.rng === 0) previewTarget({ x: u.x, y: u.y });
      }

      function previewTarget(tile) {
        const m = MOVES[currentMove];
        if (m.rng > 0) {
          const d = Math.abs(tile.x - u.x) + Math.abs(tile.y - u.y);
          if (d < 1 || d > m.rng) return;
        }
        if (!battle.validTarget(u, currentMove, tile.x, tile.y)) {
          renderer.addPopup(tile.x, tile.y, "Kein Ziel", "#a9a8c0");
          return;
        }
        clearMarks();
        const tiles = battle.tilesInRange(u, currentMove);
        markTiles(tiles, m.target === "foe" ? "attack" : "ally");
        markTiles(battle.aoeTiles(currentMove, tile.x, tile.y), "aoe");
        renderer.cursor = tile;
        pendingTile = tile;
        mode = "aoe-confirm";
        showForecast(tile);
        showConfirm();
        $("#btn-confirm").classList.remove("hidden");
      }

      function showForecast(tile) {
        const m = MOVES[currentMove];
        const aff = battle.affectedUnits(u, currentMove, tile.x, tile.y);
        const fc = $("#forecast");
        fc.querySelector(".fc-title").textContent = m.name;
        const lines = aff.map((t) => {
          if (m.heal) return `<b>${t.name}</b>: heilt ${m.heal >= 1 ? "vollständig" : "+" + Math.round(t.maxHp * m.heal) + " KP"}`;
          if (m.cat === "s") {
            const what = m.fx ? STATUS[m.fx.st].name : (m.buff ? (m.buff.mult > 1 ? "Stärkung" : "Schwächung") : "Effekt");
            const p = battle.predict(u, currentMove, t);
            return `<b>${t.name}</b>: ${what} · Chance ${t.team === u.team ? 100 : p.hit}%`;
          }
          const p = battle.predict(u, currentMove, t);
          const eff = p.mult === 0 ? `<span class="fc-eff-0">wirkungslos</span>`
            : p.mult >= 2 ? `<span class="fc-eff-2">sehr effektiv</span>`
            : p.mult < 1 ? `<span class="fc-eff-05">wenig effektiv</span>` : "";
          const ally = t.team === u.team ? " ⚠ eigenes Team!" : "";
          const dir = p.dir === "back" ? " · Rücken!" : p.dir === "side" ? " · Flanke" : "";
          const grd = t.guarding ? " · 🛡 blockt" : "";
          return `<b>${t.name}</b>: ~${p.dmg} Schaden · ${p.hit}% ${eff}${dir}${grd}${ally}`;
        });
        fc.querySelector(".fc-body").innerHTML = lines.join("<br>") || "Keine Ziele";
        fc.classList.remove("hidden");
        $("#unit-card").classList.add("hidden"); // Platz für die Vorschau schaffen
      }

      async function execAttack() {
        mode = "busy";
        clearMarks();
        hideConfirm();
        battle.setFacingTowards(u, pendingTile.x, pendingTile.y);
        const m = MOVES[currentMove];
        renderer.centerOnTile(pendingTile.x, pendingTile.y);
        const melee = m.cat === "p" && m.rng <= 1;
        await withTimeout(renderer.animLunge(u, pendingTile.x, pendingTile.y, melee ? .4 : .15), 1200);
        const aoe = battle.aoeTiles(currentMove, pendingTile.x, pendingTile.y);
        await withTimeout(renderer.animAttackFx(currentMove, { x: u.x, y: u.y }, pendingTile, aoe), 3000);
        const events = battle.resolveAttack(u, currentMove, pendingTile.x, pendingTile.y);
        await playEvents(events);
        acted = true;
        updateTurnOrder();
        setIdle();
      }

      /* --- Tap-Routing --- */
      renderer.onTap = (tile) => {
        if (!tile) return;
        if (mode === "busy") return;
        Sfx.tap();
        if (mode === "facing") {
          // Tipp auf ein Feld: dorthin schauen
          if (tile.x !== u.x || tile.y !== u.y) {
            battle.setFacingTowards(u, tile.x, tile.y);
            $("#facing-bar").querySelectorAll(".fb-btn[data-fx]").forEach((b) => {
              b.classList.toggle("active",
                u.facing.x === parseInt(b.dataset.fx, 10) &&
                u.facing.y === parseInt(b.dataset.fy, 10));
            });
          }
          return;
        }
        if (mode === "move" || mode === "move-confirm") {
          const ok = reach.tiles.some((t) => t.x === tile.x && t.y === tile.y);
          if (ok) previewMove(tile);
          return;
        }
        if (mode === "target" || mode === "aoe-confirm") {
          previewTarget(tile);
          return;
        }
        // Idle: Einheiten-Info
        const tu = battle.unitAt(tile.x, tile.y);
        if (tu) { showInfoModal(tu); }
      };

      $("#btn-confirm").onclick = () => {
        Sfx.select();
        if (mode === "move-confirm") execMove();
        else if (mode === "aoe-confirm") execAttack();
      };
      $("#btn-cancel").onclick = () => { Sfx.cancel(); setIdle(); };

      setIdle();
    });
  }

  /* ---------- Gegnerzug ---------- */
  async function enemyTurn(u) {
    await renderer.wait(350);
    const decision = aiDecide(battle, u);
    let moved = false, acted = false;
    if (decision.path && decision.path.length > 1) {
      Sfx.move();
      await withTimeout(renderer.animMove(u, decision.path), decision.path.length * 250 + 1500);
      const last = decision.path[decision.path.length - 1];
      u.x = last.x; u.y = last.y; u.rx = u.x; u.ry = u.y;
      moved = true;
      renderer.centerOnTile(u.x, u.y);
    }
    if (decision.action) {
      await renderer.wait(250);
      const mv = decision.action.move;
      const m = MOVES[mv];
      battle.setFacingTowards(u, decision.action.x, decision.action.y);
      renderer.centerOnTile(decision.action.x, decision.action.y);
      const melee = m.cat === "p" && m.rng <= 1;
      await withTimeout(renderer.animLunge(u, decision.action.x, decision.action.y, melee ? .4 : .15), 1200);
      const aoe = battle.aoeTiles(mv, decision.action.x, decision.action.y);
      await withTimeout(renderer.animAttackFx(mv, { x: u.x, y: u.y }, { x: decision.action.x, y: decision.action.y }, aoe), 3000);
      const events = battle.resolveAttack(u, mv, decision.action.x, decision.action.y);
      await playEvents(events);
      acted = true;
    }
    if (!moved && !acted) await renderer.wait(300);
    // Zugende: zum nächsten Spieler ausrichten (kein freier Rücken)
    const foes = battle.alive(0);
    if (u.alive && foes.length) {
      let nf = foes[0], bd = Infinity;
      for (const f of foes) {
        const d = Math.abs(f.x - u.x) + Math.abs(f.y - u.y);
        if (d < bd) { bd = d; nf = f; }
      }
      battle.setFacingTowards(u, nf.x, nf.y);
    }
    return { moved, acted };
  }

  /* ---------- Hauptschleife ---------- */
  async function run(def, partyEntries, enemyState = null) {
    battle = new Battle(def, partyEntries, enemyState);
    showScreen("#screen-battle");
    renderer.resize();          // Canvas war evtl. unsichtbar (Größe 0)
    renderer.setBattle(battle);
    clearMarks();
    hideActionBar();
    showUnitCard(null);
    updateTurnOrder();

    let fled = false;
    $("#btn-flee").onclick = () => {
      if (confirm("Schlacht wirklich aufgeben?")) {
        fled = true;
        if (abortPlayerTurn) abortPlayerTurn();
      }
    };
    $("#btn-sound").onclick = () => {
      const m = Sfx.toggle();
      $("#btn-sound").textContent = m ? "🔇" : "🔊";
    };
    $("#btn-info-close").onclick = () => $("#info-modal").classList.add("hidden");

    await banner(`${def.icon} ${def.name}`, 1100);
    await banner(def.intro, 1700);

    let result = 0;
    for (let guard = 0; guard < 1000; guard++) {
      if (fled) { result = 3; break; }
      const u = battle.nextTurn();
      if (!u) break;
      updateTurnOrder();
      renderer.centerOnTile(u.x, u.y);
      showUnitCard(u);
      Sfx.turn();
      await renderer.wait(280);

      const sot = battle.startOfTurn(u);
      if (sot.events.length) await playEvents(sot.events);

      result = battle.checkEnd();
      if (result) break;

      let moved = false, acted = false;
      if (u.alive && !sot.skip) {
        try {
          if (u.team === 0) {
            const r = await playerTurn(u);
            moved = r.moved; acted = r.acted;
          } else {
            const r = await enemyTurn(u);
            moved = r.moved; acted = r.acted;
          }
        } catch (e) {
          // Ein Fehler in einem Zug darf die Schlacht nie anhalten
          console.error("Zug-Fehler, Zug wird beendet:", e);
          hideActionBar();
          clearMarks();
        }
      }
      if (fled) { result = 3; break; }
      battle.endTurn(moved, acted);
      if (u.alive && u.guarding) {
        Sfx.chime();
        renderer.addPopup(u.x, u.y, "🛡 Blockt!", "#7dd3fc");
      }
      showUnitCard(null);
      result = battle.checkEnd();
      if (result) break;
    }

    hideActionBar();
    clearMarks();
    if (result === 1) { Sfx.win(); await banner("🏆 SIEG!", 1600); }
    else if (result === 2) { Sfx.lose(); await banner("💀 Der Trupp ist gefallen …", 1600); }
    renderer.onTap = null;
    return { result, battle }; // 1 Sieg, 2 Niederlage, 3 geflohen
  }

  return { init, run };
})();
