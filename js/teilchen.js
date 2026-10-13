'use strict';
// Fischfieber – Teilchen: weiche Sprites statt Würfel. Alles in drei Zeichenaufrufen (Rauch/Gischt, Tropfen/Splitter, Funken/Glut),
// egal wie viele Teilchen fliegen. Rein optisch – keine Spielregeln hängen daran.
window.FF = window.FF || {};
FF.Teilchen = (() => {
  const T = THREE;
  const KAP = { weich:700, hart:700, glut:600 };
  const LIMIT = { hoch:1, mittel:.65, niedrig:.38 };
  let faktor = 1, szeneRef = null;
  const farbCache = {};
  const farbe = f => farbCache[f] || (farbCache[f] = new T.Color(f));
  const zuf = (a, b) => a + Math.random() * (b - a);
  const skalaU = { value:600 };

  const VS = `
    attribute vec3 aFarbe; attribute float aGr; attribute float aAlpha;
    uniform float uSkala; varying vec3 vF; varying float vA;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(aGr * uSkala / max(-mv.z, .1), 0., 220.);
      vF = aFarbe; vA = aAlpha;
    }`;
  const FS = {
    // weich: Rauch, Gischtnebel, Staub
    weich:`varying vec3 vF; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5) * 2.; if (d > 1.) discard;
        float a = (1. - d) * (1. - d) * (3. - 2. * (1. - d)); gl_FragColor = vec4(vF * (.82 + .18 * (1. - d)), a * vA); }`,
    // hart: Wassertropfen, Schuppen, Splitter – klare Kante mit Glanzpunkt
    hart:`varying vec3 vF; varying float vA;
      void main(){ vec2 c = gl_PointCoord - .5; float d = length(c) * 2.; if (d > 1.) discard;
        float a = 1. - smoothstep(.72, 1., d); float glanz = smoothstep(.55, 0., length(c - vec2(-.14, -.14)));
        gl_FragColor = vec4(vF * (.8 + .5 * glanz), a * vA); }`,
    // glut: additiv leuchtend, heller Kern
    glut:`varying vec3 vF; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5) * 2.; if (d > 1.) discard;
        float k = 1. - d; float a = k * k + pow(k, 6.) * 1.5; gl_FragColor = vec4(vF * (.6 + 1.2 * pow(k, 3.)), a * vA); }`,
  };

  function System(art) {
    const n = KAP[art];
    this.art = art; this.n = n; this.next = 0; this.aktiv = 0; this.schmutzig = false;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.gr = new Float32Array(n); this.alpha = new Float32Array(n);
    this.leben = new Float32Array(n); this.max = new Float32Array(n); this.schwer = new Float32Array(n);
    this.gr0 = new Float32Array(n); this.gr1 = new Float32Array(n); this.a0 = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aFarbe', new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aGr', new T.BufferAttribute(this.gr, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('aAlpha', new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
    g.boundingSphere = new T.Sphere(new T.Vector3(), 1e5);
    const m = new T.ShaderMaterial({
      uniforms:{ uSkala:skalaU }, vertexShader:VS, fragmentShader:FS[art], transparent:true, depthWrite:false,
      blending:art === 'glut' ? T.AdditiveBlending : T.NormalBlending,
    });
    this.punkte = new T.Points(g, m); this.punkte.frustumCulled = false; this.punkte.renderOrder = art === 'glut' ? 6 : 5;
    this.geo = g;
  }
  System.prototype.neu = function (p, v, c, o) {
    const i = this.next; this.next = (this.next + 1) % Math.max(8, Math.floor(this.n * faktor));
    const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = v.x; this.vel[k + 1] = v.y; this.vel[k + 2] = v.z;
    this.col[k] = c.r; this.col[k + 1] = c.g; this.col[k + 2] = c.b;
    if (this.leben[i] <= 0) this.aktiv++;
    this.leben[i] = this.max[i] = o.leben; this.schwer[i] = o.schwer; this.gr0[i] = o.gr; this.gr1[i] = o.gr2; this.a0[i] = o.alpha; this.drag[i] = o.drag;
    this.gr[i] = o.gr; this.alpha[i] = 0;
  };
  System.prototype.update = function (dt) {
    if (!this.aktiv) { if (this.schmutzig) { this.schmutzig = false; } return; }
    const { pos, vel, leben, max, schwer, gr, alpha, gr0, gr1, a0, drag } = this, n = this.n, glut = this.art === 'glut';
    let aktiv = 0;
    for (let i = 0; i < n; i++) {
      if (leben[i] <= 0) continue;
      leben[i] -= dt;
      if (leben[i] <= 0) { gr[i] = 0; alpha[i] = 0; continue; }
      aktiv++;
      const k = 1 - leben[i] / max[i], k3 = i * 3;
      vel[k3 + 1] -= 12 * schwer[i] * dt;
      if (drag[i] > 0) { const d = Math.exp(-drag[i] * dt); vel[k3] *= d; vel[k3 + 1] *= d; vel[k3 + 2] *= d; }
      pos[k3] += vel[k3] * dt; pos[k3 + 1] += vel[k3 + 1] * dt; pos[k3 + 2] += vel[k3 + 2] * dt;
      gr[i] = gr0[i] + (gr1[i] - gr0[i]) * k;
      alpha[i] = a0[i] * Math.min(1, k * 10) * (glut ? (1 - k) : (1 - k * k));
    }
    this.aktiv = aktiv;
    const a = this.geo.attributes;
    a.position.needsUpdate = a.aGr.needsUpdate = a.aAlpha.needsUpdate = a.aFarbe.needsUpdate = true;
  };

  const S = {};
  function init(szene) {
    szeneRef = szene;
    for (const art of ['weich', 'hart', 'glut']) { S[art] = new System(art); szene.add(S[art].punkte); }
  }
  function setQualitaet(q) { faktor = LIMIT[q] || 1; }
  const v3 = new T.Vector3();
  // o: kraft (Startgeschwindigkeit), gr (Durchmesser m), gr2 (Endgröße), leben (s), schwer (1 = normale Schwerkraft, <0 steigt auf),
  //    alpha, drag (Luftwiderstand), richtung (Vector3: Grundrichtung), streu (Streuung um die Richtung), flach (nur seitlich)
  function spawn(art, pos, f, n, o = {}) {
    if (!S[art]) return;
    n = Math.max(1, Math.round(n * (faktor < 1 ? Math.max(.4, faktor) : 1)));
    const c = farbe(f), kraft = o.kraft ?? 3, gr = o.gr ?? .1, leben = o.leben ?? .7;
    const p = { leben:0, schwer:o.schwer ?? 1, gr:0, gr2:0, alpha:o.alpha ?? 1, drag:o.drag ?? 0 };
    for (let i = 0; i < n; i++) {
      const g1 = gr * zuf(.6, 1.3);
      p.gr = g1; p.gr2 = g1 * (o.wachs ?? 1); p.leben = leben * zuf(.6, 1.2);
      if (o.richtung) {
        const s = o.streu ?? .4;
        v3.set(o.richtung.x + zuf(-s, s), o.richtung.y + zuf(-s, s), o.richtung.z + zuf(-s, s));
        if (v3.lengthSq() < 1e-6) v3.set(0, 1, 0);
        v3.normalize().multiplyScalar(kraft * zuf(.5, 1.1));
      } else if (o.flach) {
        const a = Math.random() * Math.PI * 2, r = kraft * zuf(.3, 1);
        v3.set(Math.cos(a) * r, zuf(.05, .5) * kraft * .4, Math.sin(a) * r);
      } else v3.set(zuf(-1, 1), zuf(.3, 1.4), zuf(-1, 1)).multiplyScalar(kraft);
      S[art].neu(pos, v3, c, p);
    }
  }
  function update(dt, kamera, hoehePx) {
    if (!szeneRef) return;
    skalaU.value = hoehePx / (2 * Math.tan(kamera.fov * Math.PI / 360));
    for (const art in S) S[art].update(dt);
  }
  return {
    init, setQualitaet, update, spawn,
    weich:(p, f, n, o) => spawn('weich', p, f, n, o),
    hart:(p, f, n, o) => spawn('hart', p, f, n, o),
    glut:(p, f, n, o) => spawn('glut', p, f, n, o),
  };
})();
