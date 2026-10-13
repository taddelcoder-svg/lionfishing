'use strict';
// Fischfieber – alle 3D-Modelle, prozedural aus Grundformen gebaut (Low-Poly mit Canvas-Texturen und Vertex-Farben).
// Kleine Teile werden pro Modell zu EINEM Mesh verschmolzen (wenige Zeichenaufrufe, auch auf dem Handy).
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
  const mischen = (a, b, t) => '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString();
  // Kleiner deterministischer Zufall für Texturen und Formen
  function zuf(seed) { let s = Math.floor(seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

  /* ---------- Werkzeug: Texturen, verschmolzene Geometrie, Lofts ---------- */
  function leinwand(w, h, zeichnen, wdh) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    zeichnen(cv.getContext('2d'), w, h);
    const t = new T.CanvasTexture(cv); t.anisotropy = 4;
    if (wdh) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  const vcFlach = new T.MeshPhongMaterial({ vertexColors:true, flatShading:true, shininess:0, specular:0x000000 });
  const vcGlatt = new T.MeshPhongMaterial({ vertexColors:true, shininess:30, specular:0x2a2a2a });
  const vcMetall = new T.MeshPhongMaterial({ vertexColors:true, shininess:90, specular:0xaaaaaa });
  const flossenMat = new T.MeshPhongMaterial({ vertexColors:true, side:T.DoubleSide, shininess:25, specular:0x333333 });

  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new T.Vector3(), _s = new T.Vector3();
  // Ein Teil für verschmelzen(): Geometrie, Farbe, Position, Drehung, Skalierung
  function E(geo, farbe, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return { g:geo, f:farbe == null ? null : new T.Color(farbe), m:_m.clone() };
  }
  function verschmelzen(liste) {
    const mitUv = liste.every(e => e.g.attributes.uv), pos = [], nor = [], col = [], uv = [], weiss = new T.Color('#ffffff');
    for (const e of liste) {
      const g = e.g.index ? e.g.toNonIndexed() : e.g.clone();
      g.applyMatrix4(e.m);
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position.count, fc = g.attributes.color;
      for (let i = 0; i < n; i++) {
        pos.push(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i));
        nor.push(g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i));
        if (fc) col.push(fc.getX(i), fc.getY(i), fc.getZ(i)); else { const c = e.f || weiss; col.push(c.r, c.g, c.b); }
        if (mitUv) uv.push(g.attributes.uv.getX(i), g.attributes.uv.getY(i));
      }
      g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    if (mitUv) out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return out;
  }
  const Gk = { kugel:new T.SphereGeometry(1, 8, 6), kugelF:new T.SphereGeometry(1, 12, 8), kegel:new T.ConeGeometry(1, 1, 5), kegel4:new T.ConeGeometry(1, 1, 4),
    zyl:new T.CylinderGeometry(1, 1, 1, 8), zyl6:new T.CylinderGeometry(1, 1, 1, 6), box:new T.BoxGeometry(1, 1, 1) };
  const kugelE = (f, x, y, z, rx, ry = rx, rz = rx) => E(Gk.kugel, f, x, y, z, 0, 0, 0, rx, ry, rz);
  const boxE = (f, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) => E(Gk.box, f, x, y, z, rx, ry, rz, w, h, d);
  const zylE = (f, x, y, z, r, h, rx = 0, ry = 0, rz = 0, r2 = r) => E(Gk.zyl, f, x, y, z, rx, ry, rz, r, h, r2);
  const kegelE = (f, x, y, z, r, h, rx = 0, ry = 0, rz = 0) => E(Gk.kegel, f, x, y, z, rx, ry, rz, r, h, r);
  function vm(liste, m = vcFlach, schatten = true) { return mesh(verschmelzen(liste), m, schatten); }

  // Röhre entlang eines Pfades mit wechselndem Radius (Palmstamm, Aal, Tentakel); u = Länge, v = Umfang
  function lofte(pfad, radien, seiten, ref, farbeFn) {
    const n = pfad.length, pos = [], nor = [], uv = [], col = [], idx = [], t = new T.Vector3(), s = new T.Vector3(), u = new T.Vector3(), d = new T.Vector3();
    for (let i = 0; i < n; i++) {
      t.subVectors(pfad[Math.min(i + 1, n - 1)], pfad[Math.max(i - 1, 0)]).normalize();
      s.crossVectors(t, ref); if (s.lengthSq() < 1e-6) s.set(0, 0, 1); s.normalize();
      u.crossVectors(s, t).normalize();
      const r = typeof radien === 'function' ? radien(i / (n - 1), i) : radien[i];
      for (let j = 0; j <= seiten; j++) {
        const a = j / seiten * Math.PI * 2;
        d.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(s, Math.sin(a));
        pos.push(pfad[i].x + d.x * r, pfad[i].y + d.y * r, pfad[i].z + d.z * r); nor.push(d.x, d.y, d.z);
        uv.push(i / (n - 1), j / seiten);
        if (farbeFn) { const c = farbeFn(i / (n - 1), j / seiten, i); col.push(c.r, c.g, c.b); }
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seiten; j++) {
      const a = i * (seiten + 1) + j, b = a + seiten + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    if (farbeFn) g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }
  // Boxen mit Texturkacheln nach Größe, damit Holzmaserung nicht verschmiert
  function holzBox(w, h, d, kachel = 1.3) {
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, sk = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * sk[f][0] / kachel, uv.getY(k) * sk[f][1] / kachel); }
    return g;
  }
  const tCache = {};
  function holzTextur() {
    if (tCache.holz) return tCache.holz;
    return tCache.holz = leinwand(256, 256, (c, w, h) => {
      const r = zuf(7);
      c.fillStyle = '#e9e4dc'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {   // Maserung
        c.strokeStyle = `rgba(70,45,25,${.05 + r() * .12})`; c.lineWidth = .6 + r() * 1.6;
        const y = r() * h; c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * .03 + i) * 3 + (r() - .5) * 2);
        c.stroke();
      }
      for (let i = 0; i < 5; i++) { // Astlöcher
        const x = r() * w, y = r() * h; c.fillStyle = 'rgba(60,38,20,.35)'; c.beginPath(); c.ellipse(x, y, 5 + r() * 4, 2.5 + r() * 2, 0, 0, 7); c.fill();
      }
      c.fillStyle = 'rgba(40,25,10,.25)'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3);
    }, true);
  }
  const holzMat = new T.MeshPhongMaterial({ vertexColors:true, map:holzTextur(), flatShading:true, shininess:4, specular:0x111111 });

  function stoffTextur(f1, f2, n, senkrecht) {
    const key = 'stoff' + f1 + f2 + n + senkrecht;
    return tCache[key] || (tCache[key] = leinwand(256, 128, (c, w, h) => {
      for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? f2 : f1; if (senkrecht) c.fillRect(i / n * w, 0, w / n + 1, h); else c.fillRect(0, i / n * h, w, h / n + 1); }
      const r = zuf(3); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${r() * .05})`; c.fillRect(r() * w, r() * h, 1 + r() * 8, 1); }
    }, true));
  }

  /* ---------- Fisch-Texturen: jede Art hat ihr eigenes Muster ----------
     Seitenansicht: links Schwanz, rechts Kopf, oben Rücken, unten Bauch. */
  const FP = {
    sardine:     { lang:.5,  hoch:.14, breit:.1,  kopf:.35, sw:.45, tail:'gabel', tl:.2,  th:.16, r:['weich', .2, .1, .0],  afl:[.12, .07], finF:'#6f93a8', iris:'#f0f0f0', auge:.045 },
    makrele:     { lang:.54, hoch:.17, breit:.12, kopf:.4,  sw:.55, tail:'gabel', tl:.22, th:.17, r:['weich', .2, .1, .08], r2:['weich', .13, .07, -.32], afl:[.12, .07], finlets:5, finF:'#245b6b', iris:'#f2d36b', auge:.045 },
    beissbarsch: { lang:.47, hoch:.24, breit:.13, kopf:.3,  sw:.4,  tail:'rund',  tl:.2,  th:.15, r:['stachel', .36, .2, .02], r2:['weich', .17, .09, -.38], afl:[.13, .08], finF:'#e0642a', iris:'#ffd23f', maul:'zaehne', buckel:.12, auge:.05 },
    thunfisch:   { lang:.62, hoch:.23, breit:.19, kopf:.45, sw:.6,  tail:'mond',  tl:.2,  th:.27, r:['weich', .2, .13, .04], r2:['weich', .12, .07, -.4], afl:[.12, .08], finlets:6, finletF:'#ffd23f', finF:'#18325c', iris:'#1a1a1a', auge:.05 },
    goldbrasse:  { lang:.45, hoch:.3,  breit:.13, kopf:.35, sw:.5,  tail:'gabel', tl:.22, th:.2,  r:['weich', .5, .12, 0],   afl:[.12, .09], finF:'#ff9f1a', iris:'#222222', auge:.05, buckel:.1 },
    rotbarsch:   { lang:.5,  hoch:.25, breit:.15, kopf:.3,  sw:.45, tail:'rund',  tl:.2,  th:.16, r:['stachel', .4, .14, -.02], afl:[.13, .08], finF:'#c43a22', iris:'#111111', auge:.062, buckel:.08 },
    seeteufel:   { lang:.4,  hoch:.26, breit:.3,  kopf:.18, sw:.75, tail:'rund',  tl:.2,  th:.14, r:['weich', .3, .1, -.1],  afl:[.14, .08], finF:'#3a2f3d', iris:'#d6ff6b', maul:'gross', laterne:true, auge:.05 },
    babyhai:     { lang:.64, hoch:.19, breit:.18, kopf:.55, sw:.5,  tail:'hai',   tl:.27, th:.17, r:['hai', .28, .22, .02],  r2:['weich', .1, .05, -.4], afl:[.1, .06], kiemen:4, maul:'hai', iris:'#111111', auge:.032 },
    goldhai:     { lang:.64, hoch:.19, breit:.18, kopf:.55, sw:.5,  tail:'hai',   tl:.27, th:.17, r:['hai', .28, .22, .02],  r2:['weich', .1, .05, -.4], afl:[.1, .06], kiemen:4, maul:'hai', iris:'#2a1a00', auge:.032 },
    admiral:     { lang:.64, hoch:.19, breit:.18, kopf:.55, sw:.5,  tail:'hai',   tl:.27, th:.17, r:['hai', .28, .22, .02],  r2:['weich', .1, .05, -.4], afl:[.1, .06], kiemen:4, maul:'hai', iris:'#111111', auge:.032 },
    schwertfisch:{ lang:.55, hoch:.18, breit:.13, kopf:.5,  sw:.55, tail:'mond',  tl:.18, th:.24, r:['segel', .5, .26, .0],  afl:[.1, .06], finF:'#1f3a5e', iris:'#111111', auge:.05, schwert:true },
    zitteraal:   {},
  };
  function fischTextur(typ) {
    const id = typ.id || typ.name;
    if (tCache['f' + id]) return tCache['f' + id];
    const c1 = typ.f1, c2 = typ.f2;
    return tCache['f' + id] = leinwand(256, 128, (c, W, H) => {
      const r = zuf(id.length * 7.3 + id.charCodeAt(0));
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mischen(c1, '#000000', .25)); g.addColorStop(.3, c1); g.addColorStop(.46, c1);
      g.addColorStop(.58, mischen(c1, c2, .55)); g.addColorStop(.7, c2); g.addColorStop(1, mischen(c2, '#ffffff', .4));
      if (typ.form === 'hai') { g.addColorStop(.5, c1); g.addColorStop(.53, c2); }
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const schuppen = (alpha, dunkel, gr, y0, y1) => {
        c.strokeStyle = dunkel ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`; c.lineWidth = 1;
        for (let y = y0, j = 0; y < y1; y += gr * .55, j++) for (let x = (j % 2) * gr * .5; x < W + gr; x += gr) { c.beginPath(); c.arc(x, y, gr * .55, Math.PI * .1, Math.PI * .9); c.stroke(); }
      };
      const bander = (n, breite, y0, y1, farbe, wellig, a = 1) => {
        for (let i = 0; i < n; i++) {
          const x = (i + .7) / (n + .3) * W; c.fillStyle = farbe; c.globalAlpha = a; c.beginPath();
          c.moveTo(x - breite / 2, y0);
          for (let y = y0; y <= y1; y += 4) c.lineTo(x - breite / 2 + Math.sin(y * .12 + i) * wellig, y);
          for (let y = y1; y >= y0; y -= 4) c.lineTo(x + breite / 2 + Math.sin(y * .12 + i) * wellig, y);
          c.closePath(); c.fill(); c.globalAlpha = 1;
        }
      };
      const punkte = (n, farbe, rmin, rmax, y0, y1, x0 = 0, x1 = W) => {
        for (let i = 0; i < n; i++) { c.fillStyle = farbe; c.beginPath(); c.arc(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), rmin + r() * (rmax - rmin), 0, 7); c.fill(); }
      };
      switch (id) {
        case 'sardine':
          c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(0, H * .5, W, 5);
          for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(20,40,70,.85)'; c.beginPath(); c.arc(W * (.32 + i * .09), H * .4, 3.5, 0, 7); c.fill(); }
          schuppen(.1, false, 14, 0, H); break;
        case 'makrele':
          bander(11, 9, 0, H * .5, 'rgba(10,35,45,.9)', 7); punkte(40, 'rgba(255,255,255,.35)', 1, 2, H * .5, H); break;
        case 'beissbarsch':
          bander(6, 20, 0, H * .78, 'rgba(25,45,15,.78)', 3);
          c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, H * .52, W, 8); schuppen(.12, true, 12, 0, H); break;
        case 'thunfisch':
          c.fillStyle = 'rgba(255,215,60,.7)'; c.fillRect(W * .12, H * .46, W * .8, 4);
          c.fillStyle = 'rgba(180,225,255,.28)'; c.fillRect(0, H * .5, W, 6);
          bander(14, 3, H * .7, H, 'rgba(255,255,255,.3)', 2); schuppen(.07, true, 16, 0, H * .6); break;
        case 'goldbrasse':
          schuppen(.3, true, 15, 0, H); schuppen(.2, false, 15, 3, H);
          c.fillStyle = 'rgba(70,35,0,.55)'; c.beginPath(); c.ellipse(W * .86, H * .4, 11, 26, 0, 0, 7); c.fill();
          c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(W * .15, H * .46, W * .7, 3); break;
        case 'rotbarsch':
          schuppen(.22, true, 17, 0, H); c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(W * .1, H * .5, W * .8, 3);
          punkte(30, 'rgba(120,20,10,.35)', 2, 4, 0, H * .45); break;
        case 'seeteufel':
          for (let i = 0; i < 38; i++) { c.fillStyle = `rgba(${r() < .5 ? '20,10,25' : '110,95,115'},.5)`; c.beginPath(); c.ellipse(r() * W, r() * H * .8, 6 + r() * 14, 4 + r() * 9, r() * 3, 0, 7); c.fill(); }
          punkte(24, 'rgba(255,255,255,.3)', 1, 2.5, 0, H); break;
        case 'babyhai': case 'goldhai': case 'admiral':
          punkte(id === 'babyhai' ? 26 : 8, 'rgba(255,255,255,.22)', 1.5, 3, 0, H * .45);
          if (id === 'admiral') for (let i = 0; i < 6; i++) { c.strokeStyle = 'rgba(255,240,230,.35)'; c.lineWidth = 2; const x = r() * W, y = r() * H * .5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18, y + 7); c.stroke(); }
          if (id === 'goldhai') schuppen(.18, true, 14, 0, H * .6); break;
        case 'schwertfisch':
          bander(9, 6, 0, H * .5, 'rgba(120,170,230,.3)', 2); c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, H * .5, W, 4); schuppen(.08, true, 18, 0, H); break;
        case 'kugelfisch': case 'kugelkoenig':
          punkte(id === 'kugelkoenig' ? 70 : 52, 'rgba(90,50,10,.55)', 2.5, 7, 0, H * .52);
          bander(5, 8, 0, H * .5, 'rgba(120,70,15,.35)', 5); punkte(18, 'rgba(255,255,255,.55)', 2, 4, H * .55, H); break;
        default: schuppen(.12, true, 14, 0, H);
      }
      // weiches Licht auf dem Rücken, dunkler Rand zum Bauch
      const gl = c.createLinearGradient(0, 0, 0, H); gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(.3, 'rgba(255,255,255,.14)'); gl.addColorStop(.46, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,.12)');
      c.fillStyle = gl; c.fillRect(0, 0, W, H);
    });
  }

  // Flosse aus Umriss (x nach vorn, y nach oben), Farbverlauf von der Wurzel zur Spitze
  function flosseGeo(pts, f1, f2) {
    const sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new T.ShapeGeometry(sh), p = g.attributes.position, col = [], a = new T.Color(f1), b = new T.Color(f2), c = new T.Color();
    let md = 1e-4; for (let i = 0; i < p.count; i++) md = Math.max(md, Math.hypot(p.getX(i), p.getY(i)));
    for (let i = 0; i < p.count; i++) { c.copy(a).lerp(b, Math.min(1, Math.hypot(p.getX(i), p.getY(i)) / md)); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return g;
  }
  const schwanzForm = {
    gabel:(l, h) => [[0, .03], [-l * .45, h * .55], [-l, h], [-l * .72, 0], [-l, -h], [-l * .45, -h * .55], [0, -.03]],
    rund:(l, h) => [[0, .03], [-l * .5, h * .85], [-l * .95, h * .55], [-l, 0], [-l * .95, -h * .55], [-l * .5, -h * .85], [0, -.03]],
    mond:(l, h) => [[0, .03], [-l * .3, h * .45], [-l * .95, h * 1.1], [-l * .62, h * .1], [-l * .62, -h * .1], [-l * .95, -h * 1.1], [-l * .3, -h * .45], [0, -.03]],
    hai:(l, h) => [[0, .03], [-l * .35, h * .75], [-l * .95, h * 1.7], [-l * .7, h * .35], [-l * .95, -h * .55], [-l * .45, -h * .6], [0, -.03]],
  };
  function rueckenForm(art, b, h) {
    if (art === 'stachel') { const k = 6, pts = [[b / 2, 0]]; for (let i = 0; i <= k; i++) { const x = b / 2 - i / k * b; pts.push([x, h * (i % 2 ? .78 : 1.0) * (1 - Math.abs(i / k - .35) * .5)]); } pts.push([-b / 2, 0]); return pts; }
    if (art === 'hai') return [[b / 2, 0], [b * .12, h * .8], [-b * .38, h], [-b * .5, 0]];
    if (art === 'segel') return [[b / 2, 0], [b * .32, h * .92], [-b * .05, h], [-b * .5, h * .55], [-b / 2, 0]];
    return [[b / 2, 0], [b * .28, h * .85], [-b * .12, h], [-b / 2, h * .35], [-b / 2, 0]];
  }
  const kugelFlecken = zuf(5);

  function fisch(typ) {
    const f = typ.form;
    if (f === 'krebs') return krebs(typ);
    if (f === 'kugel') return kugel(typ);
    if (f === 'krake') return krake(typ);
    if (f === 'stiefel') return stiefel(typ);
    if (f === 'aal') return aal(typ);
    const g = new T.Group(), p = Object.assign({ lang:.5, hoch:.22, breit:.15, kopf:.35, sw:.5, tail:'gabel', tl:.22, th:.17, r:['weich', .22, .13, 0], afl:[.12, .07], finF:typ.f1, iris:'#e8b923', auge:.045, buckel:0, maul:'klein' }, FP[typ.id] || {});
    if (typ.stark) { p.hoch *= 1.05; p.breit *= 1.05; }
    const { lang, hoch, breit } = p;
    // Körper: Ellipsoid mit schlankem Schwanzstiel und Spitzkopf, Textur per Seitenprojektion
    const bg = new T.SphereGeometry(1, 22, 14), bp = bg.attributes.position, bn = bg.attributes.normal, buv = bg.attributes.uv;
    const prof = nx => nx < 0 ? 1 - p.sw * Math.pow(-nx, 1.5) * .6 : nx > .4 ? 1 - p.kopf * Math.pow((nx - .4) / .6, 2) * .6 : 1;
    const ysk = (nx, ny) => ny > 0 ? 1 + p.buckel * Math.max(0, 1 - nx * nx * 2) : 1;
    for (let i = 0; i < bp.count; i++) {
      const nx = bp.getX(i), ny = bp.getY(i), nz = bp.getZ(i), s = prof(nx), ys = ysk(nx, ny);
      buv.setXY(i, (nx + 1) / 2, (ny + 1) / 2);
      bp.setXYZ(i, nx * lang, ny * hoch * s * ys, nz * breit * s);
      const v = new T.Vector3(nx / lang, ny / (hoch * s * ys), nz / (breit * s)).normalize(); bn.setXYZ(i, v.x, v.y, v.z);
    }
    const koerperMat = new T.MeshPhongMaterial({ map:fischTextur(typ), shininess:typ.glanz ? 110 : 55, specular:typ.glanz ? 0xffeeaa : 0x4a5560, emissive:typ.glanz ? 0x3a2600 : 0x000000 });
    const koerper = mesh(bg, koerperMat); g.add(koerper);
    const flaeche = (ex, ey) => ({ z:breit * prof(ex) * Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey)), y:ey * hoch * prof(ex) * ysk(ex, ey) });
    const fl = [], de = [];
    const fF = p.finF, fT = mischen(fF, '#ffffff', .22);
    // Schwanz, Rücken-, After- und Brustflossen
    const tg = flosseGeo(schwanzForm[p.tail](p.tl, p.th), fF, mischen(fF, '#000000', .25)); fl.push({ g:tg, m:new T.Matrix4().makeTranslation(-lang * .96, 0, 0) });
    const rueck = (R) => { const [art, b, h, xo] = R, x = lang * xo; const y = flaeche(xo, .98).y * .96;
      fl.push({ g:flosseGeo(rueckenForm(art, b, h), fF, fT), m:new T.Matrix4().makeTranslation(x, y, 0) }); };
    rueck(p.r); if (p.r2) rueck(p.r2);
    const afl = flosseGeo([[p.afl[0] / 2, 0], [-p.afl[0] * .2, -p.afl[1]], [-p.afl[0] / 2, -p.afl[1] * .3], [-p.afl[0] / 2, 0]], fF, fT);
    fl.push({ g:afl, m:new T.Matrix4().makeTranslation(-lang * .5, flaeche(-.5, -.98).y * .96, 0) });
    for (const s of [-1, 1]) {
      const bf = flosseGeo([[0, 0], [-.1, -.045], [-.17, -.1], [-.1, .005]], fF, fT);
      const m = new T.Matrix4().compose(new T.Vector3(lang * .38, -hoch * .35, breit * .78 * s), new T.Quaternion().setFromEuler(new T.Euler(s * 1.05, 0, .05)), new T.Vector3(1, 1, 1));
      fl.push({ g:bf, m });
      const pf = flosseGeo([[0, 0], [-.07, -.03], [-.11, -.075], [-.04, 0]], fF, fT);
      fl.push({ g:pf, m:new T.Matrix4().compose(new T.Vector3(-lang * .05, -hoch * .78, breit * .35 * s), new T.Quaternion().setFromEuler(new T.Euler(s * .9, 0, 0)), new T.Vector3(1, 1, 1)) });
    }
    if (p.finlets) for (let i = 0; i < p.finlets; i++) for (const sy of [1, -1]) {
      const x = -lang * (.45 + i * .085), y = sy * flaeche(-.45 - i * .085, sy * .98).y * .98;
      de.push(E(Gk.kegel4, p.finletF || mischen(typ.f1, '#ffffff', .1), x, y + sy * .02, 0, 0, 0, sy > 0 ? -1.2 : 1.2 + Math.PI, .018, .06, .008));
    }
    // Kiemen
    if (p.kiemen) for (let i = 0; i < p.kiemen; i++) for (const s of [-1, 1]) {
      const ex = .36 + i * .035, q = flaeche(ex, 0);
      de.push(boxE(mischen(typ.f1, '#000000', .55), lang * ex, 0, q.z * .985 * s, .008, hoch * (.85 - i * .06), .006, 0, 0, -.18));
    } else for (const s of [-1, 1]) {
      const q = flaeche(.42, 0);
      de.push(E(new T.TorusGeometry(hoch * .62, .0075, 4, 9, Math.PI), mischen(typ.f1, '#000000', .45), lang * .42, -hoch * .05, q.z * .985 * s, 0, 0, Math.PI / 2));
    }
    // Augen
    const ez = flaeche(.6, .3), ey = ez.y, ex = lang * .6, ar = p.auge;
    for (const s of [-1, 1]) {
      de.push(kugelE('#f6f4ec', ex, ey, ez.z * .98 * s, ar), kugelE(p.iris, ex + ar * .22, ey, (ez.z * .98 + ar * .42) * s, ar * .78),
        kugelE('#0a0a0a', ex + ar * .3, ey, (ez.z * .98 + ar * .68) * s, ar * .46), kugelE('#ffffff', ex + ar * .5, ey + ar * .25, (ez.z * .98 + ar * .86) * s, ar * .16));
    }
    // Maul
    const mx = lang * .94;
    if (p.maul === 'hai') {
      de.push(E(Gk.kugel, '#1d1416', mx - .05, -hoch * .32, 0, 0, 0, 0, .12, .018, breit * .66));
      for (let i = 0; i < 8; i++) for (const sy of [1, -1]) { const z = (i - 3.5) / 3.5 * breit * .5; de.push(kegelE('#ffffff', mx - .07 - Math.abs(z) * .25, -hoch * .32 + sy * .02, z, .009, .028, sy > 0 ? Math.PI : 0)); }
    } else if (p.maul === 'zaehne' || p.maul === 'gross') {
      const gross = p.maul === 'gross';
      de.push(E(Gk.kugel, '#2a0d12', lang * .9, -hoch * .12, 0, 0, 0, 0, gross ? .16 : .08, gross ? .075 : .045, breit * (gross ? .8 : .6)));
      const n = gross ? 9 : 6;
      for (let i = 0; i < n; i++) for (const sy of [1, -1]) {
        const a = (i / (n - 1) - .5) * 2, z = a * breit * (gross ? .66 : .48), x = lang * (gross ? .97 : .945) - Math.abs(a) * (gross ? .09 : .04);
        de.push(kegelE('#fdfdf2', x, -hoch * .12 + sy * (gross ? .05 : .03), z, gross ? .014 : .011, gross ? .07 : .045, sy > 0 ? Math.PI : 0, 0, sy > 0 ? 0 : 0));
      }
    } else for (const s of [-1, 1]) de.push(boxE(mischen(typ.f1, '#000000', .6), lang * .93, -hoch * .1, flaeche(.93, -.1).z * s * .6, .02, .006, .03, 0, s * .5));
    if (p.schwert) de.push(E(new T.ConeGeometry(.03, .75, 6), '#cfd7df', lang + .36, 0, 0, 0, 0, -Math.PI / 2, 1, 1, 1));
    if (p.laterne) {
      de.push(zylE('#3a2f3d', lang * .5, hoch + .11, 0, .008, .32, 0, 0, -.55));
      de.push(zylE('#3a2f3d', lang * .5 + .21, hoch + .235, 0, .004, .14, 0, 0, -1.6));
    }
    if (typ.hammer) {
      // Hammerkopf: gerundeter Querbalken mit Augen an den Enden
      const kopf = mesh(new T.SphereGeometry(1, 14, 8), new T.MeshPhongMaterial({ map:fischTextur(typ), shininess:50, specular:0x445566 })); kopf.scale.set(.15, .06, .42); kopf.position.set(lang + .02, -.01, 0);
      g.add(kopf);
      for (const s of [-1, 1]) { const a = mesh(new T.SphereGeometry(.05, 8, 6), mat('#f4f4ec'), false); a.position.set(lang + .05, .02, .38 * s); g.add(a);
        const pu = mesh(new T.SphereGeometry(.028, 6, 5), mat('#0a0a0a'), false); pu.position.set(lang + .085, .02, .405 * s); g.add(pu); }
      const hut = admiralshut(); hut.position.set(.1, hoch + .02, 0); hut.scale.setScalar(.5); g.add(hut);
      // Orden und Narben
      de.push(kugelE('#ffcc33', lang * .35, hoch * .3, flaeche(.35, .3).z * .99, .02), kugelE('#e8394a', lang * .27, hoch * .28, flaeche(.27, .28).z * .99, .014));
    }
    const fm = mesh(verschmelzen(fl.map(e => ({ g:e.g, f:null, m:e.m }))), flossenMat); g.add(fm);
    if (de.length) g.add(vm(de, vcGlatt, false));
    if (p.laterne) {
      const l = mesh(new T.SphereGeometry(.055, 8, 6), new T.MeshBasicMaterial({ color:'#d6ff6b' }), false);
      l.position.set(lang * .5 + .28, hoch + .3, 0); g.add(l);
      g.add(leuchtFlaeche(l.position, '#b6ff3b', .55));
    }
    if (typ.glanz) { const gs = leuchtFlaeche(new T.Vector3(0, 0, 0), '#ffcc33', typ.gr > 1 ? 1.4 : 1.1); g.add(gs); }
    g.userData.wackel = koerper;
    return g;
  }
  // Weicher, additiver Lichtschein (billboard) – günstiger Glühen-Effekt
  let glowTex = null;
  function leuchtFlaeche(pos, farbe, groesse, deckung = .55) {
    if (!glowTex) glowTex = leinwand(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
    const s = new T.Sprite(new T.SpriteMaterial({ map:glowTex, color:farbe, transparent:true, opacity:deckung, depthWrite:false, blending:T.AdditiveBlending }));
    s.position.copy(pos); s.scale.setScalar(groesse); s.renderOrder = 3;
    return s;
  }

  function aal(typ) {
    const g = new T.Group(), n = 26, pfad = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1), x = -.78 + t * 1.56; pfad.push(new T.Vector3(x, Math.sin(x * 6.5) * .05, Math.sin(x * 3 + 1) * .02)); }
    const geo = lofte(pfad, t => (.05 + .04 * Math.min(1, t * 1.6)) * Math.sqrt(Math.min(1, (1 - t) / .06)) * Math.min(1, .2 + t * 7), 10, new T.Vector3(0, 1, 0));
    const tex = leinwand(256, 128, (c, W, H) => {
      const gr = c.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, typ.f1); gr.addColorStop(.3, mischen(typ.f1, typ.f2, .15)); gr.addColorStop(.5, typ.f2); gr.addColorStop(.7, mischen(typ.f1, typ.f2, .15)); gr.addColorStop(1, typ.f1);
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
      const r = zuf(11); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(0,0,0,${.1 + r() * .22})`; c.beginPath(); c.arc(r() * W, r() * H, 1 + r() * 4, 0, 7); c.fill(); }
      for (let i = 0; i < 20; i++) { c.fillStyle = 'rgba(160,240,255,.55)'; c.fillRect(r() * W, r() * H, 6 + r() * 14, 2); }
    });
    // Faltenwurf: v läuft um den Körper, Bauch liegt unten (v≈.5 ↔ Textur-Mitte)
    const k = mesh(geo, new T.MeshPhongMaterial({ map:tex, shininess:60, specular:0x445544 })); g.add(k);
    const de = [], hz = .085;
    for (const s of [-1, 1]) {
      de.push(kugelE('#f6f4ec', .72, .085, hz * .85 * s, .028), kugelE('#ffd23f', .735, .085, hz * .95 * s, .02), kugelE('#0a0a0a', .745, .085, hz * 1.02 * s, .012));
    }
    de.push(E(Gk.kugel, '#2a1810', .83, -.02, 0, 0, 0, 0, .05, .02, .045));
    g.add(vm(de, vcGlatt, false));
    g.add(leuchtFlaeche(new T.Vector3(0, 0, 0), '#9ff3ff', 1.5));
    g.userData.wackel = k;
    return g;
  }

  function kugel(typ) {
    const g = new T.Group(), r = .4;
    const bg = new T.SphereGeometry(r, 18, 12), bp = bg.attributes.position, buv = bg.attributes.uv;
    for (let i = 0; i < bp.count; i++) buv.setXY(i, (bp.getX(i) / r + 1) / 2, (bp.getY(i) / r + 1) / 2);
    const k = mesh(bg, new T.MeshPhongMaterial({ map:fischTextur(typ), shininess:35, specular:0x666655 })); g.add(k);
    const de = [], fl = [];
    // Stacheln gleichmäßig verteilt (Fibonacci-Kugel), alle in einem Mesh
    const n = typ.krone ? 54 : 40, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + .5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * ga, d = new T.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
      if (d.x > .62 && Math.abs(d.z) < .6 && d.y < .5 && d.y > -.5) continue;   // Gesicht frei lassen
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d), e = new T.Euler().setFromQuaternion(q);
      de.push(E(Gk.kegel4, d.y < -.1 ? '#fff6dc' : mischen('#fff6dc', typ.f1, .25), d.x * r * 1.02, d.y * r * 1.02, d.z * r * 1.02, e.x, e.y, e.z, .035, .17, .035));
    }
    // Schwanz und Flossen
    fl.push({ g:flosseGeo(schwanzForm.rund(.2, .17), typ.f1, mischen(typ.f1, '#000000', .25)), m:new T.Matrix4().makeTranslation(-.44, 0, 0) });
    for (const s of [-1, 1]) {
      fl.push({ g:flosseGeo([[0, 0], [-.1, .05], [-.15, -.02], [-.07, -.08]], typ.f1, mischen(typ.f2, '#ffffff', .3)), m:new T.Matrix4().compose(new T.Vector3(.08, -.08, .38 * s), new T.Quaternion().setFromEuler(new T.Euler(s * .8, 0, 0)), new T.Vector3(1.2, 1.2, 1.2)) });
    }
    fl.push({ g:flosseGeo([[.06, 0], [-.04, .14], [-.12, 0]], typ.f1, mischen(typ.f1, '#000000', .2)), m:new T.Matrix4().makeTranslation(-.22, .36, 0) });
    // Gesicht: große Augen, Schnabelmund
    for (const s of [-1, 1]) {
      de.push(kugelE('#f8f8f0', .3, .12, .21 * s, .085), kugelE('#2a6a4a', .335, .12, .245 * s, .062), kugelE('#0a0a0a', .355, .12, .262 * s, .036), kugelE('#ffffff', .372, .145, .275 * s, .014));
      de.push(boxE('#c97a52', .31, .22, .17 * s, .08, .016, .03, 0, 0, s * -.4));
    }
    de.push(E(new T.TorusGeometry(.045, .02, 6, 10), '#d96a52', .39, -.08, 0, 0, Math.PI / 2, 0), kugelE('#6a1c20', .385, -.08, 0, .03));
    g.add(vm(de, vcGlatt, false));
    g.add(mesh(verschmelzen(fl.map(e => ({ g:e.g, f:null, m:e.m }))), flossenMat));
    if (typ.krone) {
      const kr = new T.Group(), gold = new T.MeshPhongMaterial({ color:'#ffcc33', shininess:100, specular:0xffffff, emissive:0x553a00, flatShading:true });
      const kl = [];
      kl.push(E(new T.CylinderGeometry(.2, .23, .12, 12, 1, true), '#ffcc33'));
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
        kl.push(E(Gk.kegel4, '#ffcc33', x * .2, .13, z * .2, 0, 0, 0, .06, .16, .06));
        kl.push(kugelE(i % 2 ? '#e8394a' : '#3fa0ff', x * .22, .01, z * .22, .028));
        kl.push(kugelE('#fff6c0', x * .2, .23, z * .2, .022));
      }
      const kron = mesh(verschmelzen(kl), vcGlatt, false); kron.material = new T.MeshPhongMaterial({ vertexColors:true, shininess:100, specular:0xffffff, side:T.DoubleSide }); void gold;
      kr.add(kron); kr.position.y = .43; g.add(kr);
      g.add(leuchtFlaeche(new T.Vector3(0, .5, 0), '#ffd24a', 1.3));
    }
    g.userData.wackel = k;
    return g;
  }

  function krebs(typ) {
    const g = new T.Group(), dunkel = mischen(typ.f1, '#000000', .3), hell = typ.f2;
    // Panzer: flache Kuppel mit gesprenkelter Textur
    const pg = new T.SphereGeometry(.35, 16, 10, 0, Math.PI * 2, 0, Math.PI * .62), pp = pg.attributes.position, puv = pg.attributes.uv;
    for (let i = 0; i < pp.count; i++) puv.setXY(i, pp.getX(i) / .7 + .5, pp.getZ(i) / .84 + .5);
    const tex = leinwand(128, 128, (c, w, h) => {
      c.fillStyle = typ.f1; c.fillRect(0, 0, w, h); const r = zuf(typ.f1.charCodeAt(2));
      for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${r() < .5 ? '255,235,200' : '60,10,0'},${.12 + r() * .25})`; c.beginPath(); c.arc(r() * w, r() * h, 1.5 + r() * 5, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 2; c.beginPath(); c.moveTo(w * .1, h * .35); c.quadraticCurveTo(w / 2, h * .5, w * .9, h * .35); c.stroke();
    });
    const pan = mesh(pg, new T.MeshPhongMaterial({ map:tex, shininess:50, specular:0x553322 })); pan.scale.set(1, .55, 1.2); pan.position.y = .1; g.add(pan);
    const de = [];
    de.push(E(Gk.kugelF, hell, 0, .1, 0, 0, 0, 0, .31, .06, .38));   // heller Bauch
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = -.12 + i * .12;
        de.push(zylE(typ.f1, x, .09, s * .36, .022, .3, s * 1.1, 0, 0, .014));
        de.push(zylE(dunkel, x, .055, s * .52, .016, .2, s * .7, 0, 0, .008));
      }
      // Arm und Schere
      de.push(zylE(typ.f1, .27, .15, s * .3, .035, .26, 0, 0, Math.PI / 2 - s * .25 * 0, .028));
      de.push(E(Gk.kugel, typ.f1, .5, .17, s * .34, 0, 0, 0, .14, .07, .09));
      de.push(kegelE(hell, .62, .17, s * .27, .035, .13, 0, 0, -Math.PI / 2 + s * .35), kegelE(hell, .62, .17, s * .41, .03, .1, 0, 0, -Math.PI / 2 - s * .35));
      // Augenstiele
      de.push(zylE(typ.f1, .27, .28, s * .1, .012, .14), kugelE('#f4f4ec', .27, .36, s * .1, .04), kugelE('#0a0a0a', .295, .37, s * .1, .022));
      de.push(zylE(dunkel, .3, .26, s * .17, .004, .16, 0, 0, -1.2));   // Fühler
    }
    for (let i = 0; i < 5; i++) de.push(kegelE(dunkel, -.05 + i * .06, .26, 0, .018, .05));
    g.add(vm(de, vcGlatt, false));
    g.userData.wackel = pan;
    return g;
  }

  function krake(typ) {
    const g = new T.Group();
    const kg = new T.SphereGeometry(.3, 16, 12), kp = kg.attributes.position, kuv = kg.attributes.uv;
    for (let i = 0; i < kp.count; i++) kuv.setXY(i, (kp.getX(i) / .3 + 1) / 2, (kp.getY(i) / .3 + 1) / 2);
    const tex = leinwand(128, 128, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, mischen(typ.f1, '#000000', .2)); gr.addColorStop(.5, typ.f1); gr.addColorStop(1, typ.f2);
      c.fillStyle = gr; c.fillRect(0, 0, w, h); const r = zuf(4);
      for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${r() < .6 ? '255,220,250' : '60,0,50'},${.15 + r() * .3})`; c.beginPath(); c.arc(r() * w, r() * h * .8, 2 + r() * 6, 0, 7); c.fill(); }
    });
    const kopf = mesh(kg, new T.MeshPhongMaterial({ map:tex, shininess:70, specular:0x886688 })); kopf.scale.set(1, 1.25, 1); kopf.position.y = .38; g.add(kopf);
    // Tentakel: gebogene Röhren mit hellerer Unterseite und Saugnäpfen
    const tl = [], cA = new T.Color(typ.f1), cB = new T.Color(typ.f2), c = new T.Color(), de = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), pfad = [], rot = (Math.random() - .5) * 0;
      for (let k = 0; k < 8; k++) {
        const t = k / 7, rad = .16 + t * .34 + Math.sin(t * 3 + i) * .02;
        pfad.push(new T.Vector3(ca * rad, .26 - t * .24 + Math.sin(t * 6 + i * 1.7) * .02, sa * rad + rot));
      }
      tl.push(lofte(pfad, t => .08 * (1 - t * .85), 7, new T.Vector3(0, 1, 0), t => c.copy(cA).lerp(cB, t * .75)));
      for (let k = 1; k < 6; k++) de.push(kugelE('#f8d9f0', pfad[k].x * .98, pfad[k].y - .035, pfad[k].z * .98, .014 * (1 - k * .1)));
    }
    g.add(mesh(verschmelzen(tl.map(x => ({ g:x, f:null, m:new T.Matrix4() }))), vcGlatt));
    for (const s of [-1, 1]) {
      de.push(kugelE('#f4f0e0', .25, .4, .13 * s, .075), kugelE('#d98a1a', .285, .4, .15 * s, .052), E(Gk.kugel, '#0a0a0a', .31, .4, .16 * s, 0, 0, 0, .014, .045, .022), kugelE('#ffffff', .318, .43, .165 * s, .012));
    }
    g.add(vm(de, vcGlatt, false));
    g.userData.wackel = kopf;
    return g;
  }

  function stiefel(typ) {
    const g = new T.Group(), de = [], leder = typ.f1, dunkel = typ.f2;
    de.push(zylE(leder, 0, .23, 0, .1, .4, 0, 0, 0, .088));            // Schaft
    de.push(zylE(mischen(leder, '#000000', .35), 0, .43, 0, .102, .05, 0, 0, 0, .1));   // Umschlag
    de.push(E(Gk.kugelF, leder, .08, .075, 0, 0, 0, 0, .17, .075, .095));  // Fuß
    de.push(boxE(dunkel, .08, .0, 0, .36, .036, .19));                    // Sohle
    de.push(boxE(dunkel, -.07, -.035, 0, .1, .045, .17));                 // Absatz
    for (let i = 0; i < 4; i++) de.push(boxE('#cfc3a0', .105, .18 + i * .045, 0, .014, .012, .13, 0, 0, i % 2 ? .3 : -.3));   // Schnürsenkel
    de.push(kugelE('#9a8456', .13, .12, 0, .02));
    for (let i = 0; i < 6; i++) de.push(boxE('#5f8a3a', -.02 + (i % 3) * .05, .45 + i * .03, ((i % 2) - .5) * .12, .02, .12 + (i % 3) * .05, .008, .3 * i, 0, 0));   // Seetang
    g.add(vm(de, vcGlatt));
    g.userData.wackel = g.children[0];
    return g;
  }

  /* ---------- Menschen und Möwe ---------- */
  function admiralshut() {
    const de = [];
    de.push(zylE('#1d2b4a', 0, 0, 0, .33, .06, 0, 0, 0, .33));
    de.push(zylE('#1d2b4a', 0, .12, 0, .22, .2, 0, 0, 0, .25));
    de.push(zylE('#243759', 0, .225, 0, .23, .03, 0, 0, 0, .21));
    de.push(boxE('#ffcc33', .25, .14, 0, .02, .09, .13, 0, 0, 0), boxE('#ffcc33', 0, .07, 0, .5, .018, .5, 0, 0, 0));
    de.push(zylE('#ffcc33', 0, .075, 0, .255, .02, 0, 0, 0, .255));
    de.push(kugelE('#e8394a', .26, .14, 0, .02));
    const h = new T.Group(); h.add(vm(de, vcGlatt)); return h;
  }
  // art: 'hein', 'kuddel' oder 'spieler' (Mitspieler, Jackenfarbe aus farbe)
  function person(art, farbe) {
    const g = new T.Group();
    const F = {
      hein:    { jacke:'#f2c12e', hose:'#2d3e5a', haut:'#f0c19a', hut:'suedwester', haar:'#7a4a22', stiefel:'#3a2f2a' },
      kuddel:  { jacke:'#1d2b4a', hose:'#22262e', haut:'#e8b48f', hut:'kapitaen', bart:true, haar:'#f2f2f2', stiefel:'#17181c' },
      spieler: { jacke:farbe, hose:'#3b3f46', haut:'#efc4a0', hut:'muetze', haar:'#4a3322', stiefel:'#2c2a28' },
    }[art];
    const de = [], dunkel = mischen(F.jacke, '#000000', .3), hell = mischen(F.jacke, '#ffffff', .22);
    // Beine mit Stiefeln und Gürtel
    for (const s of [-1, 1]) {
      de.push(zylE(F.hose, 0, .52, s * .12, .11, .62, 0, 0, 0, .1));
      de.push(zylE(F.stiefel, 0, .15, s * .12, .115, .3, 0, 0, 0, .11), boxE(F.stiefel, .09, .06, s * .12, .3, .12, .2));
    }
    de.push(zylE(F.hose, 0, .86, 0, .26, .24, 0, 0, 0, .27));
    // Rumpf (Jacke), Taille, Kragen
    de.push(E(Gk.zyl, F.jacke, 0, 1.16, 0, 0, 0, 0, .3, .66, .3));
    de.push(zylE(dunkel, 0, .88, 0, .292, .07, 0, 0, 0, .292), boxE('#d9b44a', .295, .88, 0, .03, .06, .07));
    de.push(zylE(hell, 0, 1.5, 0, .2, .08, 0, 0, 0, .21));
    if (art === 'hein') for (const s of [-1, 1]) de.push(boxE('#c98f1a', .27, 1.2, s * .1, .03, .55, .035));   // Träger/Reflexstreifen
    if (art === 'hein') de.push(boxE('#e8e8ea', .305, 1.0, 0, .02, .05, .56));
    if (art === 'kuddel') {
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) de.push(kugelE('#ffcc33', .295, 1.34 - i * .12, s * .06, .026));
      for (const s of [-1, 1]) de.push(boxE('#ffcc33', 0, 1.46, s * .26, .1, .03, .12, 0, 0, s * .1));
    }
    if (art === 'spieler') { de.push(boxE(hell, .31, 1.18, 0, .02, .66, .06)); de.push(boxE(dunkel, -.28, 1.15, 0, .12, .5, .34)); }
    // Arme mit Händen
    for (const s of [-1, 1]) {
      de.push(zylE(F.jacke, 0, 1.2, s * .37, .085, .62, s * .15, 0, 0, .075));
      de.push(zylE(hell, 0, .93, s * .39, .082, .05, s * .15, 0, 0, .082));
      de.push(kugelE(F.haut, .02, .88, s * .395, .075));
    }
    // Kopf: Gesicht mit Augen, Brauen, Nase, Mund
    de.push(E(Gk.kugelF, F.haut, 0, 1.73, 0, 0, 0, 0, .245, .26, .235));
    for (const s of [-1, 1]) {
      de.push(kugelE('#fbfbf6', .205, 1.77, .085 * s, .043), kugelE('#2a2018', .24, 1.77, .088 * s, .025), kugelE('#ffffff', .252, 1.785, .092 * s, .008));
      de.push(boxE(art === 'kuddel' ? '#eeeeee' : F.haar, .225, 1.835, .09 * s, .03, .02, .08, 0, 0, s * .12));
      de.push(kugelE(F.haut, 0, 1.73, .235 * s, .05));  // Ohr
    }
    de.push(kugelE(mischen(F.haut, '#d06a50', .35), .245, 1.69, 0, .052), boxE('#8a3a30', .235, 1.6, 0, .02, .012, .1));
    if (art === 'hein') de.push(zylE('#6a4a2a', .27, 1.585, .04, .012, .13, 0, 0, Math.PI / 2 - .1), E(Gk.kugel, '#4a3220', .345, 1.6, .04, 0, 0, 0, .035, .04, .035));   // Pfeife
    if (F.bart) { de.push(E(Gk.kugelF, F.haar, .1, 1.58, 0, 0, 0, 0, .17, .2, .22), E(Gk.kugelF, F.haar, .2, 1.65, 0, 0, 0, 0, .06, .04, .13)); }
    else de.push(E(Gk.kugelF, F.haar, -.06, 1.8, 0, 0, 0, 0, .22, .17, .22));   // Haar
    // Hut
    if (F.hut === 'suedwester') {
      de.push(zylE('#f2c12e', 0, 1.92, 0, .27, .2, 0, 0, 0, .25), E(new T.ConeGeometry(.4, .08, 12), '#e0ac1a', 0, 1.86, 0, 0, 0, 0, 1, 1, 1));
      de.push(boxE('#d79b16', -.3, 1.8, 0, .24, .06, .46, 0, 0, .5), zylE('#e0ac1a', .02, 1.84, 0, .32, .04, 0, 0, 0, .32));
    } else if (F.hut === 'muetze') {
      de.push(E(new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), farbe, 0, 1.78, 0, 0, 0, 0, .26, .22, .26), boxE(mischen(farbe, '#000000', .25), .26, 1.79, 0, .2, .025, .3), kugelE('#ffffff', 0, 2.0, 0, .035));
    } else { const h = admiralshut(); const hm = h.children[0]; hm.position.y = 1.9; hm.scale.setScalar(1); hm.castShadow = true; g.add(hm); }
    g.add(vm(de, vcGlatt));
    return g;
  }
  function moewe() {
    const g = new T.Group(), de = [], weiss = '#f6f7f8', grau = '#9aa4ad';
    de.push(E(Gk.kugelF, weiss, 0, 1.0, 0, 0, 0, 0, .62, .48, .45));   // Körper
    de.push(E(Gk.kugelF, '#ffffff', .22, 1.1, 0, 0, 0, 0, .34, .34, .3));   // Brust
    de.push(E(Gk.kugelF, '#ffffff', .46, 1.55, 0, 0, 0, 0, .3, .3, .28));   // Kopf
    de.push(E(Gk.kegel, '#f5a623', .86, 1.5, 0, 0, 0, -Math.PI / 2, .075, .42, .06), kugelE('#d62839', .98, 1.49, .03, .016), kugelE('#d62839', .98, 1.49, -.03, .016));
    for (const s of [-1, 1]) {
      // Flügel: gefaltet am Körper, graue Decke mit schwarzer Spitze
      de.push(E(Gk.kugelF, grau, -.1, 1.05, s * .42, 0, 0, 0, .52, .14, .26), E(Gk.kegel4, '#222a30', -.62, 1.0, s * .42, 0, 0, Math.PI / 2 + .1, .1, .3, .22));
      de.push(zylE('#f5a623', 0, .3, s * .18, .035, .55, 0, 0, 0, .03), E(Gk.box, '#f5a623', .12, .03, s * .18, 0, 0, 0, .3, .04, .14));
      de.push(boxE('#f5a623', .22, .03, s * .13, .12, .03, .035, 0, s * .4, 0), boxE('#f5a623', .22, .03, s * .23, .12, .03, .035, 0, s * -.4, 0));
      de.push(kugelE('#fffbe8', .6, 1.6, .22 * s, .06), kugelE('#d99a1a', .64, 1.6, .24 * s, .042), kugelE('#0a0a0a', .66, 1.6, .25 * s, .026));
    }
    de.push(E(Gk.kegel4, '#e9ecee', -.62, 1.02, 0, 0, 0, Math.PI / 2, .13, .4, .22));   // Schwanz
    // Croupier-Look: Sonnenbrille und Fliege
    de.push(boxE('#111111', .73, 1.62, 0, .06, .1, .45), boxE('#111111', .74, 1.62, .3, .03, .02, .08), boxE('#111111', .74, 1.62, -.3, .03, .02, .08));
    de.push(boxE('#d62839', .46, 1.27, 0, .1, .1, .14), kugelE('#b01e2c', .5, 1.27, 0, .05), boxE('#d62839', .46, 1.27, .1, .06, .15, .08, .5, 0, 0), boxE('#d62839', .46, 1.27, -.1, .06, .15, .08, -.5, 0, 0));
    g.add(vm(de, vcGlatt));
    return g;
  }

  /* ---------- Gebäude & Natur ---------- */
  // Beschilderung: Holzbrett mit Rand, Nieten und Schlagschatten
  function textSchild(text, breite, hoehe, farbe = '#3a2412', schrift = '#fff3d6') {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * hoehe / breite);
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, mischen(farbe, '#ffffff', .12)); gr.addColorStop(1, mischen(farbe, '#000000', .25));
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    const r = zuf(text.length);
    for (let i = 0; i < 26; i++) { c.strokeStyle = `rgba(0,0,0,${.05 + r() * .1})`; c.lineWidth = 1 + r() * 2; c.beginPath(); const y = r() * H; c.moveTo(0, y); c.bezierCurveTo(W * .3, y + 5, W * .6, y - 5, W, y + 2); c.stroke(); }
    c.strokeStyle = 'rgba(255,230,190,.35)'; c.lineWidth = 5; c.strokeRect(12, 12, W - 24, H - 24);
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 10; c.strokeRect(4, 4, W - 8, H - 8);
    for (const [x, y] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) { c.fillStyle = '#c9b78a'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(x + 1.5, y + 1.5, 3, 0, 7); c.fill(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let gs = H * .52; c.font = `800 ${gs}px "Bricolage Grotesque", sans-serif`;
    while (c.measureText(text).width > W * .84) { gs *= .92; c.font = `800 ${gs}px "Bricolage Grotesque", sans-serif`; }
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillText(text, W / 2 + 3, H / 2 + 7);
    c.fillStyle = schrift; c.fillText(text, W / 2, H / 2 + 4);
    const tex = new T.CanvasTexture(cv); tex.anisotropy = 4;
    return mesh(new T.PlaneGeometry(breite, hoehe), new T.MeshBasicMaterial({ map:tex, side:T.DoubleSide }), false);
  }
  function awningTextur(f) {
    return tCache['aw' + f] || (tCache['aw' + f] = leinwand(128, 256, (c, w, h) => {
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f6f1e6' : f; c.fillRect(0, i * h / 8, w, h / 8 + 1); }
      const r = zuf(2); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${r() * .06})`; c.fillRect(r() * w, r() * h, 1, 2 + r() * 7); }
    }, true));
  }
  function bude(titel, dachFarbe, art) {
    art = art || (/CASINO/i.test(titel) ? 'casino' : 'shop');
    const g = new T.Group(), de = [];
    const holz = '#8b5a2b', dunkel = '#5e3b1c', hell1 = '#a8743a';
    de.push({ g:holzBox(3.2, .2, 3.6), f:new T.Color(dunkel), m:new T.Matrix4().makeTranslation(0, .1, 0) });   // Boden
    for (let z = -1.6; z <= 1.6; z += .4) de.push({ g:holzBox(3.2, .02, .36), f:new T.Color(z % .8 ? '#6d4426' : '#7a4c28'), m:new T.Matrix4().makeTranslation(0, .21, z) });
    // Theke: Korpus aus senkrechten Brettern, Platte mit Überstand
    de.push({ g:holzBox(1.2, 1.0, 3.2), f:new T.Color(holz), m:new T.Matrix4().makeTranslation(.9, .55, 0) });
    de.push({ g:holzBox(1.42, .08, 3.4), f:new T.Color(hell1), m:new T.Matrix4().makeTranslation(.95, 1.1, 0) });
    for (let z = -1.5; z <= 1.5; z += .5) de.push({ g:holzBox(.03, .9, .04), f:new T.Color(dunkel), m:new T.Matrix4().makeTranslation(1.51, .56, z) });
    de.push({ g:holzBox(.05, .06, 3.3), f:new T.Color(dunkel), m:new T.Matrix4().makeTranslation(1.52, .12, 0) });
    // Pfosten mit Kappen
    for (const [x, z] of [[1.5, 1.7], [1.5, -1.7], [-1.5, 1.7], [-1.5, -1.7]]) {
      de.push({ g:holzBox(.2, 2.8, .2), f:new T.Color(holz), m:new T.Matrix4().makeTranslation(x, 1.4, z) });
      de.push({ g:holzBox(.28, .08, .28), f:new T.Color(dunkel), m:new T.Matrix4().makeTranslation(x, 2.82, z) });
    }
    // Streben und Rückwand aus Brettern
    for (const s of [-1, 1]) de.push({ g:holzBox(.1, 1.1, .1), f:new T.Color(dunkel), m:new T.Matrix4().compose(new T.Vector3(1.3, 2.35, 1.5 * s), new T.Quaternion().setFromEuler(new T.Euler(0, 0, 0)), new T.Vector3(1, 1, 1)) });
    for (let z = -1.6; z <= 1.6; z += .4) de.push({ g:holzBox(.15, 2.6, .38), f:new T.Color(z % .8 ? '#7d5026' : '#8b5a2b'), m:new T.Matrix4().makeTranslation(-1.5, 1.5, z) });
    // Regale an der Rückwand
    for (const y of [1.35, 2.0]) de.push({ g:holzBox(.35, .06, 3.0), f:new T.Color(hell1), m:new T.Matrix4().makeTranslation(-1.3, y, 0) });
    g.add(mesh(verschmelzen(de), holzMat));
    const d2 = [];
    const farben = ['#d62839', '#ffcc33', '#2a9d8f', '#3fa0ff', '#f4f4f4'];
    if (art === 'shop') {
      // Angelruten an der Wand, Köder-Eimer, Netz, Schwimmer und Fischkiste
      FF.RUTEN.forEach((ru, i) => d2.push(zylE(ru.farbe, -1.38, 1.7, -1.3 + i * .22, .014, 1.9, 0, 0, .1, .006)));
      d2.push(zylE('#3c78c8', -1.0, 1.55, 1.3, .17, .3, 0, 0, 0, .13), zylE('#2a5aa0', -1.0, 1.71, 1.3, .18, .03, 0, 0, 0, .18), E(new T.TorusGeometry(.14, .012, 4, 10, Math.PI), '#999', -1.0, 1.75, 1.3, 0, 0, 0));
      for (let i = 0; i < 6; i++) d2.push(kugelE(i % 2 ? '#d62839' : '#f4f4f4', -1.15, 1.45, -1.2 + i * .13, .06), kugelE(i % 2 ? '#f4f4f4' : '#d62839', -1.15, 1.51, -1.2 + i * .13, .05));
      for (let i = 0; i < 4; i++) d2.push(kugelE(farben[i], -1.2, 2.05 + .0, -.2 + i * .16, .05), zylE('#777', -1.2, 2.16, -.2 + i * .16, .01, .1));
      d2.push(boxE('#9a6a38', 1.0, 1.28, .9, .55, .22, .8), boxE('#7a5028', 1.0, 1.4, .9, .5, .03, .75));
      for (let i = 0; i < 3; i++) d2.push(E(Gk.kugelF, ['#8fb3c9', '#e2552f', '#ffcc33'][i], 1.0, 1.43, .65 + i * .22, 0, 0, 0, .1, .04, .05, .04));
      d2.push(boxE('#4a7a9a', 1.1, 1.17, -.6, .5, .1, .6), kugelE('#d62839', 1.0, 1.28, -.6, .06), kugelE('#ffcc33', 1.2, 1.26, -.5, .05));
      d2.push(E(new T.TorusGeometry(.35, .07, 6, 14), '#e8394a', -1.38, 1.1, .9, 0, Math.PI / 2, 0), E(new T.TorusGeometry(.35, .074, 6, 14, 1.0), '#f4f4f4', -1.37, 1.1, .9, 0, Math.PI / 2, .6));
    } else {
      // Spielautomat, Würfelbecher und Chips auf der Theke
      d2.push(boxE('#7a1620', 1.0, 1.7, -.9, .5, 1.1, .5), boxE('#111', 1.27, 1.85, -.9, .04, .34, .36), boxE('#d62839', 1.27, 1.45, -.9, .06, .14, .4), E(new T.CylinderGeometry(.03, .03, .3, 6), '#cccccc', 1.1, 2.1, -.62, 0, 0, .3), kugelE('#e8394a', 1.07, 2.25, -.62, .055));
      for (let i = 0; i < 3; i++) d2.push(boxE(['#ffcc33', '#e8394a', '#3fa0ff'][i], 1.28, 1.88, -.9 + (i - 1) * .1, .02, .12, .08));
      for (let k = 0; k < 4; k++) for (let i = 0; i < 5; i++) d2.push(zylE(['#d62839', '#2a9d8f', '#ffcc33', '#222'][k], 1.0 + (k % 2) * .2, 1.16 + i * .035, .6 + (k >> 1) * .22, .07, .03, 0, 0, 0, .07));
      d2.push(boxE('#f4f4f4', 1.1, 1.15, .1, .09, .09, .09, .4, .3, .2), boxE('#f4f4f4', .8, 1.15, .3, .09, .09, .09, .2, .8, .1));
      d2.push(boxE('#fff', 1.0, 1.145, -.2, .12, .006, .17, 0, .3, 0), boxE('#fff', 1.1, 1.147, -.18, .12, .006, .17, 0, -.2, 0));
    }
    // Pfosten-Laternen
    d2.push(boxE(dunkel, 1.9, 2.55, 1.6, .04, .3, .04));
    g.add(vm(d2, vcGlatt));
    // Dach: gestreifte Markise, Zackenrand, Giebelbalken
    const dach = new T.Group(); dach.position.set(0, 2.95, 0); dach.rotation.z = .18;
    const dm = mesh(holzBox(3.8, .15, 4.2), new T.MeshPhongMaterial({ map:awningTextur(dachFarbe), flatShading:true, shininess:6, specular:0x111111 })); dach.add(dm);
    const rd = [];
    for (let i = 0; i < 9; i++) rd.push(E(Gk.kegel4, i % 2 ? '#f6f1e6' : dachFarbe, 1.93, -.2, -1.9 + i * .475, 0, Math.PI / 4, Math.PI, .24, .3, .24));
    rd.push(boxE(dunkel, 0, -.12, 1.9, 3.8, .07, .1), boxE(dunkel, 0, -.12, -1.9, 3.8, .07, .1));
    dach.add(vm(rd, vcFlach));
    g.add(dach);
    // Hängelaternen
    for (const z of [-1.5, 1.5]) {
      const lm = new T.Mesh(new T.SphereGeometry(.1, 8, 6), new T.MeshBasicMaterial({ color:'#ffd98a' })); lm.position.set(1.95, 2.45, z * 1.25); g.add(lm);
      g.add(leuchtFlaeche(lm.position, '#ffb347', .8));
    }
    // Wimpel
    const w = [];
    w.push(zylE(dunkel, -1.7, 3.5, 1.8, .025, 1.0), E(Gk.kegel4, dachFarbe, -1.7, 3.7, 1.55, Math.PI / 2, 0, 0, .15, .6, .03));
    g.add(vm(w, vcFlach));
    const schild = textSchild(titel, 3.2, .7); schild.position.set(1.62, 2.55, 0); schild.rotation.y = Math.PI / 2; g.add(schild);
    // Seile für das Schild
    const sl = [];
    for (const z of [-1.55, 1.55]) sl.push(zylE('#caa66a', 1.62, 2.88, z, .01, .3));
    g.add(vm(sl, vcFlach, false));
    return g;
  }
  function palme(rnd) {
    const g = new T.Group();
    const h = 4 + rnd() * 3, segs = 14, biege = (rnd() - .5) * 1.4, biegeZ = (rnd() - .5) * 1.4;
    const pfad = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs; pfad.push(new T.Vector3(biege * t * t, h * t, biegeZ * t * t)); }
    const spitze = pfad[segs].clone();
    const cA = new T.Color('#6b4a2c'), cB = new T.Color('#9a7a52'), cc = new T.Color(), nPhase = rnd() * 6;
    const stamm = lofte(pfad, t => (.2 - t * .09) * (1 + (t < .06 ? (.06 - t) * 5 : 0)) * (1 + .09 * Math.max(0, Math.sin(t * h * 5.2 + nPhase)) ), 8, new T.Vector3(1, 0, 0),
      (t, v, i) => cc.copy(cA).lerp(cB, (.5 + .5 * Math.sin(t * h * 5.2 + nPhase)) * .55 + t * .25));
    const nuss = [];
    for (let i = 0; i < 4; i++) nuss.push(kugelE('#5b3a1e', spitze.x + Math.cos(i * 1.6 + 1) * .22, spitze.y - .22, spitze.z + Math.sin(i * 1.6 + 1) * .22, .13));
    g.add(mesh(verschmelzen([{ g:stamm, f:null, m:new T.Matrix4() }, ...nuss]), vcFlach));
    // Wedel: Fiederblätter (Textur mit Alpha), nach außen hängend
    const bl = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const geo = wedelGeo(2.1 + rnd() * .8, .85 + rnd() * .25, .1 + rnd() * .22);
      const m = new T.Matrix4().compose(spitze.clone().add(new T.Vector3(0, .1, 0)), new T.Quaternion().setFromEuler(new T.Euler(0, i / n * Math.PI * 2 + rnd() * .4, (rnd() - .5) * .25 + (i % 2 ? .15 : 0))), new T.Vector3(1, 1, 1));
      bl.push({ g:geo, f:null, m });
    }
    const blattMesh = mesh(verschmelzen(bl), wedelMat(rnd() < .5)); blattMesh.castShadow = false;
    g.add(blattMesh);
    g.userData.spitze = spitze;
    return g;
  }
  // Ein Palmwedel: in +x, hängt zur Spitze durch; Fiederung kommt aus der Textur
  function wedelGeo(l, b, hang) {
    const geo = new T.PlaneGeometry(l, b, 8, 1); geo.translate(l / 2, 0, 0); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const t = p.getX(j) / l;
      p.setZ(j, p.getZ(j) * (1 - t * .3));
      p.setY(j, Math.sin(t * 2.6) * l * .12 - t * t * l * hang);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function wedelTextur() {
    return tCache.wedel || (tCache.wedel = leinwand(256, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const r = zuf(5), n = 30;
      // Fiedern: dichte, leicht überlappende Blättchen links und rechts der Mittelrippe
      for (let i = 0; i < n; i++) {
        const x = 8 + i / n * (w - 16), len = (h * .5) * (1 - Math.pow(i / n, 2.2) * .7);
        for (const s of [-1, 1]) {
          const y0 = h / 2, g = c.createLinearGradient(x, y0, x, y0 + s * len);
          g.addColorStop(0, '#a8e86f'); g.addColorStop(.5, `hsl(${96 + r() * 14},58%,${34 + r() * 10}%)`); g.addColorStop(1, `hsl(${100 + r() * 10},55%,${24 + r() * 8}%)`);
          c.fillStyle = g; c.beginPath(); c.moveTo(x - 6, y0); c.quadraticCurveTo(x + 2, y0 + s * len * .55, x + 11 + r() * 4, y0 + s * len * (.92 + r() * .08)); c.lineTo(x + 8, y0); c.closePath(); c.fill();
        }
      }
      c.strokeStyle = '#b7dd7e'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    }));
  }
  function wedelMat(hellig) {
    const k = 'wm' + hellig;
    return tCache[k] || (tCache[k] = new T.MeshLambertMaterial({ map:wedelTextur(), alphaTest:.45, side:T.DoubleSide, color:hellig ? '#e6ffd0' : '#c8f0b0', vertexColors:true }));
  }
  function fels(rnd, farbe) {
    const geo = new T.IcosahedronGeometry(1, 1), p = geo.attributes.position;
    const versatz = {}, pos = [], seed = rnd() * 50;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
      if (!versatz[key]) versatz[key] = .8 + rnd() * .38 + Math.sin(x * 4 + seed) * Math.cos(z * 3.3 + seed) * .12;
      const f = versatz[key]; p.setXYZ(i, x * f, y * f * .72, z * f);
    }
    const flach = geo; flach.computeVertexNormals(); void pos;
    const fp = flach.attributes.position, nor = flach.attributes.normal, col = [], c = new T.Color(), c0 = new T.Color(farbe), moos = new T.Color('#5f8f3c');
    for (let i = 0; i < fp.count; i += 3) {
      const ny = nor.getY(i), y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3, h = .85 + rnd() * .2;
      c.copy(c0).multiplyScalar(h * (.7 + (y + 1) * .22));
      if (ny > .55 && y > -.2 && rnd() < .75) c.lerp(moos, .45 + rnd() * .3);                // Moos oben
      else if (y < -.25) c.lerp(new T.Color('#2f3a3c'), .45);                                  // nasser, dunkler Fuß
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    flach.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return mesh(flach, vcFlach);
  }

  /* ---------- Boote ---------- */
  // Rumpf als Gitterfläche: Länge L (x, Bug bei +x), Breite B, Tiefe Tf; Bug und Heck hochgezogen
  function rumpfGeo(L, B, Tf, bugHub, sektionen, nx = 26, nj = 10) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nx; i++) {
      const t = i / nx * 2 - 1, at = Math.abs(t);
      const halb = B / 2 * (t > 0 ? Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), .55) : .62 + .38 * Math.sqrt(Math.max(0, 1 - t * t)));
      const kiel = Tf * (1 - .55 * Math.pow(at, 2.2)), rand = bugHub * Math.pow(at, 2.4) * (t > 0 ? 1.15 : .45);
      for (let j = 0; j <= nj; j++) {
        const s = j / nj * 2 - 1, a = s * Math.PI / 2;
        pos.push(t * L / 2, rand - kiel * Math.cos(a) * (sektionen || 1), halb * Math.sin(a));
        uv.push(i / nx, j / nj);
      }
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nj; j++) { const a = i * (nj + 1) + j, b = a + nj + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function rumpfTextur(grundFarbe, streifen, loch) {
    const key = 'ru' + grundFarbe + streifen + loch;
    return tCache[key] || (tCache[key] = leinwand(256, 256, (c, w, h) => {
      const r = zuf(grundFarbe.charCodeAt(2) + (loch ? 3 : 0));
      c.fillStyle = grundFarbe; c.fillRect(0, 0, w, h);
      for (let j = 0; j < 12; j++) {   // Planken
        const y = j / 12 * h; c.fillStyle = `rgba(0,0,0,${.06 + r() * .1})`; c.fillRect(0, y, w, h / 12);
        c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, y, w, 2);
        for (let k = 0; k < 14; k++) { c.fillStyle = `rgba(255,235,200,${r() * .08})`; c.fillRect(r() * w, y + r() * 18, 20 + r() * 50, 1.5); }
        for (let k = 0; k < 6; k++) { c.fillStyle = 'rgba(30,20,10,.45)'; c.beginPath(); c.arc(((k + .5) / 6) * w, y + 8, 1.6, 0, 7); c.fill(); }   // Nägel
      }
      if (streifen) { c.fillStyle = streifen; c.fillRect(0, h * .17, w, h * .09); }
      if (loch) {
        for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${r() < .5 ? '210,200,180' : '20,60,50'},${r() * .22})`; c.beginPath(); c.arc(r() * w, r() * h, 1 + r() * 4, 0, 7); c.fill(); }
        c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.ellipse(w * .6, h * .56, 26, 30, .4, 0, 7); c.fill();
        c.beginPath(); c.ellipse(w * .2, h * .75, 14, 16, 0, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over';
      }
    }, true));
  }
  function wrack(geflickt) {
    const g = new T.Group();
    const h = new T.Group();
    const hullTex = geflickt ? rumpfTextur('#c0392b', '#f4f4ee', false) : rumpfTextur('#7a3b2e', null, true);
    const hull = mesh(rumpfGeo(6.2, 2.1, 1.25, .55), new T.MeshPhongMaterial({ map:hullTex, side:T.DoubleSide, flatShading:false, shininess:geflickt ? 40 : 3, specular:geflickt ? 0x555555 : 0x000000, alphaTest:.5 }));
    h.add(hull);
    const de = [];
    de.push({ g:holzBox(5.5, .1, 1.7), f:new T.Color(geflickt ? '#a97a46' : '#8a6a44'), m:new T.Matrix4().makeTranslation(-.1, -.2, 0) });
    for (const x of [-1.5, .9, 2.0]) de.push({ g:holzBox(.1, .1, 1.95), f:new T.Color('#6d4426'), m:new T.Matrix4().makeTranslation(x, .0, 0) });  // Ruderbänke
    de.push({ g:holzBox(.2, .2, 1.8), f:new T.Color('#5e3b1c'), m:new T.Matrix4().makeTranslation(-3.0, .1, 0) });
    de.push({ g:holzBox(5.9, .09, .14), f:new T.Color('#6d4426'), m:new T.Matrix4().makeTranslation(-.05, .08, 1.0) });   // Scheuerleiste
    de.push({ g:holzBox(5.9, .09, .14), f:new T.Color('#6d4426'), m:new T.Matrix4().makeTranslation(-.05, .08, -1.0) });
    h.add(mesh(verschmelzen(de), holzMat));
    const kabine = mesh(holzBox(1.6, 1.1, 1.5), mat(geflickt ? '#f4f4f4' : '#9c9c94')); kabine.position.set(-.8, .4, 0); h.add(kabine);
    const kd = [];
    kd.push(boxE(geflickt ? '#d62839' : '#6a4a3a', -.8, 1.0, 0, 1.8, .1, 1.7));   // Kabinendach
    for (const s of [-1, 1]) kd.push(boxE('#5fb4e8', .03, .55, .4 * s, .05, .34, .4), boxE('#2a4a60', .035, .55, .4 * s, .03, .38, .46));
    kd.push(boxE('#5fb4e8', -.8, .55, .77, .6, .34, .04), boxE('#5fb4e8', -.8, .55, -.77, .6, .34, .04), boxE('#7a5028', -.04, .15, 0, .06, .7, .5));
    h.add(vm(kd, vcGlatt));
    if (!geflickt) {
      // Mastreste, zerrissenes Segel, Tau
      const m = []; m.push(zylE('#5e3b1c', 1.4, .5, .0, .06, 1.4, 0, 0, .35, .045), boxE('#d9d2bc', 1.6, .75, .15, .02, .7, .5, .2, .4, .3), zylE('#b59a66', 2.2, .1, .5, .02, 1.3, 0, 0, Math.PI / 2 - .3));
      h.add(vm(m, vcFlach));
      for (let i = 0; i < 3; i++) { const b = mesh(holzBox(1.2, .08, .25), mat('#6d4426')); b.position.set(2 + i * .5, -1, 1.6 + i * .3); b.rotation.y = i; g.add(b); }
      h.rotation.z = .25; h.rotation.x = -.18;
    } else {
      const fm = [];
      fm.push(zylE('#5e3b1c', -.8, 1.8, 0, .045, 1.5), boxE('#ffcc33', -.8, 2.35, .3, .02, .4, .6), E(new T.TorusGeometry(.3, .08, 6, 14), '#e8394a', 1.8, .1, 1.04, 0, 0, 0), E(new T.TorusGeometry(.3, .084, 6, 14, 1.2), '#f4f4f4', 1.8, .1, 1.05, 0, 0, .6));
      fm.push(zylE('#f4f4f4', -.8, 1.75, 0, .06, .04), kugelE('#ffcc33', -.8, 2.55, 0, .05));
      h.add(vm(fm, vcGlatt));
      const flagge = mesh(new T.PlaneGeometry(.6, .4), mat('#ffcc33', { side:T.DoubleSide }), false); flagge.position.set(-.8, 2.2, .3); h.add(flagge);
    }
    g.add(h);
    return g;
  }
  function ruderboot() {
    const g = new T.Group();
    g.add(mesh(rumpfGeo(3.2, 1.25, .62, .3, 1, 18, 8), new T.MeshPhongMaterial({ map:rumpfTextur('#3f7ec4', '#f4f4ee', false), side:T.DoubleSide, shininess:30, specular:0x444444 })));
    const de = [];
    for (const x of [-.5, .5]) de.push({ g:holzBox(.18, .06, 1.15), f:new T.Color('#c8995a'), m:new T.Matrix4().makeTranslation(x, .02, 0) });
    de.push({ g:holzBox(3.0, .05, .08), f:new T.Color('#8a5a2a'), m:new T.Matrix4().makeTranslation(0, .22, .58) }, { g:holzBox(3.0, .05, .08), f:new T.Color('#8a5a2a'), m:new T.Matrix4().makeTranslation(0, .22, -.58) });
    g.add(mesh(verschmelzen(de), holzMat));
    const r = [];
    for (const s of [-1, 1]) r.push(zylE('#b98a52', 0, .45, s * .8, .022, 2.0, Math.PI / 2 - .25 * s, 0, .0, .022), E(Gk.kugel, '#d8b078', .03, .22, s * 1.7, 0, 0, 0, .06, .02, .12));
    r.push(zylE('#e8e0cc', 1.55, .1, 0, .018, .5, 0, 0, 1.2));
    g.add(vm(r, vcFlach));
    return g;
  }
  function segelboot() {
    const g = new T.Group();
    g.add(mesh(rumpfGeo(5.0, 1.7, .6, .5, 1, 20, 8), new T.MeshPhongMaterial({ map:rumpfTextur('#f4f4ee', '#d62839', false), side:T.DoubleSide, shininess:30, specular:0x444444 })));
    const de = [];
    de.push(zylE('#e8e0cc', .2, 2.6, 0, .05, 5.4), E(Gk.kegel4, '#ffffff', -.05, 2.5, 0, 0, 0, 0, 1.15, 2.2, .02), E(Gk.kegel4, '#f4efe0', 1.2, 1.5, 0, 0, 0, 0, .7, 1.4, .02), boxE('#d62839', .22, 5.35, .02, .03, .01, .02));
    de.push(boxE('#c8995a', -1.7, .25, 0, .12, .12, 1.4), boxE('#8a5a2a', 0, .1, 0, 3.5, .05, 1.2));
    g.add(vm(de, vcFlach));
    return g;
  }
  function steg(laenge) {
    const g = new T.Group();
    const pl = [], pf = [], zubehoer = [], r = zuf(laenge);
    for (let z = 0; z < laenge; z += .5) {
      const b = holzBox(2.6, .12, .4); const f = new T.Color(['#9a6a3a', '#86592f', '#a3733f', '#8f6234'][Math.floor(r() * 4)]).multiplyScalar(.92 + r() * .16);
      pl.push({ g:b, f, m:new T.Matrix4().compose(new T.Vector3(0, r() * .008, z + .25), new T.Quaternion().setFromEuler(new T.Euler(0, (r() - .5) * .012, 0)), new T.Vector3(1, 1, 1)) });
    }
    for (const x of [-1.15, 1.15]) pl.push({ g:holzBox(.14, .16, laenge + .1), f:new T.Color('#6d4426'), m:new T.Matrix4().makeTranslation(x, -.14, laenge / 2) });   // Längsbalken
    for (let z = 0; z <= laenge; z += 3) pl.push({ g:holzBox(2.8, .14, .16), f:new T.Color('#5e3b1c'), m:new T.Matrix4().makeTranslation(0, -.24, z) });
    // Pfähle: oben hell, am Wasser dunkel, darunter veralgt
    const cH = new T.Color('#7a5230'), cW = new T.Color('#3d2a1a'), cA = new T.Color('#2f5a3a'), c = new T.Color();
    for (let z = 0; z <= laenge; z += 3) for (const x of [-1.2, 1.2]) {
      const pg = new T.CylinderGeometry(.12, .13, 6, 7, 10), pp = pg.attributes.position, col = [];
      for (let i = 0; i < pp.count; i++) { const lw = pp.getY(i) - 2.9 + .9; c.copy(cH); if (lw < .3) c.lerp(cW, Math.min(1, (.3 - lw) * 1.4)); if (lw < -.5) c.lerp(cA, Math.min(1, (-.5 - lw) * .7)); col.push(c.r, c.g, c.b); }
      pg.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      pf.push({ g:pg, f:null, m:new T.Matrix4().makeTranslation(x, -2.9, z) });
      pf.push(E(Gk.zyl, '#4a3020', x, .17, z, 0, 0, 0, .15, .05, .15));
    }
    g.add(mesh(verschmelzen(pl), holzMat));
    g.add(mesh(verschmelzen(pf), vcFlach));
    // Geländer aus Pfosten und durchhängendem Seil, Poller am Ende, Fass und Kisten
    const ra = [];
    for (let z = 0; z <= laenge; z += 3) for (const x of [-1.26, 1.26]) ra.push(zylE('#6a4528', x, .5, z, .05, .9), kugelE('#8a5a2d', x, .97, z, .07));
    for (const x of [-1.26, 1.26]) for (let z = 0; z < laenge; z += 3) for (let k = 0; k < 6; k++) {
      const t0 = k / 6, t1 = (k + 1) / 6, y0 = .86 - Math.sin(t0 * Math.PI) * .14, y1 = .86 - Math.sin(t1 * Math.PI) * .14, zz0 = z + t0 * 3, zz1 = z + t1 * 3;
      ra.push(E(Gk.zyl6, '#d9c492', x, (y0 + y1) / 2, (zz0 + zz1) / 2, Math.atan2(zz1 - zz0, y1 - y0), 0, 0, .018, Math.hypot(zz1 - zz0, y1 - y0), .018));
    }
    const ende = laenge - .2;
    for (const x of [-1.1, 1.1]) ra.push(zylE('#3a2a20', x, .26, ende, .09, .4), zylE('#222', x, .5, ende, .11, .04));
    ra.push(zylE('#6b4a2a', .9, .4, laenge * .35, .3, .6, 0, 0, 0, .27), E(Gk.zyl, '#3a3a3a', .9, .25, laenge * .35, 0, 0, 0, .31, .04, .31), E(Gk.zyl, '#3a3a3a', .9, .55, laenge * .35, 0, 0, 0, .31, .04, .31));
    ra.push(boxE('#9a6a38', -.85, .3, laenge * .6, .5, .42, .5, 0, .3, 0), boxE('#85592c', -.8, .72, laenge * .6, .4, .36, .4, 0, -.2, 0));
    // Laternenmast am Ende
    ra.push(zylE('#3a2a20', 0, 1.3, ende - .5, .05, 2.2), boxE('#3a2a20', .3, 2.35, ende - .5, .6, .05, .05), boxE('#3a2a20', 0, 2.4, ende - .5, .26, .05, .26));
    g.add(vm(ra, vcFlach));
    const lampe = new T.Mesh(new T.SphereGeometry(.14, 8, 6), new T.MeshBasicMaterial({ color:'#ffd98a' })); lampe.position.set(.58, 2.2, ende - .5); g.add(lampe);
    g.add(leuchtFlaeche(lampe.position, '#ffb347', 1.1));
    return g;
  }
  function lagerfeuer() {
    const g = new T.Group(), de = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + .3;
      de.push(E(Gk.zyl6, i % 2 ? '#5e3b1c' : '#6d4a2a', Math.cos(a) * .22, .14, Math.sin(a) * .22, Math.PI / 2 - .35, -a, 0, .085, 1.0, .085), kugelE('#1a0f0a', Math.cos(a) * .52, .1, Math.sin(a) * .52, .06));
    }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + .15; de.push(E(new T.DodecahedronGeometry(1, 0), ['#777', '#8a8a8a', '#666'][i % 3], Math.cos(a) * .72, .09, Math.sin(a) * .72, 0, i, 0, .17 + (i % 3) * .04, .12, .15 + (i % 2) * .05)); }
    de.push(zylE('#2a2320', 0, .02, 0, .8, .03, 0, 0, 0, .8), zylE('#ff6a1f', 0, .045, 0, .38, .02, 0, 0, 0, .38));
    g.add(vm(de, vcFlach));
    const fm = new T.MeshBasicMaterial({ color:'#ffffff', vertexColors:true, transparent:true, opacity:.92, side:T.DoubleSide, depthWrite:false });
    const flGeo = (r, h, a, b) => { const k = new T.ConeGeometry(r, h, 7, 3, true), p = k.attributes.position, col = [], c1 = new T.Color(a), c2 = new T.Color(b), c = new T.Color();
      for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; c.copy(c1).lerp(c2, 1 - t); col.push(c.r, c.g, c.b); } k.setAttribute('color', new T.Float32BufferAttribute(col, 3)); k.translate(0, h / 2, 0); return k; };
    const flamme = new T.Mesh(flGeo(.32, .9, '#ff7a1f', '#ffd24a'), fm); flamme.position.y = .12; g.add(flamme);
    const kern = new T.Mesh(flGeo(.17, .55, '#ffcc33', '#fff6c0'), fm); kern.position.y = .1; g.add(kern);
    for (const [x, z, s] of [[.14, .1, .6], [-.16, -.08, .5], [.02, -.2, .55]]) { const f = new T.Mesh(flGeo(.14, .6, '#ff5a1f', '#ffb23a'), fm); f.position.set(x, .12, z); f.scale.setScalar(s * 1.4); g.add(f); }
    g.add(leuchtFlaeche(new T.Vector3(0, .6, 0), '#ff8a2e', 1.8, .3));
    g.userData.flamme = flamme; g.userData.kern = kern;
    return g;
  }
  function casino() {
    const g = bude('MÖWEN-CASINO', '#d62839', 'casino');
    const lichter = [];
    for (let i = 0; i < 14; i++) {
      const l = new T.Mesh(new T.SphereGeometry(.07, 6, 5), new T.MeshBasicMaterial({ color:'#ffcc33' }));
      l.position.set(1.65, 2.95 - (i < 7 ? 0 : .85), -1.5 + (i % 7) * .5); g.add(l); lichter.push(l);
    }
    const rad = new T.Group();
    const rs = new T.Mesh(new T.CircleGeometry(.8, 24), new T.MeshBasicMaterial({ map:radTextur(), side:T.DoubleSide }));
    rad.add(rs); rad.position.set(-1.38, 1.7, 0); rad.rotation.y = Math.PI / 2; g.add(rad);
    const ra = mesh(new T.TorusGeometry(.82, .06, 6, 24), mat('#ffcc33', { shininess:80, specular:0xffffff }), false); ra.position.copy(rad.position); ra.rotation.y = Math.PI / 2; g.add(ra);
    g.userData.lichter = lichter; g.userData.rad = rs;
    return g;
  }
  function radTextur() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const c = cv.getContext('2d'), n = 12;
    for (let i = 0; i < n; i++) {
      c.beginPath(); c.moveTo(128, 128); c.arc(128, 128, 126, i / n * Math.PI * 2, (i + 1) / n * Math.PI * 2); c.closePath();
      c.fillStyle = ['#d62839', '#ffcc33', '#2a9d8f', '#f4f4f4'][i % 4]; c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; c.stroke();
    }
    c.fillStyle = '#222'; c.beginPath(); c.arc(128, 128, 16, 0, 7); c.fill(); c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(128, 128, 9, 0, 7); c.fill();
    return new T.CanvasTexture(cv);
  }

  /* ---------- Ausrüstung in der Hand (Ego-Sicht) ---------- */
  function hand(gruppe) {
    const haut = '#f0c19a', hautD = '#d9a47c', de = [];
    de.push(E(Gk.kugelF, haut, 0, 0, 0, 0, 0, 0, .05, .05, .075));                              // Faust
    for (let i = 0; i < 4; i++) de.push(zylE(i % 2 ? haut : hautD, 0, .038, -.045 + i * .03, .014, .1, 0, 0, Math.PI / 2, .014));   // Finger um den Griff
    de.push(E(Gk.kugel, haut, .042, .01, -.03, 0, 0, 0, .02, .02, .035));                       // Daumen
    de.push(zylE(haut, 0, 0, .17, .04, .22, Math.PI / 2, 0, 0, .046));                          // Unterarm
    de.push(zylE('#2f78b8', 0, 0, .4, .058, .3, Math.PI / 2, 0, 0, .056), E(new T.TorusGeometry(.064, .013, 5, 12), '#eaf2fa', 0, 0, .25, 0, 0, 0));   // Hemdärmel mit Umschlag
    const m = vm(de, vcGlatt, false); gruppe.add(m);
    return m;
  }
  const schaftTextur = (id, farbe) => {
    const k = 'sch' + id + farbe;
    return tCache[k] || (tCache[k] = leinwand(32, 256, (c, w, h) => {
      c.fillStyle = farbe; c.fillRect(0, 0, w, h); const r = zuf(id.length);
      if (id === 'bambus') {
        c.fillStyle = 'rgba(255,255,220,.18)'; c.fillRect(0, 0, w * .35, h);
        for (let y = 20; y < h; y += 34 + r() * 8) { c.fillStyle = '#6a5224'; c.fillRect(0, y, w, 4); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, y + 4, w, 3); }
      } else if (id === 'glasfaser') {
        c.fillStyle = '#f4f8ff'; for (let y = 0; y < h; y += 28) { c.fillRect(0, y, w, 3); }
        c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(0, 0, w * .3, h);
      } else if (id === 'carbon') {
        c.fillStyle = '#34383f'; for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) if (((x + y) / 8) % 2 < 1) c.fillRect(x, y, 8, 8);
        c.fillStyle = '#c0392b'; for (let y = 10; y < h; y += 60) c.fillRect(0, y, w, 5);
        c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(0, 0, w * .3, h);
      } else {
        const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#fff2a0'); g.addColorStop(.4, '#ffcc33'); g.addColorStop(1, '#b8860b'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = '#e8394a'; for (let y = 12; y < h; y += 52) { c.fillRect(0, y, w, 4); }
      }
    }, true));
  };
  function angel(g, rute) {
    const id = rute.id, farbe = rute.farbe;
    const stock = new T.Mesh(new T.CylinderGeometry(.005, .014, 1.5, 8, 6), new T.MeshPhongMaterial({ map:schaftTextur(id, farbe), shininess:id === 'gold' ? 120 : 40, specular:id === 'gold' ? 0xffeeaa : 0x555555, emissive:id === 'gold' ? 0x3a2a00 : 0x000000 }));
    stock.rotation.x = -Math.PI / 2 + .55; stock.position.set(0, .3, -.55); g.add(stock);
    const metall = id === 'gold' ? '#ffd24a' : id === 'carbon' ? '#c8ccd2' : '#d4d8dc', de = [];
    const ax = new T.Vector3(0, .5227, -.8525), ct = new T.Vector3(0, .3, -.55);
    for (let i = 1; i <= 4; i++) {
      const s = .12 + i * .15, p = ct.clone().addScaledVector(ax, s);
      de.push(E(new T.TorusGeometry(.019 - i * .002, .0045, 4, 8), metall, p.x, p.y + .014, p.z, .55, 0, 0), zylE(metall, p.x, p.y + .006, p.z, .003, .02, 0, 0, 0, .003));
      de.push(zylE(id === 'carbon' ? '#c0392b' : '#2a1a10', p.x, p.y, p.z, .017 - i * .002, .035, -Math.PI / 2 + .55, 0, 0, .017 - i * .002));
    }
    // Korkgriff mit Gummi-Enden, Rollenhalter
    de.push(zylE('#c99f6a', 0, -.04, .05, .026, .24, -Math.PI / 2 + .55, 0, 0, .026), zylE('#2a2a2a', 0, -.11, .165, .029, .04, -Math.PI / 2 + .55, 0, 0, .029), zylE('#2a2a2a', 0, .035, -.065, .029, .035, -Math.PI / 2 + .55, 0, 0, .029));
    for (let i = 0; i < 5; i++) de.push(zylE('#a5804d', 0, -.04 + .0, .0, .027, .006, -Math.PI / 2 + .55, 0, 0, .027));
    de.push(boxE('#555a60', 0, .008, -.045, .028, .035, .08), boxE('#555a60', 0, -.016, -.045, .016, .03, .05));
    // Rolle: Gehäuse, Spule mit Schnur, Bügel
    const rolle = id === 'gold' ? '#ffd24a' : id === 'carbon' ? '#2a2d33' : id === 'glasfaser' ? '#3a3f47' : '#7a5a30';
    de.push(zylE(rolle, .05, .028, -.05, .04, .03, 0, 0, Math.PI / 2, .04), zylE('#e9e3cf', .073, .028, -.05, .031, .02, 0, 0, Math.PI / 2, .031), zylE(rolle, .088, .028, -.05, .035, .01, 0, 0, Math.PI / 2, .035));
    de.push(zylE(metall, .03, .028, -.05, .018, .02, 0, 0, Math.PI / 2, .018), E(new T.TorusGeometry(.045, .004, 4, 12, 3.3), metall, .01, .028, -.05, 0, Math.PI / 2, .5));
    if (id === 'gold') for (let i = 0; i < 4; i++) de.push(kugelE(['#e8394a', '#3fa0ff', '#2ecc71', '#ffffff'][i], .1, .028 + Math.cos(i * 1.6) * .03, -.05 + Math.sin(i * 1.6) * .03, .007));
    g.add(vm(de, vcMetall, false));
    const kurbel = new T.Group(); kurbel.position.set(.098, .028, -.05);
    kurbel.add(vm([zylE('#3a3a3a', 0, .0, 0, .008, .012, 0, 0, Math.PI / 2), boxE('#3a3a3a', .004, .026, 0, .008, .055, .01), zylE('#9a6a38', .016, .054, 0, .012, .026, 0, 0, Math.PI / 2, .012)], vcMetall, false));
    g.add(kurbel);
    const spitze = new T.Object3D(); spitze.position.set(0, .68, -1.14); g.add(spitze);
    g.userData.spitze = spitze; g.userData.kurbel = kurbel; g.userData.stock = stock;
    hand(g).position.set(0, -.05, .1);
  }
  const GM = '#2b2d31', GM2 = '#43474d', GM3 = '#171819', HOLZ = '#7a4a25', HOLZ2 = '#5a3519';
  function inHand(id, rute) {
    const g = new T.Group();
    if (id === 'rute') angel(g, rute);
    else if (id === 'paddel') {
      const de = [];
      de.push(zylE('#a0703f', 0, .2, -.3, .022, 1.1, -Math.PI / 2 + .9, 0, 0, .022), E(Gk.kugel, '#8a5a2d', 0, -.03, .1, 0, 0, 0, .04, .04, .04));
      const sh = new T.Vector3(0, .55, -.62);
      de.push(E(Gk.zyl, '#c98a4b', sh.x, sh.y, sh.z, .9 - Math.PI / 2 + Math.PI / 2 + .0, 0, 0, .1, .02, .24), E(Gk.zyl, '#e8e0cc', sh.x, sh.y + .005, sh.z, .9, 0, 0, .1, .022, .24));
      for (const y of [.05, .1]) de.push(zylE('#d62839', 0, .2 + y * .6, -.3 - y * 1.0, .024, .03, -Math.PI / 2 + .9, 0, 0, .024));
      g.add(vm(de, vcGlatt, false));
      hand(g).position.set(0, -.05, .05);
    } else if (id === 'pistole') {
      const de = [];
      de.push(boxE(GM, 0, .06, -.14, .052, .06, .3), boxE(GM2, 0, .095, -.14, .03, .01, .26), zylE(GM3, 0, .06, -.3, .018, .05, Math.PI / 2, 0, 0, .018));
      de.push(boxE(GM3, 0, .105, -.27, .012, .018, .014), boxE(GM3, 0, .1, -.02, .016, .014, .016));
      de.push(boxE(HOLZ, 0, -.04, .02, .05, .15, .07, .25), boxE(HOLZ2, .028, -.04, .02, .006, .12, .05, .25), boxE(HOLZ2, -.028, -.04, .02, .006, .12, .05, .25));
      de.push(E(new T.TorusGeometry(.03, .006, 4, 8, Math.PI), GM3, 0, .0, -.065, 0, Math.PI / 2, Math.PI), boxE(GM3, 0, .022, -.07, .008, .028, .008, -.3));
      de.push(boxE(GM3, 0, .045, .03, .02, .02, .03));
      g.add(vm(de, vcMetall, false));
      hand(g).position.set(0, -.06, .03);
      const m = new T.Object3D(); m.position.set(0, .05, -.32); g.add(m); g.userData.muendung = m;
    } else if (id === 'flinte') {
      const de = [];
      for (const x of [-.022, .022]) de.push(zylE(GM, x, .05, -.35, .022, .7, Math.PI / 2, 0, 0, .022), zylE(GM3, x, .05, -.7, .016, .02, Math.PI / 2, 0, 0, .016));
      de.push(boxE(GM2, 0, .077, -.35, .016, .012, .66), boxE(GM, 0, .045, -.09, .075, .09, .2), kugelE('#d4b24a', 0, .07, -.2, .014));
      de.push(boxE(HOLZ, 0, .0, -.4, .07, .06, .3), boxE(HOLZ2, 0, -.005, -.4, .076, .015, .3));   // Vorderschaft
      de.push(boxE(HOLZ, 0, -.01, .12, .068, .1, .45, .0), boxE(HOLZ, 0, -.04, .3, .062, .16, .12, .25), boxE('#222', 0, -.05, .36, .066, .17, .02, .25));
      de.push(E(new T.TorusGeometry(.035, .006, 4, 8, Math.PI), GM3, 0, .0, -.04, 0, Math.PI / 2, Math.PI), boxE(GM3, 0, -.002, .0, .008, .03, .008, -.3), kugelE('#ffcc33', 0, .098, -.69, .01));
      g.add(vm(de, vcMetall, false));
      hand(g).position.set(0, -.05, .05);
      const m = new T.Object3D(); m.position.set(0, .05, -.72); g.add(m); g.userData.muendung = m;
    } else if (id === 'harpune') {
      const de = [];
      de.push(zylE('#e2e5e8', 0, .03, -.25, .03, .8, Math.PI / 2, 0, 0, .035), zylE('#9aa4ad', 0, .03, -.1, .042, .06, Math.PI / 2, 0, 0, .042), zylE('#9aa4ad', 0, .03, -.45, .04, .05, Math.PI / 2, 0, 0, .04), zylE('#d62839', 0, .03, -.6, .038, .04, Math.PI / 2, 0, 0, .038));
      de.push(boxE(HOLZ, 0, -.04, .02, .05, .14, .07, .2), boxE(GM2, 0, .015, -.04, .05, .02, .12), E(new T.TorusGeometry(.03, .006, 4, 8, Math.PI), GM3, 0, -.01, -.075, 0, Math.PI / 2, Math.PI));
      for (let i = 0; i < 5; i++) de.push(E(new T.TorusGeometry(.05, .008, 4, 8), '#d9c492', 0, .075, -.3 + i * .02, 0, Math.PI / 2, 0));
      de.push(zylE('#cfd6dc', 0, .03, -.82, .014, .3, Math.PI / 2, 0, 0, .014));
      g.add(vm(de, vcMetall, false));
      const spitze = vm([E(Gk.kegel4, '#e8ecef', 0, 0, 0, -Math.PI / 2, 0, 0, .05, .2, .05), E(Gk.kegel4, '#c0392b', .0, .0, .1, Math.PI / 2, 0, 0, .06, .08, .06), E(Gk.kegel4, '#e8ecef', .035, 0, .03, Math.PI / 2 + 0, 0, -.5, .02, .09, .02), E(Gk.kegel4, '#e8ecef', -.035, 0, .03, Math.PI / 2, 0, .5, .02, .09, .02)], vcMetall, false);
      spitze.position.set(0, .03, -.88); g.add(spitze); g.userData.pfeil = spitze;
      hand(g).position.set(0, -.05, .05);
      const m = new T.Object3D(); m.position.set(0, .03, -.75); g.add(m); g.userData.muendung = m;
    } else if (id === 'tnt') {
      const de = [];
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI * 2, x = Math.cos(a) * .034, y = Math.sin(a) * .034 + .1;
        de.push(zylE('#d62839', x, y, -.1, .036, .28, .3, 0, 0, .036), zylE('#f4efe0', x, y, -.1, .037, .04, .3, 0, 0, .037), zylE('#222', x, y + .15, -.056, .026, .01, .3, 0, 0, .026));
      }
      de.push(zylE('#1a1a1a', 0, .11, -.1, .08, .03, .3, 0, 0, .08), zylE('#222', 0, .28, -.05, .006, .12, .3), zylE('#caa66a', 0, .27, -.06, .008, .06, .3));
      de.push(boxE('#f4efe0', 0, .1, -.138, .06, .09, .004, .3));
      g.add(vm(de, vcGlatt, false));
      const z = new T.Object3D(); z.position.set(0, .34, -.04); g.add(z); g.userData.zuender = z;
      hand(g).position.set(0, -.04, -.05);
    }
    return g;
  }
  function tntStange() {
    const g = new T.Group(), de = [];
    de.push(zylE('#d62839', 0, 0, 0, .06, .3), zylE('#f4efe0', 0, 0, 0, .062, .06), zylE('#222', 0, .15, 0, .05, .02), zylE('#222', 0, -.15, 0, .05, .02), zylE('#caa66a', 0, .2, 0, .008, .1));
    g.add(vm(de, vcGlatt));
    const f = new T.Mesh(new T.SphereGeometry(.045, 6, 5), new T.MeshBasicMaterial({ color:'#ffcc33' })); f.position.y = .26; g.add(f);
    g.userData.funke = f;
    return g;
  }
  function pose() {
    const g = new T.Group();
    const m1 = new T.MeshPhongMaterial({ color:'#e8394a', shininess:70, specular:0x888888 }), m2 = new T.MeshPhongMaterial({ color:'#ffffff', shininess:70, specular:0x888888 });
    g.add(new T.Mesh(new T.SphereGeometry(.09, 12, 8), m1));
    g.add(new T.Mesh(new T.SphereGeometry(.091, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), m2));
    g.add(new T.Mesh(new T.TorusGeometry(.088, .008, 4, 14), mat('#222')));
    const st = new T.Mesh(new T.CylinderGeometry(.012, .012, .16, 5), mat('#222')); st.position.y = .13; g.add(st);
    const sp = new T.Mesh(new T.SphereGeometry(.018, 5, 4), new T.MeshBasicMaterial({ color:'#ffcc33' })); sp.position.y = .22; g.add(sp);
    return g;
  }
  function stachel() {
    const s = new T.Mesh(new T.ConeGeometry(.06, .4, 4), mat('#f6eed2'));
    s.geometry.rotateX(Math.PI / 2);
    return s;
  }
  // Wolke: mehrere Kuppen, oben weiß, unten bläulich-grau; ein Mesh
  const wolkenMat = new T.MeshLambertMaterial({ vertexColors:true, emissive:0x3c4858 });
  function wolke(rnd) {
    const liste = [];
    const n = 5 + Math.floor(rnd() * 5), laenge = n * 3, c = new T.Color();
    for (let i = 0; i < n; i++) {
      const r = 2.5 + rnd() * 3.5 * Math.sin((i + .5) / n * Math.PI);
      const k = new T.IcosahedronGeometry(r, 1), p = k.attributes.position, col = [];
      for (let j = 0; j < p.count; j++) { const t = Math.min(1, Math.max(0, (p.getY(j) / r + .6) / 1.5)); c.set('#a9b8c8').lerp(new T.Color('#ffffff'), Math.pow(t, .8)); col.push(c.r, c.g, c.b); }
      k.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      liste.push({ g:k, f:null, m:new T.Matrix4().compose(new T.Vector3(i * 3 - laenge / 2, r * .25 + rnd() * 1.5, (rnd() - .5) * 5), new T.Quaternion(), new T.Vector3(1, .62, 1)) });
    }
    const b = new T.CylinderGeometry(laenge * .45, laenge * .45, 1.2, 12), bp = b.attributes.position, col = [];
    for (let j = 0; j < bp.count; j++) { c.set('#98a8ba'); col.push(c.r, c.g, c.b); }
    b.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    liste.push({ g:b, f:null, m:new T.Matrix4().compose(new T.Vector3(0, -.4, 0), new T.Quaternion(), new T.Vector3(1, 1, .35)) });
    const g = new T.Group(); g.add(new T.Mesh(verschmelzen(liste), wolkenMat));
    g.userData.wolkenMat = wolkenMat;
    return g;
  }
  function vogel() {
    const g = new T.Group(), m = mat('#ffffff', { side:T.DoubleSide });
    g.add(vm([E(Gk.kugelF, '#ffffff', 0, 0, 0, 0, 0, 0, .3, .1, .1), E(Gk.kugel, '#ffffff', .27, .03, 0, 0, 0, 0, .09, .08, .08), E(Gk.kegel4, '#f5a623', .38, .03, 0, 0, 0, -Math.PI / 2, .025, .1, .02), E(Gk.kegel4, '#e9ecef', -.3, 0, 0, 0, 0, Math.PI / 2, .07, .14, .02)], vcFlach, false));
    const wing = () => {
      const sh = new T.Shape(); sh.moveTo(.18, 0); sh.lineTo(.0, .75); sh.lineTo(-.14, .66); sh.lineTo(-.22, 0);
      const gg = new T.ShapeGeometry(sh), col = [], p = gg.attributes.position, c = new T.Color();
      for (let i = 0; i < p.count; i++) { c.set(p.getY(i) > .6 ? '#2a3038' : '#ffffff'); col.push(c.r, c.g, c.b); }
      gg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return gg;
    };
    void m;
    for (const s of [-1, 1]) {
      const f = new T.Mesh(wing(), new T.MeshBasicMaterial({ vertexColors:true, side:T.DoubleSide }));
      f.rotation.x = -Math.PI / 2; if (s > 0) f.scale.y = -1;   // Spannweite nach -z (links) bzw. +z (rechts)
      g.add(f); g.userData[s < 0 ? 'l' : 'r'] = f;
    }
    return g;
  }

  return { mat, mesh, fisch, person, moewe, bude, casino, palme, fels, wrack, ruderboot, segelboot, steg, lagerfeuer, inHand, tntStange, pose, stachel, wolke, vogel, textSchild, leuchtFlaeche, wolkenMat, verschmelzen, lofte, leinwand, E, kugelE, boxE, zylE, kegelE, vm, mischen, zuf, holzMat, vcFlach, vcGlatt };
})();
