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
- **Endlosmodus** auf jeder freigeschalteten Karte: nach der letzten geplanten
  Welle geht es weiter, alle zehn Wellen kommt der Boss der Karte zurück
- Dash auf der Leertaste: zwei Ladungen, kurzer Cooldown, schluckt 40 % des
  Schadens — mit der Stufe _Dash-Schadensreduktion_ bis zu 100 %
- mit dem Klingendash schneidet der Dash durch Gegner und lädt dabei ein Schild,
  das Treffer schluckt und langsam wieder wegschmilzt
- Kopfgeld wird **gleichmäßig geteilt**: jeder im Trupp bekommt denselben
  Anteil, egal ob er geschossen, gebaut oder wiederbelebt hat
- Mini-Boss-Wellen mit vier verschiedenen Anführern, dazu Schwarmwellen
- dreizehn Zombiearten plus zehn Bosse
- sechsundzwanzig Waffen von der Pistole bis zum Sonnenwerfer, darunter fünf
  munitionsfreie Nahkampfwaffen und sehr teure Endgame-Builds
- gekaufte Waffen bleiben im Arsenal; Wechsel per Zifferntaste oder Mausrad,
  jede Waffe behält ihre eigene Munition
- neun Barrikaden und vierzehn Türme vom günstigen MG bis zum Donnerkranz,
  inklusive Drohnenhangar mit drei fliegenden Jagddrohnen
- **sieben Fahrzeuge** vom Quad bis zum Kampfpanzer, fünf davon mit Platz für
  mehrere Spieler; langsamere, deutlich robustere Hüllen machen Insassen
  unverwundbar, dafür geht der Dash verloren
- Barrikaden lassen sich lückenlos aneinander bauen, die Vorschau rastet ein;
  Stacheldraht ist eine durchquerbare Bodenfalle, die bremst, Schaden macht und
  unter einer dichten Horde schnell zertrampelt wird
- die Verteidigung in Reichweite wird markiert und zeigt Reparatur- und
  Verkaufspreis
- Munition, Reparieren und Verkaufen im Bau-Shop
- vor Welle 1 und zwischen allen späteren Wellen gibt es eine Bauphase ohne Uhr:
  alle können sich bereit melden, der Host kann die Welle trotzdem sofort starten
- am Wellenende wird der ganze Trupp geheilt und wieder aufgestellt
- automatische Wiederbelebung gefallener Spieler durch kurzes Danebenstehen
- freie WASD-/Pfeiltasten-Kamera, solange der eigene Spieler am Boden liegt
- Sprites, Lauf- und Angriffsanimationen, Blut-, Feuer- und Explosionseffekte,
  rote Warnkreise, Lava- und Giftpfützen
- prozedural erzeugte Soundeffekte und Musik (Bauphase, Kampf, Boss)
- permanentes Gold, sechsundzwanzig Stufen-Upgrades und zehn besondere Vorteile
  über `localStorage`

### Karten

| Karte              | Wellen | Härte | Endboss        | Gold bei Sieg |
| ------------------ | ------ | ----- | -------------- | ------------- |
| Vorposten 07       | 10     | ×1    | Fleischkönig   | 570           |
| Industriehafen     | 12     | ×1,45 | Brutmutter     | 1101          |
| Militärbasis Nord  | 14     | ×2    | Feldmarschall  | 1932          |
| Krater-Quarantäne  | 16     | ×2,8  | Artillerist    | 3159          |
| Metro Sektor 9     | 17     | ×3,6  | Sogfürst       | 4577          |
| Stahlwerk Kessel 3 | 18     | ×4,4  | Schlackenherr  | 6233          |
| Zitadelle Alpha    | 20     | ×5,2  | Zerreißer      | 8652          |
| Nekropole          | 22     | ×6    | Schwarmkönigin | 11748         |
| Reaktorblock 4     | 24     | ×6,8  | Seuchenfürst   | 15721         |
| Abgrund-Kathedrale | 26     | ×7,6  | OMEGA          | 22970         |

### Endlosmodus

In der Lobby wählt der Host neben der Karte den Modus. **Endlos** spielt dieselbe
Karte, hört aber nach ihrer letzten geplanten Welle nicht auf: Von da an baut der
Server jede Welle selbst, mit Mini-Bossen in jeder dritten, einer Schwarmwelle in
jeder fünften und dem Boss der Karte in jeder zehnten. Ab Welle 30 ziehen Leben,
Schaden und Tempo immer stärker an; größere Trupps erhöhen den Gegnerdruck
zusätzlich. Der Lohn richtet sich nach der erreichten Welle — freischalten lässt
sich im Endlosmodus nichts, dafür bleibt die Kampagne da.

### Bosse

Jede Karte hat genau einen Endboss, und jeder kann etwas anderes:

| Boss           | Kann                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| Fleischkönig   | Sturmangriff, Schockwelle, ruft Nachschub                                 |
| Brutmutter     | zerfällt beim Sterben in Brutlinge, die selbst wieder zerfallen           |
| Feldmarschall  | heilt sich und die ganze Horde, ruft Panzerträger                         |
| Artillerist    | Bombenhagel aus der Ferne, angekündigt mit roten Warnkreisen              |
| Sogfürst       | saugt den Trupp zu sich und stößt ihn wieder weg                          |
| Schlackenherr  | hinterlässt brennende Lavapfützen                                         |
| Zerreißer      | gewaltige Druckwelle, der rote Kreis ist die einzige Warnung              |
| Schwarmkönigin | endloser Nachschub, zerfällt beim Sterben                                 |
| Seuchenfürst   | Giftpfützen und Heilschwaden für die Horde                                |
| OMEGA          | Druckwelle, Bombenhagel, Sog, Lava, Sturm — nur heilen kann es sich nicht |

Dazu kommen vier Mini-Bosse: Zerstörer (Sturm und Schockwelle), Wächter
(gepanzert, ruft Verstärkung), Schlitzer (springt heran) und Mörserträger
(Bomben mit Warnkreis).

### Waffen

| Waffe                | Preis | Besonderheit                                             |
| -------------------- | ----- | -------------------------------------------------------- |
| Pistole              | 0     | Startwaffe                                               |
| Brecheisen           | 300   | Nahkampf, trifft zwei Gegner und braucht keine Munition  |
| Maschinenpistole     | 450   | sehr hohe Feuerrate                                      |
| Sturmgewehr          | 900   | Allrounder, durchschlägt einen Gegner                    |
| Schrotflinte         | 1100  | acht Schrotkugeln auf kurze Distanz                      |
| Feuerwehr-Axt        | 1200  | Nahkampf, stößt Gruppen zurück und knackt Rüstung        |
| Nagelwerfer          | 1400  | schwere Nägel durchbohren mehrere Gegner                 |
| Schwere Magnum       | 1550  | harter Einzeltreffer, durchschlägt niemanden             |
| Scharfschützengewehr | 1700  | 215 Schaden, durchschlägt vier Gegner                    |
| Säurewerfer          | 2000  | lässt klar türkise, verbündete Säurelachen liegen        |
| Maschinengewehr      | 2300  | 100 Schuss Dauerfeuer                                    |
| Elefantenbüchse      | 2500  | zwölf Schuss, 720 Schaden pro Treffer                    |
| Flammenwerfer        | 2700  | kurze Reichweite, setzt Horden in Brand                  |
| Kettensäge           | 2800  | schneller Nahkampf gegen drei Ziele zugleich             |
| Frostkanone          | 3000  | halbes Tempo für 2,4 s, durchschlägt zwei Gegner         |
| Raketenwerfer        | 3300  | Sprengschaden im Umkreis                                 |
| Feuer-Raketenwerfer  | 3600  | Feuerexplosion, die weiterbrennt                         |
| Blitzstreuer         | 3900  | Blitz springt auf vier weitere Gegner                    |
| Laserkanone          | 4800  | Dauerstrahl, durchschlägt sechs Gegner                   |
| Railgun              | 5700  | Magnetgeschoss durchbohrt bis zu vierzehn Gegner         |
| Phasenlanze          | 6200  | langer Nahkampfstich, ignoriert den Großteil der Rüstung |
| Gravitationswerfer   | 6600  | zieht Horden in eine verlangsamende Singularität         |
| Nova-Kanone          | 7600  | fünf explosive Plasmalanzen in einer breiten Salve       |
| Ionensturm           | 10800 | drei Blitze springen gleichzeitig durch die Horde        |
| Weltenbrecher        | 13000 | gewaltiger Nahkampf-Rundschlag gegen ganze Horden        |
| Sonnenwerfer         | 15000 | Mini-Sonne mit riesigem Brand- und Explosionsradius      |

### Barrikaden

Die drei neuen Premium-Bauten ergänzen die sechs bisherigen Barrikaden:

| Barrikade         | Preis | Leben | Besonderheit                             |
| ----------------- | ----- | ----- | ---------------------------------------- |
| Schockgitter      | 1100  | 3100  | hoher Gegenschaden und kurzer Slow       |
| Kryo-Bollwerk     | 1900  | 5400  | zwingt Angreifer lange auf Kriechtempo   |
| Titan-Reaktorwall | 3400  | 9800  | extrem robust, detoniert beim Zerbrechen |

### Türme

| Turm                | Preis | Besonderheit                                       |
| ------------------- | ----- | -------------------------------------------------- |
| MG-Turm             | 700   | Dauerfeuer auf mittlere Distanz                    |
| Brandturm           | 1000  | kurze Reichweite, setzt ganze Gruppen in Brand     |
| Frostturm           | 1200  | friert Reihen ein und bremst sie stark             |
| Schrottschleuder    | 1350  | breite, günstige Schrottsalve                      |
| Scharfschützenturm  | 1500  | weite Reichweite, durchschlägt Reihen              |
| Schrotflinten-Turm  | 1650  | acht schwere Kugeln auf kurze Distanz              |
| Säureturm           | 1750  | ätzender Flächenschaden über Zeit                  |
| Blitzturm           | 1900  | Blitz springt auf drei Nachbarn über               |
| Raketenturm         | 2200  | Sprengraketen gegen Gruppen                        |
| Dreifachschuss-Turm | 2750  | drei gebuffte Läufe bekämpfen verschiedene Ziele   |
| Laserturm           | 3200  | Endgame: durchschlägt Reihen auf weite Distanz     |
| Drohnenhangar       | 3600  | drei fliegende Jagddrohnen verfolgen Gegner        |
| Plasma-Bastion      | 6800  | Luxus-Endgame, deutlich stärker als der Laserturm  |
| Donnerkranz         | 9800  | 24 schwere Geschosse in einer langsamen 360°-Salve |

### Fahrzeuge

Fahrzeuge werden wie Bauten in der Bauphase gekauft und abgestellt. Mit `E`
steigt man ein und wieder aus; wer zuerst einsteigt, fährt. Alle an Bord zielen
und schießen weiter mit ihrer eigenen Waffe.

| Fahrzeug         | Preis | Plätze | Leben | Besonderheit                          |
| ---------------- | ----- | ------ | ----- | ------------------------------------- |
| Quad             | 850   | 1      | 800   | einziges schnelles Fahrzeug, Nitro    |
| Geländewagen     | 1500  | 2      | 1600  | robuster Allrounder                   |
| Mannschaftswagen | 2300  | 4      | 2400  | heilt die Besatzung während der Fahrt |
| Kampf-Pickup     | 2900  | 2      | 1900  | MG feuert selbstständig               |
| Werkstattwagen   | 3700  | 3      | 2800  | repariert Bauten, liefert Munition    |
| Schützenpanzer   | 5200  | 4      | 5000  | langsame Festung mit Bordkanone       |
| Kampfpanzer      | 8200  | 2      | 7600  | schwerste Hülle und Sprengkanone      |

Solange das Fahrzeug noch steht, sind alle Insassen vollständig
unverwundbar. Das bisherige Upgrade _Innenraumschutz_ heißt deshalb jetzt
_Hüllenpanzerung_ und reduziert den Schaden am Fahrzeug selbst. Bezahlt wird
der sichere Innenraum mit dem Dash: Am Steuer gibt es kein Ausweichen mehr,
nur das Quad ist schneller als ein Überlebender zu Fuß und macht aus der Ladung
ein Nitro. Die anderen Fahrzeuge sind bewusst langsame, teure Lebenspuffer.
Zombies gehen auf die Hülle los, Überfahren kostet auch die Karosserie Leben,
und repariert wird erst wieder in der nächsten Bauphase. Geht die Hülle hoch,
fliegen alle heraus und nehmen Wrackschaden. Das Motor-Upgrade endet bei
40 Prozent zusätzlichem Fahrzeugtempo.

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

| Taste                    | Aktion                                      |
| ------------------------ | ------------------------------------------- |
| `WASD` oder Pfeiltasten  | Bewegen                                     |
| `Leertaste` oder `Shift` | Dash — schluckt einen Großteil des Schadens |
| Maus                     | Zielen                                      |
| Linke Maustaste          | Schießen                                    |
| `R`                      | Nachladen; beim Platzieren Barrikade drehen |
| `1`–`9` oder Mausrad     | Waffe aus dem Arsenal wählen                |
| `G`                      | Granate zum Mauszeiger werfen               |
| `E`                      | in ein Fahrzeug ein- und wieder aussteigen  |
| `F`                      | markiertes Objekt reparieren (nur Bauphase) |
| `V`                      | markiertes Objekt verkaufen (nur Bauphase)  |
| Rechtsklick              | ausgewählten Bau abwählen                   |

Der Dash bringt zwei Ladungen mit, die sich einzeln wieder aufladen. Solange er
läuft, schluckt er 40 % jedes Treffers — der blaue Ring zeigt an, wann das gilt.
Das Stufen-Upgrade **Dash-Schadensreduktion** legt pro Stufe 10 % darauf und
macht den Dash mit der sechsten Stufe wieder komplett unverwundbar; jede Stufe
kostet entsprechend viel. Ein völlig abgewehrter Schlag klingt hell und
metallisch statt dumpf, so ist ein geglücktes Ausweichen auch ohne Blick auf den
Ring zu hören. Dazu gibt es im permanenten Shop weitere Ladungen und eine
schnellere Aufladung.

Der **Stoßdash** wirkt jetzt über die komplette Dash-Strecke. Getroffene Zombies
werden deutlich weiter weggeschleudert und nehmen erhöhten Schaden.

Mit dem besonderen Vorteil **Klingendash** wird der Dash zur Waffe: Jeder Gegner,
durch den man hindurchdasht, nimmt Schaden und lädt ein Schild. Geprüft wird die
ganze zurückgelegte Strecke, ein Gegner also nie doppelt pro Dash. Das Schild
fängt Treffer ab, bevor sie das Leben erreichen, hält höchstens 35 % des eigenen
Lebens und schmilzt danach von selbst wieder weg — es lohnt sich also nur, wer
weiter in die Horde dasht. Unter dem Leben zeigt ein blauer Balken, wie viel noch
steht, auch über den Köpfen der Mitspieler.

Jeder Run beginnt mit einer Bauphase vor Welle 1. Im Seitenmenü wird zwischen
Waffen, Barrikaden, Türmen und Fahrzeugen gewechselt, ein Bauteil ausgewählt und
danach auf dem Spielfeld platziert.
Spieler können sich dabei weiterhin bewegen. Die Vorschau rastet an
Nachbarbauten und Hindernissen ein, sodass Wände lückenlos entstehen; rot
bedeutet, dass dort nicht gebaut werden kann. Mit dem Start der Welle fällt die
Auswahl weg, die nächste Bauphase beginnt also ohne alte Vorschau.

Wer neben einer eigenen oder fremden Verteidigung steht, sieht sie umrandet,
dazu ihre Lebenspunkte, den Reparaturpreis und den Verkaufserlös. Was in der
laufenden Bauphase gesetzt wurde, gibt es zum vollen Preis zurück; ab der
nächsten Welle nur noch anteilig.

Die Bauphase läuft ohne Uhr: Sobald alle auf „Bereit“ gedrückt haben, startet
die nächste Welle automatisch. Der Host kann fehlende Stimmen mit
„Welle jetzt starten“ übergehen. Ein Spieler, der erst in einen laufenden Run
einsteigt oder erneut verbindet, bekommt kein zweites Startbudget. Zwischen den
Wellen wird der Trupp voll geheilt, Gefallene stehen wieder auf. Zum
Wiederbeleben mitten in der Welle genügt es, kurz neben einem gefallenen
Mitspieler stehen zu bleiben. Sound und Musik lassen sich oben rechts
abschalten.

Verbündete Säure ist auf dem Spielfeld leuchtend türkis und von einem dicken,
pulsierenden Ring umgeben. Gegnerisches Gift bleibt grün, sodass die beiden
Bodeneffekte auch mitten in einer Horde sofort auseinanderzuhalten sind.

## Geld und Fortschritt

Kopfgeld wird gleichmäßig geteilt: Jeder im Trupp bekommt denselben Anteil an
jeder Prämie, egal ob er geschossen, gebaut oder wiederbelebt hat. Der Abschuss
in der Statistik zählt für den, der dem Zombie am meisten Schaden zugefügt hat.

Permanentes Gold gibt es am Ende jedes Runs und auch bei einem freiwilligen
Ausstieg; die Auszahlung wird vor dem Verlassen bestätigt. Kampagnenruns zahlen
jetzt auf jeder erreichten Tiefe ungefähr doppelt so viel wie zuvor, auch bei
einer Niederlage. Im Endlosmodus
steigt der Lohn nach Welle 10 immer stärker, sodass Welle 50 auf der ersten
Karte 1.415 statt 615 Gold bringt. „Zurück zur Lobby“ öffnet nur für den
klickenden Spieler eine frische Lobby und zieht keinen Mitspieler mit. Der Shop steht auf der Startseite
und in der Lobby offen, solange der Run noch nicht läuft — dort gekaufte
Upgrades zählen sofort für den nächsten Run. Es gibt zwei Arten von Käufen:

- **Stufen-Upgrades** – maximales Spielerleben, Panzerung, Tempo, Waffenschaden,
  Nahkampf-Angriffstempo und -Reichweite, Nachladen, Magazin, Munitionsvorrat,
  Granaten, Barrikaden, Turmschaden, Turmreichweite,
  Fahrzeugpanzerung, Hüllenpanzerung, Motorleistung, Rammschaden, Bordwaffen,
  Wiederbelebung, Dash-Ladungen, Dash-Aufladung, Dash-Schadensreduktion,
  Dash-Schaden und Dash-Schild
- **Besondere Vorteile** – günstigere erste Waffe, erste Barrikaden, erster
  Turm und erstes Fahrzeug eines Runs, ein Dash der Zombies wegschleudert, ein
  Dash der durch Gegner schneidet und Schild auflädt, doppelt so schnelles
  Wiederbeleben, günstigere Reparaturen, eine Granate mehr und ein Aufbäumen,
  das einen tödlichen Treffer pro Welle überlebt

Zusätzliche Dash-Ladungen kommen ausschließlich aus dem Stufen-Upgrade. Die
Stufenleiste zeigt kurze Leitern mit einem Strich pro Stufe, lange Leitern als
gefüllten Balken — vierzig Striche wären nicht lesbar.

`Waffenschaden` gilt für Fern- und Nahkampf. `Nachladen`, `Magazingröße` und
`Munitionsreserve` gelten nur für Fernkampf; Nahkampf hat dafür eigene Upgrades
für Angriffstempo und Reichweite.

Dash-Schaden und Dash-Schild bleiben gesperrt, solange der Vorteil fehlt, der sie
überhaupt wirksam macht: Dash-Schaden braucht Stoßdash oder Klingendash,
Dash-Schild den Klingendash. So kostet keine Stufe Gold, die nichts tut.

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
bis zum Endboss durch und prüft Waffen, Verteidigungen, Türme, Fahrzeuge samt
Ein- und Aussteigen, Rammschaden und Bordgerät, Dash samt Schadensreduktion,
Klingendash und Schild, den Frost der Frostkanone, den Endlosmodus, die gleiche
Geldverteilung, alle Boss-Fähigkeiten und ob jede Welle wirklich endet.

Der fertige Browser-Build liegt danach unter
`dist/zombie-defense/browser`. Der Server-Build liegt unter `server/build`.

## Online-Deployment

Die Datei `render.yaml` beschreibt einen kostenlosen Render-Webdienst. Der
Node.js-Prozess liefert sowohl den Angular-Build als auch den
Colyseus-WebSocket-Server über dieselbe öffentliche Adresse aus.

## Später sinnvoll

- bessere Wegfindung um große Verteidigungsanlagen
- optionale Accounts und Datenbank für manipulationssicheren Fortschritt
