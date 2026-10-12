'use strict';
// Test für die Olympia-Anbindung: Ticket-Prüfung, Punkterechnung, Ablauf einer Meldung.
// Start: npm test
const assert = require('assert');
delete process.env.ZUGANG_PASSWORT; delete process.env.RENDER;
const olympFabrik = require('../olymp');
const { datenLaden, wertung, einstellungen, erstelleAnfrage, STRAFE } = require('../olymp-logik');

const FF = datenLaden();
let nr = 0;
const ok = (name, f) => { f(); nr++; console.log('  ok  ' + name); };

/* ---------- Einstellungen ---------- */
ok('Einstellungen: Unsinn fällt auf Standard zurück', () => {
  assert.deepStrictEqual(einstellungen({ dauer:9999, insel:7 }), { dauer:240, insel:1 });
  assert.deepStrictEqual(einstellungen({ dauer:300, insel:2 }), { dauer:300, insel:2 });
  assert.deepStrictEqual(einstellungen(null), { dauer:240, insel:1 });
});

/* ---------- Punkterechnung ---------- */
const E1 = { dauer:240, insel:1 };
ok('Punkte: Summe der Fischwerte', () => {
  const w = wertung(FF, E1, { sardine:3, thunfisch:1 }, 0);
  assert.strictEqual(w.punkte, 3 * FF.FISCHE.sardine.wert + FF.FISCHE.thunfisch.wert);
  assert.strictEqual(w.anzahl, 4);
  assert.ok(/4 Fische · Thunfisch/.test(w.text) && w.text.length <= 40, w.text);   // die Olympiade kürzt auf 40 Zeichen
});
ok('Punkte: Ohnmacht kostet, Ergebnis nie unter 0', () => {
  assert.strictEqual(wertung(FF, E1, { thunfisch:2 }, 1).punkte, 2 * FF.FISCHE.thunfisch.wert - STRAFE);
  assert.strictEqual(wertung(FF, E1, { sardine:1 }, 5).punkte, 0);
});
ok('Punkte: Fische der anderen Insel, Bosse und Unbekanntes zählen nicht', () => {
  assert.strictEqual(wertung(FF, E1, { goldhai:1, kugelkoenig:1, __proto__x:3, nichts:4 }, 0).punkte, 0);
  assert.strictEqual(wertung(FF, { dauer:240, insel:2 }, { goldhai:1 }, 0).punkte, FF.FISCHE.goldhai.wert);
  assert.strictEqual(wertung(FF, E1, { stiefel:2 }, 0).punkte, 2 * FF.FISCHE.stiefel.wert);   // Stiefel gibt es überall
});
ok('Punkte: Negatives, Brüche und Texte werden zu sicheren Zahlen', () => {
  assert.strictEqual(wertung(FF, E1, { sardine:-5 }, -3).punkte, 0);
  assert.strictEqual(wertung(FF, E1, { sardine:'2.9' }, 'x').punkte, 2 * FF.FISCHE.sardine.wert);
  assert.strictEqual(wertung(FF, E1, null, 0).punkte, 0);
});
ok('Punkte: unmögliche Mengen werden gekappt, die wertvollsten zuerst', () => {
  const w = wertung(FF, { dauer:240, insel:2 }, { goldhai:50, rotbarsch:500 }, 0);
  assert.ok(w.gekappt);
  assert.ok(w.anzahl <= 240 / 4 + 2, 'mehr Fische als möglich: ' + w.anzahl);
  const seltene = wertung(FF, { dauer:240, insel:2 }, { goldhai:50 }, 0);
  assert.ok(seltene.punkte <= 4 * FF.FISCHE.goldhai.wert, 'zu viele Legendäre: ' + seltene.punkte);
});

/* ---------- Ticket ---------- */
const olymp = olympFabrik({ spiel:'fischfieber' });
const werkzeug = olympFabrik.werkzeug();
const ticketDaten = (extra = {}) => Object.assign({ sp:'fischfieber', l:'lauf1', g:0, s:'sp1', n:'Tester', m:[{ s:'sp1', n:'Tester' }], u:'http://localhost:10500', c:{ dauer:180, insel:1 }, z:'http://localhost:10500/', ti:'Olympiade TEST', nr:2, von:5, bis:Date.now() + 3600_000 }, extra);
const ticket = (extra) => werkzeug.ausstellen(ticketDaten(extra));

ok('Ticket: gültiges wird erkannt, Einstellungen kommen mit', () => {
  const t = olymp.ticketPruefen(ticket());
  assert.ok(t); assert.strictEqual(t.n, 'Tester'); assert.strictEqual(t.c.dauer, 180);
});
ok('Ticket: ohne Ticket, kaputt, gefälscht, abgelaufen oder für ein anderes Spiel → null', () => {
  assert.strictEqual(olymp.ticketPruefen(undefined), null);
  assert.strictEqual(olymp.ticketPruefen('quatsch'), null);
  const t = ticket();
  assert.strictEqual(olymp.ticketPruefen(t.slice(0, -2) + 'xx'), null);
  const [daten] = t.split('.');
  assert.strictEqual(olymp.ticketPruefen(daten + '.abc'), null);
  assert.strictEqual(olymp.ticketPruefen(ticket({ bis:Date.now() - 1000 })), null);
  assert.strictEqual(olymp.ticketPruefen(ticket({ sp:'pingutowers' })), null);
});

/* ---------- Ablauf einer Meldung ---------- */
const melden = [], da = [];
const falsche = Object.assign({}, olymp, { wertMelden:(t, s, wert, text) => { melden.push({ s, wert, text }); return Promise.resolve(true); }, da:(t, s) => { da.push(s); return Promise.resolve(true); } });
let uhr = 1_000_000;
const { anfrage } = erstelleAnfrage({ olymp:falsche, FF, jetzt:() => uhr });
const fang = { sardine:4, makrele:2 };
const erwartet = 4 * FF.FISCHE.sardine.wert + 2 * FF.FISCHE.makrele.wert;

ok('Ablauf: ohne gültiges Ticket keine Antwort und keine Meldung', () => {
  assert.strictEqual(anfrage({ aktion:'info' }).status, 403);
  assert.strictEqual(anfrage({ ticket:'x.y', aktion:'ergebnis', fang }).status, 403);
  assert.strictEqual(melden.length, 0);
});
const t1 = ticket({ bis:Date.now() + 3600_000 });
ok('Ablauf: info liefert Anzeigedaten und geprüfte Einstellungen, meldet „bin da“', () => {
  const r = anfrage({ ticket:t1, aktion:'info' });
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.daten.einst, { dauer:180, insel:1 });
  assert.strictEqual(r.daten.info.name, 'Tester'); assert.strictEqual(r.daten.gestartet, false); assert.strictEqual(r.daten.ergebnis, null);
  assert.strictEqual(da.length, 1);
});
ok('Ablauf: Ergebnis ohne Start oder zu früh wird abgelehnt', () => {
  assert.strictEqual(anfrage({ ticket:t1, aktion:'ergebnis', fang }).status, 400);
  assert.strictEqual(anfrage({ ticket:t1, aktion:'start' }).status, 200);
  assert.strictEqual(anfrage({ ticket:t1, aktion:'start' }).status, 409);       // nur ein Start
  uhr += 60_000;
  assert.strictEqual(anfrage({ ticket:t1, aktion:'ergebnis', fang }).status, 400);
  assert.strictEqual(melden.length, 0);
});
ok('Ablauf: nach der Turnierzeit zählt die Meldung genau einmal', () => {
  uhr += 125_000;
  const r = anfrage({ ticket:t1, aktion:'ergebnis', fang, ohn:0 });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.daten.punkte, erwartet);
  assert.strictEqual(melden.length, 1); assert.strictEqual(melden[0].wert, erwartet); assert.strictEqual(melden[0].s, 'sp1');
  const zweite = anfrage({ ticket:t1, aktion:'ergebnis', fang:{ thunfisch:9 }, ohn:0 });
  assert.strictEqual(zweite.status, 409); assert.strictEqual(zweite.daten.punkte, erwartet);
  assert.strictEqual(melden.length, 1);
  assert.strictEqual(anfrage({ ticket:t1, aktion:'start' }).status, 409);
  assert.strictEqual(anfrage({ ticket:t1, aktion:'info' }).daten.ergebnis, r.daten.text);
});
ok('Ablauf: kaputte Meldungen werden abgelehnt', () => {
  const t2 = ticket({ s:'sp2', m:[{ s:'sp2', n:'Zwei' }] });
  anfrage({ ticket:t2, aktion:'start' }); uhr += 200_000;
  assert.strictEqual(anfrage({ ticket:t2, aktion:'ergebnis' }).status, 400);
  assert.strictEqual(anfrage({ ticket:t2, aktion:'ergebnis', fang:[1, 2] }).status, 400);
  assert.strictEqual(anfrage({ ticket:t2, aktion:'blub' }).status, 400);
  assert.strictEqual(melden.length, 1);
});

console.log(nr + ' Tests bestanden.');
