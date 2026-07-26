# Zombie Defense

Kooperatives 2D-Top-down-Spiel für 1–4 Freunde. Ein Spieler erstellt eine
Lobby, teilt den Link und kämpft sich durch zehn Karten mit festen Wellen,
Mini-Bossen und einem eigenen Endboss pro Karte.

Der aktuelle Stand ist ein spielbarer Online-Prototyp. Er braucht keine
Accounts und keine Datenbank.

**Direkt spielen:** [zombie-defense-stexeflex.onrender.com](https://zombie-defense-stexeflex.onrender.com/)

Der kostenlose Server kann nach längerer Inaktivität schlafen. Beim ersten
Aufruf kann das Laden deshalb kurz dauern.

## Enthalten

- Link-Lobbys mit fünfstelligem Code, 1–4 Spieler über Colyseus/WebSockets
- autoritative Bewegung, Zombie-KI, Treffer und Wellen auf dem Server
- zehn Karten mit eigener Optik, eigenen Hindernissen und steigender Härte
- jede Karte endet mit ihrem **eigenen** Endboss und schaltet die nächste frei
- Dash auf der Leertaste: zwei Ladungen, kurzer Cooldown, währenddessen
  unverwundbar — sichtbar am blauen Ring
- mit dem Klingendash schneidet der Dash durch Gegner und lädt dabei ein Schild,
  das Treffer schluckt und langsam wieder wegschmilzt
- Kopfgeld wird **gleichmäßig geteilt**: jeder im Trupp bekommt denselben
  Anteil, egal ob er geschossen, gebaut oder wiederbelebt hat
- Mini-Boss-Wellen mit vier verschiedenen Anführern, dazu Schwarmwellen
- dreizehn Zombiearten plus zehn Bosse
- elf Waffen von der Pistole bis zur Laserkanone, darunter die Frostkanone, die
  ganze Reihen auf halbes Tempo bremst
- gekaufte Waffen bleiben im Arsenal; Wechsel per Zifferntaste oder Mausrad,
  jede Waffe behält ihre eigene Munition
- vier Barrikaden (Holz, Stachel, Stein, Stahl) und sechs Türme (MG, Brand,
  Scharfschütze, Blitz, Rakete, Laser)
- Barrikaden lassen sich lückenlos aneinander bauen, die Vorschau rastet ein
- die Verteidigung in Reichweite wird markiert und zeigt Reparatur- und
  Verkaufspreis
- Munition, Reparieren und Verkaufen im Bau-Shop
- die Bauphase hat keine Uhr: die nächste Welle startet erst, wenn alle bereit
  sind
- am Wellenende wird der ganze Trupp geheilt und wieder aufgestellt
- automatische Wiederbelebung gefallener Spieler durch kurzes Danebenstehen
- Sprites, Lauf- und Angriffsanimationen, Blut-, Feuer- und Explosionseffekte,
  rote Warnkreise, Lava- und Giftpfützen
- prozedural erzeugte Soundeffekte und Musik (Bauphase, Kampf, Boss)
- permanentes Gold, achtzehn Stufen-Upgrades und neun einmalige Vorteile über
  `localStorage`

### Karten

| Karte | Wellen | Härte | Endboss | Gold |
|---|---|---|---|---|
| Vorposten 07 | 10 | ×1 | Fleischkönig | 150 |
| Industriehafen | 12 | ×1,45 | Brutmutter | 320 |
| Militärbasis Nord | 14 | ×2 | Feldmarschall | 600 |
| Krater-Quarantäne | 16 | ×2,8 | Artillerist | 1000 |
| Metro Sektor 9 | 17 | ×3,6 | Sogfürst | 1500 |
| Stahlwerk Kessel 3 | 18 | ×4,4 | Schlackenherr | 2100 |
| Zitadelle Alpha | 20 | ×5,2 | Zerreißer | 3000 |
| Nekropole | 22 | ×6 | Schwarmkönigin | 4200 |
| Reaktorblock 4 | 24 | ×6,8 | Seuchenfürst | 5800 |
| Abgrund-Kathedrale | 26 | ×7,6 | OMEGA | 9000 |

### Bosse

Jede Karte hat genau einen Endboss, und jeder kann etwas anderes:

| Boss | Kann |
|---|---|
| Fleischkönig | Sturmangriff, Schockwelle, ruft Nachschub |
| Brutmutter | zerfällt beim Sterben in Brutlinge, die selbst wieder zerfallen |
| Feldmarschall | heilt sich und die ganze Horde, ruft Panzerträger |
| Artillerist | Bombenhagel aus der Ferne, angekündigt mit roten Warnkreisen |
| Sogfürst | saugt den Trupp zu sich und stößt ihn wieder weg |
| Schlackenherr | hinterlässt brennende Lavapfützen |
| Zerreißer | gewaltige Druckwelle, der rote Kreis ist die einzige Warnung |
| Schwarmkönigin | endloser Nachschub, zerfällt beim Sterben |
| Seuchenfürst | Giftpfützen und Heilschwaden für die Horde |
| OMEGA | Druckwelle, Bombenhagel, Sog, Lava, Sturm — nur heilen kann es sich nicht |

Dazu kommen vier Mini-Bosse: Zerstörer (Sturm und Schockwelle), Wächter
(gepanzert, ruft Verstärkung), Schlitzer (springt heran) und Mörserträger
(Bomben mit Warnkreis).

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
| Frostkanone | 3000 | halbes Tempo für 2,4 s, durchschlägt zwei Gegner |
| Raketenwerfer | 3300 | Sprengschaden im Umkreis |
| Blitzstreuer | 3900 | Blitz springt auf vier weitere Gegner |
| Laserkanone | 4800 | Dauerstrahl, durchschlägt sechs Gegner |

### Türme

| Turm | Preis | Besonderheit |
|---|---|---|
| MG-Turm | 700 | Dauerfeuer auf mittlere Distanz |
| Brandturm | 1000 | kurze Reichweite, setzt ganze Gruppen in Brand |
| Scharfschützenturm | 1500 | weite Reichweite, durchschlägt Reihen |
| Blitzturm | 1900 | Blitz springt auf drei Nachbarn über |
| Raketenturm | 2200 | Sprengraketen gegen Gruppen |
| Laserturm | 3200 | Endgame: durchschlägt Reihen auf weite Distanz |

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
| `Leertaste` oder `Shift` | Dash — kurz unverwundbar |
| Maus | Zielen |
| Linke Maustaste | Schießen |
| `R` | Nachladen; beim Platzieren Barrikade drehen |
| `1`–`9` oder Mausrad | Waffe aus dem Arsenal wählen |
| `G` | Granate zum Mauszeiger werfen |
| `F` | markierte Verteidigung reparieren (nur Bauphase) |
| `V` | markierte Verteidigung verkaufen (nur Bauphase) |
| Rechtsklick | ausgewählte Verteidigung abwählen |

Der Dash bringt zwei Ladungen mit, die sich einzeln wieder aufladen. Solange
er läuft, geht jeder Treffer daneben — der blaue Ring zeigt an, wann das gilt.
Ein abgewehrter Schlag klingt hell und metallisch statt dumpf, so ist ein
geglücktes Ausweichen auch ohne Blick auf den Ring zu hören. Im permanenten Shop
gibt es weitere Ladungen, eine schnellere Aufladung, mehr Dash-Schaden und ein
stärkeres Dash-Schild.

Mit dem einmaligen Vorteil **Klingendash** wird der Dash zur Waffe: Jeder Gegner,
durch den man hindurchdasht, nimmt Schaden und lädt ein Schild. Geprüft wird die
ganze zurückgelegte Strecke, ein Gegner also nie doppelt pro Dash. Das Schild
fängt Treffer ab, bevor sie das Leben erreichen, hält höchstens 35 % des eigenen
Lebens und schmilzt danach von selbst wieder weg — es lohnt sich also nur, wer
weiter in die Horde dasht. Unter dem Leben zeigt ein blauer Balken, wie viel noch
steht, auch über den Köpfen der Mitspieler.

In der Bauphase wird im Seitenmenü zwischen Waffen, Barrikaden und Türmen
gewechselt, ein Bauteil ausgewählt und danach auf dem Spielfeld platziert.
Spieler können sich dabei weiterhin bewegen. Die Vorschau rastet an
Nachbarbauten und Hindernissen ein, sodass Wände lückenlos entstehen; rot
bedeutet, dass dort nicht gebaut werden kann. Mit dem Start der Welle fällt die
Auswahl weg, die nächste Bauphase beginnt also ohne alte Vorschau.

Wer neben einer eigenen oder fremden Verteidigung steht, sieht sie umrandet,
dazu ihre Lebenspunkte, den Reparaturpreis und den Verkaufserlös. Was in der
laufenden Bauphase gesetzt wurde, gibt es zum vollen Preis zurück; ab der
nächsten Welle nur noch anteilig.

Die Bauphase läuft ohne Uhr: Erst wenn alle auf „Bereit“ gedrückt haben, startet
die nächste Welle. Zwischen den Wellen wird der Trupp voll geheilt, Gefallene
stehen wieder auf. Zum Wiederbeleben mitten in der Welle genügt es, kurz neben
einem gefallenen Mitspieler stehen zu bleiben. Sound und Musik lassen sich oben
rechts abschalten.

## Geld und Fortschritt

Kopfgeld wird gleichmäßig geteilt: Jeder im Trupp bekommt denselben Anteil an
jeder Prämie, egal ob er geschossen, gebaut oder wiederbelebt hat. Der Abschuss
in der Statistik zählt für den, der dem Zombie am meisten Schaden zugefügt hat.

Permanentes Gold gibt es am Ende jedes Runs. Der Shop steht auf der Startseite
und in der Lobby offen, solange der Run noch nicht läuft — dort gekaufte
Upgrades zählen sofort für den nächsten Run. Es gibt zwei Arten von Käufen:

- **Stufen-Upgrades** – Leben, Panzerung, Tempo, Waffenschaden, Nachladen,
  Magazin, Munitionsvorrat, Granaten, Barrikaden, Turmschaden, Turmreichweite,
  Wiederbelebung, Dash-Ladungen, Dash-Aufladung, Dash-Schaden und Dash-Schild
- **Einmalige Vorteile** – günstigere erste Waffe, erste Barrikaden und erster
  Turm eines Runs, ein Dash der Zombies wegschleudert, ein Dash der durch Gegner
  schneidet und Schild auflädt, doppelt so schnelles Wiederbeleben, günstigere
  Reparaturen, eine Granate mehr und ein Aufbäumen, das einen tödlichen Treffer
  pro Welle überlebt

Zusätzliche Dash-Ladungen kommen ausschließlich aus dem Stufen-Upgrade. Die
Stufenleiste zeigt kurze Leitern mit einem Strich pro Stufe, lange Leitern als
gefüllten Balken — vierzig Striche wären nicht lesbar.

Upgrades, die direkt Geld oder Gold bringen, gibt es bewusst nicht.

## Projektstruktur

```text
src/                 Angular-Oberfläche und Phaser-Spiel
src/app/game/        Szene, Effekte, Views und prozedurale Texturen
src/app/core/        Verbindung, Fortschritt und Audio
src/app/shared/      Bausteine für mehrere Seiten, etwa der Gold-Shop
shared/              Arena, Waffen, Verteidigungen, Zombies, Wellen, Karten
server/src/game/     Spielsysteme: Spieler, Zombies, Fähigkeiten, Bau, Wellen
server/src/rooms/    Colyseus-Raum als dünne Netzwerkschicht
scripts/             lokale Hilfsskripte
```

Der Browser sendet nur Eingaben und Kauf-/Bauabsichten. Der Server entscheidet
über Positionen, Schüsse, Treffer, Explosionen, Zombie-Leben, Spielerleben,
Dash, Wiederbelebung, Geld, Wellen, Barrikaden, Türme und Bodeneffekte. Effekte
wie Blut, Explosionen und Blitze schickt der Server als kompakte Ereignisliste
mit dem Snapshot mit.

Alle Bilder entstehen zur Laufzeit als Canvas-Texturen, alle Klänge über die
Web-Audio-API. Das Spiel lädt deshalb keine externen Assets.

## Prüfen und bauen

```text
npm test -- --watch=false
npm run sim
npm run build:all
```

`npm run sim` startet einen Rauchtest ohne Browser: Ein Bot spielt jede Karte
bis zum Endboss durch und prüft Waffen, Verteidigungen, Türme, Dash samt
Klingendash und Schild, den Frost der Frostkanone, die gleiche Geldverteilung,
alle Boss-Fähigkeiten und ob jede Welle wirklich endet.

Der fertige Browser-Build liegt danach unter
`dist/zombie-defense/browser`. Der Server-Build liegt unter `server/build`.

## Online-Deployment

Die Datei `render.yaml` beschreibt einen kostenlosen Render-Webdienst. Der
Node.js-Prozess liefert sowohl den Angular-Build als auch den
Colyseus-WebSocket-Server über dieselbe öffentliche Adresse aus.

## Später sinnvoll

- bessere Wegfindung um große Verteidigungsanlagen
- optionale Accounts und Datenbank für manipulationssicheren Fortschritt
