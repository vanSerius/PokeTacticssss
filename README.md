# ⚔ PokéTactics

Ein mobiles Taktik-Rollenspiel im Browser – **Final Fantasy Tactics trifft Pokémon**.
Komplett in Vanilla-HTML/CSS/JS, ohne Build-Schritt, optimiert für Smartphones und direkt über GitHub Pages spielbar.

## 🎮 Features

- **Isometrische Schlachtfelder** mit Höhenstufen – wer oben steht, schlägt härter
- **CT-Zugsystem** wie in Final Fantasy Tactics: Tempo bestimmt die Zugreihenfolge (Vorschau-Leiste inklusive)
- **Klassisches Typensystem**: Wasser löscht Feuer, Elektro schockt Flieger, Geister sind immun gegen normale Hiebe
- **Mana-System**: Attacken kosten 2–6 Mana (Hieb gratis), +2 Regeneration pro Runde – starke Attacken wollen getimt sein
- **Lebendige Karten**: Tag/Nacht-Stimmungen, Regen & Gewitter, wiegende Bäume, Blätter, Glühwisps, Schmetterlinge, Lauf-Staub
- **Musik & Sound**: eigener Chiptune-Sequencer (3 Themes: Menü, Kampf, Spuk), echte CC0-Soundeffekte (Kenney) und Sieg-/Boss-Jingles (Beatscribe)
- **Einstellungen**: Musik-/Effekt-Lautstärke, Vibration, schnelle Animationen, Spielstand-Reset
- **Flanken- & Rückenangriffe** (+10 % / +25 % Schaden), Flächenattacken mit Friendly Fire
- **Status-Effekte**: Brand, Gift, Paralyse, Schlaf – plus Buffs & Debuffs
- **Roguelike-Runs**: Starter-Wahl (1 aus 3), nach jedem Sieg Rekruten-Wahl (1 aus 2 oder ablehnen für EP), bei jedem Level-Up 1 aus 3 Verbesserungs-Karten (neue Attacke, +KP/ANG/VER/Tempo/Bewegung)
- **Permadeath & Rückschläge**: Wer im Kampf fällt, ist tot (Pokécenter/Beleber können wiederbeleben). KP bleiben zwischen Kämpfen erhalten. Wird der Trupp besiegt, tritt der nächste gegen die **verwundeten Gegner** an – der Run endet erst, wenn niemand mehr lebt
- **Zufallsbegegnungen** alle 2–3 Etappen: Pokécenter (heilen oder wiederbeleben), Wanderhändler mit Münz-Shop (Tränke, Beleber, Protein, Sonderbonbon …), Rast am Lagerfeuer
- **7 Etappen pro Run** inkl. Bosskämpfen (Onix, Rivalen-Team, Mewtu als Finale), **Entwicklungen** (Glumanda → Glutexo …) bleiben erhalten
- **Smarte Touch-Steuerung**: Tippen mit Schadensvorschau vor jeder Aktion, Ziehen = Kamera, Pinch = Zoom
- **Offizielle Pokémon-Sprites** (Gen 5, via [PokeAPI/sprites](https://github.com/PokeAPI/sprites)) inkl. Rücken-Sprites je nach Blickrichtung – mit eingebauter Pixel-Art als Fallback
- **Gelände aus Kenneys „Isometric Landscape"-Pack** ([kenney.nl](https://kenney.nl), CC0) – inkl. eigens getönter Varianten für Spuk-Karten
- **Animierte Attacken-Effekte** aus Foozles „[Pixel Magic Effects](https://foozlecc.itch.io/pixel-magic-sprite-effects)" (CC0): Feuerbälle, Wassergeysir, Erdstacheln, Portale, Tornados … kombiniert mit additivem Glow für Strahlen & Blitze
- **Soundeffekte (WebAudio) und Vibration** – ohne Audio-Dateien
- **Auto-Save** im Browser (localStorage)

## 🚀 Spielen

Über GitHub Pages (Branch `main` veröffentlichen):
**Settings → Pages → Source: Deploy from a branch → Branch: `main` / root**

Lokal genügt ein beliebiger statischer Server:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## 🕹 Steuerung

| Geste | Aktion |
|---|---|
| Tippen auf Feld/Einheit | Auswählen / Vorschau / Info |
| Zweites Tippen bzw. „Bestätigen" | Aktion ausführen |
| Ziehen mit einem Finger | Kamera schwenken |
| Zwei Finger (Pinch) | Zoomen |

## 🗂 Projektstruktur

```
index.html        – Alle Screens (Titel, Karte, Trupp, Kampf, Ergebnis)
css/style.css     – Mobile-first UI
js/data.js        – Typen, Attacken, Spezies, Pixel-Sprites, Schlachten
js/sprites.js     – Sprite-Rendering & Umfärbung für Entwicklungen
js/audio.js       – Soundeffekte (WebAudio, ohne Dateien)
js/render.js      – Isometrischer Renderer, Kamera, Touch, Animationen
js/battle.js      – Kampflogik: CT-System, Wegfindung, Schaden, KI
js/ui.js          – Kampf-UI & Ablaufsteuerung
js/main.js        – Kampagne, Speicherstand, Bildschirm-Flows
```

```
assets/sprites/    – Gen-5-Sprites aus dem PokeAPI/sprites-Repository
assets/tiles/      – Geländeblöcke aus Kenneys "Isometric Landscape" (CC0)
assets/fx/         – Effekt-Spritesheets aus Foozles "Pixel Magic Effects" (CC0)
```

> Hinweis: Dies ist ein nicht-kommerzielles Fanprojekt. Pokémon und alle Sprites sind © Nintendo / Game Freak / The Pokémon Company. Geländetiles von [Kenney](https://kenney.nl) (CC0), Effekt-Animationen von [Foozle](https://foozlecc.itch.io) (CC0).

Viel Spaß auf dem Schlachtfeld! 🏆
