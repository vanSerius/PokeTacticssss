# ⚔ PokéTactics

Ein mobiles Taktik-Rollenspiel im Browser – **Final Fantasy Tactics trifft Pokémon**.
Komplett in Vanilla-HTML/CSS/JS, ohne Build-Schritt, optimiert für Smartphones und direkt über GitHub Pages spielbar.

## 🎮 Features

- **Isometrische Schlachtfelder** mit Höhenstufen – wer oben steht, schlägt härter
- **CT-Zugsystem** wie in Final Fantasy Tactics: Tempo bestimmt die Zugreihenfolge (Vorschau-Leiste inklusive)
- **Klassisches Typensystem**: Wasser löscht Feuer, Elektro schockt Flieger, Geister sind immun gegen normale Hiebe
- **Flanken- & Rückenangriffe** (+10 % / +25 % Schaden), Flächenattacken mit Friendly Fire
- **Status-Effekte**: Brand, Gift, Paralyse, Schlaf – plus Buffs & Debuffs
- **Kampagne mit 7 Schlachten** inkl. Bosskämpfen (Onix, Rivalen-Team, Mewtu als Finale)
- **Fortschrittssystem**: EP, Level-Ups, neue Attacken, **Entwicklungen** (Glumanda → Glutexo …) und Rekruten nach jedem Sieg
- **Smarte Touch-Steuerung**: Tippen mit Schadensvorschau vor jeder Aktion, Ziehen = Kamera, Pinch = Zoom
- **Offizielle Pokémon-Sprites** (Gen 5, via [PokeAPI/sprites](https://github.com/PokeAPI/sprites)) inkl. Rücken-Sprites je nach Blickrichtung – mit eingebauter Pixel-Art als Fallback
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
```

> Hinweis: Dies ist ein nicht-kommerzielles Fanprojekt. Pokémon und alle Sprites sind © Nintendo / Game Freak / The Pokémon Company.

Viel Spaß auf dem Schlachtfeld! 🏆
