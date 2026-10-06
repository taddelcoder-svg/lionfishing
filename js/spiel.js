'use strict';
// Fischfieber – Spiellogik: Spieler, Angeln, Viecher, Waffen, Bosse, Shop, Casino, Speichern.
(() => {
const T = THREE, Welt = FF.Welt, M = FF.Modelle, Ton = FF.Ton;
const $ = id => document.getElementById(id);
const zufall = (a, b) => a + Math.random() * (b - a);
const klemm = (x, a, b) => Math.max(a, Math.min(b, x));
const istTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (istTouch) document.body.classList.add('touch');

/* ================= Spielstand ================= */
const SPEICHER = 'fischfieber.v1', EINST = 'fischfieber.einst';
function neuerStand() {
  return { geld:0, insel:1, ruten:['bambus'], waffen:['paddel'], tnt:0,
    koeder:{ garnele:0, glitzer:0, koenig:0, admiral:0 }, aktivKoeder:'wurm', kuehlbox:0, weste:0, kiste:[],
    trophaeen:[], quests:{}, fanglog:{}, hp:100, ende:false,
    stats:{ gefangen:0, verdient:0, casino:0, ohnmacht:0, bosse:0 } };
}
function lesen(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function schreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat */ } }
let S = lesen(SPEICHER);
const hatteStand = !!S;
S = Object.assign(neuerStand(), S || {});
S.koeder = Object.assign(neuerStand().koeder, S.koeder); S.stats = Object.assign(neuerStand().stats, S.stats);
const E = Object.assign({ ton:true, empf:1, grafik:istTouch ? 'niedrig' : 'hoch' }, lesen(EINST) || {});
Ton.setAn(E.ton);
let geaendert = false;
const merken = () => { geaendert = true; };
function speichern() { schreiben(SPEICHER, S); geaendert = false; }
setInterval(() => { if (geaendert) speichern(); }, 4000);
window.addEventListener('beforeunload', () => speichern());

const rute = () => FF.RUTEN.filter(r => S.ruten.includes(r.id)).pop();
const platz = () => FF.KUEHLBOX[S.kuehlbox].platz;

/* ================= Grafik ================= */
const cv = $('c');
const renderer = new T.WebGLRenderer({ canvas:cv, antialias:E.grafik === 'hoch', powerPreference:'high-performance' });
function grafikAnwenden() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, E.grafik === 'hoch' ? 1.75 : 1));
  renderer.shadowMap.enabled = E.grafik === 'hoch';
  renderer.setSize(innerWidth, innerHeight, false);
}
renderer.shadowMap.type = T.PCFSoftShadowMap;
grafikAnwenden();
const szene = new T.Scene();
const kamera = new T.PerspectiveCamera(72, innerWidth / innerHeight, .05, 900);
kamera.rotation.order = 'YXZ';
szene.add(kamera);
const hemi = new T.HemisphereLight('#ffffff', '#6b5a3a', .62); szene.add(hemi);
const sonne = new T.DirectionalLight('#fff4dc', .95);
sonne.castShadow = true; sonne.shadow.mapSize.set(2048, 2048);
Object.assign(sonne.shadow.camera, { left:-40, right:40, top:40, bottom:-40, near:1, far:160 });
sonne.shadow.bias = -.0006;
szene.add(sonne); szene.add(sonne.target);
addEventListener('resize', () => { kamera.aspect = innerWidth / innerHeight; kamera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

/* ================= Spieler ================= */
const P = { pos:new T.Vector3(), vel:new T.Vector3(), yaw:0, pitch:0, amBoden:true, slot:0, cd:0, nachladen:0, mag:{}, schwung:0, rueck:0, bob:0, wackeln:0, ruhe:0, unverw:0, imWasser:false };
const In = { vor:0, seit:0, sprint:false, springen:false, haupt:false, hauptNeu:false, hauptLos:false, stickX:0, stickY:0 };
const tasten = new Set();

let laeuft = false, panelOffen = false, zeit = 0;
let W = null;
const V = [];          // Viecher (lebend und erledigt)
const GESCHOSSE = [], TNTS = [], TEILCHEN = [], STRICHE = [], WELLEN = [], ZAHLEN = [];

/* ================= Angeln ================= */
const A = { zustand:'bereit', ladung:0, pose:M.pose(), vel:new T.Vector3(), timer:0, fisch:null, dist:0, spann:0, lauf:0, pause:2, richtung:new T.Vector3(), seite:new T.Vector3(), boss:false };
A.pose.visible = false; szene.add(A.pose);
const schnurGeo = new T.BufferGeometry().setFromPoints(Array.from({ length:16 }, () => new T.Vector3()));
const schnur = new T.Line(schnurGeo, new T.LineBasicMaterial({ color:'#ffffff', transparent:true, opacity:.85 }));
schnur.frustumCulled = false; schnur.visible = false; szene.add(schnur);

/* ================= Hand / Ausrüstung ================= */
let hand = null, handId = null;
const WAFFEN_REIHE = ['paddel', 'pistole', 'flinte', 'harpune'];
const ICON = { rute:'🎣', paddel:'🛶', pistole:'🔫', flinte:'💥', harpune:'🔱', tnt:'🧨' };
const NAME = { rute:'Angel', paddel:'Paddel', pistole:'Pistole', flinte:'Flinte', harpune:'Harpune', tnt:'TNT' };
function slots() {
  const s = ['rute', ...WAFFEN_REIHE.filter(w => S.waffen.includes(w))];
  if (S.tnt > 0) s.push('tnt');
  return s;
}
function slotWaehlen(i) {
  const s = slots(); i = ((i % s.length) + s.length) % s.length;
  if (P.slot !== i || handId !== s[i]) { angelAbbrechen(); P.slot = i; P.nachladen = 0; }
  handBauen(); hotbarZeichnen();
}
function handBauen() {
  const id = slots()[P.slot] || 'rute';
  if (hand && handId === id && !(id === 'rute' && hand.userData.rute !== rute().id)) return;
  if (hand) kamera.remove(hand);
  hand = M.inHand(id, rute()); hand.userData.rute = rute().id; handId = id;
  hand.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.depthTest = true; } o.castShadow = false; o.renderOrder = 10; });
  kamera.add(hand);
  const w = FF.WAFFEN[id];
  if (w && w.mag && P.mag[id] === undefined) P.mag[id] = w.mag;
}

/* ================= Meldungen & HUD ================= */
function meldung(text, farbe) {
  const d = document.createElement('div'); d.className = 'meldung'; d.innerHTML = text;
  if (farbe) d.style.color = farbe;
  const box = $('meldungen'); box.appendChild(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 450); }, 2600);
}
let ansageZeit = 0;
function ansage(text, unter = '', dauer = 2.6) {
  $('ansage').innerHTML = text + (unter ? `<small>${unter}</small>` : ''); $('ansage').style.opacity = 1; ansageZeit = dauer;
}
function zahl(pos, text, farbe = '#fff') {
  const d = document.createElement('div'); d.className = 'zahl'; d.textContent = text; d.style.color = farbe;
  $('zahlen').appendChild(d);
  ZAHLEN.push({ d, pos:pos.clone(), leben:.9 });
}
const htmlCache = {};
function setz(id, wert, art = 'textContent') { if (htmlCache[id + art] !== wert) { htmlCache[id + art] = wert; $(id)[art] = wert; } }
function hotbarZeichnen() {
  const s = slots();
  $('hotbar').innerHTML = s.map((id, i) => `<div class="slot${i === P.slot ? ' an' : ''}" data-i="${i}"><i>${i + 1}</i>${ICON[id]}<small>${id === 'tnt' ? 'TNT ×' + S.tnt : NAME[id]}</small></div>`).join('');
  for (const el of $('hotbar').children) el.onpointerdown = e => { e.stopPropagation(); slotWaehlen(+el.dataset.i); };
}
const geldText = n => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('de-DE') + ' $';
function hudAktualisieren() {
  setz('geld', geldText(S.geld));
  $('geld').classList.toggle('minus', S.geld < 0);
  setz('kiste', S.kiste.length + '/' + platz());
  $('hpBalken').style.width = klemm(S.hp, 0, 100) + '%';
  setz('inselName', FF.INSELN[S.insel].name);
  const id = slots()[P.slot], w = FF.WAFFEN[id];
  let mun = '';
  if (w && w.mag) mun = P.nachladen > 0 ? '↻' : (P.mag[id] ?? w.mag) + ' / ' + w.mag;
  if (id === 'tnt') mun = '🧨 ' + S.tnt;
  setz('munition', mun);
  const boss = V.find(v => v.typ.boss && !v.tot);
  $('bossbar').style.display = boss ? 'block' : 'none';
  if (boss) { setz('bossName', boss.typ.name); $('bossHp').style.width = (boss.hp / boss.max * 100) + '%'; }
}

/* ================= Teilchen & Effekte ================= */
const tGeo = new T.BoxGeometry(1, 1, 1), tMat = {};
const basis = f => tMat[f] || (tMat[f] = new T.MeshBasicMaterial({ color:f }));
function teilchen(pos, farbe, n, kraft = 3, gr = .08, leben = .7, schwer = 1) {
  for (let i = 0; i < n; i++) {
    const m = new T.Mesh(tGeo, basis(farbe)); m.scale.setScalar(gr * zufall(.6, 1.3)); m.position.copy(pos);
    szene.add(m);
    TEILCHEN.push({ m, v:new T.Vector3(zufall(-1, 1), zufall(.3, 1.4), zufall(-1, 1)).multiplyScalar(kraft), leben:leben * zufall(.6, 1.2), schwer });
  }
  while (TEILCHEN.length > 450) szene.remove(TEILCHEN.shift().m);
}
function platsch(pos, staerke = 1) {
  const p = pos.clone(); p.y = Welt.welle(p.x, p.z, zeit);
  teilchen(p, '#ffffff', Math.round(10 * staerke), 3 * staerke, .1, .7);
  teilchen(p, '#9fd8ff', Math.round(8 * staerke), 2.5 * staerke, .08, .6);
}
function strich(a, b, farbe = '#fff2a8') {
  const g = new T.BufferGeometry().setFromPoints([a, b]);
  const l = new T.Line(g, new T.LineBasicMaterial({ color:farbe })); szene.add(l);
  STRICHE.push({ l, leben:.07 });
}
function wackeln(s) { P.wackeln = Math.max(P.wackeln, s); }

/* ================= Eingabe ================= */
addEventListener('keydown', e => {
  if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
  tasten.add(e.code);
  if (!laeuft) {
    if (e.code === 'Escape' && panelOffen) fensterZu();
    return;
  }
  if (e.code === 'Space') { In.springen = true; e.preventDefault(); }
  if (e.code === 'KeyE') interagieren();
  if (e.code === 'KeyR') nachladen();
  if (e.code === 'KeyQ') angelAbbrechen(true);
  if (e.code === 'Tab') { e.preventDefault(); fanglog(); }
  if (/^Digit[1-9]$/.test(e.code)) slotWaehlen(+e.code.slice(5) - 1);
});
addEventListener('keyup', e => tasten.delete(e.code));
addEventListener('blur', () => { tasten.clear(); In.haupt = false; });
cv.addEventListener('mousedown', e => {
  if (istTouch) return;
  if (!laeuft) return;
  if (document.pointerLockElement !== cv) { sperren(); return; }
  if (e.button === 0) { In.haupt = true; In.hauptNeu = true; }
});
addEventListener('mouseup', e => { if (e.button === 0 && In.haupt) { In.haupt = false; In.hauptLos = true; } });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== cv || !laeuft) return;
  P.yaw -= e.movementX * .0022 * E.empf; P.pitch = klemm(P.pitch - e.movementY * .0022 * E.empf, -1.45, 1.45);
});
addEventListener('wheel', e => { if (laeuft) slotWaehlen(P.slot + Math.sign(e.deltaY)); }, { passive:true });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== cv && laeuft && !panelOffen && !istTouch) pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && laeuft) pause(); });

// Touch: links Stick, rechts umschauen, Knöpfe
if (istTouch) {
  $('touch').style.display = 'block';
  let stickId = null, stickX = 0, stickY = 0, blickId = null, bx = 0, by = 0;
  const stick = $('stick'), knopf = $('stick').firstElementChild;
  $('touch').addEventListener('pointerdown', e => {
    if (!laeuft) return;
    if (e.clientX < innerWidth * .45 && stickId === null) {
      stickId = e.pointerId; stickX = e.clientX; stickY = e.clientY;
      stick.style.display = 'block'; stick.style.left = stickX + 'px'; stick.style.top = stickY + 'px'; knopf.style.transform = 'translate(-50%,-50%)';
    } else if (blickId === null) { blickId = e.pointerId; bx = e.clientX; by = e.clientY; }
  });
  $('touch').addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickX, dy = e.clientY - stickY; const l = Math.hypot(dx, dy), max = 50;
      if (l > max) { dx *= max / l; dy *= max / l; }
      In.stickX = dx / max; In.stickY = -dy / max;
      knopf.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === blickId) {
      P.yaw -= (e.clientX - bx) * .006 * E.empf; P.pitch = klemm(P.pitch - (e.clientY - by) * .006 * E.empf, -1.45, 1.45);
      bx = e.clientX; by = e.clientY;
    }
  });
  const los = e => {
    if (e.pointerId === stickId) { stickId = null; In.stickX = In.stickY = 0; stick.style.display = 'none'; }
    if (e.pointerId === blickId) blickId = null;
  };
  $('touch').addEventListener('pointerup', los); $('touch').addEventListener('pointercancel', los);
  const knopfDruck = (id, runter, hoch) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.stopPropagation(); el.classList.add('an'); runter(); });
    const auf = e => { e.stopPropagation(); el.classList.remove('an'); if (hoch) hoch(); };
    el.addEventListener('pointerup', auf); el.addEventListener('pointercancel', auf); el.addEventListener('pointerleave', auf);
  };
  knopfDruck('tHaupt', () => { In.haupt = true; In.hauptNeu = true; Ton.start(); }, () => { if (In.haupt) { In.haupt = false; In.hauptLos = true; } });
  knopfDruck('tSprung', () => { In.springen = true; });
  knopfDruck('tAktion', () => interagieren());
  knopfDruck('tLaden', () => nachladen());
  knopfDruck('tPause', () => pause());
}

// Maus einfangen (gibt in neueren Browsern ein Promise zurück, das ohne Klick scheitert)
function sperren() { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* egal */ } }

/* ================= Spieler-Bewegung ================= */
function spielerUpdate(dt) {
  let vor = In.stickY, seit = In.stickX;
  if (tasten.has('KeyW') || tasten.has('ArrowUp')) vor += 1;
  if (tasten.has('KeyS') || tasten.has('ArrowDown')) vor -= 1;
  if (tasten.has('KeyD') || tasten.has('ArrowRight')) seit += 1;
  if (tasten.has('KeyA') || tasten.has('ArrowLeft')) seit -= 1;
  const sprint = tasten.has('ShiftLeft') || tasten.has('ShiftRight') || (istTouch && Math.hypot(In.stickX, In.stickY) > .95);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let wx = fx * vor + rx * seit, wz = fz * vor + rz * seit;
  const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
  const g = Welt.gelaende(P.pos.x, P.pos.z), b = Welt.boden(P.pos.x, P.pos.z);
  P.imWasser = b < -.2 && P.pos.y < .2;
  let tempo = sprint ? 8.4 : 5.2;
  if (P.imWasser) tempo *= .5;
  if (A.zustand === 'drill' || A.zustand === 'laden') tempo *= .45;
  const acc = P.amBoden ? 12 : 3;
  P.vel.x += (wx * tempo - P.vel.x) * Math.min(1, acc * dt);
  P.vel.z += (wz * tempo - P.vel.z) * Math.min(1, acc * dt);
  if (In.springen && P.amBoden) { P.vel.y = P.imWasser ? 4.5 : 7; P.amBoden = false; }
  In.springen = false;
  P.vel.y -= 20 * dt;

  const altX = P.pos.x, altZ = P.pos.z;
  P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
  for (const h of W.hindernisse) {
    const dx = P.pos.x - h.x, dz = P.pos.z - h.z, d = Math.hypot(dx, dz), min = h.r + .4;
    if (d < min && d > 1e-4) { P.pos.x = h.x + dx / d * min; P.pos.z = h.z + dz / d * min; }
  }
  // nicht ins tiefe Wasser, keine Wände hochlaufen
  const nb = Welt.boden(P.pos.x, P.pos.z);
  if ((Welt.gelaende(P.pos.x, P.pos.z) < -1.35 && nb < 0) || nb - P.pos.y > .75) { P.pos.x = altX; P.pos.z = altZ; }
  P.pos.y += P.vel.y * dt;
  const gb = Welt.boden(P.pos.x, P.pos.z);
  if (P.pos.y <= gb) { P.pos.y = gb; if (P.vel.y < -12) schaden(Math.round((-P.vel.y - 12) * 3), true); P.vel.y = 0; P.amBoden = true; }
  else P.amBoden = P.pos.y - gb < .06 && P.vel.y <= 0;
  if (P.amBoden && P.pos.y > gb) P.pos.y = gb;
  void g;

  const bewegt = Math.hypot(P.vel.x, P.vel.z);
  if (P.amBoden) P.bob += bewegt * dt * 1.6;
  P.ruhe += dt;
  if (P.ruhe > 5 && S.hp < 100) S.hp = Math.min(100, S.hp + dt * 1.5);
  P.unverw -= dt;
}
function kameraSetzen(dt) {
  P.wackeln = Math.max(0, P.wackeln - dt * 2.2);
  const w = P.wackeln * P.wackeln * .3;
  kamera.position.set(P.pos.x + zufall(-w, w), P.pos.y + 1.62 + Math.sin(P.bob * 2) * .05 + zufall(-w, w), P.pos.z + zufall(-w, w));
  kamera.rotation.set(P.pitch, P.yaw, 0);
  kamera.updateMatrixWorld(true);
  sonne.position.set(P.pos.x + 30, P.pos.y + 55, P.pos.z + 18); sonne.target.position.copy(P.pos);
}
const vorne = () => new T.Vector3(0, 0, -1).applyQuaternion(kamera.quaternion);

/* ================= Hand-Animation ================= */
function handUpdate(dt) {
  if (!hand) return;
  P.schwung = Math.max(0, P.schwung - dt * 3.2); P.rueck = Math.max(0, P.rueck - dt * 6);
  const bob = Math.hypot(P.vel.x, P.vel.z) > .5 && P.amBoden ? Math.sin(P.bob * 2) : 0;
  hand.position.set(.3 + bob * .012, -.3 + Math.abs(bob) * .012 - P.rueck * .03, -.5 + P.rueck * .12);
  hand.rotation.set(P.rueck * .25, 0, 0);
  if (handId === 'rute') {
    let rx = 0;
    if (A.zustand === 'laden') rx = A.ladung * .9;
    else if (A.zustand === 'flug') rx = -.3;
    else if (A.zustand === 'drill') rx = -.15 - A.spann * .35 + Math.sin(zeit * 30) * A.spann * .04;
    else if (A.zustand === 'biss') rx = Math.sin(zeit * 40) * .05;
    hand.rotation.x = rx;
    hand.userData.kurbel.rotation.x += (A.zustand === 'drill' && In.haupt ? 18 : 0) * dt;
  } else if (handId === 'paddel') {
    const s = Math.sin(Math.min(1, P.schwung) * Math.PI);
    hand.rotation.set(-s * 1.3, s * .6, s * .4);
  } else if (handId === 'tnt') {
    hand.rotation.x = -Math.sin(Math.min(1, P.schwung) * Math.PI) * 1.2;
  }
  if (P.nachladen > 0) hand.rotation.x = -.6 + Math.sin(zeit * 8) * .08;
}

/* ================= Angeln ================= */
function angelAbbrechen(manuell) {
  if (A.zustand === 'drill' && manuell) meldung('Leine gekappt. Fisch weg.');
  A.zustand = 'bereit'; A.pose.visible = false; schnur.visible = false; A.fisch = null; A.ladung = 0;
}
function bissZeit() { return Math.max(1, zufall(3, 8) * FF.KOEDER[S.aktivKoeder].biss); }
function waehleFisch(entf) {
  const k = FF.KOEDER[S.aktivKoeder];
  if (k.boss && k.insel === S.insel && S.koeder[S.aktivKoeder] > 0 && !V.some(v => v.typ.boss && !v.tot)) return k.boss;
  const sel = (k.selten || 1) * (entf > 24 ? 1.3 : 1) * (1 + FF.RUTEN.indexOf(rute()) * .15);
  const liste = Object.entries(FF.FISCHE).filter(([, f]) => f.w > 0 && (f.insel === S.insel || f.insel === 0));
  const gw = liste.map(([, f]) => f.w * (f.s >= 3 ? sel : 1) * (f.s >= 4 ? sel * .5 : 1));
  let r = Math.random() * gw.reduce((a, b) => a + b, 0);
  for (let i = 0; i < liste.length; i++) if ((r -= gw[i]) <= 0) return liste[i][0];
  return liste[0][0];
}
function angelUpdate(dt) {
  const ru = rute();
  if (handId !== 'rute') { if (A.zustand !== 'bereit') angelAbbrechen(); return; }
  const spitze = new T.Vector3(); hand.userData.spitze.getWorldPosition(spitze);
  switch (A.zustand) {
    case 'bereit':
      if (In.hauptNeu) { A.zustand = 'laden'; A.ladung = 0; }
      break;
    case 'laden':
      A.ladung = Math.min(1, A.ladung + dt / 1.1);
      if (!In.haupt) {
        const weite = 4 + A.ladung * (ru.wurf - 4), g = 14;
        const v = Math.sqrt(weite * g);
        const f = vorne(); f.y = Math.max(f.y, -.2) + .7; f.normalize();
        A.pose.position.copy(spitze); A.vel.copy(f).multiplyScalar(v);
        A.pose.visible = true; schnur.visible = true; A.zustand = 'flug';
        Ton.wurf();
      }
      break;
    case 'flug': {
      A.vel.y -= 14 * dt; A.pose.position.addScaledVector(A.vel, dt);
      const p = A.pose.position, gel = Welt.gelaende(p.x, p.z), bod = Welt.boden(p.x, p.z);
      if (bod > gel && p.y <= bod + .05) { A.zustand = 'land'; p.y = bod + .05; meldung('Auf dem Steg gelandet.'); break; }
      if (gel > -.25 && p.y <= gel + .05) { A.zustand = 'land'; p.y = gel + .05; meldung('Daneben – das ist Land! Klicken zum Einholen.'); break; }
      if (gel <= -.25 && p.y <= Welt.welle(p.x, p.z, zeit)) {
        A.zustand = 'warten'; A.timer = bissZeit(); platsch(p, .6); Ton.platsch(.6);
      }
      if (In.hauptNeu) angelAbbrechen();
      break;
    }
    case 'warten': {
      const p = A.pose.position; p.y = Welt.welle(p.x, p.z, zeit) - .02;
      A.timer -= dt;
      if (Math.random() < dt * .8) teilchen(p, '#cfefff', 1, .6, .05, .5);
      if (A.timer <= 0) { A.zustand = 'biss'; A.timer = .9; Ton.biss(); platsch(p, .5); }
      if (In.hauptNeu) angelAbbrechen();
      break;
    }
    case 'biss': {
      const p = A.pose.position; p.y = Welt.welle(p.x, p.z, zeit) - .22 + Math.sin(zeit * 40) * .05;
      A.timer -= dt;
      if (In.hauptNeu) {
        const flach = new T.Vector3(p.x - P.pos.x, 0, p.z - P.pos.z);
        A.dist = flach.length(); A.richtung.copy(flach.normalize()); A.seite.set(-A.richtung.z, 0, A.richtung.x);
        A.fisch = waehleFisch(A.dist);
        const typ = FF.FISCHE[A.fisch];
        const k = FF.KOEDER[S.aktivKoeder];
        if (k.menge !== Infinity && (!k.boss || typ.boss)) {
          S.koeder[S.aktivKoeder]--;
          if (S.koeder[S.aktivKoeder] <= 0) { S.koeder[S.aktivKoeder] = 0; meldung(k.name.replace(/ ×\d+/, '') + ' aufgebraucht – zurück zum Wurm.'); S.aktivKoeder = 'wurm'; }
          merken();
        }
        A.boss = !!typ.boss; A.spann = .1; A.lauf = 0; A.pause = zufall(.8, 2);
        A.zustand = 'drill'; platsch(p, 1); Ton.platsch(.8);
        if (typ.boss) { ansage('⚠ ETWAS RIESIGES ⚠', 'Das ist kein normaler Fisch …'); wackeln(1); }
      } else if (A.timer <= 0) { meldung('Zu langsam – der Fisch hat den Köder geklaut!'); A.zustand = 'warten'; A.timer = bissZeit(); }
      break;
    }
    case 'drill': {
      const typ = FF.FISCHE[A.fisch];
      const ueber = typ.kraft > ru.kraft ? 1 + (typ.kraft - ru.kraft) * .55 : 1;
      if (A.lauf > 0) { A.lauf -= dt; if (A.lauf <= 0) A.pause = zufall(1.4, 3.2) / Math.sqrt(typ.kraft); }
      else { A.pause -= dt; if (A.pause <= 0) A.lauf = zufall(.7, 1.5) * (typ.boss ? 1.4 : 1); }
      const zieht = A.lauf > 0;
      if (In.haupt) {
        A.dist -= ru.zug * dt * (zieht ? .3 : 1);
        A.spann += (.1 + .08 * typ.kraft) * (zieht ? 3 : 1) * ru.spann * ueber * dt;
      } else {
        A.spann -= .55 * dt;
        A.dist += (zieht ? typ.kraft * .9 : .25) * dt;
      }
      A.spann = Math.max(0, A.spann);
      const p = A.pose.position;
      const wackel = Math.sin(zeit * (zieht ? 7 : 2.5)) * Math.min(A.dist * .15, 2.2);
      p.set(P.pos.x + A.richtung.x * A.dist + A.seite.x * wackel, 0, P.pos.z + A.richtung.z * A.dist + A.seite.z * wackel);
      p.y = Welt.welle(p.x, p.z, zeit) - (zieht ? .15 : .05);
      if (zieht && Math.random() < dt * 14) teilchen(p, '#ffffff', 2, 2, .08, .5);
      if (A.spann >= 1) { Ton.reissen(); meldung('💥 Schnur gerissen! ' + (typ.boss ? 'Der Boss ist weg.' : ''), '#ff8a80'); angelAbbrechen(); break; }
      if (A.dist > ru.wurf + 10) { meldung('Er ist entkommen …'); angelAbbrechen(); break; }
      if (A.dist < 2.3 || Welt.gelaende(p.x, p.z) > -.15) rausziehen();
      break;
    }
    case 'land':
      if (In.hauptNeu) angelAbbrechen();
      break;
  }
  // Schnur zeichnen
  if (schnur.visible) {
    const ziel = A.pose.position, pkt = schnurGeo.attributes.position;
    const d = spitze.distanceTo(ziel), durchhang = A.zustand === 'drill' ? d * .02 * (1 - A.spann) : d * .08;
    for (let i = 0; i < 16; i++) {
      const s = i / 15;
      pkt.setXYZ(i, spitze.x + (ziel.x - spitze.x) * s, spitze.y + (ziel.y - spitze.y) * s - Math.sin(s * Math.PI) * durchhang, spitze.z + (ziel.z - spitze.z) * s);
    }
    pkt.needsUpdate = true;
  }
}
// Der große Moment: Fisch fliegt aus dem Wasser an Land
function rausziehen() {
  const id = A.fisch, typ = FF.FISCHE[id];
  const start = A.pose.position.clone(); start.y = Math.max(.4, Welt.boden(start.x, start.z) + typ.gr * .5 + .3);
  // landeinwärts hinter/neben den Spieler – so hat man kurz Zeit, bevor er zurück zum Wasser zappelt
  const land = zumWasser(P.pos).multiplyScalar(-1);
  const ziel = P.pos.clone().addScaledVector(land, typ.boss ? 8 : 3.5);
  ziel.y = Welt.boden(ziel.x, ziel.z);
  if (ziel.y < -.2) { ziel.copy(P.pos); ziel.y = Welt.boden(ziel.x, ziel.z); }
  const flug = typ.boss ? 1.3 : .85, g = 20;
  const vel = new T.Vector3((ziel.x - start.x) / flug, 0, (ziel.z - start.z) / flug);
  vel.y = (ziel.y + typ.gr * .5 - start.y + .5 * g * flug * flug) / flug;
  viehSpawnen(id, start, vel);
  platsch(start, typ.boss ? 3 : 1.4); Ton.platsch(1.3); wackeln(typ.boss ? 1.2 : .45);
  const sl = FF.SELTEN[typ.s];
  meldung(`${typ.boss ? '👑' : '🎣'} <b style="color:${sl.farbe}">${typ.name}</b> <span style="opacity:.7">(${sl.name})</span>`);
  if (!S.fanglog[id]) S.fanglog[id] = 0;
  if (typ.boss) ansage(typ.name.toUpperCase() + '!', 'Mach ihn fertig!', 3);
  angelAbbrechen();
  merken();
}

/* ================= Viecher ================= */
const AUFRECHT = { krebs:1, krake:1, stiefel:1, kugel:1 };
function viehSpawnen(id, pos, vel) {
  const typ = FF.FISCHE[id];
  const m = M.fisch(typ);
  const sk = typ.gr * (typ.form === 'kugel' ? 1.25 : 1);
  m.scale.setScalar(sk); m.rotation.order = 'YXZ';
  szene.add(m);
  const v = { id, typ, m, sk, pos:pos.clone(), vel:vel.clone(), r:typ.gr * .5, hp:typ.hp, max:typ.hp, tot:false, flug:true, amBoden:false,
    t:0, hop:zufall(.2, .6), cd:1, cd2:4, cd3:8, rammen:0, auf:0, treffer:0, rollSeite:Math.random() < .5 ? 1 : -1, spin:0, gieren:Math.atan2(-vel.z, vel.x), leben:240 };
  V.push(v);
  return v;
}
function viehWeg(v) { const i = V.indexOf(v); if (i < 0) return; szene.remove(v.m); V.splice(i, 1); }
function zumWasser(p) { const d = new T.Vector3(p.x, 0, p.z); return d.lengthSq() < 1e-4 ? d.set(1, 0, 0) : d.normalize(); }
function zumSpieler(v) { const d = new T.Vector3(P.pos.x - v.pos.x, 0, P.pos.z - v.pos.z); const l = d.length(); return { d:l > 1e-4 ? d.divideScalar(l) : d, l }; }

function viehUpdate(v, dt) {
  v.t += dt; v.treffer = Math.max(0, v.treffer - dt * 4);
  const typ = v.typ;
  // Physik
  v.vel.y -= 20 * dt;
  v.pos.addScaledVector(v.vel, dt);
  for (const h of W.hindernisse) {
    const dx = v.pos.x - h.x, dz = v.pos.z - h.z, d = Math.hypot(dx, dz), min = h.r + v.r * .8;
    if (d < min && d > 1e-4) { v.pos.x = h.x + dx / d * min; v.pos.z = h.z + dz / d * min; }
  }
  const gb = Welt.boden(v.pos.x, v.pos.z);
  if (v.pos.y - v.r <= gb) {
    v.pos.y = gb + v.r;
    if (v.vel.y < -3) v.vel.y = -v.vel.y * .3; else v.vel.y = 0;
    if (!v.amBoden && v.flug && !v.tot) { v.flug = false; teilchen(v.pos, '#e8d6a0', 6, 2, .07, .5); if (typ.verh === 'muell') sterben(v, true); }
    v.amBoden = true;
    const reib = Math.exp(-(v.tot ? 8 : (typ.verh === 'krebs' ? 0 : 5)) * dt);
    v.vel.x *= reib; v.vel.z *= reib;
  } else v.amBoden = false;

  if (v.tot) {
    v.leben -= dt;
    if (v.leben <= 0) { viehWeg(v); return; }
    v.m.position.set(v.pos.x, v.pos.y + Math.sin(zeit * 3 + v.t) * .05 + (AUFRECHT[typ.form] && typ.form !== 'kugel' ? -v.r : 0), v.pos.z);
    v.m.rotation.set(Math.PI * .5 * v.rollSeite + (typ.form === 'kugel' ? Math.PI * .5 : 0), v.gieren + zeit * .5, 0);
    if (Math.random() < dt * 2) teilchen(v.pos.clone().add(new T.Vector3(0, v.r, 0)), typ.boss ? '#ffcc33' : '#fff7c0', 1, .5, .05, .6, -.2);
    const d = Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z);
    if (d < 1.7 + v.r && Math.abs(P.pos.y - v.pos.y) < 2.5) einsammeln(v);
    return;
  }
  // Ins Wasser zurückgeflutscht?
  if (!v.flug && !typ.boss && gb < -.35) {
    platsch(v.pos, .8); Ton.platsch(.5); meldung(`🌊 ${typ.name} ist zurück ins Wasser entwischt!`, '#9fd8ff'); viehWeg(v); return;
  }
  if (typ.boss && gb < .3) { const z = zumWasser(v.pos).multiplyScalar(-8 * dt); v.vel.x += z.x * 10; v.vel.z += z.z * 10; }

  const sp = zumSpieler(v);
  v.cd -= dt; v.cd2 -= dt; v.cd3 -= dt;
  const nah = sp.l < v.r + .75 && Math.abs(P.pos.y + .8 - v.pos.y) < 1.6;
  if (v.amBoden && !v.flug) {
    v.hop -= dt;
    const huepf = (richtung, weite, hoehe, takt) => {
      if (v.hop > 0) return;
      v.hop = takt * zufall(.75, 1.25);
      v.vel.x = richtung.x * weite; v.vel.z = richtung.z * weite; v.vel.y = hoehe;
      v.spin = zufall(-8, 8); if (Math.random() < .5) v.rollSeite *= -1;
    };
    const wasserJitter = () => { const d = zumWasser(v.pos); d.x += zufall(-1, 1); d.z += zufall(-1, 1); return d.normalize(); };
    switch (typ.verh) {
      case 'zappeln': huepf(wasserJitter(), typ.stark ? 2 : zufall(1, 1.8), typ.stark ? 6 : zufall(3, 5), typ.stark ? .6 : .85); break;
      case 'beissen':
        huepf(sp.l < 15 ? sp.d : wasserJitter(), 3.8, 3.8, .7);
        if (nah && v.cd <= 0) { schaden(typ.sch); v.cd = 1; stoss(sp.d, 4); }
        break;
      case 'krebs':
        if (sp.l < 18) { v.vel.x = sp.d.x * 2.3; v.vel.z = sp.d.z * 2.3; } else huepf(wasserJitter(), 1.5, 1.5, 1);
        if (nah && v.cd <= 0) { schaden(typ.sch); v.cd = 1.2; }
        break;
      case 'explodieren':
        huepf(wasserJitter(), 1.4, 3, .9);
        break;
      case 'zitter':
        huepf(wasserJitter(), 1.3, 2.2, 1.1);
        if (sp.l < 2.8 && v.cd <= 0) { v.cd = 1.3; Ton.zap(); teilchen(v.pos, '#8fe8ff', 14, 4, .06, .3, 0); schaden(typ.sch); }
        break;
      case 'ramme':
        if (v.cd <= 0 && sp.l < 16) { v.cd = 2.6; v.rammen = .7; v.vel.set(sp.d.x * 12, 2.5, sp.d.z * 12); v.spin = 0; }
        else huepf(sp.d, 1.2, 2.5, .9);
        break;
      case 'boss_kugel':
        if (v.cd2 <= 0) { v.cd2 = 5.5; stachelregen(v); }
        if (v.cd3 <= 0) { v.cd3 = 11; v.auf = 1; ansage('', 'Er bläst sich auf – SPRING!', 1.4); }
        huepf(sp.d, 5, 6.5, 1.5);
        break;
      case 'boss_hai':
        if (v.cd3 <= 0) { v.cd3 = 16; for (let i = 0; i < 2; i++) viehSpawnen(Math.random() < .5 ? 'riesenkrabbe' : 'krabbe', v.pos.clone().add(new T.Vector3(zufall(-3, 3), 2, zufall(-3, 3))), new T.Vector3(zufall(-3, 3), 6, zufall(-3, 3))).flug = false; meldung('🦀 Der Admiral ruft Verstärkung!'); }
        if (v.cd <= 0 && sp.l < 25 && v.rammen <= 0) { v.cd = 4; v.anlauf = 1.1; v.spin = 0; meldung('⚠ Der Admiral nimmt Anlauf – zur Seite!', '#ffb3ad'); }
        if (v.anlauf > 0) {
          v.anlauf -= dt; v.gieren = Math.atan2(-sp.d.z, sp.d.x);
          if (v.anlauf <= 0) { v.rammen = .8; v.vel.set(sp.d.x * 15, 3, sp.d.z * 15); Ton.hieb(); }
        } else if (v.rammen <= 0) huepf(sp.d, 2, 3, 1.1);
        if (sp.l < v.r + 1.6 && v.cd2 <= 0) { v.cd2 = 2.2; schaden(8); stoss(sp.d, 9); }
        break;
    }
  }
  // Rammen trifft
  if (v.rammen > 0) {
    v.rammen -= dt;
    if (sp.l < v.r + 1 && Math.abs(P.pos.y + .8 - v.pos.y) < 2) { schaden(typ.sch); stoss(sp.d, 10); v.rammen = 0; v.vel.x *= -.4; v.vel.z *= -.4; v.cd2 = Math.max(v.cd2, 1.5); }
  }
  // Kugelfisch bläst sich auf und platzt
  if (typ.verh === 'explodieren') {
    v.auf += dt;
    const s = 1 + v.auf / 6 * .9 + (v.auf > 4 ? Math.sin(zeit * 30) * .08 : 0);
    v.m.scale.setScalar(v.sk * s);
    if (v.auf >= 6) { explosion(v.pos.clone(), 3.6, typ.sch, v); viehWeg(v); return; }
  }
  // Boss-Kugel: Druckwelle
  if (typ.verh === 'boss_kugel' && v.auf > 0) {
    v.auf -= dt;
    v.m.scale.setScalar(v.sk * (1 + (1 - Math.max(0, v.auf)) * .35));
    if (v.auf <= 0) { druckwelle(v.pos.clone(), 11, 22); v.m.scale.setScalar(v.sk); }
  }
  if (typ.boss && nah && v.cd <= 0 && typ.verh === 'boss_kugel') { schaden(typ.sch); v.cd = 1; stoss(sp.d, 8); }

  // Aussehen
  if (v.vel.x * v.vel.x + v.vel.z * v.vel.z > .3 && !(v.anlauf > 0)) v.gieren = Math.atan2(-v.vel.z, v.vel.x);
  if (typ.form === 'krebs' && sp.l < 18) v.gieren = Math.atan2(-sp.d.z, sp.d.x);
  const yOff = AUFRECHT[typ.form] && typ.form !== 'kugel' ? -v.r : 0;
  v.m.position.set(v.pos.x, v.pos.y + yOff, v.pos.z);
  let roll = 0, nick = 0;
  if (AUFRECHT[typ.form]) roll = Math.sin(v.t * 12) * .08;
  else if (typ.boss) roll = Math.sin(v.t * 3) * .1;
  else if (v.amBoden) roll = v.rollSeite * Math.PI * .45 + Math.sin(v.t * 22) * .25;
  else { v.rollSeite += 0; roll = v.rollSeite * Math.PI * .45 + v.t * v.spin; }
  if (v.anlauf > 0) roll = Math.sin(zeit * 40) * .15;
  if (typ.form === 'krebs') v.m.rotation.set(0, v.gieren + Math.PI / 2 + Math.sin(v.t * 18) * .1, roll * .5);
  else v.m.rotation.set(roll, v.gieren, nick);
  if (v.treffer > 0 && typ.verh !== 'explodieren' && !(typ.verh === 'boss_kugel' && v.auf > 0)) v.m.scale.setScalar(v.sk * (1 + v.treffer * .2));
  else if (typ.verh !== 'explodieren' && !(typ.verh === 'boss_kugel' && v.auf > 0)) v.m.scale.setScalar(v.sk);
}
function stoss(richtung, kraft) { P.vel.x += richtung.x * kraft; P.vel.z += richtung.z * kraft; P.vel.y = Math.max(P.vel.y, 3); P.amBoden = false; }

function viehSchaden(v, n, richtung, kraft) {
  if (v.tot) return;
  v.hp -= n; v.treffer = 1;
  zahl(v.pos.clone().add(new T.Vector3(0, v.r + .3, 0)), Math.round(n), v.typ.boss ? '#ffb3ad' : '#fff');
  teilchen(v.pos, v.typ.f1, 5, 2.5, .06, .4);
  if (richtung) { const k = (kraft || 3) / (v.typ.boss ? 6 : 1); v.vel.x += richtung.x * k; v.vel.z += richtung.z * k; v.vel.y += k * .5; }
  Ton.treffer();
  if (v.hp <= 0) sterben(v);
}
function sterben(v, still) {
  v.tot = true; v.hp = 0; v.flug = false;
  if (!still) { teilchen(v.pos, '#ffffff', 10, 3, .08, .6); teilchen(v.pos, v.typ.f1, 10, 3.5, .1, .7); }
  if (v.typ.boss) {
    S.stats.bosse++; Ton.sieg(); ansage('BOSS BESIEGT!', `${v.typ.name} ist erledigt – sammel die Trophäe ein!`, 4); wackeln(1); merken();
  }
}
function einsammeln(v) {
  const typ = v.typ;
  if (typ.trophae) {
    if (!S.trophaeen.includes(typ.trophae)) S.trophaeen.push(typ.trophae);
    const tr = FF.TROPHAEEN[typ.trophae];
    meldung(`${tr.icon} <b>${tr.name}</b> eingesammelt!`, '#ffcc33'); Ton.kasse();
    S.fanglog[v.id] = (S.fanglog[v.id] || 0) + 1;
    viehWeg(v); merken(); return;
  }
  if (S.kiste.length >= platz()) {
    if (!v.vollGemeldet || zeit - v.vollGemeldet > 4) { v.vollGemeldet = zeit; meldung('🧊 Kühlbox voll! Erst bei Hein verkaufen.', '#ffb3ad'); }
    return;
  }
  S.kiste.push(v.id); S.fanglog[v.id] = (S.fanglog[v.id] || 0) + 1; S.stats.gefangen++;
  meldung(`+ ${typ.name} <span class="preis">${typ.wert} $</span>`); Ton.klick();
  viehWeg(v); merken();
}

/* ================= Boss-Angriffe ================= */
function stachelregen(v) {
  const n = 14, versatz = Math.random() * Math.PI;
  // Höhe so wählen, dass die Stacheln beim Spieler auf Kopfhöhe ankommen (auch am Hang)
  const ab = Math.max(2, Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z));
  const steig = klemm((P.pos.y + 1.2 - v.pos.y) / ab + ab * .012, -.6, .6);
  for (let i = 0; i < n; i++) {
    const a = versatz + i / n * Math.PI * 2, d = new T.Vector3(Math.cos(a), steig, Math.sin(a)).normalize();
    const m = M.stachel(); m.position.copy(v.pos); m.lookAt(v.pos.clone().add(d)); szene.add(m);
    GESCHOSSE.push({ m, pos:v.pos.clone(), vel:d.multiplyScalar(11), leben:2.2, sch:10 });
  }
  Ton.harpune();
}
function druckwelle(pos, radius, sch) {
  const m = new T.Mesh(new T.RingGeometry(.8, 1.2, 40), new T.MeshBasicMaterial({ color:'#ffe9a8', transparent:true, opacity:.85, side:T.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, Welt.boden(pos.x, pos.z) + .15, pos.z); szene.add(m);
  WELLEN.push({ m, pos, r:1, max:radius, sch, getroffen:false });
  Ton.explosion(); wackeln(.8);
}
function explosion(pos, radius, sch, quelle) {
  teilchen(pos, '#ffb347', 24, 7, .16, .6); teilchen(pos, '#ff5a1f', 16, 5, .14, .5); teilchen(pos, '#555555', 14, 3, .25, 1.1, -.3);
  Ton.explosion(); wackeln(Math.max(0, 1.2 - P.pos.distanceTo(pos) / 20));
  for (const v of V.slice()) {
    if (v === quelle || v.tot) continue;
    const d = v.pos.distanceTo(pos);
    if (d < radius + v.r) { const r = new T.Vector3(v.pos.x - pos.x, 0, v.pos.z - pos.z).normalize(); viehSchaden(v, sch * (1 - d / (radius + v.r) * .55), r, 9); }
  }
  const dp = P.pos.clone().setY(P.pos.y + .8).distanceTo(pos);
  if (dp < radius) { schaden(Math.round(sch * .4 * (1 - dp / radius) + 6)); stoss(new T.Vector3(P.pos.x - pos.x, 0, P.pos.z - pos.z).normalize(), 9); }
}

/* ================= Waffen ================= */
function strahlKugel(o, d, c, r) {
  const lx = c.x - o.x, ly = c.y - o.y, lz = c.z - o.z, tca = lx * d.x + ly * d.y + lz * d.z;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}
function einschlag(o, d, max) {
  for (let s = .5; s < max; s += .5) {
    const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
    const g = Welt.boden(x, z);
    if (y <= Math.max(g, 0)) {
      const p = new T.Vector3(x, Math.max(g, 0), z);
      if (g < 0) platsch(p, .35); else teilchen(p, '#d9c08a', 4, 1.5, .05, .4);
      return p;
    }
  }
  return null;
}
function schuss(dir, waffe, schadenProKugel) {
  const o = kamera.position.clone();
  const treffer = [];
  for (const v of V) {
    if (v.tot) continue;
    const t = strahlKugel(o, dir, v.pos, v.r * 1.2 + .1);
    if (t !== null && t < 60) treffer.push({ v, t });
  }
  treffer.sort((a, b) => a.t - b.t);
  const muend = new T.Vector3(); (hand.userData.muendung || hand).getWorldPosition(muend);
  let ende;
  if (treffer.length) {
    const liste = waffe.durch ? treffer : [treffer[0]];
    for (const h of liste) viehSchaden(h.v, schadenProKugel, new T.Vector3(dir.x, 0, dir.z).normalize(), waffe.stoss);
    ende = o.clone().addScaledVector(dir, liste[liste.length - 1].t);
  } else ende = einschlag(o, dir, 60) || o.clone().addScaledVector(dir, 60);
  strich(muend, ende, waffe.durch ? '#ffffff' : '#fff2a8');
}
function waffeUpdate(dt) {
  const id = handId, w = FF.WAFFEN[id];
  P.cd -= dt;
  if (P.nachladen > 0) {
    P.nachladen -= dt;
    if (P.nachladen <= 0) { P.mag[id] = w.mag; Ton.nachladen(); }
    return;
  }
  if (!w || !In.hauptNeu || P.cd > 0) return;
  if (w.art === 'nah') {
    P.cd = w.cd; P.schwung = 1; Ton.hieb();
    const o = kamera.position, f = vorne();
    let getroffen = 0;
    for (const v of V.slice().sort((a, b) => a.pos.distanceTo(o) - b.pos.distanceTo(o))) {
      if (v.tot || getroffen >= 2) continue;
      const zu = v.pos.clone().sub(o), d = zu.length();
      if (d < w.reich + v.r && zu.normalize().dot(f) > .55) { viehSchaden(v, w.sch, new T.Vector3(f.x, 0, f.z).normalize(), w.stoss); getroffen++; }
    }
    if (!getroffen) einschlag(o, f, w.reich);
  } else if (w.art === 'schuss' || w.art === 'schrot') {
    if ((P.mag[id] ?? w.mag) <= 0) { nachladen(); return; }
    P.mag[id] = (P.mag[id] ?? w.mag) - 1; P.cd = w.cd; P.rueck = 1;
    const f = vorne();
    if (w.art === 'schrot') {
      for (let i = 0; i < w.kugeln; i++) {
        const d = f.clone().add(new T.Vector3(zufall(-w.streu, w.streu), zufall(-w.streu, w.streu), zufall(-w.streu, w.streu))).normalize();
        schuss(d, w, w.sch);
      }
      Ton.flinte(); wackeln(.35);
    } else { schuss(f, w, w.sch); id === 'harpune' ? Ton.harpune() : Ton.schuss(); wackeln(id === 'harpune' ? .3 : .12); }
    const m = new T.Vector3(); (hand.userData.muendung || hand).getWorldPosition(m);
    teilchen(m, '#ffe066', 4, 1.2, .05, .12, 0);
    if (P.mag[id] <= 0) setTimeout(() => { if (handId === id && P.mag[id] <= 0) nachladen(); }, 250);
  } else if (w.art === 'wurf') {
    if (S.tnt <= 0) return;
    S.tnt--; P.cd = .6; P.schwung = 1; merken();
    const f = vorne(), m = M.tntStange();
    const pos = kamera.position.clone().addScaledVector(f, .6);
    m.position.copy(pos); szene.add(m);
    TNTS.push({ m, pos, vel:f.clone().multiplyScalar(13).add(new T.Vector3(P.vel.x * .5, 3.5, P.vel.z * .5)), zuender:2.2, dreh:zufall(-10, 10) });
    Ton.wurf();
    if (S.tnt <= 0) setTimeout(() => { if (handId === 'tnt') slotWaehlen(0); else hotbarZeichnen(); }, 300);
    else hotbarZeichnen();
  }
}
function nachladen() {
  const w = FF.WAFFEN[handId];
  if (!w || !w.mag || P.nachladen > 0 || (P.mag[handId] ?? w.mag) >= w.mag) return;
  P.nachladen = w.nach; Ton.klick();
}

/* ================= Projektile, Wellen, Effekte ================= */
function effekteUpdate(dt) {
  for (let i = GESCHOSSE.length - 1; i >= 0; i--) {
    const g = GESCHOSSE[i];
    g.leben -= dt; g.vel.y -= 3 * dt; g.pos.addScaledVector(g.vel, dt); g.m.position.copy(g.pos);
    const kopf = P.pos.clone(); kopf.y += .9;
    let weg = g.leben <= 0 || g.pos.y < Welt.boden(g.pos.x, g.pos.z);
    if (!weg && g.pos.distanceTo(kopf) < .9) { schaden(g.sch); weg = true; }
    if (weg) { szene.remove(g.m); GESCHOSSE.splice(i, 1); }
  }
  for (let i = WELLEN.length - 1; i >= 0; i--) {
    const w = WELLEN[i];
    w.r += dt * 13; w.m.scale.setScalar(w.r); w.m.material.opacity = .85 * (1 - w.r / w.max);
    const d = Math.hypot(P.pos.x - w.pos.x, P.pos.z - w.pos.z);
    if (!w.getroffen && Math.abs(d - w.r) < 1 && P.pos.y - Welt.boden(P.pos.x, P.pos.z) < .5) {
      w.getroffen = true; schaden(w.sch); stoss(new T.Vector3(P.pos.x - w.pos.x, 0, P.pos.z - w.pos.z).normalize(), 9);
    }
    if (w.r >= w.max) { szene.remove(w.m); w.m.geometry.dispose(); WELLEN.splice(i, 1); }
  }
  for (let i = TNTS.length - 1; i >= 0; i--) {
    const t = TNTS[i];
    t.zuender -= dt; t.vel.y -= 20 * dt; t.pos.addScaledVector(t.vel, dt);
    const g = Welt.boden(t.pos.x, t.pos.z);
    if (t.pos.y < g + .06) { t.pos.y = g + .06; t.vel.y = Math.abs(t.vel.y) * .35; t.vel.x *= .6; t.vel.z *= .6; t.dreh *= .6; }
    if (g < -.3 && t.pos.y < .1) { t.vel.multiplyScalar(.9); }
    t.m.position.copy(t.pos); t.m.rotation.x += t.dreh * dt; t.m.rotation.z += t.dreh * .7 * dt;
    t.m.userData.funke.visible = Math.sin(zeit * 30) > 0;
    if (Math.random() < dt * 20) teilchen(t.pos.clone().add(new T.Vector3(0, .2, 0)), '#ffcc33', 1, .8, .03, .25, 0);
    if (t.zuender <= 0) { szene.remove(t.m); TNTS.splice(i, 1); if (g < -.3) platsch(t.pos, 3); explosion(t.pos.clone(), FF.WAFFEN.tnt.radius, FF.WAFFEN.tnt.sch, null); }
  }
  for (let i = TEILCHEN.length - 1; i >= 0; i--) {
    const p = TEILCHEN[i];
    p.leben -= dt; p.v.y -= 12 * p.schwer * dt; p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4;
    if (p.leben <= 0) { szene.remove(p.m); TEILCHEN.splice(i, 1); }
  }
  for (let i = STRICHE.length - 1; i >= 0; i--) {
    const s = STRICHE[i]; s.leben -= dt;
    if (s.leben <= 0) { szene.remove(s.l); s.l.geometry.dispose(); s.l.material.dispose(); STRICHE.splice(i, 1); }
  }
  const v = new T.Vector3();
  for (let i = ZAHLEN.length - 1; i >= 0; i--) {
    const z = ZAHLEN[i]; z.leben -= dt; z.pos.y += dt * 1.2;
    v.copy(z.pos).project(kamera);
    if (z.leben <= 0 || v.z > 1) { z.d.remove(); ZAHLEN.splice(i, 1); continue; }
    z.d.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; z.d.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; z.d.style.opacity = Math.min(1, z.leben * 2.5);
  }
}

/* ================= Schaden am Spieler ================= */
let auaZeit = 0;
function schaden(n, sturz) {
  if (P.unverw > 0 || !laeuft) return;
  n *= 1 - FF.WESTEN[S.weste || 0].schutz;
  S.hp -= n; P.ruhe = 0; auaZeit = .35; Ton.aua(); wackeln(.5);
  if (!sturz) zahl(kamera.position.clone().addScaledVector(vorne(), 1.2).add(new T.Vector3(0, -.3, 0)), '−' + Math.round(n), '#ff6b5e');
  if (S.hp <= 0) ohnmacht();
}
function ohnmacht() {
  S.stats.ohnmacht++;
  const verloren = S.kiste.length;
  S.kiste = []; S.hp = 100;
  for (const v of V.slice()) viehWeg(v);
  angelAbbrechen();
  spawnen();
  P.unverw = 2;
  ansage('Ohnmächtig!', verloren ? `Hein hat dich zum Feuer geschleppt. Deine ${verloren} Fische sind weg.` : 'Hein hat dich zum Feuer geschleppt.', 3.5);
  Ton.pech(); merken();
}
function spawnen() {
  P.pos.copy(W.spawn); P.pos.y = Welt.boden(P.pos.x, P.pos.z); P.vel.set(0, 0, 0);
  const z = W.stegEnde; P.yaw = Math.atan2(-(z.x - P.pos.x), -(z.z - P.pos.z)); P.pitch = -.05;
}

/* ================= Interaktion ================= */
let naechsteStation = null;
function stationSuchen() {
  naechsteStation = null; let best = 3.4;
  for (const s of W.stationen) {
    const d = Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z);
    if (d < best) { best = d; naechsteStation = s; }
  }
  if (naechsteStation) {
    setz('hinweis', istTouch ? `<b>E</b> ${naechsteStation.text}` : `<b>[E]</b> ${naechsteStation.text}`, 'innerHTML');
    $('hinweis').style.display = 'block'; if (istTouch) $('tAktion').style.display = 'flex';
  } else { $('hinweis').style.display = 'none'; if (istTouch) $('tAktion').style.display = 'none'; }
}
function interagieren() {
  if (!naechsteStation || !laeuft) return;
  Ton.klick();
  ({ shop:shopOeffnen, casino:casinoOeffnen, kuddel:kuddelOeffnen, feuer:feuerOeffnen })[naechsteStation.art]();
}

/* ================= Fenster ================= */
function fensterAuf(html) {
  panelOffen = true; laeuft = false; In.haupt = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('fensterInhalt').innerHTML = html; $('fenster').style.display = 'flex';
  hudAktualisieren();
  $('touch').style.pointerEvents = 'none';
}
function fensterZu() {
  $('fenster').style.display = 'none'; panelOffen = false;
  if (fensterZu.zurueck) { const z = fensterZu.zurueck; fensterZu.zurueck = null; z(); return; }
  weiter();
}
function kopf(titel, unter) { return `<div class="kopf"><div><h2>${titel}</h2>${unter ? `<p class="unter">${unter}</p>` : ''}</div><button class="zu" data-zu>✕</button></div>`; }
function knoepfeVerbinden(handler = {}) {
  for (const el of $('fensterInhalt').querySelectorAll('[data-zu]')) el.onclick = () => { Ton.klick(); fensterZu(); };
  for (const el of $('fensterInhalt').querySelectorAll('[data-a]')) el.onclick = () => { Ton.klick(); handler[el.dataset.a] && handler[el.dataset.a](el.dataset.w, el); };
}

/* ---------- Hein: Shop ---------- */
let shopTab = 'verkauf';
function shopOeffnen(tab) {
  if (tab) shopTab = tab;
  const tabs = [['verkauf', 'Verkaufen'], ['ruten', 'Angeln'], ['koeder', 'Köder'], ['waffen', 'Waffen'], ['kram', 'Ausrüstung']];
  let inhalt = '';
  const zeile = (icon, name, text, rechts) => `<div class="zeile"><div class="icon">${icon}</div><div class="mitte"><b>${name}</b><span>${text}</span></div>${rechts}</div>`;
  const kauf = (preis, a, w, besitz, label) => besitz ? `<button disabled>${besitz}</button>` : `<span class="preis">${geldText(preis)}</span><button data-a="${a}" data-w="${w}" ${S.geld < preis ? 'disabled' : ''}>${label || 'Kaufen'}</button>`;
  if (shopTab === 'verkauf') {
    const gruppen = {};
    for (const id of S.kiste) gruppen[id] = (gruppen[id] || 0) + 1;
    const summe = S.kiste.reduce((a, id) => a + FF.FISCHE[id].wert, 0);
    inhalt = Object.keys(gruppen).length
      ? Object.entries(gruppen).map(([id, n]) => { const f = FF.FISCHE[id]; return zeile(fischIcon(f), `${f.name} ×${n}`, `<span style="color:${FF.SELTEN[f.s].farbe}">${FF.SELTEN[f.s].name}</span> · je ${f.wert} $`, `<span class="preis">${geldText(f.wert * n)}</span>`); }).join('')
        + `<div class="summe"><span>Zusammen</span><span class="preis">${geldText(summe)}</span></div><div class="knoepfe" style="margin-top:10px"><button class="gruen" data-a="verkaufen" style="flex:1;font-size:20px">Alles verkaufen</button></div>`
      : `<div class="rede"><b>Hein:</b> „Deine Kühlbox ist leer, Jung. Raus mit dir, Fische fangen! Die Viecher an Land musst du erst erledigen, bevor sie zurück ins Wasser zappeln.“</div>`;
  } else if (shopTab === 'ruten') {
    inhalt = FF.RUTEN.map(r => zeile('🎣', r.name, `${r.text} · Einholen ${r.zug} m/s · Wurf ${r.wurf} m · hält Kraft ${r.kraft}`, kauf(r.preis, 'rute', r.id, S.ruten.includes(r.id) && (r === rute() ? 'Im Einsatz' : 'Besitzt')))).join('');
  } else if (shopTab === 'koeder') {
    inhalt = Object.entries(FF.KOEDER).filter(([, k]) => !k.insel || k.insel === S.insel).map(([id, k]) => {
      const anz = id === 'wurm' ? '∞' : S.koeder[id];
      const aktiv = S.aktivKoeder === id;
      const rechts = (id === 'wurm' ? '' : kauf(k.preis, 'koeder', id)) + (aktiv ? '<button disabled>Am Haken</button>' : `<button class="zweit" data-a="anhaken" data-w="${id}" ${id !== 'wurm' && !S.koeder[id] ? 'disabled' : ''}>Anhaken</button>`);
      return zeile(k.boss ? '👑' : id === 'wurm' ? '🪱' : id === 'garnele' ? '🦐' : '✨', `${k.name} <span style="opacity:.6">(${anz})</span>`, k.text, rechts);
    }).join('');
  } else if (shopTab === 'waffen') {
    inhalt = Object.entries(FF.WAFFEN).map(([id, w]) => {
      const info = w.art === 'nah' ? `Nahkampf · ${w.sch} Schaden` : w.art === 'wurf' ? `${w.sch} Schaden im Umkreis · du hast ${S.tnt}` : `${w.art === 'schrot' ? w.kugeln + '×' : ''}${w.sch} Schaden · ${w.mag} Schuss`;
      return zeile(ICON[id], w.name, `${w.text} · ${info}`, kauf(w.preis, 'waffe', id, id !== 'tnt' && S.waffen.includes(id) && 'Besitzt'));
    }).join('');
  } else {
    const nk = FF.KUEHLBOX[S.kuehlbox + 1];
    inhalt = zeile('🧊', `Kühlbox (${platz()} Plätze)`, nk ? `Größere Kühlbox: ${nk.platz} Plätze` : 'Größer geht nicht.', nk ? kauf(nk.preis, 'kuehlbox', '') : '<button disabled>Maximum</button>')
      + (FF.WESTEN[S.weste + 1] ? zeile('🦺', FF.WESTEN[S.weste + 1].name, `Fängt ${FF.WESTEN[S.weste + 1].schutz * 100} % des Schadens ab${S.weste ? ' (jetzt: ' + FF.WESTEN[S.weste].schutz * 100 + ' %)' : ''}`, kauf(FF.WESTEN[S.weste + 1].preis, 'weste', '')) : zeile('🦺', FF.WESTEN[S.weste].name, `Fängt ${FF.WESTEN[S.weste].schutz * 100} % des Schadens ab`, '<button disabled>Maximum</button>'))
      + zeile('🩹', FF.VERBAND.name, `Heilt ${FF.VERBAND.heil} Lebenspunkte sofort · du hast ${Math.round(S.hp)}/100`, kauf(FF.VERBAND.preis, 'verband', '', S.hp >= 100 && 'Gesund'));
  }
  fensterAuf(kopf('Heins Angelbedarf', `Geld: <b style="color:${S.geld < 0 ? 'var(--rot)' : 'var(--gelb)'}">${geldText(S.geld)}</b> · Kühlbox ${S.kiste.length}/${platz()}`)
    + `<div class="tabs">${tabs.map(([id, n]) => `<button class="${id === shopTab ? 'an' : ''}" data-a="tab" data-w="${id}">${n}</button>`).join('')}</div>` + inhalt);
  knoepfeVerbinden({
    tab:w => shopOeffnen(w),
    verkaufen:() => {
      const summe = S.kiste.reduce((a, id) => a + FF.FISCHE[id].wert, 0);
      S.geld += summe; S.stats.verdient += summe; S.kiste = []; Ton.kasse(); merken();
      meldung(`💰 Verkauft für ${geldText(summe)}`, '#ffcc33'); shopOeffnen();
    },
    rute:id => { const r = FF.RUTEN.find(x => x.id === id); if (S.geld < r.preis) return; S.geld -= r.preis; S.ruten.push(id); Ton.kasse(); merken(); handBauen(); shopOeffnen(); },
    koeder:id => { const k = FF.KOEDER[id]; if (S.geld < k.preis) return; S.geld -= k.preis; S.koeder[id] += k.menge; if (S.aktivKoeder === 'wurm') S.aktivKoeder = id; Ton.kasse(); merken(); shopOeffnen(); },
    anhaken:id => { S.aktivKoeder = id; merken(); shopOeffnen(); },
    waffe:id => {
      const w = FF.WAFFEN[id]; if (S.geld < w.preis) return; S.geld -= w.preis;
      if (id === 'tnt') S.tnt += w.menge; else { S.waffen.push(id); P.mag[id] = w.mag; }
      Ton.kasse(); merken(); hotbarZeichnen(); shopOeffnen();
    },
    kuehlbox:() => { const nk = FF.KUEHLBOX[S.kuehlbox + 1]; if (!nk || S.geld < nk.preis) return; S.geld -= nk.preis; S.kuehlbox++; Ton.kasse(); merken(); shopOeffnen(); },
    weste:() => { const w = FF.WESTEN[S.weste + 1]; if (!w || S.geld < w.preis) return; S.geld -= w.preis; S.weste++; Ton.kasse(); merken(); shopOeffnen(); },
    verband:() => { if (S.geld < FF.VERBAND.preis) return; S.geld -= FF.VERBAND.preis; S.hp = Math.min(100, S.hp + FF.VERBAND.heil); Ton.kasse(); merken(); shopOeffnen(); },
  });
}
function fischIcon(f) { return { fisch:'🐟', kugel:'🐡', krebs:'🦀', hai:'🦈', krake:'🐙', aal:'🐍', schwert:'🗡️', stiefel:'👢' }[f.form] || '🐟'; }

/* ---------- Möwe Mona: Casino ---------- */
let einsatz = 10, radWinkel = 0, dreht = false;
function casinoOeffnen() {
  const stufen = [10, 50, 100, 500, 1000];
  fensterAuf(kopf('Möwen-Casino', `„Kraah! Das Haus gewinnt fast nie, Schätzchen.“ · Geld: <b style="color:${S.geld < 0 ? 'var(--rot)' : 'var(--gelb)'}" id="casGeld">${geldText(S.geld)}</b>`)
    + `<div class="einsatz">Einsatz: ${stufen.map(s => `<button class="${s === einsatz ? 'an' : ''}" data-a="einsatz" data-w="${s}">${s} $</button>`).join('')}</div>
    <div class="casino">
      <div><h3>🎡 Glücksrad</h3><canvas id="radCv" width="300" height="300"></canvas><br><button data-a="rad">Drehen</button></div>
      <div><h3>🎰 Fischautomat</h3><div class="walzen"><div class="walze">🐟</div><div class="walze">🦀</div><div class="walze">🐡</div></div>
        <span style="font-size:13px;opacity:.75">3 gleiche: 🐟×5 🦀×8 🐡×12 ⚓×20 💰×40 🐋 Jackpot · 2 gleiche: ×1,2</span><br><br><button data-a="slot">Hebel ziehen</button></div>
    </div>
    <div id="casinoErgebnis"></div>
    <p style="font-size:13px;opacity:.6;text-align:center">Achtung: Das Feld „PLEITE“ kostet dich den Einsatz doppelt – auch ins Minus.</p>`);
  radZeichnen();
  knoepfeVerbinden({
    einsatz:w => { if (dreht) return; einsatz = +w; casinoOeffnen(); },
    rad:() => radDrehen(),
    slot:() => slotDrehen(),
  });
}
function casGeldZeigen() { hudAktualisieren(); const el = $('casGeld'); if (el) { el.textContent = geldText(S.geld); el.style.color = S.geld < 0 ? 'var(--rot)' : 'var(--gelb)'; } }
function darfSetzen() {
  if (dreht) return false;
  if (S.geld < einsatz) { $('casinoErgebnis').innerHTML = '<span style="color:var(--rot)">Zu wenig Geld für den Einsatz!</span>'; return false; }
  return true;
}
function radZeichnen() {
  const c = $('radCv'); if (!c) return;
  const g = c.getContext('2d'), n = FF.RAD.length, r = 140;
  g.clearRect(0, 0, 300, 300);
  g.save(); g.translate(150, 150); g.rotate(radWinkel);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, x = FF.RAD[i];
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a0, a1); g.closePath();
    g.fillStyle = x < 0 ? '#111' : x === 0 ? (i % 2 ? '#7a1a1a' : '#a82424') : x >= 5 ? '#ffcc33' : x >= 2 ? '#2a9d8f' : '#2f6f9e'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    g.save(); g.rotate((a0 + a1) / 2); g.fillStyle = x >= 5 ? '#000' : '#fff'; g.font = '800 20px Barlow, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(x < 0 ? 'PLEITE' : '×' + String(x).replace('.', ','), r - 10, 0); g.restore();
  }
  g.restore();
  g.fillStyle = '#ffcc33'; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(150, 26); g.lineTo(137, 2); g.lineTo(163, 2); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.arc(150, 150, 14, 0, 7); g.fillStyle = '#fff'; g.fill();
}
function radDrehen() {
  if (!darfSetzen()) return;
  dreht = true; S.geld -= einsatz; casGeldZeigen();
  const n = FF.RAD.length, ziel = Math.floor(Math.random() * n);
  // Zeiger oben (-90°): Segmentmitte des Ziels muss dort landen
  const mitte = (ziel + .5) / n * Math.PI * 2;
  const start = radWinkel, ende = start + Math.PI * 2 * 5 + ((-Math.PI / 2 - mitte - start) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
  const t0 = performance.now(), dauer = 3200; let letzterTick = 0;
  const schritt = now => {
    const k = Math.min(1, (now - t0) / dauer), e = 1 - Math.pow(1 - k, 3);
    radWinkel = start + (ende - start) * e; radZeichnen();
    const tick = Math.floor(radWinkel / (Math.PI * 2 / n)); if (tick !== letzterTick) { letzterTick = tick; Ton.klick(); }
    if (k < 1 && $('radCv')) return requestAnimationFrame(schritt);
    radWinkel = ende % (Math.PI * 2);
    const x = FF.RAD[ziel];
    const gewinn = x < 0 ? -einsatz : Math.round(einsatz * x);
    S.geld += gewinn; S.stats.casino += gewinn - einsatz; dreht = false; merken();
    const el = $('casinoErgebnis');
    if (el) el.innerHTML = x < 0 ? `<span style="color:var(--rot)">💀 PLEITE! Noch mal −${einsatz} $</span>` : x === 0 ? '<span style="color:#ff8a80">Nix. Mona kichert.</span>' : `<span style="color:var(--gelb)">×${String(x).replace('.', ',')} → +${geldText(gewinn)}</span>`;
    x >= 2 ? Ton.sieg() : x <= 0 ? Ton.pech() : Ton.kasse();
    casGeldZeigen();
  };
  requestAnimationFrame(schritt);
}
function slotDrehen() {
  if (!darfSetzen()) return;
  dreht = true; S.geld -= einsatz; casGeldZeigen();
  const ziehe = () => { let r = Math.random() * FF.SLOT.reduce((a, s) => a + s.w, 0); for (const s of FF.SLOT) if ((r -= s.w) <= 0) return s; return FF.SLOT[0]; };
  const erg = [ziehe(), ziehe(), ziehe()];
  const walzen = [...document.querySelectorAll('.walze')];
  let n = 0;
  const iv = setInterval(() => {
    n++;
    walzen.forEach((w, i) => { if (n < 10 + i * 6) w.textContent = FF.SLOT[Math.floor(Math.random() * FF.SLOT.length)].s; else w.textContent = erg[i].s; });
    Ton.klick();
    if (n >= 22) {
      clearInterval(iv); dreht = false;
      let gewinn = 0, text;
      if (erg[0] === erg[1] && erg[1] === erg[2]) {
        gewinn = einsatz * erg[0].x;
        if (erg[0].wal) {
          if (!S.trophaeen.includes('wal')) S.trophaeen.push('wal');
          text = `🐋 JACKPOT! +${geldText(gewinn)} und der <b>Goldene Wal-Pokal</b>!`;
        } else text = `Drei ${erg[0].s}! +${geldText(gewinn)}`;
        Ton.sieg();
      } else if (erg[0] === erg[1] || erg[1] === erg[2] || erg[0] === erg[2]) { gewinn = Math.round(einsatz * FF.SLOT_PAAR); text = `Zwei gleiche: +${geldText(gewinn)}`; Ton.kasse(); }
      else { text = '<span style="color:#ff8a80">Nichts. Kraah!</span>'; Ton.pech(); }
      S.geld += gewinn; S.stats.casino += gewinn - einsatz; merken();
      const el = $('casinoErgebnis'); if (el) el.innerHTML = `<span style="color:var(--gelb)">${text}</span>`;
      casGeldZeigen();
    }
  }, 70);
}

/* ---------- Kapitän Kuddel ---------- */
function kuddelOeffnen() {
  const insel = S.insel, q = FF.INSELN[insel].quest, tr = FF.TROPHAEEN[q.trophae];
  const fertig = !!S.quests[insel], hatTr = S.trophaeen.includes(q.trophae), hatGeld = S.geld >= q.geld;
  let rede, knoepfe = '';
  if (insel === 1 && !fertig) {
    rede = `„Moin! Na, Kopf noch dicke von gestern? Unser Kahn hat 'n Loch so groß wie Heins Bauch. Um das zu flicken, brauch ich <b>${q.geld} $</b> für Material – und die <b>${tr.icon} ${tr.name}</b>. Die trägt der Kugelkönig, der fette Kerl da draußen. Hol dir bei Hein den <b>Königsköder</b>, wirf ihn aus und gib ihm Saures. Aber zieh dir erst 'ne vernünftige Waffe!“`;
    knoepfe = `<button class="gruen" data-a="quest" ${hatTr && hatGeld ? '' : 'disabled'}>Krone + ${q.geld} $ geben</button>`;
  } else if (insel === 1) {
    rede = '„Der Kahn ist dicht! Wohin soll’s gehen? Auf dem Haifisch-Atoll gibt’s dickere Fische – und dickere Probleme.“';
    knoepfe = '<button class="gruen" data-a="reise" data-w="2">⛵ Zum Haifisch-Atoll</button>';
  } else if (!fertig) {
    rede = `„Fast zuhause, Jung! Für die Heimfahrt übers offene Meer brauchen wir Sprit für <b>${q.geld} $</b>. Und hier draußen lässt dich keiner durch, solange <b>Admiral Hammer</b> das Atoll beherrscht. Bring mir seinen <b>${tr.icon} ${tr.name.replace(' des Admirals', '')}</b>! Den Admiralsköder hat Hein – und kauf dir bei ihm ’ne Weste, der Kerl rammt wie ’n Frachter.“`;
    knoepfe = `<button class="gruen" data-a="quest" ${hatTr && hatGeld ? '' : 'disabled'}>Hammer + ${q.geld} $ geben</button><button class="zweit" data-a="reise" data-w="1">⛵ Zurück zur Schiffbruch-Insel</button>`;
  } else {
    rede = '„Wir haben’s geschafft, du alter Seebär! Du kannst trotzdem weiter angeln – hier gibt’s noch Goldhaie. Oder willst du zurück zur ersten Insel?“';
    knoepfe = '<button class="zweit" data-a="reise" data-w="1">⛵ Zur Schiffbruch-Insel</button><button data-a="ende">🏆 Abspann ansehen</button>';
  }
  const fehlt = !fertig ? `<p style="opacity:.8">${hatTr ? '✅' : '❌'} ${tr.icon} ${tr.name} &nbsp; ${hatGeld ? '✅' : '❌'} ${q.geld} $ (du hast ${geldText(S.geld)})</p>` : '';
  fensterAuf(kopf('Kapitän Kuddel', FF.INSELN[insel].name) + `<div class="rede"><b>Kuddel:</b> ${rede}</div>${fehlt}<div class="knoepfe">${knoepfe}</div>`);
  knoepfeVerbinden({
    quest:() => {
      if (!hatTr || !hatGeld) return;
      S.geld -= q.geld; S.quests[insel] = true; merken(); Ton.sieg();
      if (insel === 1) { fensterZu.zurueck = () => { reisen(1, true); }; fensterAuf(kopf('Das Boot ist geflickt!') + '<div class="rede"><b>Kuddel:</b> „Hammerkrone! Ich hab den Kahn an den Steg gelegt. Sag Bescheid, wenn du ablegen willst – das Haifisch-Atoll wartet.“</div><div class="knoepfe"><button data-zu>Weiter</button></div>'); knoepfeVerbinden(); }
      else ende();
    },
    reise:w => reisen(+w),
    ende:() => ende(),
  });
}
function reisen(nach, nurNeuBauen) {
  $('fenster').style.display = 'none'; panelOffen = false;
  $('schwarz').style.opacity = 1;
  setTimeout(() => {
    S.insel = nach; merken();
    for (const v of V.slice()) viehWeg(v);
    angelAbbrechen();
    W = Welt.bauen(szene, S.insel, S);
    sonne.color.set(FF.INSELN[S.insel].sonne);
    spawnen(); hotbarZeichnen();
    $('schwarz').style.opacity = 0;
    if (!nurNeuBauen) ansage(FF.INSELN[S.insel].name, S.insel === 2 ? 'Neue Fische, mehr Geld, mehr Ärger.' : 'Willkommen zurück.', 3);
    weiter();
  }, 900);
}
function ende() {
  S.ende = true; merken(); Ton.sieg();
  const st = S.stats;
  fensterAuf(`<div style="text-align:center"><h2 style="font-size:46px">🏆 HEIMKEHR!</h2>
    <div class="rede">Nach Schiffbruch, Kugelkönig, Casino-Schulden und einem Hammerhai mit Hut tuckert ihr endlich Richtung Heimat. Kapitän Kuddel weint ein bisschen. Hein hat sich als blinder Passagier eingeschlichen.</div>
    <div class="gitter" style="text-align:center">
      <div class="karte"><div class="gross">🎣</div><b>${st.gefangen}</b><span>Fische eingesammelt</span></div>
      <div class="karte"><div class="gross">💰</div><b>${geldText(st.verdient)}</b><span>verdient</span></div>
      <div class="karte"><div class="gross">🎰</div><b>${geldText(st.casino)}</b><span>Casino-Bilanz</span></div>
      <div class="karte"><div class="gross">😵</div><b>${st.ohnmacht}</b><span>mal ohnmächtig</span></div>
    </div><br><button class="gruen" data-zu style="font-size:20px">Weiterangeln</button></div>`);
  knoepfeVerbinden();
}

/* ---------- Lagerfeuer ---------- */
function feuerOeffnen() {
  fensterAuf(kopf('Lagerfeuer', 'Knistert gemütlich.') + `<div class="rede">Hier kannst du dich ausruhen: volle Lebenspunkte, und dein Spiel wird gespeichert.</div>
    <div class="knoepfe"><button class="gruen" data-a="ruhe">😴 Ausruhen</button><button class="zweit" data-a="log">📖 Fanglog</button></div>`);
  knoepfeVerbinden({ ruhe:() => { S.hp = 100; speichern(); meldung('Ausgeruht und gespeichert. ❤️'); fensterZu(); }, log:() => { fensterZu.zurueck = feuerOeffnen; fanglog(); } });
}

/* ---------- Fanglog ---------- */
function fanglog() {
  const zurueck = fensterZu.zurueck; fensterZu.zurueck = null;
  const ids = Object.keys(FF.FISCHE);
  const bekannt = ids.filter(id => S.fanglog[id] !== undefined).length;
  const karten = ids.map(id => {
    const f = FF.FISCHE[id], n = S.fanglog[id];
    if (n === undefined) return `<div class="karte unbekannt"><div class="gross">❔</div><b>???</b><span>${f.insel ? FF.INSELN[f.insel].name : 'überall'}</span></div>`;
    return `<div class="karte" style="border-color:${FF.SELTEN[f.s].farbe}55"><div class="gross">${f.boss ? '👑' : fischIcon(f)}</div><b>${f.name}</b><span style="color:${FF.SELTEN[f.s].farbe}">${FF.SELTEN[f.s].name}</span><br><span>${f.boss ? 'Trophäe' : f.wert + ' $'} · ${n ? n + '× gefangen' : 'gesehen'}</span></div>`;
  }).join('');
  const tr = S.trophaeen.length ? S.trophaeen.map(t => `${FF.TROPHAEEN[t].icon} ${FF.TROPHAEEN[t].name}`).join(' · ') : 'noch keine';
  fensterAuf(kopf('Fanglog', `${bekannt} von ${ids.length} entdeckt · Trophäen: ${tr}`) + `<div class="gitter">${karten}</div>`);
  fensterZu.zurueck = zurueck || null;
  knoepfeVerbinden();
}

/* ================= Menü / Pause ================= */
function menue(art) {
  laeuft = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('menue').style.display = 'flex';
  const k = $('menueKnoepfe');
  if (art === 'start') {
    k.innerHTML = (hatteStand || S.stats.gefangen ? '<button class="gruen" id="mWeiter">Weiterspielen</button><button class="zweit" id="mNeu">Neues Spiel</button>' : '<button class="gruen" id="mNeu">Spiel starten</button>')
      + '<button class="zweit" id="mHilfe">Steuerung</button>';
  } else {
    k.innerHTML = '<button class="gruen" id="mWeiter">Weiter</button><button class="zweit" id="mLog">Fanglog</button><button class="zweit" id="mEinst">Einstellungen</button><button class="zweit" id="mHilfe">Steuerung</button><button class="gefahr" id="mNeu">Neues Spiel</button>';
  }
  const an = (id, f) => { const el = $(id); if (el) el.onclick = () => { Ton.start(); Ton.klick(); f(); }; };
  an('mWeiter', () => starten());
  an('mNeu', () => {
    if (art !== 'start' || hatteStand || S.stats.gefangen) {
      if (!confirm('Wirklich neu anfangen? Dein Spielstand wird gelöscht.')) return;
    }
    S = neuerStand(); P.mag = {}; speichern(); W = Welt.bauen(szene, 1, S); sonne.color.set(FF.INSELN[1].sonne);
    for (const v of V.slice()) viehWeg(v);
    spawnen(); P.slot = 0; handBauen(); hotbarZeichnen(); intro();
  });
  an('mHilfe', () => hilfe(art));
  an('mLog', () => { $('menue').style.display = 'none'; fensterZu.zurueck = () => menue('pause'); fanglog(); });
  an('mEinst', () => einstellungen());
}
function hilfe(art) {
  $('menue').style.display = 'none';
  fensterAuf(kopf('Steuerung') + (istTouch
    ? `<div class="tasten"><span>Linker Daumen</span><span>Laufen (ganz drücken = rennen)</span><span>Rechts wischen</span><span>Umschauen</span><kbd>AKTION</kbd><span>Halten = Wurf aufladen, loslassen = auswerfen. Beim Biss tippen! Beim Drill halten = einholen, loslassen wenn die Leiste rot wird. Mit Waffen: schießen/schlagen</span><kbd>⤒</kbd><span>Springen</span><kbd>E</kbd><span>Mit Leuten reden</span><kbd>↻</kbd><span>Nachladen</span><span>Unten</span><span>Ausrüstung wechseln</span></div>`
    : `<div class="tasten"><kbd>W A S D</kbd><span>Laufen</span><kbd>Shift</kbd><span>Rennen</span><kbd>Leertaste</kbd><span>Springen</span><kbd>Maus</kbd><span>Umschauen</span><kbd>Linke Maustaste</kbd><span>Angel: halten = Wurf aufladen, loslassen = auswerfen. Beim Biss klicken! Beim Drill halten = einholen, loslassen wenn die Leiste rot wird. Waffen: schießen/schlagen</span><kbd>1–6 / Mausrad</kbd><span>Ausrüstung wechseln</span><kbd>E</kbd><span>Mit Leuten reden</span><kbd>R</kbd><span>Nachladen</span><kbd>Q</kbd><span>Leine kappen</span><kbd>Tab</kbd><span>Fanglog</span><kbd>Esc</kbd><span>Pause</span></div>`)
    + `<div class="rede"><b>So läuft’s:</b> Fisch an Land ziehen → er fliegt dir vor die Füße und zappelt Richtung Wasser → mit Paddel oder Waffe erledigen → einsammeln → bei Hein verkaufen → bessere Ausrüstung kaufen → Boss besiegen → mit Kuddel weitersegeln.</div>`);
  fensterZu.zurueck = () => menue(art);
  knoepfeVerbinden();
}
function einstellungen() {
  $('menue').style.display = 'none';
  fensterAuf(kopf('Einstellungen')
    + `<div class="einst"><span>Ton</span><button data-a="ton" class="${E.ton ? 'gruen' : 'zweit'}">${E.ton ? 'An' : 'Aus'}</button></div>
       <div class="einst"><span>${istTouch ? 'Wisch' : 'Maus'}-Empfindlichkeit</span><input type="range" id="empf" min="0.3" max="2.5" step="0.1" value="${E.empf}"></div>
       <div class="einst"><span>Grafik</span><button data-a="grafik" class="zweit">${E.grafik === 'hoch' ? 'Hoch (Schatten)' : 'Niedrig (schneller)'}</button></div>`);
  $('empf').oninput = e => { E.empf = +e.target.value; schreiben(EINST, E); };
  fensterZu.zurueck = () => menue('pause');
  knoepfeVerbinden({
    ton:() => { E.ton = !E.ton; Ton.setAn(E.ton); schreiben(EINST, E); einstellungen(); },
    grafik:() => { E.grafik = E.grafik === 'hoch' ? 'niedrig' : 'hoch'; schreiben(EINST, E); grafikAnwenden(); sonne.castShadow = E.grafik === 'hoch'; einstellungen(); },
  });
}
function intro() {
  $('menue').style.display = 'none';
  fensterAuf(`<h2>Wo … bin ich?</h2><div class="rede">Gestern noch Bootstour mit Kapitän Kuddel und viel zu viel Rum – heute wachst du mit Brummschädel am Strand einer winzigen Insel auf. Das Boot: Schrott. Das Geld: weg.<br><br>
    Zum Glück gibt’s hier <b>Hein</b>, der Fische kauft und Ausrüstung verkauft, und <b>Möwe Mona</b> mit ihrem zwielichtigen Casino. Fang Fische, erledige sie an Land, verkauf sie – und finde einen Weg zurück nach Hause.</div>
    <div class="rede" style="font-size:16px">${istTouch ? '<b>AKTION</b> halten = Wurf laden, loslassen = auswerfen. Beim Biss tippen, dann halten zum Einholen – loslassen, wenn die Leiste rot wird!' : '<b>Linke Maustaste</b> halten = Wurf laden, loslassen = auswerfen. Beim Biss klicken, dann halten zum Einholen – loslassen, wenn die Leiste rot wird!'}</div>
    <div class="knoepfe"><button class="gruen" data-zu style="font-size:20px">Los geht’s!</button></div>`);
  knoepfeVerbinden();
}
function starten() {
  $('menue').style.display = 'none';
  weiter();
}
function weiter() {
  if (panelOffen) return;
  $('menue').style.display = 'none';
  $('hud').style.display = 'block';
  $('touch').style.pointerEvents = '';
  laeuft = true; In.haupt = false; In.hauptNeu = false;
  if (!istTouch) sperren();
  hotbarZeichnen();
}
function pause() {
  if (!laeuft) return;
  speichern(); menue('pause');
}

/* ================= Hauptschleife ================= */
const TEST = { halt:false };
let letzte = performance.now();
function schleife(jetzt) {
  const dt = Math.min(.05, (jetzt - letzte) / 1000); letzte = jetzt;
  zeit += dt;
  if (laeuft && !TEST.halt) schritt(dt);
  Welt.animieren(zeit, dt);
  if (ansageZeit > 0) { ansageZeit -= dt; if (ansageZeit <= 0) $('ansage').style.opacity = 0; }
  auaZeit = Math.max(0, auaZeit - dt); $('aua').style.opacity = auaZeit > 0 ? 1 : (S.hp < 30 && laeuft ? .35 : 0);
  renderer.render(szene, kamera);
  requestAnimationFrame(schleife);
}
function schritt(dt) {
  spielerUpdate(dt);
  kameraSetzen(dt);
  handBauen();
  if (handId === 'rute') angelUpdate(dt); else { if (A.zustand !== 'bereit') angelAbbrechen(); waffeUpdate(dt); }
  for (const v of V.slice()) if (V.includes(v)) viehUpdate(v, dt);
  // zu viel Beute rumliegen? die ältesten verschwinden
  const tote = V.filter(v => v.tot && !v.typ.trophae);
  if (tote.length > 20) viehWeg(tote[0]);
  effekteUpdate(dt);
  handUpdate(dt);
  stationSuchen();
  angelHud();
  hudAktualisieren();
  In.hauptNeu = false; In.hauptLos = false;
}
function angelHud() {
  const a = $('angel');
  if (handId !== 'rute' || A.zustand === 'bereit') {
    if (handId === 'rute' && !naechsteStation) { a.style.display = 'block'; setz('angelText', istTouch ? 'AKTION halten zum Auswerfen' : 'Maustaste halten zum Auswerfen', 'innerHTML'); $('angelText').className = ''; $('angelText').style.fontSize = '17px'; $('ladung').style.display = 'none'; $('spannung').style.display = 'none'; setz('entf', 'Köder: ' + FF.KOEDER[S.aktivKoeder].name.replace(/ ×\d+/, '') + (S.aktivKoeder !== 'wurm' ? ' (' + S.koeder[S.aktivKoeder] + ')' : '')); }
    else a.style.display = 'none';
    return;
  }
  a.style.display = 'block'; $('angelText').style.fontSize = '';
  const txt = $('angelText');
  $('ladung').style.display = A.zustand === 'laden' ? 'block' : 'none';
  $('spannung').style.display = A.zustand === 'drill' ? 'block' : 'none';
  txt.className = A.zustand === 'biss' ? 'biss' : '';
  let t = '', e = '';
  if (A.zustand === 'laden') { t = 'Wurfkraft …'; $('ladung').firstElementChild.style.width = (A.ladung * 100) + '%'; e = Math.round(4 + A.ladung * (rute().wurf - 4)) + ' m'; }
  else if (A.zustand === 'flug') t = '';
  else if (A.zustand === 'warten') { t = 'Warten auf einen Biss …'; e = istTouch ? 'AKTION = einholen' : 'Klick = einholen'; }
  else if (A.zustand === 'biss') t = istTouch ? '! TIPPEN !' : '! KLICK !';
  else if (A.zustand === 'drill') {
    const typ = FF.FISCHE[A.fisch];
    t = A.lauf > 0 ? '<span style="color:#ff8a80">ER ZIEHT!</span>' : (In.haupt ? 'Einholen …' : 'Halten zum Einholen');
    if (typ.boss) t = '👑 ' + t;
    $('spannung').firstElementChild.style.width = (Math.min(1, A.spann) * 100) + '%';
    e = Math.max(0, A.dist).toFixed(1) + ' m · Schnurspannung';
  } else if (A.zustand === 'land') { t = 'Auf Land gelandet'; e = istTouch ? 'AKTION = einholen' : 'Klick = einholen'; }
  setz('angelText', t, 'innerHTML'); setz('entf', e);
}

/* ================= Start ================= */
W = Welt.bauen(szene, S.insel, S);
sonne.color.set(FF.INSELN[S.insel].sonne);
sonne.castShadow = E.grafik === 'hoch';
spawnen();
handBauen(); hotbarZeichnen();
kameraSetzen(0);
menue('start');
requestAnimationFrame(schleife);

// Zum Testen in der Konsole
window.fischfieber = {
  TEST,
  get S() { return S; }, P, A, V, In, W:() => W,
  geld(n) { S.geld += n; merken(); },
  fang(id) { A.fisch = id; A.pose.position.copy(P.pos).add(new T.Vector3(0, 0, 8)); rausziehen(); },
  sim(sek, schrittweite = 1 / 60) { for (let t = 0; t < sek; t += schrittweite) { zeit += schrittweite; schritt(schrittweite); Welt.animieren(zeit, schrittweite); } },
  starten() { $('menue').style.display = 'none'; $('fenster').style.display = 'none'; panelOffen = false; laeuft = true; $('hud').style.display = 'block'; },
};
})();
