/* ============================================================
   PokéTactics – Kampflogik
   CT-Zugsystem, Wegfindung, Schaden, Status, KI
   ============================================================ */
"use strict";

/* Einheit aus Roster-Eintrag bzw. Gegner-Definition erzeugen.
   entry (optional): Run-Eintrag mit individuellen Attacken & Stat-Boni */
function makeUnit(spId, lvl, team, x, y, boss = false, entry = null) {
  const sp = SPECIES[spId];
  const bonus = (entry && entry.bonus) || { hp: 0, atk: 0, def: 0, spd: 0, mov: 0 };
  const st = (i) => Math.round(sp.base[i] + sp.grow[i] * (lvl - 1));
  const moves = (entry && entry.moves && entry.moves.length)
    ? entry.moves.slice(0, 4)
    : sp.learn.filter(([l]) => l <= lvl).map(([, id]) => id).slice(-4);
  const maxHp = st(0) + bonus.hp;
  // KP bleibt innerhalb eines Runs erhalten
  const startHp = (entry && entry.hp !== undefined)
    ? Math.max(1, Math.min(entry.hp, maxHp)) : maxHp;
  return {
    species: spId, name: sp.name, role: sp.role, types: sp.types,
    lvl, team, boss: boss || !!sp.boss,
    maxHp, hp: startHp,
    atk: st(1) + bonus.atk, def: st(2) + bonus.def, spd: sp.base[3] + bonus.spd,
    mov: sp.mov + (bonus.mov || 0), jmp: sp.jmp, fly: !!sp.fly, swim: !!sp.swim,
    x, y, rx: x, ry: y, hop: 0, facing: { x: 0, y: 1 },
    ct: Math.floor(Math.random() * 25),
    moves,                                    // Attacken-IDs
    mana: MANA_START, manaMax: MANA_MAX,
    statuses: [], buffs: [], guarding: false,
    alive: true, anim: null, alpha: 1, flash: false,
  };
}

class Battle {
  /* enemyState: KP-Reste aus vorherigem Versuch (Index = Gegner-Index, 0 = tot)
     relics: passive Run-Items (wirken nur für Team 0) */
  constructor(def, partyEntries, enemyState = null, relics = [], mods = {}) {
    this.def = def;
    this.relics = relics || [];
    this.lvlBoost = mods.lvlBoost || 0;   // Elite-/Endlos-Verstärkung
    this.h = def.heights.length;
    this.w = def.heights[0].length;
    this.heights = def.heights.map((r) => [...r].map(Number));
    this.terrain = def.terrain.map((r) => [...r]);
    this.units = [];
    partyEntries.forEach((e, i) => {
      const [x, y] = def.spawns[i];
      const u = makeUnit(e.sp, e.lvl, 0, x, y, false, e);
      u.rosterRef = e;
      // Relikt-Boni
      if (this.relics.includes("manakristall")) u.mana = Math.min(u.manaMax, u.mana + 1);
      if (this.relics.includes("sprungfedern")) u.jmp += 1;
      if (this.relics.includes("tempoband")) u.spd += 1;
      this.units.push(u);
    });
    def.enemies.forEach((e, i) => {
      const hpLeft = enemyState ? enemyState[i] : undefined;
      if (hpLeft !== undefined && hpLeft !== null && hpLeft <= 0) return; // bereits besiegt
      const u = makeUnit(e.sp, e.lvl + this.lvlBoost, 1, e.x, e.y, e.boss);
      if (hpLeft !== undefined && hpLeft !== null) u.hp = Math.min(u.hp, hpLeft);
      u.enemyIdx = i;
      this.units.push(u);
    });
    this.active = null;
    this.round = 0;
    // Anfangs-Blickrichtung: zum nächsten Feind
    for (const u of this.units) {
      const foes = this.alive(u.team === 0 ? 1 : 0);
      if (!foes.length) continue;
      let nf = foes[0], bd = Infinity;
      for (const f of foes) {
        const d = Math.abs(f.x - u.x) + Math.abs(f.y - u.y);
        if (d < bd) { bd = d; nf = f; }
      }
      this.setFacingTowards(u, nf.x, nf.y);
    }
  }

  heightAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.heights[y][x];
  }
  terrainAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return "g";
    return this.terrain[y][x];
  }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  unitAt(x, y) {
    return this.units.find((u) => u.alive && u.x === x && u.y === y) || null;
  }
  unitsRenderAt(x, y) {
    return this.units.filter(
      (u) => (u.alive || u.alpha > 0) && Math.round(u.rx) === x && Math.round(u.ry) === y
    );
  }
  alive(team) { return this.units.filter((u) => u.alive && u.team === team); }

  /* ---------- Effektive Werte ---------- */
  buffMult(u, stat) {
    let m = 1;
    for (const b of u.buffs) if (b.stat === stat) m *= b.mult;
    return m;
  }
  effAtk(u) {
    let a = u.atk * this.buffMult(u, "atk");
    if (u.statuses.some((s) => s.id === "brn")) a *= 0.7;
    return a;
  }
  effDef(u) { return u.def * this.buffMult(u, "def"); }
  effSpd(u) {
    let s = u.spd * this.buffMult(u, "spd");
    if (u.statuses.some((st) => st.id === "par")) s *= 0.5;
    return Math.max(1, s);
  }

  /* ---------- Zugreihenfolge (CT) ---------- */
  nextTurn() {
    for (let guard = 0; guard < 4000; guard++) {
      const ready = this.units
        .filter((u) => u.alive && u.ct >= 100)
        .sort((a, b) => b.ct - a.ct || b.spd - a.spd);
      if (ready.length) {
        this.active = ready[0];
        return this.active;
      }
      for (const u of this.units) if (u.alive) u.ct += this.effSpd(u);
    }
    return null;
  }

  endTurn(moved, acted) {
    const u = this.active;
    if (u) {
      let cost = 100;
      if (!moved) cost -= 12;
      if (!acted) cost -= 12;
      u.guarding = !acted;   // ohne Angriff: Blocken (-25 % Schaden)
      u.ct -= cost;
      // Buffs laufen am eigenen Zugende ab
      for (const b of u.buffs) b.dur--;
      u.buffs = u.buffs.filter((b) => b.dur > 0);
    }
    this.active = null;
  }

  forecast(n = 8) {
    const sim = this.units
      .filter((u) => u.alive)
      .map((u) => ({ u, ct: u.ct, spd: this.effSpd(u) }));
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 3000) {
      const ready = sim.filter((s) => s.ct >= 100).sort((a, b) => b.ct - a.ct || b.spd - a.spd);
      if (ready.length) {
        const s = ready[0];
        out.push(s.u);
        s.ct -= 100;
      } else {
        for (const s of sim) s.ct += s.spd;
      }
    }
    return out;
  }

  /* ---------- Bewegung ---------- */
  canStand(u, x, y) {
    if (!this.inBounds(x, y)) return false;
    const ter = TERRAIN[this.terrainAt(x, y)];
    if (ter.block) return false; // Bäume/Felsen/Kristalle: niemand steht dort
    if (ter.water && !u.swim && !u.fly) return false;
    return true;
  }

  reachable(u) {
    const start = { x: u.x, y: u.y };
    const seen = new Map();
    seen.set(u.x + "," + u.y, { x: u.x, y: u.y, d: 0, prev: null });
    const queue = [seen.get(start.x + "," + start.y)];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.d >= u.mov) continue;
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const key = nx + "," + ny;
        if (seen.has(key)) continue;
        if (!this.inBounds(nx, ny)) continue;
        if (!u.fly) {
          const dh = Math.abs(this.heightAt(nx, ny) - this.heightAt(cur.x, cur.y));
          if (dh > u.jmp) continue;
        }
        const ter = TERRAIN[this.terrainAt(nx, ny)];
        if (ter.block && !u.fly) continue;              // nur Flieger überqueren Hindernisse
        if (ter.water && !u.swim && !u.fly) continue;
        const occ = this.unitAt(nx, ny);
        if (occ && occ.team !== u.team) continue; // Gegner blockieren
        const node = { x: nx, y: ny, d: cur.d + 1, prev: cur };
        seen.set(key, node);
        queue.push(node);
      }
    }
    // Stehen darf man nur auf freien, betretbaren Feldern
    const tiles = [];
    for (const node of seen.values()) {
      if (node.d === 0) continue;
      if (!this.canStand(u, node.x, node.y)) continue;
      if (this.unitAt(node.x, node.y)) continue;
      tiles.push(node);
    }
    return { tiles, nodes: seen };
  }

  pathTo(nodes, tx, ty) {
    let cur = nodes.get(tx + "," + ty);
    if (!cur) return null;
    const path = [];
    while (cur) { path.unshift({ x: cur.x, y: cur.y }); cur = cur.prev; }
    return path;
  }

  /* ---------- Attacken-Reichweite ---------- */
  movesOf(u) {
    return ["hieb", ...u.moves];
  }
  canAfford(u, moveId) {
    return u.mana >= manaCost(MOVES[moveId]);
  }

  tilesInRange(u, moveId) {
    const m = MOVES[moveId];
    const out = [];
    if (m.rng === 0) { out.push({ x: u.x, y: u.y }); return out; }
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const d = Math.abs(x - u.x) + Math.abs(y - u.y);
        if (d >= 1 && d <= m.rng) out.push({ x, y });
      }
    return out;
  }

  aoeTiles(moveId, cx, cy) {
    const m = MOVES[moveId];
    const out = [{ x: cx, y: cy }];
    if (m.aoe >= 1) {
      const r = m.aoe;
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const d = Math.abs(x - cx) + Math.abs(y - cy);
          if (d >= 1 && d <= r) out.push({ x, y });
        }
    }
    return out.filter((t) => this.inBounds(t.x, t.y));
  }

  /* Betroffene Einheiten einer Attacke auf Zielfeld */
  affectedUnits(attacker, moveId, cx, cy) {
    const m = MOVES[moveId];
    const tiles = this.aoeTiles(moveId, cx, cy);
    const units = [];
    for (const t of tiles) {
      const u = this.unitAt(t.x, t.y);
      if (!u) continue;
      if (m.rng === 0 && m.aoe > 0 && u === attacker) continue; // Umkreis trifft Anwender nicht
      units.push(u);
    }
    if (m.target === "self") return units.filter((u) => u === attacker);
    if (m.target === "ally") return units.filter((u) => u.team === attacker.team);
    return units; // foe: trifft alle im Bereich (auch Verbündete!)
  }

  /* Hat die Attacke auf diesem Zielfeld ein sinnvolles Hauptziel? */
  validTarget(attacker, moveId, cx, cy) {
    const m = MOVES[moveId];
    const aff = this.affectedUnits(attacker, moveId, cx, cy);
    if (m.target === "self") return aff.includes(attacker);
    if (m.target === "ally") return aff.some((u) => u.team === attacker.team);
    return aff.some((u) => u.team !== attacker.team);
  }

  /* Gefahrenzone eines Gegners: alle Felder, die er erreichen + angreifen kann */
  dangerZone(u) {
    const marks = new Set();
    const { tiles } = this.reachable(u);
    const stands = [{ x: u.x, y: u.y }, ...tiles];
    let maxR = 1;
    for (const id of this.movesOf(u)) {
      const m = MOVES[id];
      if (m.target === "foe" && m.rng > maxR) maxR = m.rng;
    }
    for (const s of stands) {
      for (let dy = -maxR; dy <= maxR; dy++) {
        const rest = maxR - Math.abs(dy);
        for (let dx = -rest; dx <= rest; dx++) {
          const x = s.x + dx, y = s.y + dy;
          if (this.inBounds(x, y)) marks.add(x + "," + y);
        }
      }
    }
    return marks;
  }

  /* ---------- Ausrichtung / Flanken ---------- */
  facingOf(u) { return u.facing || { x: 1, y: 0 }; }
  setFacingTowards(u, tx, ty) {
    const dx = tx - u.x, dy = ty - u.y;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) >= Math.abs(dy)) u.facing = { x: Math.sign(dx) || 1, y: 0 };
    else u.facing = { x: 0, y: Math.sign(dy) };
  }
  /* 'back' | 'side' | 'front' aus Sicht des Verteidigers */
  attackDirection(attacker, defender) {
    const f = this.facingOf(defender);
    const dx = attacker.x - defender.x, dy = attacker.y - defender.y;
    const dot = f.x * Math.sign(dx) + f.y * Math.sign(dy);
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const mainAxis = adx >= ady ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    const d2 = f.x * mainAxis.x + f.y * mainAxis.y;
    if (d2 < 0) return "back";
    if (d2 === 0 || dot === 0) return "side";
    return "front";
  }

  /* ---------- Schaden ---------- */
  /* Vorhersage ohne Zufall – für die Schadensvorschau */
  predict(attacker, moveId, defender) {
    const m = MOVES[moveId];
    if (m.cat === "s") {
      return { dmg: 0, mult: 1, hit: m.acc >= 999 ? 100 : Math.min(100, m.acc), dir: "front" };
    }
    const tm = typeMult(m.type, defender.types);
    const dir = this.attackDirection(attacker, defender);
    const dirMult = dir === "back" ? 1.25 : dir === "side" ? 1.1 : 1;
    const dh = this.heightAt(attacker.x, attacker.y) - this.heightAt(defender.x, defender.y);
    const hMult = dh > 0 ? 1.15 : dh < 0 ? 0.9 : 1;
    const base = m.pow * (this.effAtk(attacker) / (this.effDef(defender) + 30));
    const guardBase = (defender.team === 0 && this.relics.includes("schutzamulett")) ? 0.6 : 0.75;
    const guardMult = defender.guarding ? guardBase : 1;
    const dmg = Math.max(1, Math.round(base * tm * dirMult * hMult * guardMult));
    let hit = m.acc >= 999 ? 100 : m.acc - Math.round(this.effSpd(defender) * 1.2);
    if (dir === "back") hit += 15;
    if (dir === "side") hit += 7;
    hit = Math.max(25, Math.min(100, hit));
    if (tm === 0) return { dmg: 0, mult: 0, hit: 0, dir };
    return { dmg, mult: tm, hit, dir };
  }

  /* Attacke ausführen -> Liste von Ereignissen für die Animation */
  resolveAttack(attacker, moveId, cx, cy) {
    const m = MOVES[moveId];
    attacker.mana = Math.max(0, attacker.mana - manaCost(m));
    this.setFacingTowards(attacker, cx, cy);
    const events = [];
    const targets = this.affectedUnits(attacker, moveId, cx, cy);

    for (const t of targets) {
      // Heilung / Buffs
      if (m.heal) {
        const amount = m.heal >= 1 ? t.maxHp : Math.round(t.maxHp * m.heal);
        const healed = Math.min(t.maxHp - t.hp, amount);
        t.hp += healed;
        events.push({ type: "heal", unit: t, val: healed });
        if (m.fx && m.fx.self && m.fx.st) {
          this._applyStatus(t, m.fx.st, events);
        }
        continue;
      }
      if (m.cat === "s") {
        // Status-Attacke: Treffer würfeln
        const p = this.predict(attacker, moveId, t);
        const sameTeam = t.team === attacker.team;
        const hitRoll = sameTeam || Math.random() * 100 < p.hit;
        if (!hitRoll) { events.push({ type: "miss", unit: t }); continue; }
        if (m.fx && m.fx.st) this._applyStatus(t, m.fx.st, events);
        if (m.buff) {
          t.buffs.push({ ...m.buff });
          events.push({
            type: "buff", unit: t,
            up: m.buff.mult > 1,
            label: (m.buff.stat === "atk" ? "ANG" : m.buff.stat === "def" ? "VER" : "TEMPO") +
                   (m.buff.mult > 1 ? " ▲" : " ▼"),
          });
        }
        continue;
      }

      // Schaden
      const p = this.predict(attacker, moveId, t);
      if (p.mult === 0) { events.push({ type: "immune", unit: t }); continue; }
      if (Math.random() * 100 >= p.hit) { events.push({ type: "miss", unit: t }); continue; }
      let critCh = (m.crit || 6);
      if (attacker.team === 0 && this.relics.includes("klauen")) critCh += 10;
      const crit = Math.random() * 100 < critCh;
      let dmg = Math.round(p.dmg * (0.9 + Math.random() * 0.2) * (crit ? 1.5 : 1));
      dmg = Math.max(1, dmg);
      t.hp = Math.max(0, t.hp - dmg);
      // Schlafende wachen bei Schaden auf
      t.statuses = t.statuses.filter((s) => s.id !== "slp");
      events.push({ type: "dmg", unit: t, val: dmg, crit, mult: p.mult, dir: p.dir, guarded: t.guarding });
      if (m.drain) {
        const healed = Math.min(attacker.maxHp - attacker.hp, Math.round(dmg * m.drain));
        if (healed > 0) {
          attacker.hp += healed;
          events.push({ type: "heal", unit: attacker, val: healed });
        }
      }
      if (t.hp > 0 && m.fx && m.fx.st && Math.random() * 100 < m.fx.ch) {
        this._applyStatus(t, m.fx.st, events);
      }
      if (m.buff && t.hp > 0) {
        t.buffs.push({ ...m.buff });
        events.push({ type: "buff", unit: t, up: m.buff.mult > 1, label: "TEMPO ▼" });
      }
      if (t.hp <= 0) { t.alive = false; events.push({ type: "ko", unit: t }); }
      // Dornenpanzer: Nahkampf-Angreifer gegen das Spielerteam erleiden Schaden
      if (m.rng <= 1 && m.cat === "p" && attacker.team === 1 && t.team === 0 &&
          this.relics.includes("dornenpanzer") && attacker.alive) {
        attacker.hp = Math.max(0, attacker.hp - 3);
        events.push({ type: "thorns", unit: attacker, val: 3 });
        if (attacker.hp <= 0) { attacker.alive = false; events.push({ type: "ko", unit: attacker }); }
      }
    }
    return events;
  }

  _applyStatus(t, stId, events) {
    if (t.statuses.some((s) => s.id === stId)) return;
    // Typ-Immunitäten
    if (stId === "brn" && t.types.includes("fire")) return;
    if (stId === "psn" && (t.types.includes("poison") || t.types.includes("ghost"))) return;
    if (stId === "par" && t.types.includes("electric")) return;
    t.statuses.push({ id: stId, dur: stId === "slp" ? 2 : 99 });
    events.push({ type: "status", unit: t, st: stId });
  }

  /* Zu Zugbeginn: Gift/Brand-Schaden, Schlaf/Paralyse prüfen.
     Rückgabe: { events, skip } */
  startOfTurn(u) {
    const events = [];
    let skip = false;
    u.mana = Math.min(u.manaMax, u.mana + MANA_REGEN);
    u.guarding = false;
    for (const s of [...u.statuses]) {
      if (s.id === "psn" || s.id === "brn") {
        const dmg = Math.max(1, Math.round(u.maxHp * 0.1));
        u.hp = Math.max(0, u.hp - dmg);
        events.push({ type: "dot", unit: u, val: dmg, st: s.id });
        if (u.hp <= 0) {
          u.alive = false;
          events.push({ type: "ko", unit: u });
          return { events, skip: true };
        }
      }
      if (s.id === "slp") {
        s.dur--;
        if (s.dur <= 0) {
          u.statuses = u.statuses.filter((x) => x !== s);
          events.push({ type: "wake", unit: u });
        } else {
          events.push({ type: "asleep", unit: u });
          skip = true;
        }
      }
      if (s.id === "par" && !skip && Math.random() < 0.2) {
        events.push({ type: "paralyzed", unit: u });
        skip = true;
      }
    }
    return { events, skip };
  }

  /* 0 = läuft, 1 = Sieg, 2 = Niederlage */
  checkEnd() {
    if (this.alive(1).length === 0) return 1;
    if (this.alive(0).length === 0) return 2;
    return 0;
  }
}

/* ============================================================
   KI für Gegner-Züge
   Liefert: { path: [..] | null, action: {move, x, y} | null }
   ============================================================ */
function aiDecide(battle, u) {
  const foes = battle.alive(u.team === 0 ? 1 : 0);
  if (!foes.length) return { path: null, action: null };

  const { tiles, nodes } = battle.reachable(u);
  const standOptions = [{ x: u.x, y: u.y, d: 0 }, ...tiles];
  const moves = battle.movesOf(u).filter((id) => battle.canAfford(u, id));

  let best = null;

  const origX = u.x, origY = u.y;
  for (const pos of standOptions) {
    u.x = pos.x; u.y = pos.y;
    for (const mv of moves) {
      const m = MOVES[mv];
      // Selbstheilung, wenn nötig
      if (m.target === "self" && m.heal) {
        if (u.hp < u.maxHp * 0.4) {
          const score = 55 + (1 - u.hp / u.maxHp) * 50 - pos.d;
          if (!best || score > best.score)
            best = { score, pos, action: { move: mv, x: pos.x, y: pos.y } };
        }
        continue;
      }
      if (m.target === "self" && m.buff) {
        // Buff nur, wenn kein Gegner in Reichweite ist
        continue;
      }
      const range = battle.tilesInRange(u, mv);
      for (const rt of range) {
        if (!battle.validTarget(u, mv, rt.x, rt.y)) continue;
        const affected = battle.affectedUnits(u, mv, rt.x, rt.y);
        let score = 0;
        for (const t of affected) {
          if (m.cat === "s") {
            if (t.team !== u.team && m.fx && !t.statuses.length) score += 30;
            if (t.team !== u.team && m.buff && m.buff.mult < 1) score += 18;
            continue;
          }
          const p = battle.predict(u, mv, t);
          const expected = p.dmg * p.hit / 100;
          if (t.team !== u.team) {
            score += Math.min(expected, t.hp);
            if (expected >= t.hp) score += 35;          // K.-o.-Bonus
            if (p.mult >= 2) score += 8;
            if (t.boss === false && t.hp < t.maxHp * .35) score += 6;
          } else {
            score -= Math.min(expected, t.hp) * 1.4;    // eigenes Team schonen
          }
        }
        score -= pos.d * 0.8;
        if (score > 4 && (!best || score > best.score))
          best = { score, pos, action: { move: mv, x: rt.x, y: rt.y } };
      }
    }
  }
  u.x = origX; u.y = origY;

  if (best) {
    const path = best.pos.d > 0 ? battle.pathTo(nodes, best.pos.x, best.pos.y) : null;
    return { path, action: best.action };
  }

  // Kein Angriff möglich: auf nächsten Gegner zubewegen
  let target = null, bestD = Infinity;
  for (const f of foes) {
    const d = Math.abs(f.x - u.x) + Math.abs(f.y - u.y);
    if (d < bestD) { bestD = d; target = f; }
  }
  let bestTile = null, bestScore = Infinity;
  for (const t of tiles) {
    const d = Math.abs(target.x - t.x) + Math.abs(target.y - t.y);
    if (d < bestScore) { bestScore = d; bestTile = t; }
  }
  if (bestTile && bestScore < bestD) {
    return { path: battle.pathTo(nodes, bestTile.x, bestTile.y), action: null };
  }
  return { path: null, action: null };
}
