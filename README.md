# Fischfieber

3D-Chaos-Angeln im Browser (inspiriert vom Prinzip von „How to Fish“, eigener Name, eigene Figuren).
Nach einer feuchtfröhlichen Bootstour strandest du auf einer Insel: Fische auswerfen, im Drill an Land reißen,
die zappelnden Viecher mit Paddel, Pistole, Schrotflinte, Harpune oder TNT erledigen, bei Hein verkaufen,
im Möwen-Casino zocken, Boss-Fische besiegen und mit Kapitän Kuddel weitersegeln.

## Starten

```
node server.js          # http://localhost:10900
```

Keine npm-Abhängigkeiten. Lokal ohne `ZUGANG_PASSWORT` ohne Passwortschutz; auf Render bleibt die Seite gesperrt, bis es gesetzt ist.

## Aufbau

| Datei | Inhalt |
|---|---|
| `server.js` | liefert die Dateien aus, Passwortschutz über `zugang.js` |
| `js/daten.js` | Tabellen: Fische, Ruten, Köder, Waffen, Westen, Inseln, Casino |
| `js/modelle.js` | alle 3D-Modelle prozedural (three.js r128, flache Schattierung) |
| `js/welt.js` | Insel: Höhenfunktion, Wasser mit Wellen, Himmel, Steg, Buden, Leute |
| `js/spiel.js` | Spieler, Angeln (Wurf, Biss, Drill), Viecher-KI, Waffen, Bosse, Shop, Casino, Speichern |
| `js/ton.js` | synthetische Geräusche (WebAudio), abschaltbar |

Spielstand liegt im `localStorage` (`fischfieber.v1`), Einstellungen in `fischfieber.einst`.

## Ablauf

1. **Schiffbruch-Insel**: Sardine bis Goldbrasse. Boss **Kugelkönig** (Königsköder bei Hein) → Krone + 200 $ an Kuddel → Boot geflickt.
2. **Haifisch-Atoll**: Rotbarsch bis Goldener Hai. Boss **Admiral Hammer** (Admiralsköder) → Hammer + 1500 $ → Heimkehr (Abspann), danach freies Weiterspielen.

## Testen in der Konsole

```js
fischfieber.TEST.halt = true     // echte Schleife anhalten, nur noch sim() rechnet
fischfieber.starten()            // Menü überspringen
fischfieber.fang('kugelkoenig')  // Fisch direkt an Land ziehen
fischfieber.sim(5)               // 5 Sekunden simulieren
fischfieber.geld(1000)
```

## Deploy

Render-Blueprint `render.yaml` (Docker, Dienst `fischfieber`), Umgebungsvariable `ZUGANG_PASSWORT` setzen.
