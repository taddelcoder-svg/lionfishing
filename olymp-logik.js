'use strict';
// Fischfieber als Disziplin der Olympiade (Angelturnier).
// Der Browser spielt EINEN Versuch mit festem Zeitlimit und meldet nur rohe Zahlen (welche Fische wie oft
// gefangen, wie oft ohnmächtig). Hier rechnet der Server die Punkte selbst aus, prüft sie auf Plausibilität
// und meldet sie signiert an die Olympiade (olymp.js). Pro Ticket zählt nur die erste Meldung.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Die Fischtabelle liegt als Browser-Datei vor (js/daten.js); der Server liest dieselbe Quelle,
// damit Browser und Server immer denselben Wert für einen Fisch annehmen.
function datenLaden() {
  const kasten = {}; kasten.window = kasten;   // wie im Browser: window ist der globale Raum
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'js', 'daten.js'), 'utf8'), kasten, { timeout:1000 });
  return kasten.FF;
}

const DAUERN = [180, 240, 300];       // erlaubte Turnierdauer in Sekunden
const INSELN = [1, 2];
const STRAFE = 20;                    // $ Abzug je Ohnmacht (steht auch in js/spiel.js)
const MIN_PRO_FISCH = 4;              // so schnell schafft kein Mensch mehr als einen Fisch (Sekunden)
const TOLERANZ_S = 10;                // so viel früher als die Dauer darf die Meldung höchstens kommen

// Einstellungen aus dem Ticket gegen die Spieldaten prüfen
function einstellungen(c) {
  c = c && typeof c === 'object' ? c : {};
  return {
    dauer:DAUERN.includes(Number(c.dauer)) ? Number(c.dauer) : 240,
    insel:INSELN.includes(Number(c.insel)) ? Number(c.insel) : 1
  };
}

// Punkte aus den rohen Werten: fang = { fischId: Anzahl }, ohn = Anzahl Ohnmächte.
// Alles wird auf das Mögliche begrenzt; Unbekanntes, Negatives, Fremdes (andere Insel, Boss) zählt nicht.
function wertung(FF, einst, fang, ohn) {
  const maxFische = Math.floor(einst.dauer / MIN_PRO_FISCH) + 2;
  const maxSeltene = Math.max(2, Math.ceil(einst.dauer / 60));         // Episch und Legendär
  const maxRare = Math.ceil(maxFische / 2);                            // Selten
  const posten = [];
  if (fang && typeof fang === 'object') {
    for (const id of Object.keys(fang)) {
      const f = Object.prototype.hasOwnProperty.call(FF.FISCHE, id) ? FF.FISCHE[id] : null;
      if (!f || f.boss || !(f.wert > 0) || (f.insel !== 0 && f.insel !== einst.insel)) continue;
      const n = Math.min(maxFische, Math.max(0, Math.floor(Number(fang[id]) || 0)));
      if (n > 0) posten.push({ id, f, n });
    }
  }
  // Wer zu viel meldet, verliert zuerst die wertvollsten Fische – Schummeln lohnt sich nicht
  posten.sort((a, b) => b.f.wert - a.f.wert);
  let gekappt = false;
  const kappen = (passt, grenze) => {
    let summe = posten.filter(p => passt(p.f)).reduce((a, p) => a + p.n, 0);
    for (const p of posten) {
      if (summe <= grenze) break;
      if (!passt(p.f)) continue;
      const weg = Math.min(p.n, summe - grenze); p.n -= weg; summe -= weg; gekappt = true;
    }
  };
  kappen(f => f.s >= 4, maxSeltene);
  kappen(f => f.s === 3, maxRare);
  kappen(() => true, maxFische);
  const faenge = posten.filter(p => p.n > 0);
  const anzahl = faenge.reduce((a, p) => a + p.n, 0);
  const summe = faenge.reduce((a, p) => a + p.n * p.f.wert, 0);
  const ohnmaechte = Math.min(20, Math.max(0, Math.floor(Number(ohn) || 0)));
  const punkte = Math.max(0, summe - ohnmaechte * STRAFE);
  const bester = faenge[0] ? faenge[0].f.name : null;
  // Die Olympiade zeigt höchstens 40 Zeichen: Wichtiges zuerst, der beste Fang zuletzt
  let text = `${punkte.toLocaleString('de-DE')} $ · ${anzahl} ${anzahl === 1 ? 'Fisch' : 'Fische'}`;
  if (bester && (text + ' · ' + bester).length <= 40) text += ' · ' + bester;
  return { punkte, anzahl, gekappt, text };
}

// Die Anfrage-Behandlung ohne HTTP, damit sie sich testen lässt (Uhr und Olympiade sind austauschbar).
// m = geparster JSON-Körper von POST /api/olymp. Gibt { status, daten } zurück.
function erstelleAnfrage({ olymp, FF = datenLaden(), jetzt = () => Date.now() }) {
  const laeufe = new Map();          // 'lauf:spieler' -> { neu, start, ergebnis:{ punkte, text }, da }
  const aufraeumen = setInterval(() => {
    const j = jetzt();
    for (const [k, e] of laeufe) if (j - e.neu > 12 * 3600_000) laeufe.delete(k);
  }, 600_000);
  if (aufraeumen.unref) aufraeumen.unref();

  function anfrage(m) {
    const t = olymp.ticketPruefen(m && m.ticket);
    if (!t) return { status:403, daten:{ ok:false, fehler:'Das Olympia-Ticket ist ungültig oder abgelaufen. Hol dir in der Olympiade ein neues.' } };
    const key = t.l + ':' + t.s;
    const einst = einstellungen(t.c);
    let lauf = laeufe.get(key);
    if (!lauf) { lauf = { neu:jetzt(), start:0, ergebnis:null, da:0 }; laeufe.set(key, lauf); }
    const lebenszeichen = () => {
      // „bin da“ höchstens alle 20 Sekunden weitergeben (hält die Olympiade auch wach)
      const j = jetzt();
      if (!lauf.ergebnis && j - lauf.da > 20_000) { lauf.da = j; olymp.da(t, t.s); }
    };

    if (m.aktion === 'info') {
      lebenszeichen();
      return { status:200, daten:{ ok:true, info:olymp.fuerBrowser(t), einst, ergebnis:lauf.ergebnis ? lauf.ergebnis.text : null, gestartet:!!lauf.start } };
    }

    if (m.aktion === 'start') {
      if (lauf.ergebnis) return { status:409, daten:{ ok:false, fehler:'Dein Versuch ist schon gewertet.' } };
      if (lauf.start) return { status:409, daten:{ ok:false, fehler:'Dein Versuch läuft schon.' } };
      lebenszeichen();
      lauf.start = jetzt();
      return { status:200, daten:{ ok:true, dauer:einst.dauer } };
    }

    if (m.aktion === 'ergebnis') {
      if (lauf.ergebnis) return { status:409, daten:{ ok:false, fehler:'Dein Versuch ist schon gewertet.', punkte:lauf.ergebnis.punkte, text:lauf.ergebnis.text } };
      if (!lauf.start) return { status:400, daten:{ ok:false, fehler:'Der Start deines Versuchs ist beim Server nicht angekommen.' } };
      if (!m.fang || typeof m.fang !== 'object' || Array.isArray(m.fang)) return { status:400, daten:{ ok:false, fehler:'Meldung unvollständig.' } };
      if (jetzt() - lauf.start < (einst.dauer - TOLERANZ_S) * 1000) return { status:400, daten:{ ok:false, fehler:'Die Turnierzeit ist noch nicht um.' } };
      const w = wertung(FF, einst, m.fang, m.ohn);
      lauf.ergebnis = { punkte:w.punkte, text:w.text };
      olymp.wertMelden(t, t.s, w.punkte, w.text);
      return { status:200, daten:{ ok:true, punkte:w.punkte, text:w.text } };
    }

    return { status:400, daten:{ ok:false, fehler:'Unbekannte Aktion.' } };
  }
  return { anfrage };
}

module.exports = { datenLaden, einstellungen, wertung, erstelleAnfrage, DAUERN, INSELN, STRAFE };
