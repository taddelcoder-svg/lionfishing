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

Tests: `npm test` (Olympia-Anbindung, ohne Browser).

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
| `vendor/` | three.js und die Schrift „Bricolage Grotesque“ (SIL OFL, selbst ausgeliefert, keine CDNs) |
| `olymp.js` | Olympia-Anbindung (Kopie der Vorlage aus `olympiade/geteilt`): Ticket prüfen, Wertung melden |
| `olymp-logik.js` | Angelturnier auf dem Server: Einstellungen prüfen, Punkte aus den gemeldeten Fängen rechnen, ein Versuch je Ticket |
| `test/olymp-test.js` | Test für Ticket-Prüfung, Punkterechnung und den Ablauf einer Meldung (`npm test`) |

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

## Olympiade (Angelturnier)

Fischfieber ist eine Einzel-Disziplin der Swimming-Lions-Olympiade (Kennung `fischfieber`, Wertung `wert`: höher ist besser).
Die Olympiade öffnet das Spiel mit `?olymp=<Ticket>`. Ohne Ticket läuft alles wie gewohnt.

- **Ablauf:** Menü auf das Nötige verkürzt (Name aus dem Ticket, kein Shop, kein Casino, kein Kapitän, kein Mehrspieler) → „Turnier starten“ → Countdown →
  feste Zeit angeln (3, 4 oder 5 Minuten; die Uhr läuft auch im Pausenmenü weiter) → Ergebnisbildschirm mit Punktzahl und „Zurück zur Olympiade“.
- **Alle haben dasselbe:** gleiche Insel (Schiffbruch-Insel oder Haifisch-Atoll), gleiche Ausrüstung (Bambusrute, Paddel, Pistole, kein Geld) und gleiche
  Fisch-Reihenfolge – wer den n-ten Fisch an den Haken bekommt, wird aus der Lauf-Kennung (`t.l`) ausgewürfelt.
- **Wertung:** Wert aller eingesammelten Fische (sie werden sofort gutgeschrieben), minus 20 $ je Ohnmacht. Boss-Fische gibt es nicht (kein Köder).
- **Einstellungen im Ticket (`t.c`):** `dauer` (180 / 240 / 300 Sekunden, Standard 240) und `insel` (1 oder 2, Standard 1). Unsinn fällt auf den Standard zurück.
- **Server (`POST /api/olymp`, ohne Passwort-Cookie, geschützt durch das signierte Ticket):** `info` (Anzeigedaten, „bin da“), `start` (der Server merkt sich die
  Startzeit, nur einmal), `ergebnis` (rohe Zahlen: `fang` = Fisch → Anzahl, `ohn` = Ohnmächte). Der Server rechnet die Punkte **selbst** (Wert aus `js/daten.js`),
  lässt nur Fische der gewählten Insel zu, begrenzt die Mengen auf das Machbare (höchstens ein Fisch je 4 Sekunden, wenige seltene), lehnt Meldungen vor Ablauf der
  Turnierzeit ab und meldet mit `olymp.wertMelden`. Pro Ticket zählt nur die erste Meldung (409 bei der zweiten).
- **Seite neu geladen:** Fänge und Startzeit liegen im `localStorage` (Schlüssel `fischfieber.olymp.<Lauf>.<Spieler>`), das Turnier läuft weiter. Der normale Spielstand wird im
  Olympia-Modus weder gelesen noch geschrieben.

Katalog-Eintrag für `olympiade/spiele.js`: siehe PR-Beschreibung.

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
