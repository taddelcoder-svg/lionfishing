# Fischfieber

3D-Chaos-Angeln im Browser (inspiriert vom Prinzip von „How to Fish“, eigener Name, eigene Figuren).
Nach einer feuchtfröhlichen Bootstour strandest du auf einer Insel: Fische auswerfen, im Drill an Land reißen,
die zappelnden Viecher mit Paddel, Pistole, Schrotflinte, Harpune oder TNT erledigen, bei Hein verkaufen,
im Möwen-Casino zocken, Boss-Fische besiegen und mit Kapitän Kuddel weitersegeln.

## Starten

```
npm install
npm start               # http://localhost:10900
```

Einzige Abhängigkeit ist `ws` für das Spielen mit Freunden. Lokal ohne `ZUGANG_PASSWORT` ohne Passwortschutz; auf Render bleibt die Seite gesperrt, bis es gesetzt ist.

## Aufbau

| Datei | Inhalt |
|---|---|
| `server.js` | liefert die Dateien aus, Passwortschutz über `zugang.js`, Runden für das Spielen mit Freunden (WebSocket `/ws`) |
| `js/daten.js` | Tabellen: Fische, Ruten, Köder, Waffen, Westen, Inseln, Casino |
| `js/modelle.js` | alle 3D-Modelle prozedural (three.js r128, flache Schattierung) |
| `js/welt.js` | Insel: Höhenfunktion, Wasser mit Wellen, Himmel, Steg, Buden, Leute |
| `js/spiel.js` | Spieler, Angeln (Wurf, Biss, Drill), Viecher-KI, Waffen, Bosse, Shop, Casino, Speichern, Mehrspieler |
| `js/netz.js` | Verbindung zum Server: Runden eröffnen/beitreten, Nachrichten senden und empfangen |
| `js/ton.js` | synthetische Geräusche (WebAudio), abschaltbar |

Spielstand liegt im `localStorage` (`fischfieber.v1`), Einstellungen in `fischfieber.einst`.

## Ablauf

1. **Schiffbruch-Insel**: Sardine bis Goldbrasse. Boss **Kugelkönig** (Königsköder bei Hein) → Krone + 200 $ an Kuddel → Boot geflickt.
2. **Haifisch-Atoll**: Rotbarsch bis Goldener Hai. Boss **Admiral Hammer** (Admiralsköder) → Hammer + 1500 $ → Heimkehr (Abspann), danach freies Weiterspielen.

## Mit Freunden spielen

Im Menü auf **👥 Mit Freunden spielen**: Namen eingeben, eine Runde eröffnen oder einer offenen Runde beitreten
(Liste oder 4-Buchstaben-Code). Bis zu 4 Spieler pro Runde.

- Jeder spielt mit seinem **eigenen Spielstand** (Geld, Ausrüstung, Insel, Quests). Man sieht sich, wenn man auf derselben Insel ist.
- Mitspieler erscheinen als Figur in ihrer Farbe mit Namensschild, mit ihrer Ausrüstung in der Hand und ihrer Angelschnur.
- Fische, die einer an Land zieht, sehen alle und können sie gemeinsam erledigen. **Wer die Beute zuerst einsammelt, bekommt sie.**
  Die Trophäe eines Bosses kann sich **jeder** holen (Kugelkönig und Admiral Hammer lassen sich also zusammen besiegen).
- Die Viecher greifen den Spieler an, der ihnen am nächsten ist. Wer im Menü oder bei Hein ist, wird nicht gejagt.
- Explosionen von Kugelfischen und Boss-Angriffe (Stachelregen, Druckwelle) treffen alle. TNT von Mitspielern schubst nur.
- Oben rechts steht, wer in der Runde ist, mit Lebenspunkten und Insel (⏸ = im Menü, 💤 = keine Verbindung).

Technik: Jeder Rechner rechnet nur seine eigenen Fische und schickt sie zehnmal pro Sekunde mit (Nachricht `z`).
Treffer auf fremde Fische (`treffer`), Beute-Anfragen (`nehmen` → `gegeben`/`weg`) und Schaden an Mitspielern (`aua`)
gehen über den Server an genau einen Spieler, Effekte (`fx`) an alle. Der Server speichert nichts, er hält die Runden nur im Arbeitsspeicher.

## Testen in der Konsole

```js
fischfieber.TEST.halt = true     // echte Schleife anhalten, nur noch sim() rechnet
fischfieber.starten()            // Menü überspringen
fischfieber.fang('kugelkoenig')  // Fisch direkt an Land ziehen
fischfieber.sim(5)               // 5 Sekunden simulieren
fischfieber.geld(1000)
fischfieber.FREMDE            // Mitspieler, fischfieber.FREMDV: ihre Fische
```

## Deploy

Render-Blueprint `render.yaml` (Docker, Dienst `lionfishing`, GitHub `taddelcoder-svg/lionfishing`), Umgebungsvariable `ZUGANG_PASSWORT` setzen.
