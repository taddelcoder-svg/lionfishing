'use strict';
// Fischfieber – die Insel: Gelände (Höhenfunktion), Wasser, Himmel, Steg, Buden, Leute, Palmen.
window.FF = window.FF || {};
FF.Welt = (() => {
  const T = THREE, M = FF.Modelle;

  // Kleiner, deterministischer Zufall pro Insel
  function zufall(seed) {
    let s = Math.floor(seed * 100000) % 2147483647 || 1;
    return () => (s = s * 16807 % 2147483647) / 2147483647;
  }
  // Glatter Wertrauschen-Hügel (ohne Bibliothek)
  function hash(x, z, seed) { const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); }
  function rauschen(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const glatt = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  let I = null;          // aktuelle Inseldaten
  let gruppe = null;     // alles, was zur Insel gehört
  let wasser = null, wasserBasis = null, himmel = null;
  const W = { stationen:[], hindernisse:[], plattformen:[], palmen:[], deko:{} };

  function uferRadius(a) {
    const s = I.seed;
    return I.radius * (1 + .12 * Math.sin(3 * a + s) + .07 * Math.sin(5 * a + 2 * s) + .045 * Math.sin(9 * a + 3 * s));
  }
  // Geländehöhe (0 = Meeresspiegel)
  function gelaende(x, z) {
    const d = Math.hypot(x, z), r = uferRadius(Math.atan2(z, x)), u = 1 - d / r;
    let h;
    if (u > .2) h = .8 + (u - .2) * 9;
    else if (u > 0) h = u * 4;
    else h = u * 14;
    h += (rauschen(x * .07, z * .07, I.seed) - .5) * 5 * glatt(.15, .5, u);
    h += (rauschen(x * .25, z * .25, I.seed + 3) - .5) * .5 * glatt(-.05, .1, u);
    return Math.max(-7, h);
  }
  // Begehbarer Boden: Gelände oder Steg
  function boden(x, z) {
    let h = gelaende(x, z);
    for (const p of W.plattformen) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) h = Math.max(h, p.y);
    return h;
  }
  function welle(x, z, t) { return .12 * Math.sin(x * .3 + t * 1.3) + .08 * Math.sin(z * .4 + t * 1.7) + .05 * Math.sin((x + z) * .7 + t * 2.3); }
  // Punkt am Land in Richtung a, bei Anteil f des Uferradius
  function anLand(a, f) {
    const r = uferRadius(a) * f;
    return new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }

  function gelaendeMesh() {
    const n = 140, gr = 280;
    const geo = new T.PlaneGeometry(gr, gr, n, n); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, gelaende(p.getX(i), p.getZ(i)));
    const flach = geo.toNonIndexed(); flach.computeVertexNormals();
    const fp = flach.attributes.position, farben = [];
    const cs = new T.Color(I.sand), cn = new T.Color(I.sand).multiplyScalar(.75), cg = new T.Color(I.gras), cg2 = new T.Color(I.gras2), cf = new T.Color(I.fels), c = new T.Color();
    for (let i = 0; i < fp.count; i += 3) {
      const y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3;
      const ny = flach.attributes.normal.getY(i);
      if (y < -.25) c.copy(cn).lerp(new T.Color(I.tief), glatt(-.3, -6, y) * .6);
      else if (y < 1.0) c.copy(cs);
      else if (ny < .78 && y > 3) c.copy(cf);
      else c.copy(hash(fp.getX(i), fp.getZ(i), 9) > .5 ? cg : cg2);
      const j = .96 + hash(fp.getX(i) * 3, fp.getZ(i) * 3, 2) * .08; c.multiplyScalar(j);
      for (let k = 0; k < 3; k++) farben.push(c.r, c.g, c.b);
    }
    flach.setAttribute('color', new T.Float32BufferAttribute(farben, 3));
    const m = new T.Mesh(flach, new T.MeshPhongMaterial({ vertexColors:true, flatShading:true, shininess:0, specular:0x000000 }));
    m.receiveShadow = true;
    return m;
  }

  function wasserMesh() {
    const geo = new T.PlaneGeometry(700, 700, 90, 90); geo.rotateX(-Math.PI / 2);
    wasserBasis = Float32Array.from(geo.attributes.position.array);
    const m = new T.Mesh(geo, new T.MeshPhongMaterial({ color:I.wasser, transparent:true, opacity:.8, shininess:80, specular:0x99ccff, flatShading:true }));
    m.receiveShadow = true;
    return m;
  }

  function himmelMesh() {
    const geo = new T.SphereGeometry(500, 24, 12), p = geo.attributes.position, farben = [];
    const oben = new T.Color(I.himmel), unten = new T.Color(I.horizont), c = new T.Color();
    for (let i = 0; i < p.count; i++) { c.copy(unten).lerp(oben, glatt(0, 220, p.getY(i))); farben.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new T.Float32BufferAttribute(farben, 3));
    return new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors:true, side:T.BackSide, fog:false, depthWrite:false }));
  }

  function aufBoden(obj, x, z, dy = 0) { obj.position.set(x, gelaende(x, z) + dy, z); return obj; }
  function blick(obj, ziel) { obj.rotation.y = Math.atan2(-(ziel.z - obj.position.z), ziel.x - obj.position.x); }

  // Baut die Insel neu (beim Start und beim Reisen)
  function bauen(szene, inselNr, zustand) {
    if (gruppe) { szene.remove(gruppe); gruppe.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    I = FF.INSELN[inselNr];
    W.stationen = []; W.hindernisse = []; W.plattformen = []; W.palmen = []; W.deko = {};
    gruppe = new T.Group(); szene.add(gruppe);
    const rnd = zufall(I.seed);

    szene.fog = new T.Fog(I.nebel, 60, 330);
    szene.background = new T.Color(I.horizont);
    himmel = himmelMesh(); gruppe.add(himmel);
    gruppe.add(gelaendeMesh());
    wasser = wasserMesh(); gruppe.add(wasser);

    // Steg zeigt nach +z
    const aSteg = Math.PI / 2, rS = uferRadius(aSteg);
    const stegStart = rS - 9, stegLaenge = 26;
    const st = M.steg(stegLaenge); st.position.set(0, .9, stegStart); gruppe.add(st);
    W.plattformen.push({ x0:-1.3, x1:1.3, z0:stegStart, z1:stegStart + stegLaenge, y:.96 });
    W.stegEnde = new T.Vector3(0, .96, stegStart + stegLaenge - 1);

    // Buden und Leute
    const mitte = new T.Vector3(0, 0, 0);
    const pShop = anLand(aSteg - .42, .7), pCasino = anLand(aSteg + .45, .68), pFeuer = anLand(aSteg + .02, .55);
    const pWrack = anLand(aSteg + 1.15, .98), pKuddel = anLand(aSteg + 1.0, .86);

    const shop = M.bude('HEINS ANGELBEDARF', '#2a7fc9'); aufBoden(shop, pShop.x, pShop.z); blick(shop, new T.Vector3(0, 0, rS)); gruppe.add(shop); shop.updateMatrixWorld(true);
    const hein = M.person('hein'); hein.position.copy(shop.localToWorld(new T.Vector3(-.4, 0, 0))); hein.position.y = gelaende(hein.position.x, hein.position.z); hein.rotation.y = shop.rotation.y; gruppe.add(hein);
    const vor = shop.localToWorld(new T.Vector3(2.6, 0, 0));
    W.stationen.push({ art:'shop', name:'Hein', text:'Mit Hein handeln', pos:vor, figur:hein });
    W.hindernisse.push({ x:pShop.x, z:pShop.z, r:2.1 });

    const cas = M.casino(); aufBoden(cas, pCasino.x, pCasino.z); blick(cas, new T.Vector3(0, 0, rS)); gruppe.add(cas); cas.updateMatrixWorld(true);
    const mona = M.moewe(); mona.position.copy(cas.localToWorld(new T.Vector3(-.4, 0, 0))); mona.position.y = gelaende(mona.position.x, mona.position.z); mona.rotation.y = cas.rotation.y; gruppe.add(mona);
    W.stationen.push({ art:'casino', name:'Möwe Mona', text:'Ins Möwen-Casino', pos:cas.localToWorld(new T.Vector3(2.6, 0, 0)), figur:mona });
    W.hindernisse.push({ x:pCasino.x, z:pCasino.z, r:2.1 });
    W.deko.casino = cas;

    const feuer = M.lagerfeuer(); aufBoden(feuer, pFeuer.x, pFeuer.z); gruppe.add(feuer);
    W.stationen.push({ art:'feuer', name:'Lagerfeuer', text:'Am Feuer ausruhen', pos:feuer.position.clone() });
    W.hindernisse.push({ x:pFeuer.x, z:pFeuer.z, r:.8 });
    W.deko.feuer = feuer;
    const licht = new T.PointLight('#ff9a3c', 1.2, 12); licht.position.set(pFeuer.x, feuer.position.y + 1.2, pFeuer.z); gruppe.add(licht); W.deko.feuerLicht = licht;
    W.spawn = new T.Vector3(pFeuer.x * .92, 0, pFeuer.z * .92 - 2.5);

    const geflickt = !!(zustand.quests[inselNr]);
    const wr = M.wrack(geflickt);
    if (geflickt) { wr.position.set(3.2, .25, stegStart + stegLaenge - 4); wr.rotation.y = Math.PI / 2; }
    else { aufBoden(wr, pWrack.x, pWrack.z, .5); blick(wr, mitte); wr.rotation.y += Math.PI / 2; W.hindernisse.push({ x:pWrack.x, z:pWrack.z, r:2.6 }); }
    gruppe.add(wr); W.deko.boot = wr;
    const kuddel = M.person('kuddel'); aufBoden(kuddel, pKuddel.x, pKuddel.z); blick(kuddel, new T.Vector3(0, 0, rS * .6)); gruppe.add(kuddel);
    W.stationen.push({ art:'kuddel', name:'Kapitän Kuddel', text:'Mit Kapitän Kuddel reden', pos:kuddel.position.clone(), figur:kuddel });
    W.hindernisse.push({ x:pKuddel.x, z:pKuddel.z, r:.5 });

    // Palmen und Felsen, mit Abstand zu Buden und Steg
    const frei = (x, z, abst) => W.stationen.every(s => Math.hypot(s.pos.x - x, s.pos.z - z) > abst) && !(Math.abs(x) < 4 && z > rS - 14);
    let n = 0, versuche = 0;
    while (n < I.palmen && versuche++ < 900) {
      const a = rnd() * Math.PI * 2, f = .35 + rnd() * .6, p = anLand(a, f), h = gelaende(p.x, p.z);
      if (h < .4 || h > 7 || !frei(p.x, p.z, 6)) continue;
      const pa = M.palme(rnd); aufBoden(pa, p.x, p.z, -.1); pa.rotation.y = rnd() * 6; gruppe.add(pa);
      W.hindernisse.push({ x:p.x, z:p.z, r:.35 }); W.palmen.push(pa); n++;
    }
    n = 0; versuche = 0;
    while (n < I.felsen && versuche++ < 900) {
      const a = rnd() * Math.PI * 2, f = .2 + rnd() * 1.05, p = anLand(a, f), h = gelaende(p.x, p.z);
      if (h < -3 || !frei(p.x, p.z, 7)) continue;
      const s = .6 + rnd() * 1.8, fe = M.fels(rnd, I.fels); fe.scale.setScalar(s); aufBoden(fe, p.x, p.z, -s * .2); fe.rotation.y = rnd() * 6; gruppe.add(fe);
      if (h > -1) W.hindernisse.push({ x:p.x, z:p.z, r:s * .85 });
      n++;
    }
    // Ferne Inselchen am Horizont
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2, d = 200 + rnd() * 80, s = 8 + rnd() * 14;
      const k = new T.Mesh(new T.ConeGeometry(s, s * .5, 7), M.mat(I.gras2)); k.position.set(Math.cos(a) * d, s * .1, Math.sin(a) * d); gruppe.add(k);
    }
    // Wolken und Möwen
    W.wolken = [];
    for (let i = 0; i < 12; i++) {
      const w = M.wolke(rnd); w.position.set((rnd() - .5) * 400, 45 + rnd() * 30, (rnd() - .5) * 400); gruppe.add(w); W.wolken.push(w);
    }
    W.voegel = [];
    for (let i = 0; i < 6; i++) {
      const v = M.vogel(); gruppe.add(v);
      W.voegel.push({ m:v, r:15 + rnd() * 30, h:14 + rnd() * 10, w:rnd() * 6, s:(.15 + rnd() * .15) * (rnd() < .5 ? -1 : 1), cx:(rnd() - .5) * 30, cz:(rnd() - .5) * 30 });
    }
    return W;
  }

  function animieren(t, dt) {
    if (!wasser) return;
    const p = wasser.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, welle(wasserBasis[i * 3], wasserBasis[i * 3 + 2], t));
    p.needsUpdate = true;
    wasser.geometry.computeVertexNormals();
    for (const w of W.wolken) { w.position.x += dt * 1.5; if (w.position.x > 220) w.position.x = -220; }
    for (const v of W.voegel) {
      v.w += v.s * dt;
      v.m.position.set(v.cx + Math.cos(v.w) * v.r, v.h + Math.sin(t * .7 + v.r) * 1.5, v.cz + Math.sin(v.w) * v.r);
      v.m.rotation.y = -v.w - (v.s > 0 ? 0 : Math.PI);
      const f = Math.sin(t * 9 + v.r) * .5;
      v.m.userData.l.rotation.x = -Math.PI / 2 + f; v.m.userData.r.rotation.x = -Math.PI / 2 - f;
    }
    for (const pa of W.palmen) pa.rotation.z = Math.sin(t * .8 + pa.position.x) * .015;
    const f = W.deko.feuer;
    if (f) { const s = 1 + Math.sin(t * 13) * .1 + Math.sin(t * 7.3) * .08; f.userData.flamme.scale.set(s, s * (1 + Math.sin(t * 9) * .15), s); f.userData.kern.rotation.y = t * 3; W.deko.feuerLicht.intensity = 1.1 + Math.sin(t * 11) * .25; }
    const c = W.deko.casino;
    if (c) c.userData.lichter.forEach((l, i) => l.material.color.set(((Math.floor(t * 4) + i) % 3) === 0 ? '#ff3b6b' : ((Math.floor(t * 4) + i) % 3) === 1 ? '#ffcc33' : '#3bd6ff'));
    for (const s of W.stationen) if (s.figur && s.art !== 'kuddel') s.figur.position.y += Math.sin(t * 2 + s.pos.x) * .0008;
  }

  return { bauen, animieren, gelaende, boden, welle, uferRadius, get insel() { return I; }, W };
})();
