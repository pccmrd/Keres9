// ═══ procedural WebAudio soundscape ═════════════════════════════════════
export const AU = {
  c: null, on: true, m: null, nb: null, eng: null, engF: null, las: null, hiss: null, dgr: null, puffT: 0,

  init() {
    if (this.c) return;
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    const c = (this.c = new A());
    const k = c.createDynamicsCompressor(); k.threshold.value = -18; k.connect(c.destination);
    this.m = c.createGain(); this.m.gain.value = this.on ? 0.8 : 0; this.m.connect(k);
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nb = b;
    // engine rumble bed
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.m); s.start();
    this.eng = g; this.engF = f;
    // hull drone
    const dr = (fr, gn) => { const o = c.createOscillator(); o.frequency.value = fr; const q = c.createGain(); q.gain.value = gn; o.connect(q); q.connect(this.m); o.start(); };
    dr(55, 0.04); dr(82.4, 0.024);
    const ns = c.createBufferSource(); ns.buffer = b; ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 250;
    const ng = c.createGain(); ng.gain.value = 0.014;
    ns.connect(nf); nf.connect(ng); ng.connect(this.m); ns.start();
    // slow harmonic swells
    const roots = [73.42, 87.31, 98, 65.41];
    const swell = () => {
      if (!this.c) return;
      const t = c.currentTime, r = roots[(Math.random() * roots.length) | 0];
      [1, 1.5, 2.245].forEach((m, i) => {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = r * m;
        const q = c.createGain(); q.gain.value = 0; o.connect(q); q.connect(this.m); o.start(t);
        q.gain.linearRampToValueAtTime(0.018 / (i + 1), t + 3.2); q.gain.linearRampToValueAtTime(0, t + 9); o.stop(t + 9.2);
      });
      setTimeout(swell, 9000 + Math.random() * 8000);
    };
    setTimeout(swell, 3500);
    if (c.state === 'suspended') c.resume();
  },
  setOn(v) { this.on = v; if (this.m) this.m.gain.setTargetAtTime(v ? 0.8 : 0, this.c.currentTime, 0.04); },
  osc(t, f0, f1, d, g) {
    if (!this.c) return;
    const c = this.c, n = c.currentTime, o = c.createOscillator(); o.type = t; o.frequency.setValueAtTime(f0, n);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), n + d);
    const q = c.createGain(); q.gain.setValueAtTime(g, n); q.gain.exponentialRampToValueAtTime(0.0001, n + d);
    o.connect(q); q.connect(this.m); o.start(n); o.stop(n + d + 0.02);
  },
  nz(d, f0, f1, g, t = 'lowpass', q = 1) {
    if (!this.c) return;
    const c = this.c, n = c.currentTime, s = c.createBufferSource(); s.buffer = this.nb; s.loop = true;
    const f = c.createBiquadFilter(); f.type = t; f.frequency.setValueAtTime(f0, n); f.Q.value = q;
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), n + d);
    const v = c.createGain(); v.gain.setValueAtTime(g, n); v.gain.exponentialRampToValueAtTime(0.0001, n + d);
    s.connect(f); f.connect(v); v.connect(this.m); s.start(n); s.stop(n + d + 0.02);
  },
  engine(v) { if (this.eng) { const t = this.c.currentTime; this.eng.gain.setTargetAtTime(v * 0.15, t, 0.08); this.engF.frequency.setTargetAtTime(200 + v * 900, t, 0.1); } },
  puff() { const n = performance.now(); if (n - this.puffT < 95) return; this.puffT = n; this.nz(0.09, 1600, 700, 0.07, 'bandpass', 2); },
  shoot(g = 1) { this.osc('square', 150, 52, 0.08, 0.16 * g); this.nz(0.05, 2400, 900, 0.1 * g, 'highpass'); },
  boom(s = 1) { this.nz(0.5 + 0.3 * s, 2200, 110, 0.45 * Math.min(1.4, s)); this.osc('sine', 120, 26, 0.6 + 0.3 * s, 0.35 * Math.min(1.2, s)); },
  thunk() { this.osc('sine', 190, 70, 0.11, 0.3); this.nz(0.04, 900, 300, 0.14); },
  chime() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.osc('sine', f, f, 0.3, 0.1), i * 90)); },
  tick(h) { this.osc('sine', 1100 + h * 500, 1100 + h * 500, 0.025, 0.05); },
  geiger() { this.nz(0.012, 3400, 3000, 0.06, 'highpass'); },
  ui() { this.osc('square', 1500, 1200, 0.018, 0.05); },
  blip() { this.osc('sine', 880, 660, 0.07, 0.06); },
  warn() { this.osc('square', 440, 440, 0.1, 0.09); setTimeout(() => this.osc('square', 330, 330, 0.12, 0.09), 140); },
  alarm() { for (let i = 0; i < 3; i++) setTimeout(() => this.osc('sawtooth', 620, 380, 0.22, 0.07), i * 260); },
  whoosh(g = 1) { this.nz(0.35, 4200, 600, 0.12 * g, 'bandpass', 3); },
  cash() { this.osc('sine', 1046, 1046, 0.09, 0.08); setTimeout(() => this.osc('sine', 1568, 1568, 0.16, 0.08), 80); },
  mine(on) {
    if (!this.c) return;
    if (on && !this.las) {
      const c = this.c, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 84;
      const g = c.createGain(); g.gain.value = 0.04; o.connect(g); g.connect(this.m); o.start();
      const s = c.createBufferSource(); s.buffer = this.nb; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 920; f.Q.value = 7;
      const n = c.createGain(); n.gain.value = 0.045; s.connect(f); f.connect(n); n.connect(this.m); s.start();
      this.las = { o, g, s, n };
    } else if (!on && this.las) {
      const { o, g, s, n } = this.las, t = this.c.currentTime;
      g.gain.setTargetAtTime(0, t, 0.03); n.gain.setTargetAtTime(0, t, 0.03); o.stop(t + 0.15); s.stop(t + 0.15); this.las = null;
    }
  },
  air(on) {
    if (!this.c) return;
    if (on && !this.hiss) {
      const s = this.c.createBufferSource(); s.buffer = this.nb; s.loop = true;
      const f = this.c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
      const g = this.c.createGain(); g.gain.value = 0.013; s.connect(f); f.connect(g); g.connect(this.m); s.start();
      this.hiss = { s, g };
    } else if (!on && this.hiss) {
      this.hiss.g.gain.setTargetAtTime(0, this.c.currentTime, 0.1); this.hiss.s.stop(this.c.currentTime + 0.4); this.hiss = null;
    }
  },
  danger(on) {
    if (on && !this.dgr) {
      const b = () => { this.osc('sine', 58, 40, 0.14, 0.28); setTimeout(() => this.osc('sine', 52, 36, 0.12, 0.2), 190); };
      b(); this.dgr = setInterval(b, 1150);
    } else if (!on && this.dgr) { clearInterval(this.dgr); this.dgr = null; }
  },
};

export function initAudio() {
  addEventListener('pointerdown', () => AU.init(), { once: true });
  addEventListener('keydown', () => AU.init(), { once: true });
  document.addEventListener('visibilitychange', () => { if (!AU.c) return; document.hidden ? AU.c.suspend() : AU.c.resume(); });
}
