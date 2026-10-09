'use strict';
// Fischfieber – Server: liefert die Dateien aus und verbindet Mitspieler (WebSocket unter /ws).
// Das ganze Spiel läuft im Browser, der Spielstand liegt im localStorage des Spielers.
// Der Server merkt sich nichts dauerhaft: Er hält nur die offenen Runden im Arbeitsspeicher
// und reicht die Nachrichten zwischen den Spielern einer Runde weiter.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const zugang = require('./zugang')({ titel:'Fischfieber' });

const PORT = Number(process.env.PORT) || 10900;

const SEITEN = { '/':'index.html', '/index.html':'index.html' };
const TYPEN = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml'
};

function senden(res, datei, cache) {
  fs.stat(datei, (fehler, info) => {
    if (fehler || !info.isFile()) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type':TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control':cache, 'X-Content-Type-Options':'nosniff' });
    fs.createReadStream(datei).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (_) { res.writeHead(400); return res.end(); }
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type':'application/json' }); return res.end('{"ok":true}'); }
  if (url.pathname === '/datenschutz' || url.pathname === '/datenschutz.html') return senden(res, path.join(__dirname, 'datenschutz.html'), 'no-cache');
  // Passwort für Familie und Freunde (zugang.js)
  if (zugang.pruefen(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'Content-Type':'text/plain; charset=utf-8', Allow:'GET, HEAD' }); return res.end('Nicht erlaubt'); }
  if (SEITEN[url.pathname]) return senden(res, path.join(__dirname, SEITEN[url.pathname]), 'no-cache');
  const js = /^\/js\/([a-z0-9-]+\.(js|css))$/.exec(url.pathname);
  if (js) return senden(res, path.join(__dirname, 'js', js[1]), 'no-cache');
  // Selbst ausgelieferte Schrift und three.js (keine Verbindung zu Google oder CDNs)
  const statisch = /^\/vendor\/([\w-]+(?:\.[\w-]+)*\.(js|woff2|txt))$/.exec(url.pathname);
  if (statisch) return senden(res, path.join(__dirname, 'vendor', statisch[1]), 'public, max-age=604800');
  res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

/* ---------- Mehrspieler ----------
   Bis zu 4 Spieler pro Runde. Jeder spielt mit seinem eigenen Spielstand; der Server
   reicht Position, Fische und Effekte an die anderen in der Runde weiter. */
const MAX_SPIELER = 4;
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // ohne I und O (Verwechslung mit 1 und 0)
const runden = new Map();        // code -> { code, mitglieder:Map(id -> ws) }
const verbindungen = new Set();
const wss = new WebSocketServer({ server, path:'/ws', maxPayload:16 * 1024, verifyClient:({ req }) => zugang.hatZugang(req) });

const sendenAn = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const nameSauber = n => String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
function neuerCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_ZEICHEN[crypto.randomInt(CODE_ZEICHEN.length)];
    if (!runden.has(c)) return c;
  }
}
const spielerListe = r => [...r.mitglieder.values()].map(ws => ({ id:ws.id, name:ws.name, farbe:ws.farbe }));
function rundenListe() {
  return [...runden.values()].map(r => ({ code:r.code, spieler:spielerListe(r).map(s => s.name), voll:r.mitglieder.size >= MAX_SPIELER }));
}
// Wer in keiner Runde ist, sieht die offene Liste und bekommt Änderungen sofort
function listeVerteilen() {
  const s = JSON.stringify({ t:'liste', runden:rundenListe() });
  verbindungen.forEach(ws => { if (!ws.runde) sendenAn(ws, s); });
}
function rundeMelden(r) {
  const s = JSON.stringify({ t:'runde', code:r.code, spieler:spielerListe(r) });
  r.mitglieder.forEach(ws => sendenAn(ws, s));
}
function beitreten(ws, r) {
  if (ws.runde) verlassen(ws);
  if (r.mitglieder.size >= MAX_SPIELER) return sendenAn(ws, { t:'fehler', text:'Die Runde ist voll (höchstens ' + MAX_SPIELER + ' Spieler).' });
  // Farbe: der kleinste freie Platz in der Runde
  const belegt = new Set([...r.mitglieder.values()].map(m => m.farbe));
  ws.farbe = [0, 1, 2, 3].find(f => !belegt.has(f));
  r.mitglieder.set(ws.id, ws); ws.runde = r;
  rundeMelden(r); listeVerteilen();
}
function verlassen(ws) {
  const r = ws.runde; if (!r) return;
  r.mitglieder.delete(ws.id); ws.runde = null;
  if (!r.mitglieder.size) runden.delete(r.code); else rundeMelden(r);
  sendenAn(ws, { t:'runde', code:null, spieler:[] });
  listeVerteilen();
}
// Diese Nachrichten gehen an alle anderen in der Runde (z = Zustand, fx = Effekt)
const AN_ALLE = new Set(['z', 'fx']);
// Diese gehen an genau einen Mitspieler (Treffer auf seine Fische, Beute nehmen, Schaden …)
const AN_EINEN = new Set(['treffer', 'nehmen', 'gegeben', 'weg', 'aua']);

wss.on('connection', ws => {
  ws.id = crypto.randomBytes(6).toString('hex');
  ws.name = ''; ws.runde = null; ws.lebt = true;
  ws.marken = 80; ws.markenZeit = Date.now();   // höchstens ~40 Nachrichten pro Sekunde
  verbindungen.add(ws);
  sendenAn(ws, { t:'liste', runden:rundenListe() });
  ws.on('pong', () => { ws.lebt = true; });
  ws.on('message', roh => {
    const jetzt = Date.now();
    ws.marken = Math.min(80, ws.marken + (jetzt - ws.markenZeit) * .04); ws.markenZeit = jetzt;
    if (ws.marken < 1) return;
    ws.marken--;
    let m; try { m = JSON.parse(roh); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hallo') {
      const n = nameSauber(m.name);
      if (n.length < 2) return sendenAn(ws, { t:'fehler', text:'Der Name braucht mindestens 2 Zeichen.' });
      ws.name = n;
      sendenAn(ws, { t:'du', id:ws.id, name:n });
      return;
    }
    if (!ws.name) return;
    switch (m.t) {
      case 'neu': {
        const r = { code:neuerCode(), mitglieder:new Map() };
        runden.set(r.code, r); beitreten(ws, r);
        break;
      }
      case 'beitreten': {
        const r = runden.get(String(m.code || '').toUpperCase().trim());
        if (!r) sendenAn(ws, { t:'fehler', text:'Diese Runde gibt es nicht (mehr).' });
        else if (r !== ws.runde) beitreten(ws, r);
        break;
      }
      case 'verlassen': verlassen(ws); break;
      default: {
        const r = ws.runde; if (!r) return;
        m.von = ws.id;
        if (AN_ALLE.has(m.t)) {
          const s = JSON.stringify(m);
          r.mitglieder.forEach(x => { if (x !== ws) sendenAn(x, s); });
        } else if (AN_EINEN.has(m.t)) {
          const ziel = r.mitglieder.get(m.an);
          if (ziel && ziel !== ws) sendenAn(ziel, m);
        }
      }
    }
  });
  ws.on('close', () => { verbindungen.delete(ws); verlassen(ws); });
});
setInterval(() => {
  verbindungen.forEach(ws => { if (!ws.lebt) { ws.terminate(); return; } ws.lebt = false; try { ws.ping(); } catch (e) { /* weg */ } });
}, 25_000).unref();

server.listen(PORT, () => console.log('Fischfieber läuft auf http://localhost:' + PORT));
