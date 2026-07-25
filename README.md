# Zombie Defense

Kooperatives 2D-Top-down-Spiel für 1–4 Freunde. Ein Spieler erstellt eine
Lobby, teilt den Link und kämpft sich durch vier Karten mit festen Wellen,
Mini-Bossen und einem Endboss pro Karte.

Der aktuelle Stand ist ein spielbarer Online-Prototyp. Er braucht keine
Accounts und keine Datenbank.

**Direkt spielen:** [zombie-defense-stexeflex.onrender.com](https://zombie-defense-stexeflex.onrender.com/)

Der kostenlose Server kann nach längerer Inaktivität schlafen. Beim ersten
Aufruf kann das Laden deshalb kurz dauern.

## Enthalten

- Link-Lobbys mit fünfstelligem Code, 1–4 Spieler über Colyseus/WebSockets
- autoritative Bewegung, Zombie-KI, Treffer und Wellen auf dem Server
- vier Karten mit eigener Optik, eigenen Hindernissen und steigender Härte
- jede Karte endet mit einem Endboss und schaltet die nächste Karte frei
- feste Mini-Boss-Wellen mit dem „Zerstörer“ (Sturmangriff und Schockwelle)
- sechs Zombiearten: Läufer, Renner, Koloss, Sprengling, Zerstörer, Fleischkönig
- zehn Waffen von der Pistole bis zur Laserkanone
- vier Barrikaden (Holz, Stachel, Stein, Stahl) und drei Türme (MG,
  Scharfschütze, Rakete)
- Munition, Erste Hilfe, Reparieren und Verkaufen im Bau-Shop
- automatische Wiederbelebung gefallener Spieler durch kurzes Danebenstehen
- Sprites, Lauf- und Angriffsanimationen, Blut-, Feuer- und Explosionseffekte
- prozedural erzeugte Soundeffekte und Musik (Bauphase, Kampf, Boss)
- permanentes Gold und zwölf Upgrades über `localStorage`

### Karten

| Karte | Wellen | Härte | Gold für den Endboss |
|---|---|---|---|
| Vorposten 07 | 10 | ×1 | 150 |
| Industriehafen | 12 | ×1,45 | 320 |
| Militärbasis Nord | 14 | ×2 | 600 |
| Krater-Quarantäne | 16 | ×2,8 | 1000 |

### Waffen

| Waffe | Preis | Besonderheit |
|---|---|---|
| Pistole | 0 | Startwaffe |
| Maschinenpistole | 450 | sehr hohe Feuerrate |
| Sturmgewehr | 900 | Allrounder, durchschlägt einen Gegner |
| Schrotflinte | 1100 | acht Schrotkugeln auf kurze Distanz |
| Scharfschützengewehr | 1700 | 215 Schaden, durchschlägt vier Gegner |
| Maschinengewehr | 2300 | 100 Schuss Dauerfeuer |
| Flammenwerfer | 2700 | kurze Reichweite, setzt Horden in Brand |
| Raketenwerfer | 3300 | Sprengschaden im Umkreis |
| Blitzstreuer | 3900 | Blitz springt auf vier weitere Gegner |
| Laserkanone | 4800 | Dauerstrahl, durchschlägt sechs Gegner |

## Voraussetzungen

- Node.js 24.15 oder neuer
- npm

## Lokal starten

Beim ersten Mal:

```text
npm install
```

Danach starten Browser-Spiel und Mehrspieler-Server gemeinsam:

```text
npm run dev
```

Anschließend im Browser öffnen:

```text
http://localhost:4200
```

Der Spielserver läuft auf:

```text
http://localhost:2567
```

Für Freunde im selben Heimnetz:

```text
npm run dev:lan
```

Dann den Link mit der lokalen IP des Host-PCs statt `localhost` teilen. Die
Windows-Firewall muss die verwendeten Ports gegebenenfalls freigeben.

## Steuerung

| Taste | Aktion |
|---|---|
| `WASD` oder Pfeiltasten | Bewegen |
| Maus | Zielen |
| Linke Maustaste | Schießen |
| `R` | Nachladen; beim Platzieren Barrikade drehen |
| `G` | Granate zum Mauszeiger werfen |
| Rechtsklick | ausgewählte Verteidigung abwählen |

In der Bauphase wird im Seitenmenü zwischen Waffen, Barrikaden und Türmen
gewechselt, ein Bauteil ausgewählt und danach auf dem Spielfeld platziert.
Spieler können sich dabei weiterhin bewegen. Zum Wiederbeleben genügt es, kurz
neben einem gefallenen Mitspieler stehen zu bleiben. Sound und Musik lassen
sich oben rechts abschalten.

## Projektstruktur

```text
src/                 Angular-Oberfläche und Phaser-Spiel
src/app/game/        Szene, Sprites und prozedurale Texturen
src/app/core/        Verbindung, Fortschritt und Audio
shared/              Karten, Waffen, Gegner und Wellenpläne
server/src/          autoritativer Colyseus-Server
scripts/             lokale Hilfsskripte
```

Der Browser sendet nur Eingaben und Kauf-/Bauabsichten. Der Server entscheidet
über Positionen, Schüsse, Treffer, Explosionen, Zombie-Leben, Spielerleben,
Wiederbelebung, Geld, Wellen, Barrikaden und Türme. Effekte wie Blut,
Explosionen und Blitze schickt der Server als kompakte Ereignisliste mit dem
Snapshot mit.

Alle Bilder entstehen zur Laufzeit als Canvas-Texturen, alle Klänge über die
Web-Audio-API. Das Spiel lädt deshalb keine externen Assets.

## Prüfen und bauen

```text
npm test -- --watch=false
npm run sim
npm run build:all
```

`npm run sim` startet einen Rauchtest ohne Browser: Ein Bot spielt jede Karte
bis zum Endboss durch und prüft Waffen, Verteidigungen, Bosse und ob jede
Welle wirklich endet.

Der fertige Browser-Build liegt danach unter
`dist/zombie-defense/browser`. Der Server-Build liegt unter `server/build`.

## Online-Deployment

Die Datei `render.yaml` beschreibt einen kostenlosen Render-Webdienst. Der
Node.js-Prozess liefert sowohl den Angular-Build als auch den
Colyseus-WebSocket-Server über dieselbe öffentliche Adresse aus.

## Später sinnvoll

- zweiter Waffenslot und Waffenwechsel
- bessere Wegfindung um große Verteidigungsanlagen
- eigene Zombiearten pro Karte
- optionale Accounts und Datenbank für manipulationssicheren Fortschritt
