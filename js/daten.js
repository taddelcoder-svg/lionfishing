'use strict';
// Fischfieber – Spieldaten: Fische, Ausrüstung, Inseln, Casino.
// Alles hier ist reine Tabelle; die Regeln stehen in spiel.js.
window.FF = window.FF || {};

/* ---------- Seltenheit ---------- */
FF.SELTEN = {
  1: { name:'Gewöhnlich',   farbe:'#cfd8dc' },
  2: { name:'Ungewöhnlich', farbe:'#7ee081' },
  3: { name:'Selten',       farbe:'#5bb6ff' },
  4: { name:'Episch',       farbe:'#c77dff' },
  5: { name:'Legendär',     farbe:'#ffc93c' },
  6: { name:'BOSS',         farbe:'#ff5a4e' },
};

/* ---------- Fische und andere Viecher ----------
   wert = Verkaufspreis, hp = Lebenspunkte an Land, gr = Größe (m), kraft = wie hart er an der Leine zieht,
   w = Häufigkeit, verh = Verhalten an Land, sch = Schaden, form/f1/f2 = Aussehen */
FF.FISCHE = {
  // Insel 1 – Schiffbruch-Insel
  sardine:     { name:'Sardine',      insel:1, wert:4,   hp:8,   gr:.35, kraft:1,   w:30, verh:'zappeln',     form:'fisch', f1:'#8fb3c9', f2:'#e8f1f5', s:1 },
  makrele:     { name:'Makrele',      insel:1, wert:9,   hp:16,  gr:.5,  kraft:1.5, w:22, verh:'zappeln',     form:'fisch', f1:'#2f7a8f', f2:'#d4e9ee', s:1, streifen:true },
  stiefel:     { name:'Alter Stiefel',insel:0, wert:1,   hp:1,   gr:.45, kraft:.6,  w:6,  verh:'muell',       form:'stiefel', f1:'#5b3a20', f2:'#3a2412', s:1 },
  krabbe:      { name:'Strandkrabbe', insel:1, wert:12,  hp:22,  gr:.42, kraft:1.5, w:14, verh:'krebs',  sch:6,  form:'krebs', f1:'#e2552f', f2:'#ffd0b5', s:1 },
  beissbarsch: { name:'Beißbarsch',   insel:1, wert:18,  hp:30,  gr:.6,  kraft:2,   w:11, verh:'beissen',sch:9,  form:'fisch', f1:'#5f8a33', f2:'#e3d97a', s:2, zaehne:true },
  kugelfisch:  { name:'Kugelfisch',   insel:1, wert:26,  hp:18,  gr:.5,  kraft:2,   w:8,  verh:'explodieren', sch:30, form:'kugel', f1:'#e9c45a', f2:'#fff3c4', s:2 },
  thunfisch:   { name:'Thunfisch',    insel:1, wert:48,  hp:70,  gr:1.0, kraft:3,   w:5,  verh:'zappeln',     form:'fisch', f1:'#24477a', f2:'#cdd8e3', s:3, stark:true },
  goldbrasse:  { name:'Goldbrasse',   insel:1, wert:140, hp:35,  gr:.6,  kraft:3,   w:1.2,verh:'zappeln',     form:'fisch', f1:'#ffcc33', f2:'#fff2b0', s:4, glanz:true },
  kugelkoenig: { name:'Kugelkönig',   insel:1, wert:0,   hp:650, gr:2.4, kraft:4,   w:0,  verh:'boss_kugel',  sch:14, form:'kugel', f1:'#e9b23a', f2:'#fff0b8', s:6, boss:true, krone:true, trophae:'krone' },

  // Insel 2 – Haifisch-Atoll
  rotbarsch:   { name:'Rotbarsch',    insel:2, wert:20,  hp:25,  gr:.55, kraft:2,   w:24, verh:'zappeln',     form:'fisch', f1:'#d8452b', f2:'#ffd9c9', s:1 },
  riesenkrabbe:{ name:'Riesenkrabbe', insel:2, wert:36,  hp:60,  gr:.8,  kraft:2.5, w:14, verh:'krebs',  sch:12, form:'krebs', f1:'#b0301c', f2:'#f7b08f', s:2 },
  zitteraal:   { name:'Zitteraal',    insel:2, wert:44,  hp:40,  gr:.9,  kraft:2.5, w:10, verh:'zitter', sch:7,  form:'aal',   f1:'#3d4d27', f2:'#e8e05e', s:2 },
  babyhai:     { name:'Baby-Hai',     insel:2, wert:58,  hp:70,  gr:.95, kraft:3,   w:10, verh:'beissen',sch:14, form:'hai',   f1:'#7a8896', f2:'#eef2f5', s:3 },
  krake:       { name:'Krake',        insel:2, wert:70,  hp:80,  gr:.85, kraft:3,   w:7,  verh:'beissen',sch:10, form:'krake', f1:'#a3468e', f2:'#f0b8e0', s:3 },
  schwertfisch:{ name:'Schwertfisch', insel:2, wert:85,  hp:90,  gr:1.3, kraft:3.5, w:6,  verh:'ramme',  sch:20, form:'schwert', f1:'#335b8c', f2:'#d6e2ef', s:3 },
  seeteufel:   { name:'Seeteufel',    insel:2, wert:170, hp:60,  gr:.8,  kraft:3.5, w:2,  verh:'beissen',sch:16, form:'fisch', f1:'#3a2f3d', f2:'#6b5a6e', s:4, laterne:true, zaehne:true },
  goldhai:     { name:'Goldener Hai', insel:2, wert:420, hp:120, gr:1.15,kraft:4,   w:.6, verh:'beissen',sch:18, form:'hai',   f1:'#ffcc33', f2:'#fff2b0', s:5, glanz:true },
  admiral:     { name:'Admiral Hammer',insel:2,wert:0,   hp:1300,gr:3.2, kraft:5,   w:0,  verh:'boss_hai',    sch:20, form:'hai',   f1:'#5d6b78', f2:'#e6ebef', s:6, boss:true, hammer:true, trophae:'hammer' },
};

/* ---------- Angeln ----------
   zug = Einholtempo (m/s), wurf = maximale Wurfweite, spann = wie schnell die Schnur spannt (kleiner = besser),
   kraft = bis zu welcher Fischkraft die Rute locker hält */
FF.RUTEN = [
  { id:'bambus',    name:'Bambusrute',    preis:0,    zug:2.4, wurf:22, spann:1.0,  kraft:2.5, farbe:'#c9a45c', text:'Krumm, aber treu.' },
  { id:'glasfaser', name:'Glasfaserrute', preis:250,  zug:3.1, wurf:28, spann:.8,   kraft:3.5, farbe:'#3f8fd6', text:'Holt schneller ein, wirft weiter.' },
  { id:'carbon',    name:'Carbonrute',    preis:900,  zug:3.9, wurf:34, spann:.65,  kraft:4.5, farbe:'#222831', text:'Für Haie und anderes Ärger-Gemüse.' },
  { id:'gold',      name:'Goldrute',      preis:3000, zug:4.9, wurf:40, spann:.5,   kraft:6,   farbe:'#ffcc33', text:'Protzig. Und verdammt gut.' },
];

/* ---------- Köder ----------
   biss = Faktor auf die Wartezeit, selten = Faktor auf seltene Fische */
FF.KOEDER = {
  wurm:    { name:'Wurm',          preis:0,   menge:Infinity, biss:1,   selten:1,   text:'Gratis und glitschig.' },
  garnele: { name:'Garnelen ×10',  preis:40,  menge:10, biss:.6,  selten:1.8, text:'Beißt schneller, lockt Bessere an.' },
  glitzer: { name:'Glitzerköder ×10', preis:160, menge:10, biss:.5, selten:4, text:'Seltene Fische können nicht widerstehen.' },
  koenig:  { name:'Königsköder',   preis:180, menge:1,  biss:.4,  insel:1, boss:'kugelkoenig', text:'Ruft den Kugelkönig. Viel Glück.' },
  admiral: { name:'Admiralsköder', preis:600, menge:1,  biss:.4,  insel:2, boss:'admiral',     text:'Ruft Admiral Hammer. Wirklich?' },
};

/* ---------- Waffen ---------- */
FF.WAFFEN = {
  paddel:  { name:'Paddel',     preis:0,    art:'nah',    sch:16, cd:.55, reich:2.7, stoss:6, text:'Vom Schiffbruch übrig.' },
  pistole: { name:'Pistole',    preis:120,  art:'schuss', sch:24, cd:.26, mag:8, nach:1.3, stoss:2.5, text:'8 Schuss. Klein, flink.' },
  flinte:  { name:'Schrotflinte', preis:450, art:'schrot', sch:10, kugeln:7, streu:.075, cd:.85, mag:2, nach:1.8, stoss:8, text:'Aus der Nähe brutal.' },
  harpune: { name:'Harpune',    preis:1200, art:'schuss', sch:90, cd:1.1, mag:1, nach:1.4, stoss:10, durch:true, text:'Durchbohrt alles in einer Reihe.' },
  tnt:     { name:'TNT ×3',     preis:90,   art:'wurf',   sch:140, radius:4.5, menge:3, text:'Werfen, wegrennen. Trifft auch dich!' },
};

/* ---------- Kühlbox und Kram ---------- */
FF.KUEHLBOX = [ { platz:6, preis:0 }, { platz:10, preis:150 }, { platz:16, preis:500 }, { platz:25, preis:1500 } ];
FF.VERBAND = { name:'Verbandskasten', preis:25, heil:60 };
// Westen fangen einen Teil des Schadens ab
FF.WESTEN = [ { name:'Keine Weste', schutz:0, preis:0 }, { name:'Rettungsweste', schutz:.2, preis:300 }, { name:'Panzerweste', schutz:.4, preis:1400 } ];

/* ---------- Inseln ---------- */
FF.INSELN = {
  1: { name:'Schiffbruch-Insel', radius:46, seed:1.7, sand:'#e8d6a0', gras:'#6dbb47', gras2:'#4f9a38', fels:'#8a8f94',
       wasser:'#2a8fd6', flach:'#3fd3df', tief:'#0b4a86', himmel:'#5fb2ef', horizont:'#d6efff', nebel:'#c9e8f8', sonne:'#fff1d6', hemi:'#e2f3ff', hemiBoden:'#8a7a55', sonneRichtung:[.5, .78, .3], palmen:30, felsen:14,
       quest:{ trophae:'krone', geld:200 } },
  2: { name:'Haifisch-Atoll',    radius:50, seed:4.2, sand:'#f4e2b2', gras:'#3fa66a', gras2:'#2e8754', fels:'#6c6a72',
       wasser:'#19b3c4', flach:'#5fe6d4', tief:'#0a4f73', himmel:'#e9875f', horizont:'#ffd9a8', nebel:'#f7cfa2', sonne:'#ffc27e', hemi:'#ffd6b0', hemiBoden:'#7a5a45', sonneRichtung:[.12, .2, 1], palmen:42, felsen:20,
       quest:{ trophae:'hammer', geld:1500 } },
};

FF.TROPHAEEN = {
  krone:  { name:'Krone des Kugelkönigs', icon:'👑', text:'Für Kapitän Kuddel – damit flickt er das Boot.' },
  hammer: { name:'Hammer des Admirals',   icon:'🔨', text:'Beweis, dass du das Atoll beherrschst.' },
  wal:    { name:'Goldener Wal-Pokal',    icon:'🐋', text:'Casino-Jackpot. Unverkäuflich. Unbezahlbar.' },
};

/* ---------- Casino ---------- */
// Glücksrad: Faktor auf den Einsatz (-1 = „Pleite“: du verlierst den Einsatz noch einmal)
FF.RAD = [0, 2, 0, 1.5, -1, 0, .5, 2, 0, 5, 0, 1.5];
FF.SLOT = [
  { s:'🐟', w:30, x:5 }, { s:'🦀', w:22, x:8 }, { s:'🐡', w:18, x:12 },
  { s:'⚓', w:14, x:20 }, { s:'💰', w:10, x:40 }, { s:'🐋', w:6, x:50, wal:true },
];
FF.SLOT_PAAR = 1.2;
