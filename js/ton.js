'use strict';
// Fischfieber – kleine synthetische Geräusche (WebAudio, keine Dateien). Abschaltbar in den Einstellungen.
window.FF = window.FF || {};
FF.Ton = (() => {
  let ac = null, master = null, rausch = null, an = true;

  function start() {
    if (ac || !an) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = .45; master.connect(ac.destination);
      rausch = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = rausch.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  const bereit = () => { if (!an) return false; start(); if (ac && ac.state === 'suspended') ac.resume(); return !!ac; };

  function rauschen(dauer, frq, q, laut, typ = 'lowpass', frq2) {
    if (!bereit()) return;
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = rausch; f.type = typ; f.frequency.setValueAtTime(frq, t); f.Q.value = q;
    if (frq2) f.frequency.exponentialRampToValueAtTime(frq2, t + dauer);
    g.gain.setValueAtTime(laut, t); g.gain.exponentialRampToValueAtTime(.001, t + dauer);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dauer + .05);
  }
  function piep(frq, dauer, laut = .2, typ = 'sine', frq2) {
    if (!bereit()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = typ; o.frequency.setValueAtTime(frq, t);
    if (frq2) o.frequency.exponentialRampToValueAtTime(frq2, t + dauer);
    g.gain.setValueAtTime(laut, t); g.gain.exponentialRampToValueAtTime(.001, t + dauer);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dauer + .05);
  }

  return {
    start, setAn(v) { an = v; if (master) master.gain.value = v ? .45 : 0; }, get an() { return an; },
    wurf()      { rauschen(.35, 900, 1, .25, 'bandpass', 2500); },
    platsch(g = 1) { rauschen(.45 * g, 1400, .7, .35 * g, 'lowpass', 300); },
    biss()      { piep(880, .09, .25, 'square'); setTimeout(() => piep(1320, .12, .25, 'square'), 90); },
    reissen()   { piep(500, .25, .25, 'sawtooth', 120); },
    schuss()    { rauschen(.18, 2400, .8, .6, 'lowpass', 400); piep(160, .1, .3, 'square', 60); },
    flinte()    { rauschen(.35, 1800, .6, .8, 'lowpass', 200); piep(110, .15, .35, 'square', 40); },
    harpune()   { rauschen(.25, 3000, 2, .4, 'bandpass', 600); piep(300, .2, .2, 'triangle', 90); },
    hieb()      { rauschen(.12, 700, 1.5, .4, 'bandpass', 250); },
    treffer()   { piep(240, .08, .25, 'square', 120); },
    aua()       { piep(220, .2, .3, 'sawtooth', 90); },
    explosion() { rauschen(1.1, 900, .5, 1, 'lowpass', 60); piep(70, .6, .5, 'sine', 30); },
    kasse()     { piep(1046, .08, .2, 'triangle'); setTimeout(() => piep(1568, .18, .2, 'triangle'), 80); },
    klick()     { piep(1500, .03, .12, 'square'); },
    nachladen() { piep(600, .05, .15, 'square'); setTimeout(() => piep(900, .05, .15, 'square'), 120); },
    zap()       { rauschen(.3, 4000, 4, .35, 'bandpass', 1500); piep(1800, .25, .12, 'sawtooth', 300); },
    sieg()      { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => piep(f, .25, .2, 'triangle'), i * 120)); },
    pech()      { [392, 330, 262].forEach((f, i) => setTimeout(() => piep(f, .25, .2, 'triangle'), i * 140)); },
  };
})();
