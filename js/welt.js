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

  // Eine gemeinsame Zeit-Uniform für alle Shader (Wind, Wellen, Lichtmuster)
  const ZEIT = { value:0 };
  let qualitaet = 'hoch';
  const DICHTE = {
    hoch:    { gras:9000, blumen:650, muscheln:240, seegras:520, buesche:70 },
    mittel:  { gras:4200, blumen:320, muscheln:160, seegras:300, buesche:50 },
    niedrig: { gras:1300, blumen:120, muscheln:90,  seegras:120, buesche:30 },
  };
  let detailGruppe = null, szeneRef = null, hoehenTex = null, wasserMat = null, himmelMat = null;

  let I = null;          // aktuelle Inseldaten
  let gruppe = null;     // alles, was zur Insel gehört
  let wasser = null, himmel = null;
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
    const mat = new T.MeshPhongMaterial({ vertexColors:true, flatShading:true, shininess:0, specular:0x000000 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uZeit = ZEIT;
      sh.vertexShader = 'varying vec3 vWeltPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeltPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uZeit;\nvarying vec3 vWeltPos;\n' + `
        float ffHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ffKaustik(vec2 p, float t){
          vec2 q = p * .55; float c = 0.;
          for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.7 + t * .9), cos(q.x * 1.5 - t * .8)) * .55; c += abs(sin(q.x + q.y)); }
          return pow(max(0., 1. - c / 2.2), 5.);
        }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float ffY = vWeltPos.y;
        float ffW = .12 * sin(vWeltPos.x * .3 + uZeit * 1.3) + .08 * sin(vWeltPos.z * .4 + uZeit * 1.7);
        // nasser Sand direkt an der Wasserlinie
        diffuseColor.rgb *= mix(1., .8, (1. - smoothstep(ffW, ffW + .45, ffY)) * step(ffW - .2, ffY));
        // Lichtmuster der Wellen auf dem Meeresgrund
        if (ffY < ffW) diffuseColor.rgb += vec3(.75, .95, 1.) * ffKaustik(vWeltPos.xz, uZeit) * .6 * smoothstep(-6., -.3, ffY);
`);
    };
    const m = new T.Mesh(flach, mat);
    m.receiveShadow = true;
    return m;
  }

  // Höhenkarte als Textur, damit das Wasser seine Tiefe kennt (Farbe, Schaum am Ufer)
  function hoehenTextur() {
    const N = 256, gr = 280, daten = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + .5) / N * gr - gr / 2, z = (j + .5) / N * gr - gr / 2;
      const v = Math.round(Math.min(1, Math.max(0, (gelaende(x, z) + 8) / 16)) * 255), k = (j * N + i) * 4;
      daten[k] = daten[k + 1] = daten[k + 2] = v; daten[k + 3] = 255;
    }
    const tex = new T.DataTexture(daten, N, N, T.RGBAFormat);
    tex.magFilter = tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
    return tex;
  }

  const WELLE_GLSL = 'float ffWelle(vec2 p, float t){ return .12 * sin(p.x * .3 + t * 1.3) + .08 * sin(p.y * .4 + t * 1.7) + .05 * sin((p.x + p.y) * .7 + t * 2.3); }';
  function sonnenRichtung() { return new T.Vector3().fromArray(I.sonneRichtung || [.45, .8, .3]).normalize(); }
  function wasserMesh() {
    const geo = new T.PlaneGeometry(700, 700, 160, 160); geo.rotateX(-Math.PI / 2);
    const uni = T.UniformsUtils.merge([T.UniformsLib.fog, {
      uZeit:{ value:0 }, uHoehe:{ value:null }, uFlach:{ value:new T.Color(I.flach || I.wasser) }, uTief:{ value:new T.Color(I.tief) },
      uHimmel:{ value:new T.Color(I.horizont) }, uSonne:{ value:sonnenRichtung() }, uSonnenFarbe:{ value:new T.Color(I.sonne) },
    }]);
    uni.uZeit = ZEIT; uni.uHoehe.value = hoehenTex;
    wasserMat = new T.ShaderMaterial({
      uniforms:uni, transparent:true, fog:true,
      vertexShader:`
        uniform float uZeit; varying vec3 vWelt;
        #include <fog_pars_vertex>
        ${WELLE_GLSL}
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.y += ffWelle(w.xz, uZeit);
          vWelt = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`
        uniform float uZeit; uniform sampler2D uHoehe; uniform vec3 uFlach, uTief, uHimmel, uSonne, uSonnenFarbe;
        varying vec3 vWelt;
        #include <fog_pars_fragment>
        void main(){
          vec2 p = vWelt.xz; float t = uZeit;
          // Normale aus den Wellen + feine Kräusel nur fürs Licht
          float dx = .036 * cos(p.x * .3 + t * 1.3) + .035 * cos((p.x + p.y) * .7 + t * 2.3);
          float dz = .032 * cos(p.y * .4 + t * 1.7) + .035 * cos((p.x + p.y) * .7 + t * 2.3);
          dx += .06 * sin(p.x * 2.3 + p.y * .7 + t * 2.9) + .04 * sin(p.x * 4.1 - p.y * 3.3 + t * 3.7);
          dz += .06 * cos(p.y * 2.1 - p.x * .9 + t * 2.6) + .04 * cos(p.y * 4.7 + p.x * 2.9 - t * 3.3);
          vec3 n = normalize(vec3(-dx, 1., -dz));
          float boden = texture2D(uHoehe, p / 280. + .5).r * 16. - 8.;
          float tiefe = max(0., vWelt.y - boden);
          vec3 farbe = mix(uFlach, uTief, smoothstep(.3, 7., tiefe));
          vec3 v = normalize(cameraPosition - vWelt);
          float fresnel = pow(1. - max(dot(n, v), 0.), 3.);
          farbe = mix(farbe, uHimmel, fresnel * .55);
          farbe *= .88 + .18 * max(dot(n, uSonne), 0.);
          vec3 h = normalize(v + uSonne);
          farbe += uSonnenFarbe * pow(max(dot(n, h), 0.), 220.) * 1.6;
          // Schaum am Ufer: pulsierende Bänder
          float band = .55 + .35 * sin(t * 1.6 - tiefe * 6. + p.x * .15);
          float schaum = (1. - smoothstep(0., band, tiefe));
          schaum *= .65 + .35 * sin(p.x * 3.1 + p.y * 2.7 + t * 2.);
          farbe = mix(farbe, vec3(1.), clamp(schaum, 0., 1.) * .85);
          float alpha = mix(.5, .93, smoothstep(0., 3.5, tiefe));
          alpha = max(alpha, schaum * .9);
          gl_FragColor = vec4(farbe, alpha);
          #include <fog_fragment>
        }`,
    });
    return new T.Mesh(geo, wasserMat);
  }

  function himmelMesh() {
    himmelMat = new T.ShaderMaterial({
      side:T.BackSide, depthWrite:false, fog:false,
      uniforms:{ uOben:{ value:new T.Color(I.himmel) }, uHorizont:{ value:new T.Color(I.horizont) }, uMeer:{ value:new T.Color(I.tief) },
                 uSonne:{ value:sonnenRichtung() }, uSonnenFarbe:{ value:new T.Color(I.sonne) } },
      vertexShader:'varying vec3 vRicht; void main(){ vRicht = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:`
        uniform vec3 uOben, uHorizont, uMeer, uSonne, uSonnenFarbe; varying vec3 vRicht;
        void main(){
          vec3 r = normalize(vRicht); float h = r.y;
          vec3 c = mix(uHorizont, uOben, pow(smoothstep(-.02, .55, h), .75));
          c = mix(c, mix(uHorizont, uMeer, .35), smoothstep(0., -.08, h));
          float d = max(dot(r, uSonne), 0.);
          c += uSonnenFarbe * (smoothstep(.9993, .9997, d) * 1.8 + pow(d, 90.) * .55 + pow(d, 7.) * .18);
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    const m = new T.Mesh(new T.SphereGeometry(450, 32, 16), himmelMat);
    m.renderOrder = -1; m.frustumCulled = false;
    return m;
  }

  /* ---------- Natur-Details: Gras, Blumen, Muscheln, Seegras, Büsche (instanziert) ---------- */
  function wind(mat, staerke) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uZeit = ZEIT;
      sh.vertexShader = 'uniform float uZeit;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ffW = vec3(instanceMatrix[3][0], 0., instanceMatrix[3][2]);
        #else
          vec3 ffW = vec3(0.);
        #endif
        float ffH = max(position.y, 0.);
        transformed.x += (sin(uZeit * 1.9 + ffW.x * .35 + ffW.z * .21) * .7 + sin(uZeit * 3.7 + ffW.z * .9) * .3) * ${staerke.toFixed(3)} * ffH;
        transformed.z += cos(uZeit * 1.6 + ffW.x * .27) * ${(staerke * .6).toFixed(3)} * ffH;
`);
    };
    mat.customProgramCacheKey = () => 'wind' + staerke;
    return mat;
  }
  function halmGeo(halme, hoehe, breite, farbeUnten, farbeOben) {
    const pos = [], col = [], nor = [], cu = new T.Color(farbeUnten), co = new T.Color(farbeOben);
    for (let k = 0; k < halme; k++) {
      const a = k / halme * Math.PI * 2 + Math.random() * .6, r = Math.random() * .09;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r, h = hoehe * (.65 + Math.random() * .5);
      const qa = a + Math.PI / 2, qx = Math.cos(qa) * breite, qz = Math.sin(qa) * breite;
      const lean = .12 + Math.random() * .15;
      pos.push(bx - qx, 0, bz - qz, bx + qx, 0, bz + qz, bx + Math.cos(a) * lean * h, h, bz + Math.sin(a) * lean * h);
      col.push(cu.r, cu.g, cu.b, cu.r, cu.g, cu.b, co.r, co.g, co.b);
      for (let i = 0; i < 3; i++) nor.push(0, 1, 0);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return g;
  }
  function platzSuchen(rnd, bedingung, versuche = 30) {
    for (let i = 0; i < versuche; i++) {
      const a = rnd() * Math.PI * 2, f = Math.sqrt(rnd()) * 1.15, r = uferRadius(a) * f;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = gelaende(x, z);
      const steil = Math.hypot(gelaende(x + .5, z) - h, gelaende(x, z + .5) - h) * 2;
      if (!bedingung(h, steil)) continue;
      if (W.hindernisse.some(o => Math.hypot(o.x - x, o.z - z) < o.r + .25)) continue;
      if (W.stationen.some(s => Math.hypot(s.pos.x - x, s.pos.z - z) < 2.2)) continue;
      if (W.plattformen.some(p => x > p.x0 - .3 && x < p.x1 + .3 && z > p.z0 && z < p.z1)) continue;
      return { x, z, h };
    }
    return null;
  }
  function instanzen(geo, mat, anzahl, rnd, bedingung, setzen) {
    const m = new T.InstancedMesh(geo, mat, anzahl), o = new T.Object3D(), c = new T.Color();
    let n = 0;
    for (let i = 0; i < anzahl; i++) {
      const p = platzSuchen(rnd, bedingung); if (!p) continue;
      o.position.set(p.x, p.h - .03, p.z); o.rotation.set(0, rnd() * Math.PI * 2, 0); o.scale.setScalar(1);
      setzen(o, c, p, rnd);
      o.updateMatrix(); m.setMatrixAt(n, o.matrix); m.setColorAt(n, c); n++;
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  }
  function detailsBauen() {
    if (detailGruppe) { szeneRef.remove(detailGruppe); detailGruppe.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    detailGruppe = new T.Group(); szeneRef.add(detailGruppe);
    const D = DICHTE[qualitaet] || DICHTE.hoch, rnd = zufall(I.seed + 11);
    const g1 = new T.Color(I.gras), g2 = new T.Color(I.gras2);
    // Gras
    const gras = instanzen(halmGeo(6, .46, .05, '#4a8030', '#e2f5a8'), wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .16), D.gras, rnd,
      (h, st) => h > 1.05 && h < 9 && st < 1.1,
      (o, c, p, r) => { o.scale.set(.8 + r() * .6, .7 + r() * .8, .8 + r() * .6); c.copy(g1).lerp(g2, r()).multiplyScalar(1.15 + r() * .35); });
    gras.receiveShadow = qualitaet === 'hoch'; detailGruppe.add(gras);
    // Blumen: Stiel + Blüte mit denselben Plätzen
    const bluetenFarben = ['#ff5a6e', '#ffd23f', '#ffffff', '#b07cff', '#ff9a3c', '#6fc3ff'];
    const stielGeo = halmGeo(1, .32, .012, '#3c7a2a', '#5fa33f'), kopfGeo = new T.OctahedronGeometry(.065, 0); kopfGeo.translate(0, .33, 0);
    const stiele = instanzen(stielGeo, wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .1), D.blumen, zufall(I.seed + 21),
      (h, st) => h > 1.2 && h < 7 && st < .9, (o, c, p, r) => { o.scale.setScalar(.8 + r() * .5); c.set('#ffffff'); });
    const koepfe = new T.InstancedMesh(kopfGeo, wind(new T.MeshLambertMaterial({ color:'#ffffff' }), .1), Math.max(1, stiele.count)), mtx = new T.Matrix4(), fc = new T.Color();
    for (let i = 0; i < stiele.count; i++) { stiele.getMatrixAt(i, mtx); koepfe.setMatrixAt(i, mtx); koepfe.setColorAt(i, fc.set(bluetenFarben[i % bluetenFarben.length])); }
    koepfe.count = stiele.count;
    if (koepfe.instanceColor) koepfe.instanceColor.needsUpdate = true;
    detailGruppe.add(stiele, koepfe);
    // Muscheln am Strand
    const muschelGeo = new T.ConeGeometry(.07, .05, 7); muschelGeo.translate(0, .02, 0);
    const muschelFarben = ['#fff4e6', '#ffd1dc', '#ffe0b8', '#f2f2f2'];
    detailGruppe.add(instanzen(muschelGeo, new T.MeshLambertMaterial({ color:'#ffffff' }), D.muscheln, zufall(I.seed + 31),
      h => h > .05 && h < .95, (o, c, p, r) => { o.rotation.set((r() - .5) * .6, r() * 6, (r() - .5) * .6); o.scale.set(1, .7 + r() * .6, 1.3); c.set(muschelFarben[Math.floor(r() * 4)]); }));
    // Seegras im flachen Wasser (sieht man durchs klare Wasser)
    detailGruppe.add(instanzen(halmGeo(5, 1.1, .06, '#1f4a2a', '#6fae4a'), wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .35), D.seegras, zufall(I.seed + 41),
      h => h < -.9 && h > -4.5, (o, c, p, r) => { o.scale.set(1, Math.min(.6 + r() * 1.2, (-p.h - .45) / 1.35), 1); c.setRGB(.8 + r() * .3, .9 + r() * .2, .8); }));
    // Büsche
    const busch = instanzen(new T.IcosahedronGeometry(.6, 1), new T.MeshPhongMaterial({ color:'#ffffff', flatShading:true, shininess:0, specular:0x000000 }), D.buesche, zufall(I.seed + 51),
      (h, st) => h > 1.4 && h < 7 && st < .8, (o, c, p, r) => { o.scale.set(1 + r() * .8, .6 + r() * .5, 1 + r() * .8); o.position.y += .15; c.copy(g2).lerp(g1, r() * .5).multiplyScalar(.8 + r() * .2); });
    busch.castShadow = qualitaet === 'hoch'; busch.receiveShadow = true; detailGruppe.add(busch);
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

    szeneRef = szene;
    szene.fog = new T.Fog(I.nebel, 70, 360);
    szene.background = new T.Color(I.horizont);
    himmel = himmelMesh(); gruppe.add(himmel);
    gruppe.add(gelaendeMesh());
    if (hoehenTex) hoehenTex.dispose();
    hoehenTex = hoehenTextur();
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
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, d = 190 + rnd() * 90, s = 8 + rnd() * 16, ferne = new T.Group();
      const sand = new T.Mesh(new T.CylinderGeometry(s * 1.15, s * 1.3, 1.2, 9), M.mat(I.sand)); sand.position.y = .1; ferne.add(sand);
      const huegel = new T.Mesh(new T.ConeGeometry(s, s * (.35 + rnd() * .35), 8), M.mat(I.gras2)); huegel.position.y = s * .15; ferne.add(huegel);
      for (let j = 0; j < 3; j++) {
        const pa = M.palme(rnd); pa.scale.setScalar(1.6); const w = rnd() * 6; pa.position.set(Math.cos(w) * s * .8, .4, Math.sin(w) * s * .8); ferne.add(pa);
      }
      ferne.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); ferne.traverse(o => { o.castShadow = false; }); gruppe.add(ferne);
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
    detailsBauen();
    return W;
  }

  function animieren(t, dt, kamera) {
    if (!wasser) return;
    ZEIT.value = t;
    if (kamera && himmel) himmel.position.copy(kamera.position);
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

  function setQualitaet(q) { const neu = q !== qualitaet; qualitaet = q; if (neu && I && szeneRef) detailsBauen(); }
  return { bauen, animieren, gelaende, boden, welle, uferRadius, sonnenRichtung, setQualitaet, get insel() { return I; }, W };
})();
