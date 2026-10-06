'use strict';
// Fischfieber – alle 3D-Modelle, prozedural aus Grundformen gebaut (Low-Poly, flache Schattierung).
window.FF = window.FF || {};
FF.Modelle = (() => {
  const T = THREE;
  const matCache = {};
  function mat(farbe, opt = {}) {
    const key = farbe + JSON.stringify(opt);
    if (!matCache[key]) matCache[key] = new T.MeshPhongMaterial(Object.assign({ color:farbe, flatShading:true, shininess:0, specular:0x000000 }, opt));
    return matCache[key];
  }
  function mesh(geo, m, schatten = true) {
    const o = new T.Mesh(geo, m);
    o.castShadow = schatten; o.receiveShadow = schatten;
    return o;
  }
  // Färbt eine Geometrie oben f1 und unten f2 (Bauch), per Vertex-Farbe
  function zweifarbig(geo, f1, f2, grenze = 0) {
    const c1 = new T.Color(f1), c2 = new T.Color(f2), pos = geo.attributes.position, farben = [];
    for (let i = 0; i < pos.count; i++) {
      const c = pos.getY(i) > grenze ? c1 : c2;
      farben.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(farben, 3));
    return geo;
  }
  const vcMat = new T.MeshPhongMaterial({ vertexColors:true, flatShading:true, shininess:0, specular:0x000000 });

  function augen(g, x, y, z, r) {
    for (const s of [-1, 1]) {
      const a = mesh(new T.SphereGeometry(r, 6, 5), mat('#ffffff'), false); a.position.set(x, y, z * s); g.add(a);
      const p = mesh(new T.SphereGeometry(r * .55, 5, 4), mat('#111111'), false); p.position.set(x + r * .5, y, z * s + r * .45 * s); g.add(p);
    }
  }
  function textSchild(text, breite, hoehe, farbe = '#3a2412', schrift = '#fff3d6') {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * hoehe / breite);
    const c = cv.getContext('2d');
    c.fillStyle = farbe; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 10; c.strokeRect(5, 5, cv.width - 10, cv.height - 10);
    c.fillStyle = schrift; c.textAlign = 'center'; c.textBaseline = 'middle';
    let gr = cv.height * .55; c.font = `800 ${gr}px Barlow, sans-serif`;
    while (c.measureText(text).width > cv.width * .9) { gr *= .92; c.font = `800 ${gr}px Barlow, sans-serif`; }
    c.fillText(text, cv.width / 2, cv.height / 2 + 4);
    const tex = new T.CanvasTexture(cv);
    return mesh(new T.PlaneGeometry(breite, hoehe), new T.MeshBasicMaterial({ map:tex, side:T.DoubleSide }), false);
  }

  /* ---------- Fische & Viecher ----------
     Alle schauen in +x. Größe 1 = ca. 1 m lang, wird später mit typ.gr skaliert. */
  function fisch(typ) {
    const g = new T.Group();
    const f = typ.form;
    if (f === 'krebs') return krebs(typ);
    if (f === 'kugel') return kugel(typ);
    if (f === 'krake') return krake(typ);
    if (f === 'stiefel') return stiefel(typ);

    let lang = .5, hoch = .24, breit = .16;
    if (f === 'hai') { lang = .62; hoch = .2; breit = .19; }
    if (f === 'aal') { lang = .75; hoch = .09; breit = .09; }
    if (f === 'schwert') { lang = .5; hoch = .18; breit = .13; }
    if (typ.stark) { hoch = .27; breit = .2; }
    const kg = zweifarbig(new T.SphereGeometry(1, 9, 7), typ.f1, typ.f2, -.15);
    kg.scale(lang, hoch, breit);
    const m = typ.glanz ? new T.MeshPhongMaterial({ vertexColors:true, flatShading:true, shininess:90, specular:0xffffaa, emissive:0x332200 }) : vcMat;
    const koerper = mesh(kg, m); g.add(koerper);
    if (typ.streifen) for (let i = 0; i < 4; i++) {
      const s = mesh(new T.BoxGeometry(.03, .1, .02), mat('#1d3f4a'), false); s.position.set(-.2 + i * .12, .17, 0); g.add(s);
    }
    // Schwanzflosse
    const sw = mesh(new T.ConeGeometry(f === 'hai' ? .2 : .17, f === 'aal' ? .2 : .28, 4), mat(typ.f1));
    sw.rotation.z = Math.PI / 2; sw.scale.set(1, 1, .25); sw.position.x = -lang - .1; g.add(sw);
    if (f === 'hai') { const s2 = sw.clone(); s2.rotation.z = Math.PI / 2 + .5; s2.position.y = .08; g.add(s2); }
    // Rückenflosse
    const rf = mesh(new T.ConeGeometry(f === 'hai' ? .13 : .09, f === 'hai' ? .3 : .16, 4), mat(typ.f1));
    rf.scale.z = .25; rf.position.set(f === 'hai' ? 0 : -.05, hoch + (f === 'hai' ? .1 : .04), 0); rf.rotation.z = -.35; g.add(rf);
    // Seitenflossen
    for (const s of [-1, 1]) {
      const sf = mesh(new T.ConeGeometry(.06, .16, 3), mat(typ.f2), false);
      sf.position.set(lang * .35, -hoch * .4, breit * s); sf.rotation.set(s * 1.1, 0, 1.9); g.add(sf);
    }
    augen(g, lang * .65, hoch * .35, breit * .7, f === 'hai' ? .035 : .045);
    if (typ.zaehne) for (let i = 0; i < 5; i++) {
      const z = mesh(new T.ConeGeometry(.015, .05, 3), mat('#ffffff'), false);
      z.position.set(lang * .93, -.03, -.06 + i * .03); z.rotation.z = Math.PI; g.add(z);
    }
    if (f === 'schwert') {
      const s = mesh(new T.ConeGeometry(.025, .7, 5), mat('#c9d3dc'));
      s.rotation.z = -Math.PI / 2; s.position.x = lang + .33; g.add(s);
    }
    if (typ.laterne) {
      const st = mesh(new T.CylinderGeometry(.008, .008, .3, 4), mat('#3a2f3d'), false);
      st.position.set(lang * .5, hoch + .1, 0); st.rotation.z = -.6; g.add(st);
      const l = mesh(new T.SphereGeometry(.05, 6, 5), new T.MeshBasicMaterial({ color:'#d6ff6b' }), false);
      l.position.set(lang * .5 + .14, hoch + .2, 0); g.add(l);
    }
    if (typ.hammer) {
      const h = mesh(new T.BoxGeometry(.12, .07, .7), mat(typ.f1)); h.position.x = lang + .02; g.add(h);
      for (const s of [-1, 1]) { const a = mesh(new T.SphereGeometry(.04, 6, 5), mat('#111')); a.position.set(lang + .03, .02, .35 * s); g.add(a); }
      const hut = admiralshut(); hut.position.set(.1, hoch + .02, 0); hut.scale.setScalar(.5); g.add(hut);
    }
    g.userData.wackel = koerper;
    return g;
  }
  function krebs(typ) {
    const g = new T.Group();
    const k = mesh(new T.SphereGeometry(.35, 8, 5), mat(typ.f1)); k.scale.set(1, .45, 1.2); k.position.y = .15; g.add(k);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const b = mesh(new T.BoxGeometry(.05, .05, .32), mat(typ.f1), false);
        b.position.set(-.12 + i * .12, .07, s * .42); b.rotation.x = s * .5; g.add(b);
      }
      const arm = mesh(new T.BoxGeometry(.25, .06, .06), mat(typ.f1), false); arm.position.set(.33, .15, s * .25); arm.rotation.y = s * .4; g.add(arm);
      const sch = mesh(new T.SphereGeometry(.12, 6, 5), mat(typ.f1)); sch.scale.set(1.3, .8, .8); sch.position.set(.5, .17, s * .32); g.add(sch);
      const st = mesh(new T.CylinderGeometry(.015, .015, .14, 4), mat(typ.f1), false); st.position.set(.25, .3, s * .1); g.add(st);
      const a = mesh(new T.SphereGeometry(.04, 5, 4), mat('#111'), false); a.position.set(.25, .38, s * .1); g.add(a);
    }
    g.userData.wackel = k;
    return g;
  }
  function kugel(typ) {
    const g = new T.Group();
    const geo = zweifarbig(new T.IcosahedronGeometry(.4, 1), typ.f1, typ.f2, -.1);
    const k = mesh(geo, vcMat); g.add(k);
    const pos = new T.IcosahedronGeometry(.4, 0).attributes.position, gesehen = new Set();
    for (let i = 0; i < pos.count; i++) {
      const v = new T.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)), key = v.toArray().map(n => n.toFixed(2)).join();
      if (gesehen.has(key)) continue; gesehen.add(key);
      const sp = mesh(new T.ConeGeometry(.04, .16, 4), mat('#f6eed2'), false);
      sp.position.copy(v.clone().multiplyScalar(1.05));
      sp.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize());
      k.add(sp);
    }
    const sw = mesh(new T.ConeGeometry(.12, .18, 4), mat(typ.f1)); sw.rotation.z = Math.PI / 2; sw.scale.z = .3; sw.position.x = -.45; g.add(sw);
    augen(g, .3, .12, .2, .07);
    const mund = mesh(new T.TorusGeometry(.05, .02, 4, 8), mat('#a0402a'), false); mund.position.set(.4, -.06, 0); mund.rotation.y = Math.PI / 2; g.add(mund);
    if (typ.krone) {
      const kr = new T.Group();
      const ring = mesh(new T.CylinderGeometry(.2, .22, .12, 8, 1, true), mat('#ffcc33', { side:T.DoubleSide }));
      kr.add(ring);
      for (let i = 0; i < 6; i++) {
        const z = mesh(new T.ConeGeometry(.05, .14, 4), mat('#ffcc33'));
        const a = i / 6 * Math.PI * 2; z.position.set(Math.cos(a) * .19, .12, Math.sin(a) * .19); kr.add(z);
        const j = mesh(new T.SphereGeometry(.025, 5, 4), mat(i % 2 ? '#e8394a' : '#3fa0ff'), false); j.position.set(Math.cos(a) * .21, 0, Math.sin(a) * .21); kr.add(j);
      }
      kr.position.y = .43; g.add(kr);
    }
    g.userData.wackel = k;
    return g;
  }
  function krake(typ) {
    const g = new T.Group();
    const kopf = mesh(zweifarbig(new T.SphereGeometry(.3, 8, 7), typ.f1, typ.f2, -.2), vcMat); kopf.scale.set(1, 1.25, 1); kopf.position.y = .38; g.add(kopf);
    augen(g, .24, .38, .13, .06);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const t = mesh(new T.CylinderGeometry(.05, .015, .55, 5), mat(typ.f1), false);
      t.position.set(Math.cos(a) * .22, .1, Math.sin(a) * .22);
      t.rotation.set(Math.sin(a) * .9, 0, -Math.cos(a) * .9); g.add(t);
    }
    g.userData.wackel = kopf;
    return g;
  }
  function stiefel(typ) {
    const g = new T.Group();
    const s = mesh(new T.BoxGeometry(.16, .4, .16), mat(typ.f1)); s.position.y = .2; g.add(s);
    const f = mesh(new T.BoxGeometry(.32, .12, .17), mat(typ.f1)); f.position.set(.08, .06, 0); g.add(f);
    const so = mesh(new T.BoxGeometry(.34, .03, .18), mat(typ.f2)); so.position.set(.08, 0, 0); g.add(so);
    g.userData.wackel = s;
    return g;
  }

  /* ---------- Menschen und Möwe ---------- */
  function admiralshut() {
    const h = new T.Group();
    const b = mesh(new T.CylinderGeometry(.32, .32, .06, 10), mat('#1d2b4a')); h.add(b);
    const o = mesh(new T.CylinderGeometry(.22, .25, .2, 10), mat('#1d2b4a')); o.position.y = .12; h.add(o);
    const a = mesh(new T.BoxGeometry(.1, .06, .02), mat('#ffcc33'), false); a.position.set(.25, .14, 0); a.rotation.y = Math.PI / 2; h.add(a);
    return h;
  }
  function person(art) {
    const g = new T.Group();
    const F = {
      hein:   { jacke:'#f2c12e', hose:'#2d3e5a', haut:'#f0c19a', hut:'suedwester' },
      kuddel: { jacke:'#1d2b4a', hose:'#22262e', haut:'#e8b48f', hut:'kapitaen', bart:true },
    }[art];
    const beine = mesh(new T.CylinderGeometry(.22, .2, .8, 8), mat(F.hose)); beine.position.y = .4; g.add(beine);
    const rumpf = mesh(new T.CylinderGeometry(.3, .27, .75, 8), mat(F.jacke)); rumpf.position.y = 1.15; g.add(rumpf);
    const kopf = mesh(new T.SphereGeometry(.24, 9, 8), mat(F.haut)); kopf.position.y = 1.72; g.add(kopf);
    for (const s of [-1, 1]) {
      const arm = mesh(new T.CylinderGeometry(.08, .07, .65, 6), mat(F.jacke)); arm.position.set(0, 1.15, s * .36); arm.rotation.x = s * .15; g.add(arm);
      const a = mesh(new T.SphereGeometry(.035, 5, 4), mat('#111'), false); a.position.set(.21, 1.77, s * .08); g.add(a);
    }
    const nase = mesh(new T.SphereGeometry(.05, 5, 4), mat('#e39a7a'), false); nase.position.set(.24, 1.7, 0); g.add(nase);
    if (F.bart) { const b = mesh(new T.SphereGeometry(.2, 7, 6), mat('#f2f2f2')); b.scale.set(.7, .9, 1.05); b.position.set(.1, 1.56, 0); g.add(b); }
    if (F.hut === 'suedwester') {
      const h = mesh(new T.ConeGeometry(.4, .3, 10), mat('#f2c12e')); h.position.y = 1.95; g.add(h);
    } else {
      const h = admiralshut(); h.position.y = 1.9; h.scale.setScalar(1); g.add(h);
    }
    return g;
  }
  function moewe() {
    const g = new T.Group();
    const k = mesh(new T.SphereGeometry(.5, 9, 8), mat('#f4f4f4')); k.scale.set(1.2, 1, .9); k.position.y = 1.0; g.add(k);
    const kopf = mesh(new T.SphereGeometry(.3, 9, 8), mat('#ffffff')); kopf.position.set(.45, 1.55, 0); g.add(kopf);
    const sn = mesh(new T.ConeGeometry(.08, .4, 6), mat('#f5a623')); sn.rotation.z = -Math.PI / 2; sn.position.set(.85, 1.5, 0); g.add(sn);
    const brille = mesh(new T.BoxGeometry(.06, .1, .45), mat('#111')); brille.position.set(.7, 1.6, 0); g.add(brille);
    for (const s of [-1, 1]) {
      const f = mesh(new T.BoxGeometry(.7, .08, .35), mat('#9aa4ad')); f.position.set(-.1, 1.05, s * .5); f.rotation.x = s * .3; g.add(f);
      const b = mesh(new T.CylinderGeometry(.04, .04, .55, 5), mat('#f5a623'), false); b.position.set(0, .3, s * .18); g.add(b);
    }
    const fliege = mesh(new T.BoxGeometry(.05, .12, .25), mat('#d62839'), false); fliege.position.set(.45, 1.28, 0); g.add(fliege);
    return g;
  }

  /* ---------- Gebäude & Natur ---------- */
  function bude(titel, dachFarbe) {
    const g = new T.Group();
    const holz = mat('#8b5a2b'), dunkel = mat('#5e3b1c');
    const theke = mesh(new T.BoxGeometry(1.2, 1.1, 3.2), holz); theke.position.set(.9, .55, 0); g.add(theke);
    const boden = mesh(new T.BoxGeometry(3.2, .2, 3.6), dunkel); boden.position.y = .1; g.add(boden);
    for (const [x, z] of [[1.5, 1.7], [1.5, -1.7], [-1.5, 1.7], [-1.5, -1.7]]) {
      const p = mesh(new T.CylinderGeometry(.1, .1, 2.8, 6), holz); p.position.set(x, 1.4, z); g.add(p);
    }
    const wand = mesh(new T.BoxGeometry(.15, 2.6, 3.4), holz); wand.position.set(-1.5, 1.3, 0); g.add(wand);
    const dach = mesh(new T.BoxGeometry(3.8, .15, 4.2), mat(dachFarbe)); dach.position.set(0, 2.95, 0); dach.rotation.z = .18; g.add(dach);
    const schild = textSchild(titel, 3.2, .7); schild.position.set(1.62, 2.55, 0); schild.rotation.y = Math.PI / 2; g.add(schild);
    return g;
  }
  function palme(rnd) {
    const g = new T.Group();
    const h = 4 + rnd() * 3, segs = 6, biege = (rnd() - .5) * 1.4, biegeZ = (rnd() - .5) * 1.4;
    let spitze = new T.Vector3();
    for (let i = 0; i < segs; i++) {
      const t = i / segs, t2 = (i + 1) / segs;
      const a = new T.Vector3(biege * t * t, h * t, biegeZ * t * t), b = new T.Vector3(biege * t2 * t2, h * t2, biegeZ * t2 * t2);
      const len = a.distanceTo(b);
      const s = mesh(new T.CylinderGeometry(.13 - t * .05, .16 - t * .05, len, 6), mat(i % 2 ? '#8a6a45' : '#7a5b39'));
      s.position.copy(a).add(b).multiplyScalar(.5);
      s.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(s); spitze = b;
    }
    const blattMat = mat(rnd() < .5 ? '#3f9b3a' : '#4aa83f', { side:T.DoubleSide });
    // Ein Blatt: ragt in +x, wird zur Spitze schmal und hängt nach außen durch
    const blattGeo = new T.PlaneGeometry(2.4, .55, 5, 1);
    blattGeo.translate(1.2, 0, 0);
    const bp = blattGeo.attributes.position;
    for (let j = 0; j < bp.count; j++) { const x = bp.getX(j); bp.setY(j, bp.getY(j) * (1 - x / 2.6)); bp.setZ(j, -x * x * .2); }
    blattGeo.rotateX(-Math.PI / 2);
    blattGeo.computeVertexNormals();
    for (let i = 0; i < 7; i++) {
      const blatt = mesh(blattGeo, blattMat);
      blatt.position.copy(spitze); blatt.rotation.y = i / 7 * Math.PI * 2 + rnd() * .5;
      g.add(blatt);
    }
    for (let i = 0; i < 3; i++) {
      const n = mesh(new T.SphereGeometry(.13, 6, 5), mat('#5b3a1e')); n.position.copy(spitze).add(new T.Vector3(Math.cos(i * 2.1) * .2, -.2, Math.sin(i * 2.1) * .2)); g.add(n);
    }
    g.userData.spitze = spitze;
    return g;
  }
  function fels(rnd, farbe) {
    const geo = new T.IcosahedronGeometry(1, 0), p = geo.attributes.position;
    // Ecken gleich verschieben, damit keine Löcher entstehen
    const versatz = {};
    for (let i = 0; i < p.count; i++) {
      const key = [p.getX(i), p.getY(i), p.getZ(i)].map(n => n.toFixed(3)).join();
      if (!versatz[key]) versatz[key] = .75 + rnd() * .5;
      const f = versatz[key]; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .7, p.getZ(i) * f);
    }
    geo.computeVertexNormals();
    return mesh(geo, mat(farbe));
  }
  function wrack(geflickt) {
    const g = new T.Group();
    const rumpfFarbe = geflickt ? '#c0392b' : '#7a3b2e';
    const geo = new T.CylinderGeometry(1.3, 1.3, 6, 10, 1, false, 0, Math.PI);
    // Halbzylinder längs zur x-Achse, offene Seite nach oben
    const rumpf = mesh(geo, mat(rumpfFarbe, { side:T.DoubleSide })); rumpf.rotation.set(0, 0, -Math.PI / 2); rumpf.scale.set(1, 1, .8);
    const h = new T.Group(); h.add(rumpf);
    const deck = mesh(new T.BoxGeometry(5.8, .12, 2), mat('#a0703f')); deck.position.y = -.15; h.add(deck);
    const kabine = mesh(new T.BoxGeometry(1.6, 1.1, 1.5), mat(geflickt ? '#f4f4f4' : '#9c9c94')); kabine.position.set(-.8, .4, 0); h.add(kabine);
    const fenster = mesh(new T.BoxGeometry(.05, .35, 1), mat('#5fb4e8')); fenster.position.set(.02, .55, 0); h.add(fenster);
    if (!geflickt) {
      const loch = mesh(new T.CircleGeometry(.5, 7), mat('#1a0f0a', { side:T.DoubleSide }), false); loch.position.set(1.2, -.6, 1.06); h.add(loch);
      for (let i = 0; i < 3; i++) { const b = mesh(new T.BoxGeometry(1.2, .08, .25), mat('#6d4426')); b.position.set(2 + i * .5, -1, 1.6 + i * .3); b.rotation.y = i; g.add(b); }
      h.rotation.z = .25; h.rotation.x = -.18;
    } else {
      const flagge = mesh(new T.PlaneGeometry(.6, .4), mat('#ffcc33', { side:T.DoubleSide }), false); flagge.position.set(-.8, 1.75, .3); h.add(flagge);
      const mast = mesh(new T.CylinderGeometry(.04, .04, 1.4, 5), mat('#5e3b1c')); mast.position.set(-.8, 1.4, 0); h.add(mast);
    }
    g.add(h);
    return g;
  }
  function steg(laenge) {
    const g = new T.Group();
    const holz = mat('#9a6a3a'), holz2 = mat('#86592f'), pfahl = mat('#5e3b1c');
    for (let z = 0; z < laenge; z += .5) {
      const b = mesh(new T.BoxGeometry(2.6, .12, .44), (z * 2) % 2 ? holz : holz2); b.position.set(0, 0, z + .25); g.add(b);
    }
    for (let z = 0; z <= laenge; z += 3) for (const x of [-1.2, 1.2]) {
      const p = mesh(new T.CylinderGeometry(.12, .12, 6, 6), pfahl); p.position.set(x, -2.9, z); g.add(p);
    }
    return g;
  }
  function lagerfeuer() {
    const g = new T.Group();
    for (let i = 0; i < 4; i++) {
      const s = mesh(new T.CylinderGeometry(.08, .08, 1, 5), mat('#5e3b1c')); s.rotation.set(Math.PI / 2, i * Math.PI / 4, 0); s.rotation.order = 'YXZ'; s.position.y = .1; g.add(s);
    }
    for (let i = 0; i < 8; i++) { const st = mesh(new T.DodecahedronGeometry(.15, 0), mat('#777')); st.position.set(Math.cos(i * .8) * .6, .05, Math.sin(i * .8) * .6); g.add(st); }
    const flamme = new T.Mesh(new T.ConeGeometry(.3, .8, 6), new T.MeshBasicMaterial({ color:'#ff9a2e' }));
    flamme.position.y = .5; g.add(flamme);
    const kern = new T.Mesh(new T.ConeGeometry(.16, .5, 6), new T.MeshBasicMaterial({ color:'#ffe066' })); kern.position.y = .4; g.add(kern);
    g.userData.flamme = flamme; g.userData.kern = kern;
    return g;
  }
  function casino() {
    const g = bude('MÖWEN-CASINO', '#d62839');
    const lichter = [];
    for (let i = 0; i < 14; i++) {
      const l = new T.Mesh(new T.SphereGeometry(.07, 6, 5), new T.MeshBasicMaterial({ color:'#ffcc33' }));
      l.position.set(1.65, 2.95 - (i < 7 ? 0 : .85), -1.5 + (i % 7) * .5); g.add(l); lichter.push(l);
    }
    const rad = new T.Group();
    const rs = new T.Mesh(new T.CircleGeometry(.8, 12), new T.MeshBasicMaterial({ map:radTextur(), side:T.DoubleSide }));
    rad.add(rs); rad.position.set(-1.38, 1.7, 0); rad.rotation.y = Math.PI / 2; g.add(rad);
    g.userData.lichter = lichter; g.userData.rad = rs;
    return g;
  }
  function radTextur() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'), n = 12;
    for (let i = 0; i < n; i++) {
      c.beginPath(); c.moveTo(128, 128); c.arc(128, 128, 126, i / n * Math.PI * 2, (i + 1) / n * Math.PI * 2); c.closePath();
      c.fillStyle = ['#d62839', '#ffcc33', '#2a9d8f', '#f4f4f4'][i % 4]; c.fill();
    }
    return new T.CanvasTexture(cv);
  }

  /* ---------- Ausrüstung in der Hand (Ego-Sicht) ---------- */
  function hand(gruppe) {
    const h = mesh(new T.BoxGeometry(.09, .09, .14), mat('#f0c19a'), false); gruppe.add(h); return h;
  }
  function inHand(id, rute) {
    const g = new T.Group();
    if (id === 'rute') {
      const stock = new T.Mesh(new T.CylinderGeometry(.005, .013, 1.5, 6), mat(rute.farbe));
      stock.rotation.x = -Math.PI / 2 + .55; stock.position.set(0, .3, -.55); g.add(stock);
      for (let i = 1; i <= 3; i++) { const ring = new T.Mesh(new T.TorusGeometry(.016, .004, 4, 8), mat('#cccccc')); ring.position.set(0, .3 + (i * .3 - .45) * .52, -.55 - (i * .3 - .45) * .85); ring.rotation.x = .55; g.add(ring); }
      const rolle = new T.Mesh(new T.CylinderGeometry(.045, .045, .04, 10), mat('#888')); rolle.rotation.z = Math.PI / 2; rolle.position.set(.05, .02, -.05); g.add(rolle);
      const kurbel = new T.Mesh(new T.BoxGeometry(.06, .015, .015), mat('#444')); kurbel.position.set(.09, .02, -.05); g.add(kurbel);
      const griff = new T.Mesh(new T.CylinderGeometry(.022, .022, .25, 6), mat('#3a2412')); griff.rotation.x = -Math.PI / 2 + .55; griff.position.set(0, -.04, .05); g.add(griff);
      const spitze = new T.Object3D(); spitze.position.set(0, .68, -1.14); g.add(spitze);
      g.userData.spitze = spitze; g.userData.kurbel = kurbel; g.userData.stock = stock;
      hand(g).position.set(0, -.05, .1);
    } else if (id === 'paddel') {
      const s = new T.Mesh(new T.CylinderGeometry(.025, .025, 1.1, 6), mat('#a0703f')); s.rotation.x = -Math.PI / 2 + .9; s.position.set(0, .2, -.3); g.add(s);
      const b = new T.Mesh(new T.BoxGeometry(.2, .03, .45), mat('#c98a4b')); b.position.set(0, .55, -.62); b.rotation.x = .9 - Math.PI / 2 + Math.PI / 2; g.add(b);
      hand(g).position.set(0, -.05, .05);
    } else if (id === 'pistole') {
      const lauf = new T.Mesh(new T.BoxGeometry(.06, .07, .3), mat('#2d2f33')); lauf.position.set(0, .04, -.15); g.add(lauf);
      const griff = new T.Mesh(new T.BoxGeometry(.055, .14, .07), mat('#5a3b22')); griff.position.set(0, -.04, 0); griff.rotation.x = .25; g.add(griff);
      hand(g).position.set(0, -.06, .03);
      const m = new T.Object3D(); m.position.set(0, .05, -.32); g.add(m); g.userData.muendung = m;
    } else if (id === 'flinte') {
      for (const x of [-.022, .022]) { const l = new T.Mesh(new T.CylinderGeometry(.02, .02, .7, 6), mat('#2d2f33')); l.rotation.x = Math.PI / 2; l.position.set(x, .05, -.35); g.add(l); }
      const schaft = new T.Mesh(new T.BoxGeometry(.07, .1, .45), mat('#7a4a25')); schaft.position.set(0, .0, .1); g.add(schaft);
      hand(g).position.set(0, -.05, .05);
      const m = new T.Object3D(); m.position.set(0, .05, -.72); g.add(m); g.userData.muendung = m;
    } else if (id === 'harpune') {
      const r = new T.Mesh(new T.CylinderGeometry(.03, .035, .8, 8), mat('#e2e5e8')); r.rotation.x = Math.PI / 2; r.position.set(0, .03, -.25); g.add(r);
      const p = new T.Mesh(new T.ConeGeometry(.035, .16, 5), mat('#c0392b')); p.rotation.x = -Math.PI / 2; p.position.set(0, .03, -.72); g.add(p);
      g.userData.pfeil = p;
      hand(g).position.set(0, -.05, .05);
      const m = new T.Object3D(); m.position.set(0, .03, -.75); g.add(m); g.userData.muendung = m;
    } else if (id === 'tnt') {
      const s = new T.Mesh(new T.CylinderGeometry(.05, .05, .28, 8), mat('#d62839')); s.position.set(0, .1, -.1); s.rotation.x = .3; g.add(s);
      const z = new T.Mesh(new T.CylinderGeometry(.006, .006, .1, 4), mat('#222')); z.position.set(0, .26, -.06); g.add(z);
      hand(g).position.set(0, -.04, -.05);
    }
    return g;
  }
  function tntStange() {
    const g = new T.Group();
    const s = mesh(new T.CylinderGeometry(.06, .06, .3, 8), mat('#d62839')); g.add(s);
    const f = new T.Mesh(new T.SphereGeometry(.04, 5, 4), new T.MeshBasicMaterial({ color:'#ffcc33' })); f.position.y = .2; g.add(f);
    g.userData.funke = f;
    return g;
  }
  function pose() {
    const g = new T.Group();
    const kugel = new T.Mesh(new T.SphereGeometry(.09, 8, 6), new T.MeshLambertMaterial({ color:'#e8394a' }));
    g.add(kugel);
    const oben = new T.Mesh(new T.SphereGeometry(.091, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), new T.MeshLambertMaterial({ color:'#ffffff' }));
    g.add(oben);
    const st = new T.Mesh(new T.CylinderGeometry(.012, .012, .14, 4), mat('#222')); st.position.y = .12; g.add(st);
    return g;
  }
  function stachel() {
    const s = new T.Mesh(new T.ConeGeometry(.06, .4, 4), mat('#f6eed2'));
    s.geometry.rotateX(Math.PI / 2);
    return s;
  }
  function wolke(rnd) {
    const g = new T.Group(), m = new T.MeshPhongMaterial({ color:'#ffffff', emissive:0x8a9aa8, flatShading:true, shininess:0, specular:0x000000, transparent:true, opacity:.92 });
    const n = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const k = new T.Mesh(new T.IcosahedronGeometry(3 + rnd() * 3, 0), m);
      k.position.set(i * 4 - n * 2, rnd() * 2, (rnd() - .5) * 4); k.scale.y = .55; g.add(k);
    }
    return g;
  }
  function vogel() {
    const g = new T.Group(), m = mat('#ffffff', { side:T.DoubleSide });
    const k = new T.Mesh(new T.SphereGeometry(.15, 5, 4), m); k.scale.set(2, .8, .8); g.add(k);
    for (const s of [-1, 1]) {
      const f = new T.Mesh(new T.PlaneGeometry(.35, .7), m); f.rotation.x = -Math.PI / 2; f.position.z = s * .4; g.add(f);
      g.userData[s < 0 ? 'l' : 'r'] = f;
    }
    return g;
  }

  return { mat, mesh, fisch, person, moewe, bude, casino, palme, fels, wrack, steg, lagerfeuer, inHand, tntStange, pose, stachel, wolke, vogel, textSchild };
})();
