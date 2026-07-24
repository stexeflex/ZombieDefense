# Zombie Defense

Kooperatives 2D-Top-down-Spiel für 1–4 Freunde. Ein Spieler erstellt eine
Lobby, teilt den Link und startet einen Run aus zehn fest definierten
Zombie-Wellen.

Der aktuelle Stand ist ein spielbarer Online-Prototyp. Er braucht keine
Accounts und keine Datenbank.

**Direkt spielen:** [zombie-defense-stexeflex.onrender.com](https://zombie-defense-stexeflex.onrender.com/)

Der kostenlose Server kann nach längerer Inaktivität schlafen. Beim ersten
Aufruf kann das Laden deshalb kurz dauern.

## Enthalten

- Link-Lobbys mit fünfstelligem Code
- 1–4 Spieler über Colyseus/WebSockets
- autoritative Bewegung, Zombie-KI, Treffer und Wellen auf dem Server
- automatische Wiederbelebung gefallener Spieler durch kurzes Danebenstehen
- große Karte mit Kamera, die dem eigenen Spieler folgt
- zehn feste Wellen mit normalen, schnellen und großen Zombies
- Pistole, Sturmgewehr und Schrotflinte
- drei wiederaufladbare Granaten
- Run-Geld, Munition und Shop zwischen den Wellen
- platzierbare Barrikade und MG-Turm
- Reparieren und Verkaufen vorhandener Verteidigungen
- gemeinsame Wellenbelohnung und 180-Sekunden-Bauphase
- vorzeitiger Wellenstart, sobald alle Spieler bereit sind
- permanentes Gold und zehn kleine Upgrades über `localStorage`

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

In der Bauphase wird eine Barrikade oder ein Turm im Seitenmenü ausgewählt und
danach auf dem Spielfeld platziert. Spieler können sich dabei weiterhin
bewegen. Zum Wiederbeleben genügt es, kurz neben einem gefallenen Mitspieler
stehen zu bleiben.

## Projektstruktur

```text
src/                 Angular-Oberfläche und Phaser-Spiel
shared/              gemeinsame Spieltypen, Waffen- und Wellenwerte
server/src/          autoritativer Colyseus-Server
scripts/             lokale Hilfsskripte
```

Der Browser sendet nur Eingaben und Kauf-/Bauabsichten. Der Server entscheidet
über Positionen, Schüsse, Treffer, Zombie-Leben, Spielerleben, Wiederbelebung,
Geld, Wellen, Barrikaden und Türme. Auch Namen, Positionen, Leben, Ausrüstung
und Bereitschaft der anderen Spieler werden an alle Clients synchronisiert.

## Prüfen und bauen

```text
npm test -- --watch=false
npm run build:all
```

Der fertige Browser-Build liegt danach unter
`dist/zombie-defense/browser`. Der Server-Build liegt unter `server/build`.

## Online-Deployment

Die Datei `render.yaml` beschreibt einen kostenlosen Render-Webdienst. Der
Node.js-Prozess liefert sowohl den Angular-Build als auch den
Colyseus-WebSocket-Server über dieselbe öffentliche Adresse aus.

## Später sinnvoll

- Explodierer und Boss-Zombie
- weitere Waffen, Barrikaden und Türme
- bessere Wegfindung um große Verteidigungsanlagen
- Karten-Assets, Animationen, Audio und Partikeleffekte
- optionale Accounts und Datenbank für manipulationssicheren Fortschritt
