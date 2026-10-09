'use strict';
// Fischfieber – Verbindung zum Server für das Spielen mit Freunden (WebSocket unter /ws).
// Hier steckt nur die Leitung: verbinden, Runden anlegen/beitreten, Nachrichten senden und verteilen.
// Was die Nachrichten im Spiel bedeuten, steht in spiel.js (Abschnitt „Mehrspieler“).
window.FF = window.FF || {};
FF.Netz = (() => {
  let ws = null, verbunden = false, wartet = null;
  const zustand = { ich:null, name:'', code:null, spieler:[], runden:[] };
  const hoerer = {};
  const melden = (t, m) => (hoerer[t] || []).forEach(f => f(m));

  function an(t, f) { (hoerer[t] = hoerer[t] || []).push(f); }
  function senden(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  // Baut die Verbindung auf (falls nötig). Gibt ein Promise zurück.
  function verbinden() {
    if (verbunden) return Promise.resolve();
    if (wartet) return wartet;
    wartet = new Promise((ok, fehler) => {
      let offen = false;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
      catch (e) { wartet = null; fehler(e); return; }
      ws.onopen = () => { offen = true; verbunden = true; wartet = null; ok(); };
      ws.onerror = () => { if (!offen) { wartet = null; fehler(new Error('keine Verbindung')); } };
      ws.onclose = () => {
        const warImRaum = !!zustand.code;
        ws = null; verbunden = false; wartet = null;
        zustand.ich = null; zustand.code = null; zustand.spieler = [];
        if (offen) melden('getrennt', { warImRaum });
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === 'du') { zustand.ich = m.id; zustand.name = m.name; }
        else if (m.t === 'liste') zustand.runden = m.runden;
        else if (m.t === 'runde') { zustand.code = m.code; zustand.spieler = m.spieler; }
        melden(m.t, m);
      };
    });
    return wartet;
  }
  function trennen() { if (ws) ws.close(); }

  return {
    an, senden, verbinden, trennen,
    hallo(name) { zustand.name = name; senden({ t:'hallo', name }); },
    neu() { senden({ t:'neu' }); },
    beitreten(code) { senden({ t:'beitreten', code }); },
    verlassen() { senden({ t:'verlassen' }); },
    get verbunden() { return verbunden; },
    get imRaum() { return verbunden && !!zustand.code; },
    get ich() { return zustand.ich; },
    get code() { return zustand.code; },
    get spieler() { return zustand.spieler; },
    get runden() { return zustand.runden; },
  };
})();
