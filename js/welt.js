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
  const DETAIL_U = { value:1 };   // 1 = feine Rauschmuster in den Shadern, 0 = sparsam (Grafik „niedrig“)
  const WETTER_U = { value:0 };   // 0 = klar … 1 = Regen (nur Optik)
  let qualitaet = 'hoch';
  const DICHTE = {
    hoch:    { gras:9000, blumen:650, muscheln:240, seegras:520, buesche:70, farne:260, schilf:200, kiesel:420, seesterne:50, strandgras:420, regen:1500 },
    mittel:  { gras:4200, blumen:320, muscheln:160, seegras:300, buesche:50, farne:150, schilf:110, kiesel:240, seesterne:30, strandgras:240, regen:750 },
    niedrig: { gras:1300, blumen:120, muscheln:90,  seegras:120, buesche:30, farne:60,  schilf:40,  kiesel:100, seesterne:14, strandgras:90,  regen:0 },
  };
  // GLSL-Helfer für Rauschen (Boden, Wasser, Himmel)
  const GLSL_RAUSCHEN = `
    float ffHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float ffN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(ffHash(i), ffHash(i + vec2(1., 0.)), f.x), mix(ffHash(i + vec2(0., 1.)), ffHash(i + vec2(1., 1.)), f.x), f.y); }
    float ffFbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++) { s += a * ffN(p); p = p * 2.03 + 11.7; a *= .5; } return s * 1.14; }
  `;
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
    const cs = new T.Color(I.sand), cn = new T.Color(I.sand).multiplyScalar(.75), cg = new T.Color(I.gras), cg2 = new T.Color(I.gras2), cf = new T.Color(I.fels), c = new T.Color(), cg3 = new T.Color(I.gras).lerp(new T.Color(I.sand), .45), cd = new T.Color(I.sand).multiplyScalar(.9);
    const tiefC = new T.Color(I.tief);
    for (let i = 0; i < fp.count; i += 3) {
      const y = (fp.getY(i) + fp.getY(i + 1) + fp.getY(i + 2)) / 3, x = fp.getX(i), z = fp.getZ(i);
      const ny = flach.attributes.normal.getY(i);
      const flecken = rauschen(x * .09, z * .09, I.seed + 5), fein = hash(x * 3, z * 3, 2);
      if (y < -.25) c.copy(cn).lerp(tiefC, glatt(-.3, -6, y) * .6);
      else if (y < 1.0) { c.copy(cs).lerp(cd, glatt(.3, .8, flecken) * .7); c.multiplyScalar(.97 + fein * .06); }
      else if (ny < .78 && y > 3) c.copy(cf);
      else {
        c.copy(hash(x, z, 9) > .5 ? cg : cg2).lerp(cg2, glatt(.4, .7, flecken) * .5);   // große Grasflecken
        c.lerp(cg3, glatt(.05, .45, 1.45 - y + (flecken - .5) * .8) * .85);                 // trockener Saum zum Strand
        if (ny < .88 && y > 2.2) c.lerp(cf, glatt(.88, .7, ny) * .5);                      // Fels schimmert an Hängen durch
      }
      if (y > .85 && y < 1.5 && hash(x * 2, z * 2, 5) > .86) c.lerp(cs, .6);                // Sandtupfer im Gras
      c.multiplyScalar(.96 + fein * .08);
      for (let k = 0; k < 3; k++) farben.push(c.r, c.g, c.b);
    }
    flach.setAttribute('color', new T.Float32BufferAttribute(farben, 3));
    const mat = new T.MeshPhongMaterial({ vertexColors:true, flatShading:true, shininess:0, specular:0x000000 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uZeit = ZEIT; sh.uniforms.uWetter = WETTER_U; sh.uniforms.uDetail = DETAIL_U;
      sh.vertexShader = 'varying vec3 vWeltPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWeltPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uZeit; uniform float uWetter; uniform float uDetail;\nvarying vec3 vWeltPos;\n' + GLSL_RAUSCHEN + `
        float ffKaustik(vec2 p, float t){
          vec2 q = p * .55; float c = 0.;
          for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.7 + t * .9), cos(q.x * 1.5 - t * .8)) * .55; c += abs(sin(q.x + q.y)); }
          return pow(max(0., 1. - c / 2.2), 5.);
        }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float ffY = vWeltPos.y;
        float ffW = .12 * sin(vWeltPos.x * .3 + uZeit * 1.3) + .08 * sin(vWeltPos.z * .4 + uZeit * 1.7);
        float ffD = length(vViewPosition);
        float ffFern = (1. - smoothstep(22., 75., ffD)) * uDetail;
        // weiche Bodenvariation: große Flecken, mittlere und feine Körnung
        float ffV = (ffN(vWeltPos.xz * .22) * .65 + ffN(vWeltPos.xz * .5) * .35 - .5) * .26;
        float ffSand = 1. - smoothstep(.75, 1.2, ffY);
        if (ffFern > 0.01) {
          ffV += (ffN(vWeltPos.xz * 1.3) - .5) * .12 * ffFern;
          // Sandrippel (Wind-Dünen) auf dem Strand, Grashalm-Strichelung auf der Wiese
          float ffR = sin(dot(vWeltPos.xz, vec2(.82, .57)) * 4.6 + ffN(vWeltPos.xz * .7) * 5.) * .5 + .5;
          ffV += ffSand * smoothstep(.05, .5, ffY) * (ffR - .5) * .07 * ffFern;
          ffV += (1. - ffSand) * ffFern * (ffN(vWeltPos.xz * vec2(14., 3.)) - .5) * .14;
        }
        diffuseColor.rgb *= 1. + ffV;
        // nasser Sand direkt an der Wasserlinie
        diffuseColor.rgb *= mix(1., .78, (1. - smoothstep(ffW, ffW + .55, ffY)) * step(ffW - .2, ffY));
        // Regen macht den Boden dunkler
        diffuseColor.rgb *= 1. - .2 * uWetter;
        // Lichtmuster der Wellen auf dem Meeresgrund
        if (ffY < ffW) diffuseColor.rgb += vec3(.75, .95, 1.) * ffKaustik(vWeltPos.xz, uZeit) * .6 * smoothstep(-6., -.3, ffY);
`);
    };
    mat.customProgramCacheKey = () => 'gelaende2';
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
  // Himmelsfarbe in eine Richtung (gleiche Formel für Himmelskuppel und Spiegelung im Wasser)
  const SKY_GLSL = `
    uniform vec3 uOben, uHorizont, uSonne, uSonnenFarbe; uniform float uWetter;
    vec3 ffHimmel(vec3 r){
      float h = max(r.y, 0.);
      vec3 c = mix(uHorizont, uOben, pow(smoothstep(-.02, .55, h), .75));
      float d = max(dot(r, uSonne), 0.);
      c += uSonnenFarbe * (pow(d, 90.) * .5 + pow(d, 7.) * .16) * (1. - uWetter * .85);
      float grau = dot(c, vec3(.3, .55, .15));
      return mix(c, vec3(grau * .9, grau * .95, grau) * .78, uWetter * .72);
    }`;
  function wasserMesh() {
    const geo = new T.PlaneGeometry(700, 700, 160, 160); geo.rotateX(-Math.PI / 2);
    const uni = T.UniformsUtils.merge([T.UniformsLib.fog, {
      uHoehe:{ value:null }, uFlach:{ value:new T.Color(I.flach || I.wasser) }, uMitte:{ value:new T.Color(I.wasser) }, uTief:{ value:new T.Color(I.tief) },
      uHorizont:{ value:new T.Color(I.horizont) }, uOben:{ value:new T.Color(I.himmel) }, uSonne:{ value:sonnenRichtung() }, uSonnenFarbe:{ value:new T.Color(I.sonne) },
    }]);
    uni.uZeit = ZEIT; uni.uWetter = WETTER_U; uni.uDetail = DETAIL_U; uni.uHoehe.value = hoehenTex;
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
        uniform float uZeit; uniform float uDetail; uniform sampler2D uHoehe; uniform vec3 uFlach, uMitte, uTief;
        varying vec3 vWelt;
        ${SKY_GLSL}
        ${GLSL_RAUSCHEN}
        #include <fog_pars_fragment>
        void main(){
          vec2 p = vWelt.xz; float t = uZeit;
          float dist = length(cameraPosition - vWelt);
          // Normale aus den Wellen + feine Kräusel (nahe Wellen detailreicher, ferne ruhiger)
          float dx = .036 * cos(p.x * .3 + t * 1.3) + .035 * cos((p.x + p.y) * .7 + t * 2.3);
          float dz = .032 * cos(p.y * .4 + t * 1.7) + .035 * cos((p.x + p.y) * .7 + t * 2.3);
          float fein = (1. - smoothstep(30., 150., dist)) * uDetail;
          dx += (.06 * sin(p.x * 2.3 + p.y * .7 + t * 2.9) + .04 * sin(p.x * 4.1 - p.y * 3.3 + t * 3.7)) * (.35 + fein * .65);
          dz += (.06 * cos(p.y * 2.1 - p.x * .9 + t * 2.6) + .04 * cos(p.y * 4.7 + p.x * 2.9 - t * 3.3)) * (.35 + fein * .65);
          if (fein > .02) {
            vec2 q = p * 1.1 + vec2(t * .21, t * .13); float n0 = ffN(q);
            dx += (ffN(q + vec2(.15, 0.)) - n0) * .9 * fein; dz += (ffN(q + vec2(0., .15)) - n0) * .9 * fein;
          }
          vec3 n = normalize(vec3(-dx, 1., -dz));
          float boden = texture2D(uHoehe, p / 280. + .5).r * 16. - 8.;
          float tiefe = max(0., vWelt.y - boden);
          vec3 v = normalize(cameraPosition - vWelt);
          // Farbverlauf: helles Türkis im Flachen, Meerblau, dunkles Tiefblau
          float k = smoothstep(.15, 7., tiefe);
          vec3 farbe = mix(uFlach, mix(uMitte, uTief, smoothstep(.45, 1., k)), smoothstep(.0, .55, k));
          farbe += uFlach * .12 * (1. - k) * (.5 + .5 * sin(t * .8 + p.x * .3));
          // Licht scheint durch die Wellenkämme
          float welle = vWelt.y;
          farbe += uFlach * smoothstep(.06, .24, welle) * .22 * max(dot(vec3(0., 1., 0.), uSonne), 0.);
          farbe *= .86 + .2 * max(dot(n, uSonne), 0.);
          // Spiegelung des Himmels mit Fresnel
          vec3 rf = reflect(-v, n); rf.y = abs(rf.y);
          float fr = .03 + .97 * pow(1. - max(dot(n, v), 0.), 4.);
          farbe = mix(farbe, ffHimmel(rf), clamp(fr * 1.15 + .04, 0., .92));
          // Sonnenglitzern: scharfes Glanzlicht plus Funkeln auf den Kräuseln
          vec3 h = normalize(v + uSonne);
          float gl = pow(max(dot(n, h), 0.), 260.) * 1.8 + pow(max(dot(n, h), 0.), 40.) * .12;
          float funkeln = 0.;
          if (fein > .02 && dot(n, h) > .9) funkeln = smoothstep(.72, .98, ffN(p * 5. + vec2(t * .9, -t * .7))) * pow(max(dot(n, h), 0.), 18.) * 1.2 * fein;
          farbe += uSonnenFarbe * (gl + funkeln) * (1. - WETTERDUMMY);
          // Schaum: Uferbänder mit spitzenartigem Rand und Linie an der Wasserlinie
          float sn = ffN(p * 2.4 + vec2(t * .35, -t * .2));
          float band = .6 + .38 * sin(t * 1.6 - tiefe * 6. + p.x * .15);
          float schaum = (1. - smoothstep(0., band, tiefe)) * smoothstep(.22, .75, sn + .45 * (1. - tiefe / band));
          schaum += (1. - smoothstep(0., .14, tiefe)) * .9;
          // weiße Schaumkronen auf hohen Wellen, bei Regen mehr
          float kamm = 0.;
          if (welle > .1 && dist < 200. && uDetail > .5) kamm = smoothstep(.15 - .04 * WETTERDUMMY, .25, welle) * smoothstep(.5, .78, ffN(p * 1.7 + vec2(t * .4, t * .25)));
          schaum += kamm * (.5 + .5 * WETTERDUMMY) * (1. - smoothstep(60., 200., dist));
          // Regentropfen-Ringe
          vec2 g = p * 1.5; vec2 id = floor(g); vec2 f = fract(g) - .5;
          float ring = 0.;
          if (WETTERDUMMY > .02 && fein > .02) { float ph = fract(t * .8 + ffHash(id) * 7.); ring = smoothstep(.05, 0., abs(length(f) - ph * .5)) * (1. - ph) * step(ffHash(id + 3.1), WETTERDUMMY * .6) * fein; }
          schaum += ring * .45;
          schaum = clamp(schaum, 0., 1.);
          farbe = mix(farbe, vec3(.96, .985, 1.), schaum * .88);
          float alpha = mix(.42, .94, smoothstep(0., 3.5, tiefe));
          alpha = max(alpha, max(schaum * .92, fr * .75));
          farbe *= 1. - .18 * WETTERDUMMY;
          gl_FragColor = vec4(farbe, alpha);
          #include <fog_fragment>
        }`.replace(/WETTERDUMMY/g, 'uWetter'),
    });
    return new T.Mesh(geo, wasserMat);
  }

  function himmelMesh() {
    himmelMat = new T.ShaderMaterial({
      side:T.BackSide, depthWrite:false, fog:false,
      uniforms:{ uOben:{ value:new T.Color(I.himmel) }, uHorizont:{ value:new T.Color(I.horizont) }, uMeer:{ value:new T.Color(I.tief) },
                 uSonne:{ value:sonnenRichtung() }, uSonnenFarbe:{ value:new T.Color(I.sonne) }, uZeit:ZEIT, uWetter:WETTER_U, uDetail:DETAIL_U },
      vertexShader:'varying vec3 vRicht; void main(){ vRicht = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:`
        uniform vec3 uMeer; uniform float uZeit; uniform float uDetail; varying vec3 vRicht;
        ${SKY_GLSL}
        ${GLSL_RAUSCHEN}
        void main(){
          vec3 r = normalize(vRicht); float h = r.y;
          vec3 c = ffHimmel(r);
          c = mix(c, mix(uHorizont, uMeer, .35), smoothstep(0., -.08, h));
          // Dunstband am Horizont
          c = mix(c, uHorizont * 1.03, exp(-max(h, 0.) * 9.) * .3);
          float d = max(dot(r, uSonne), 0.);
          // weiche Wolkenschicht (Rauschen auf einer Ebene), von der Sonne beleuchtet
          float wolke = 0.;
          if (h > .01) {
            vec2 uv = r.xz / (h + .22) * 1.15 + vec2(uZeit * .010, uZeit * .004);
            float n = uDetail > .5 ? ffFbm(uv * 1.3) : ffN(uv * 1.6) * .8 + .1;
            float deck = mix(.52, .34, uWetter);
            float m = smoothstep(deck, deck + .22, n) * smoothstep(.01, .16, h);
            if (m > .01) {
              float n2 = uDetail > .5 ? ffFbm(uv * 1.3 + uSonne.xz * .22) : n - .05;
              float licht = clamp(.62 + (n - n2) * 3.2, 0., 1.25);
              vec3 hell = mix(uSonnenFarbe, vec3(1.), .55) * (.96 + .1 * licht), dunkel = mix(uHorizont, vec3(.52, .58, .68), .55) * .9;
              vec3 wk = mix(dunkel, hell, clamp(licht, 0., 1.));
              wk = mix(wk, vec3(.5, .54, .6) * (.8 + .3 * licht), uWetter * .75);
              c = mix(c, wk, m * (.82 - uWetter * .1)); wolke = m;
            }
          }
          // Sonnenscheibe mit Hof, von Wolken verdeckt
          float sonne = (smoothstep(.9993, .9997, d) * 1.9 + pow(d, 160.) * .8 + pow(d, 14.) * .12) * (1. - uWetter * .9) * (1. - wolke * .75);
          c += uSonnenFarbe * sonne;
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
  // Farn: Fächer aus gebogenen Wedeln
  function farnGeo() {
    const pos = [], col = [], nor = [], cu = new T.Color('#2f6a2a'), co = new T.Color('#8fd25a'), c = new T.Color();
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + (k % 2) * .2, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca, L = .5 + (k % 3) * .08, br = .07;
      const segs = 3;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const f = t => [ca * t * L * .9, .12 + Math.sin(t * 2.4) * L * .5 - t * t * L * .35, sa * t * L * .9];
        const a0 = f(t0), a1 = f(t1), w0 = br * Math.sin(Math.PI * Math.min(1, t0 * 1.2 + .15)), w1 = br * Math.sin(Math.PI * Math.min(1, t1 * 1.2 + .15)) * (t1 > .95 ? .2 : 1);
        pos.push(a0[0] - px * w0, a0[1], a0[2] - pz * w0, a0[0] + px * w0, a0[1], a0[2] + pz * w0, a1[0] - px * w1, a1[1], a1[2] - pz * w1,
                 a0[0] + px * w0, a0[1], a0[2] + pz * w0, a1[0] + px * w1, a1[1], a1[2] + pz * w1, a1[0] - px * w1, a1[1], a1[2] - pz * w1);
        for (let q = 0; q < 6; q++) { nor.push(0, 1, 0); }
        c.copy(cu).lerp(co, t0); const c2 = cu.clone().lerp(co, t1);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b, c2.r, c2.g, c2.b, c.r, c.g, c.b, c2.r, c2.g, c2.b, c2.r, c2.g, c2.b);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return g;
  }
  function seesternGeo() {
    const sh = new T.Shape(), arme = 5;
    for (let i = 0; i < arme * 2; i++) { const a = i / (arme * 2) * Math.PI * 2, r = i % 2 ? .035 : .12; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const g = new T.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, .02, 0); return g;
  }
  function blumeGeo() {
    // fünf flache Blütenblätter (Rauten) um die Mitte, leicht nach oben gebogen: nur 10 Dreiecke
    const pos = [], nor = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;
      const P = (r, h, w) => [ca * r + px * w, .33 + h, sa * r + pz * w];
      const v = [P(.012, 0, 0), P(.05, .008, -.032), P(.1, .028, 0), P(.05, .008, .032)];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...v[k]); nor.push(0, 1, 0); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return g;
  }
  function buschGeo() {
    const l = [], c = new T.Color();
    for (const [x, y, z, r] of [[0, 0, 0, .6], [.4, -.1, .15, .42], [-.38, -.05, -.1, .45], [.1, .2, -.3, .4]]) {
      const g = new T.IcosahedronGeometry(r, r > .5 ? 1 : 0), p = g.attributes.position, col = [];
      for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) / r + 1) / 2)); c.setRGB(.55 + t * .5, .55 + t * .5, .55 + t * .5); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      l.push({ g, f:null, m:new T.Matrix4().makeTranslation(x, y, z) });
    }
    return M.verschmelzen(l);
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
    // Strandgras auf den Dünen: heller, höher, trocken
    detailGruppe.add(instanzen(halmGeo(7, .75, .045, '#8c9a4a', '#efe6a6'), wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .22), D.strandgras, zufall(I.seed + 61),
      (h, st) => h > .8 && h < 1.7 && st < 1, (o, c, p, r) => { o.scale.set(.8 + r() * .5, .7 + r() * .9, .8 + r() * .5); c.setRGB(.85 + r() * .25, .9 + r() * .2, .8 + r() * .2); }));
    // Farne im Unterholz
    const farn = instanzen(farnGeo(), wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .12), D.farne, zufall(I.seed + 71),
      (h, st) => h > 1.6 && h < 7.5 && st < .9, (o, c, p, r) => { o.scale.setScalar(.9 + r() * .9); c.copy(g1).lerp(g2, r()).multiplyScalar(1.3 + r() * .4); });
    detailGruppe.add(farn);
    // Schilf am Wasser
    detailGruppe.add(instanzen(halmGeo(5, 1.35, .035, '#56743a', '#cdb86e'), wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .2), D.schilf, zufall(I.seed + 81),
      (h, st) => h > -.1 && h < .75 && st < 1.2, (o, c, p, r) => { o.scale.set(.8 + r() * .5, .6 + r() * .9, .8 + r() * .5); c.setRGB(.9 + r() * .2, .95, .85); }));
    // Blumen: Stiel + Blüte (sechs Blütenblätter + gelbe Mitte)
    const bluetenFarben = ['#ff5a6e', '#ffd23f', '#ffffff', '#b07cff', '#ff9a3c', '#6fc3ff'];
    const stielGeo = halmGeo(1, .32, .012, '#3c7a2a', '#5fa33f');
    const stiele = instanzen(stielGeo, wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .1), D.blumen, zufall(I.seed + 21),
      (h, st) => h > 1.2 && h < 7 && st < .9, (o, c, p, r) => { o.scale.setScalar(.8 + r() * .5); c.set('#ffffff'); });
    const bm = wind(new T.MeshLambertMaterial({ color:'#ffffff', side:T.DoubleSide }), .1);
    const koepfe = new T.InstancedMesh(blumeGeo(), bm, Math.max(1, stiele.count)), mitten = new T.InstancedMesh(new T.OctahedronGeometry(.032, 0).translate(0, .335, 0), wind(new T.MeshLambertMaterial({ color:'#ffd23f' }), .1), Math.max(1, stiele.count));
    const mtx = new T.Matrix4(), fc = new T.Color();
    for (let i = 0; i < stiele.count; i++) { stiele.getMatrixAt(i, mtx); koepfe.setMatrixAt(i, mtx); mitten.setMatrixAt(i, mtx); koepfe.setColorAt(i, fc.set(bluetenFarben[i % bluetenFarben.length])); }
    koepfe.count = mitten.count = stiele.count;
    if (koepfe.instanceColor) koepfe.instanceColor.needsUpdate = true;
    detailGruppe.add(stiele, koepfe, mitten);
    // Muscheln und Seesterne am Strand
    const muschelGeo = new T.ConeGeometry(.07, .05, 7); muschelGeo.translate(0, .02, 0);
    const muschelFarben = ['#fff4e6', '#ffd1dc', '#ffe0b8', '#f2f2f2'];
    detailGruppe.add(instanzen(muschelGeo, new T.MeshLambertMaterial({ color:'#ffffff' }), D.muscheln, zufall(I.seed + 31),
      h => h > .05 && h < .95, (o, c, p, r) => { o.rotation.set((r() - .5) * .6, r() * 6, (r() - .5) * .6); o.scale.set(1, .7 + r() * .6, 1.3); c.set(muschelFarben[Math.floor(r() * 4)]); }));
    const sternFarben = ['#ff7a3c', '#ff9ab0', '#ffcf4a', '#e8503a'];
    detailGruppe.add(instanzen(seesternGeo(), new T.MeshLambertMaterial({ color:'#ffffff', side:T.DoubleSide }), D.seesterne, zufall(I.seed + 91),
      h => h > -1.1 && h < .6, (o, c, p, r) => { o.scale.setScalar(.8 + r() * .8); c.set(sternFarben[Math.floor(r() * 4)]); }));
    // Kiesel und Steinchen am Ufer und zwischen den Felsen
    const kieselGeo = new T.OctahedronGeometry(.09, 0);
    const kiesel = new T.InstancedMesh(kieselGeo, new T.MeshPhongMaterial({ color:'#ffffff', flatShading:true, shininess:0, specular:0x000000 }), D.kiesel), ko = new T.Object3D(), kc = new T.Color(), kr = zufall(I.seed + 101);
    let kn = 0;
    for (let i = 0; i < D.kiesel; i++) {
      const pl = platzSuchen(kr, (h, st) => (h > .1 && h < 1.7 && st < 1.3)); if (!pl) continue;
      const nah = kr() < .5; ko.position.set(pl.x, pl.h + .02, pl.z); ko.rotation.set(kr() * 3, kr() * 3, kr() * 3); ko.scale.set(.6 + kr() * 1.5, .5 + kr() * .8, .6 + kr() * 1.5); ko.updateMatrix();
      kiesel.setMatrixAt(kn, ko.matrix); kiesel.setColorAt(kn, kc.set(nah ? '#a7a69c' : '#d8c9a3').multiplyScalar(.7 + kr() * .5)); kn++;
    }
    kiesel.count = kn; kiesel.instanceMatrix.needsUpdate = true; if (kiesel.instanceColor) kiesel.instanceColor.needsUpdate = true; detailGruppe.add(kiesel);
    // Treibholz
    const holzGeo = new T.CylinderGeometry(.06, .1, 1.6, 6); holzGeo.rotateZ(Math.PI / 2);
    detailGruppe.add(instanzen(holzGeo, new T.MeshPhongMaterial({ color:'#ffffff', flatShading:true, shininess:0, specular:0x000000 }), qualitaet === 'niedrig' ? 3 : 9, zufall(I.seed + 111),
      (h, st) => h > .2 && h < .95 && st < .6, (o, c, p, r) => { o.rotation.set((r() - .5) * .2, r() * 6, (r() - .5) * .2); o.scale.set(.6 + r() * 1.1, .7 + r() * .6, .7 + r() * .6); c.set('#b8a483').multiplyScalar(.8 + r() * .3); }));
    // Seegras im flachen Wasser (sieht man durchs klare Wasser)
    detailGruppe.add(instanzen(halmGeo(5, 1.1, .06, '#1f4a2a', '#6fae4a'), wind(new T.MeshLambertMaterial({ vertexColors:true, side:T.DoubleSide }), .35), D.seegras, zufall(I.seed + 41),
      h => h < -.9 && h > -4.5, (o, c, p, r) => { o.scale.set(1, Math.min(.6 + r() * 1.2, (-p.h - .45) / 1.35), 1); c.setRGB(.8 + r() * .3, .9 + r() * .2, .8); }));
    // Büsche: mehrere Kugeln, unten dunkler
    const busch = instanzen(buschGeo(), new T.MeshPhongMaterial({ color:'#ffffff', vertexColors:true, flatShading:true, shininess:0, specular:0x000000 }), D.buesche, zufall(I.seed + 51),
      (h, st) => h > 1.4 && h < 7 && st < .8, (o, c, p, r) => { o.scale.set(1 + r() * .8, .6 + r() * .5, 1 + r() * .8); o.position.y += .15; c.copy(g2).lerp(g1, r() * .5).multiplyScalar(.8 + r() * .2); });
    busch.castShadow = qualitaet === 'hoch'; busch.receiveShadow = true; detailGruppe.add(busch);
  }

  /* ---------- Wetter (nur Optik): klar → Wolken ziehen auf → Regen → klart auf ----------
     Verändert Himmel, Nebel, Licht, Wasser und Boden. Spielwerte bleiben unberührt. */
  const WET = { wert:0, ziel:0, phase:0, timer:75, manuell:false };
  const PHASEN = [ { z:0, d:150 }, { z:.55, d:45 }, { z:1, d:60 }, { z:.4, d:30 } ];
  let regenMesh = null, nebelBasis = null, nebelGrau = new T.Color('#aeb8c2');
  const regenU = { uZeit:{ value:0 }, uKam:{ value:new T.Vector3() }, uStaerke:{ value:0 } };
  function regenBauen(anzahl) {
    if (regenMesh) { regenMesh.parent && regenMesh.parent.remove(regenMesh); regenMesh.geometry.dispose(); regenMesh = null; }
    if (!anzahl || !szeneRef) return;
    const pos = [], ende = [], gesch = [], r = zufall(3.3);
    for (let i = 0; i < anzahl; i++) {
      const x = (r() - .5) * 30, y = r() * 20, z = (r() - .5) * 30, v = .8 + r() * .5;
      pos.push(x, y, z, x, y, z); ende.push(0, 1); gesch.push(v, v);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aEnde', new T.Float32BufferAttribute(ende, 1)); g.setAttribute('aGesch', new T.Float32BufferAttribute(gesch, 1));
    const m = new T.ShaderMaterial({
      uniforms:regenU, transparent:true, depthWrite:false,
      vertexShader:`attribute float aEnde; attribute float aGesch; uniform float uZeit; uniform vec3 uKam; uniform float uStaerke; varying float vA;
        void main(){
          vec3 w;
          w.x = uKam.x + mod(position.x - uKam.x + 15., 30.) - 15.;
          w.z = uKam.z + mod(position.z - uKam.z + 15., 30.) - 15.;
          w.y = uKam.y - 10. + mod(position.y - uZeit * 15. * aGesch, 20.);
          w.x += aEnde * .22; w.y += aEnde * .75;
          float d = length(w.xz - uKam.xz);
          vA = (1. - aEnde * .85) * uStaerke * (1. - smoothstep(8., 15., d)) * smoothstep(.0, 1.5, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
        }`,
      fragmentShader:'varying float vA; void main(){ gl_FragColor = vec4(.82, .89, .96, vA * .55); }',
    });
    regenMesh = new T.LineSegments(g, m); regenMesh.frustumCulled = false; regenMesh.renderOrder = 4; regenMesh.visible = false;
    szeneRef.add(regenMesh);
  }
  function wetterTick(dt, kamera) {
    if (!WET.manuell) {
      WET.timer -= dt;
      if (WET.timer <= 0) { WET.phase = (WET.phase + 1) % PHASEN.length; WET.ziel = PHASEN[WET.phase].z; WET.timer = PHASEN[WET.phase].d; }
    }
    WET.wert += (WET.ziel - WET.wert) * (WET.manuell && WET.sofort ? 1 : 1 - Math.exp(-dt * .22));
    const w = WET.wert; WETTER_U.value = w;
    const regen = Math.max(0, Math.min(1, (w - .7) / .25));
    // Nebel und Hintergrund werden grau und dichter
    if (szeneRef && szeneRef.fog && I) {
      if (!nebelBasis) nebelBasis = new T.Color(I.nebel);
      szeneRef.fog.color.copy(nebelBasis).lerp(nebelGrau, Math.min(1, w * .7));
      szeneRef.fog.near = 70 - 28 * w; szeneRef.fog.far = 360 - 140 * w;
      if (szeneRef.background && szeneRef.background.isColor) szeneRef.background.copy(szeneRef.fog.color);
    }
    const g = 1 - .42 * w; M.wolkenMat.color.setScalar(g);
    W.wetter = w; W.regen = regen; W.licht = 1 - .5 * w;
    if (regenMesh) {
      regenMesh.visible = regen > .02;
      if (regenMesh.visible && kamera) { regenU.uKam.value.copy(kamera.position); regenU.uStaerke.value = regen; regenU.uZeit.value = ZEIT.value; }
    }
  }
  // zum Testen/Screenshots: 0 = klar, 1 = Regen; ohne Argument läuft der Wechsel wieder von selbst
  function wetterSetzen(z, sofort) {
    if (z == null) { WET.manuell = false; return; }
    WET.manuell = true; WET.ziel = z; WET.sofort = !!sofort;
    if (sofort) WET.wert = z;
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
    szene.fog = new T.Fog(I.nebel, 70, 360); nebelBasis = new T.Color(I.nebel);
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
    // Ruderboot am Steg vertäut (wippt auf den Wellen), Segelboote kreuzen am Horizont
    const rb = M.ruderboot(); rb.position.set(-3.1, 0, stegStart + stegLaenge - 7); rb.rotation.y = Math.PI / 2 + .12; gruppe.add(rb); W.deko.ruderboot = rb;
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
    W.segler = [];
    for (let i = 0; i < 2; i++) {
      const sb = M.segelboot(); sb.scale.setScalar(1.3); gruppe.add(sb);
      W.segler.push({ m:sb, r:130 + i * 45, w:rnd() * 6, s:(i ? -1 : 1) * (.0065 + rnd() * .003) });
    }
    if (regenMesh) { regenMesh.parent && regenMesh.parent.remove(regenMesh); regenMesh = null; }
    regenBauen((DICHTE[qualitaet] || DICHTE.hoch).regen);
    detailsBauen();
    return W;
  }

  function animieren(t, dt, kamera) {
    if (!wasser) return;
    ZEIT.value = t;
    wetterTick(dt, kamera);
    if (kamera && himmel) himmel.position.copy(kamera.position);
    for (const w of W.wolken) { w.position.x += dt * 1.5; if (w.position.x > 220) w.position.x = -220; }
    for (const v of W.voegel) {
      v.w += v.s * dt;
      v.m.position.set(v.cx + Math.cos(v.w) * v.r, v.h + Math.sin(t * .7 + v.r) * 1.5, v.cz + Math.sin(v.w) * v.r);
      v.m.rotation.y = -v.w - (v.s > 0 ? 0 : Math.PI);
      const f = Math.sin(t * 9 + v.r) * .5;
      v.m.userData.l.rotation.x = -Math.PI / 2 + f; v.m.userData.r.rotation.x = -Math.PI / 2 - f;
    }
    for (const pa of W.palmen) pa.rotation.z = Math.sin(t * .8 + pa.position.x) * .015 * (1 + W.wetter * 1.2);
    // Boote auf den Wellen
    const rb = W.deko.ruderboot;
    if (rb) { rb.position.y = welle(rb.position.x, rb.position.z, t) - .12; rb.rotation.z = Math.sin(t * 1.3 + 1) * .04; rb.rotation.x = Math.sin(t * 1.1) * .03; }
    for (const sg of W.segler || []) {
      sg.w += sg.s * dt; const x = Math.cos(sg.w) * sg.r, z = Math.sin(sg.w) * sg.r;
      sg.m.position.set(x, welle(x, z, t) - .1, z); sg.m.rotation.y = -sg.w - (sg.s > 0 ? Math.PI / 2 : -Math.PI / 2); sg.m.rotation.z = Math.sin(t * .9 + sg.r) * .05;
    }
    const f = W.deko.feuer;
    if (f && FF.Teilchen) {
      // Funken und Rauch steigen vom Lagerfeuer auf (nur nahe am Spieler, sonst unsichtbar teuer)
      const near = !kamera || kamera.position.distanceToSquared(f.position) < 60 * 60;
      if (near) {
        if (Math.random() < dt * 9) FF.Teilchen.glut(_fp.copy(f.position).add(_up.set((Math.random() - .5) * .3, .5, (Math.random() - .5) * .3)), '#ffb23a', 1, { kraft:.9, gr:.05, leben:1.3, schwer:-.28, richtung:_up2.set(0, 1, 0), streu:.5 });
        if (Math.random() < dt * 3.2) FF.Teilchen.weich(_fp.copy(f.position).add(_up.set(0, 1, 0)), '#6a6560', 1, { kraft:.35, gr:.35, wachs:3.4, leben:2.6, schwer:-.1, alpha:.38, drag:.5, richtung:_up2.set(.15, 1, .05), streu:.3 });
      }
    }
    if (f) { const s = 1 + Math.sin(t * 13) * .1 + Math.sin(t * 7.3) * .08; f.userData.flamme.scale.set(s, s * (1 + Math.sin(t * 9) * .15), s); f.userData.kern.rotation.y = t * 3; W.deko.feuerLicht.intensity = 1.1 + Math.sin(t * 11) * .25; }
    const c = W.deko.casino;
    if (c) c.userData.lichter.forEach((l, i) => l.material.color.set(((Math.floor(t * 4) + i) % 3) === 0 ? '#ff3b6b' : ((Math.floor(t * 4) + i) % 3) === 1 ? '#ffcc33' : '#3bd6ff'));
    for (const s of W.stationen) if (s.figur && s.art !== 'kuddel') s.figur.position.y += Math.sin(t * 2 + s.pos.x) * .0008;
  }

  const _fp = new T.Vector3(), _up = new T.Vector3(), _up2 = new T.Vector3();
  function setQualitaet(q) { const neu = q !== qualitaet; qualitaet = q; DETAIL_U.value = q === 'niedrig' ? 0 : 1; if (neu && I && szeneRef) { detailsBauen(); regenBauen((DICHTE[qualitaet] || DICHTE.hoch).regen); } }
  return { bauen, animieren, wetterSetzen, gelaende, boden, welle, uferRadius, sonnenRichtung, setQualitaet, get insel() { return I; }, W };
})();
