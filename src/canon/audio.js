/* =========================================================================
   Audio — everything synthesized with WebAudio: SFX, gear loops, wind, and an
   adaptive "orchestral" score that swells with the fighting.
   ========================================================================= */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const Sfx = {
  ctx: null, ready: false,
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = (() => { try { const v = localStorage.getItem('ts_master'); return v === null ? 0.8 : +v; } catch (e) { return 0.8; } })();
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.master.connect(this.lp).connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    const sr = ctx.sampleRate, len = sr * 2;
    this.white = ctx.createBuffer(1, len, sr); const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, sr); const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // reverb
    const rl = Math.floor(sr * 2.8), ir = ctx.createBuffer(2, rl, sr);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < rl; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.6;
    this.verbIn.connect(this.verb).connect(this.master);
    // ambient wind (always) + speed wind (rises with velocity)
    const loopNoise = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const wind = loopNoise(this.brown);
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg).connect(wf.frequency); lfo.start();
    wind.connect(wf).connect(this.windGain).connect(this.sfx);
    const sw = loopNoise(this.white);
    this.speedF = ctx.createBiquadFilter(); this.speedF.type = 'bandpass'; this.speedF.frequency.value = 500; this.speedF.Q.value = 0.7;
    this.speedGain = ctx.createGain(); this.speedGain.gain.value = 0;
    sw.connect(this.speedF).connect(this.speedGain).connect(this.sfx);
    // gas hiss loop
    const gs = loopNoise(this.white);
    const gf = ctx.createBiquadFilter(); gf.type = 'highpass'; gf.frequency.value = 1800;
    const gf2 = ctx.createBiquadFilter(); gf2.type = 'peaking'; gf2.frequency.value = 4200; gf2.gain.value = 6;
    this.gasGain = ctx.createGain(); this.gasGain.gain.value = 0;
    gs.connect(gf).connect(gf2).connect(this.gasGain).connect(this.sfx);
    // cable reel whirr loop
    this.reelOsc = ctx.createOscillator(); this.reelOsc.type = 'sawtooth'; this.reelOsc.frequency.value = 140; this.reelOsc.start();
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 2;
    const rn = loopNoise(this.white); const rnf = ctx.createBiquadFilter(); rnf.type = 'bandpass'; rnf.frequency.value = 2500; rnf.Q.value = 3;
    const rng = ctx.createGain(); rng.gain.value = 0.5;
    this.reelGain = ctx.createGain(); this.reelGain.gain.value = 0;
    this.reelOsc.connect(rf).connect(this.reelGain); rn.connect(rnf).connect(rng).connect(this.reelGain);
    this.reelGain.connect(this.sfx);
    // steam ambience (dissolving titans)
    const st = loopNoise(this.white); const stf = ctx.createBiquadFilter(); stf.type = 'highpass'; stf.frequency.value = 3000;
    this.steamGain = ctx.createGain(); this.steamGain.gain.value = 0;
    st.connect(stf).connect(this.steamGain).connect(this.sfx);
    Music.init(ctx, this.master, this.verbIn);
    this.ready = true;
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  out(pan) {
    if (!pan) return this.sfx;
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.sfx); return p;
  },
  noise({ dur = 0.15, freq = 1000, q = 1, type = 'bandpass', gain = 0.3, delay = 0, rate = 1, sweep = 0, attack = 0.006, pan = 0, verb = 0, buf = null }) {
    if (!this.ctx || gain < 0.002) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = buf || this.white; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    if (verb) { const vg = ctx.createGain(); vg.gain.value = verb; g.connect(vg).connect(this.verbIn); }
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  },
  tone({ freq = 440, end = 0, dur = 0.2, gain = 0.1, type = 'sine', delay = 0, attack = 0.005, pan = 0, verb = 0, filter = 0 }) {
    if (!this.ctx || gain < 0.002) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g).connect(this.out(pan));
    if (verb) { const vg = ctx.createGain(); vg.gain.value = verb; g.connect(vg).connect(this.verbIn); }
    o.start(t); o.stop(t + dur + 0.05);
  },
  block(snd, kind, gainMul = 1) {
    if (!this.ctx) return;
    const K = { break: [0.42, 0.2, 3], place: [0.36, 0.09, 1], step: [0.09, 0.07, 1], hit: [0.14, 0.06, 1] }[kind];
    const [gain0, dur, n] = K, gain = gain0 * gainMul;
    for (let i = 0; i < n; i++) {
      const d = i * 0.045, gg = gain * (1 - i * 0.25), r = 0.9 + Math.random() * 0.2;
      switch (snd) {
        case 'stone': this.noise({ dur, freq: 1500 * r, q: 0.9, gain: gg, delay: d }); this.noise({ dur: dur * 0.7, freq: 300 * r, q: 1, type: 'lowpass', gain: gg * 0.8, delay: d }); break;
        case 'wood': this.noise({ dur, freq: 650 * r, q: 2.5, gain: gg, delay: d }); this.tone({ freq: 190 * r, end: 120, dur: dur * 0.8, gain: gg * 0.35, delay: d, type: 'triangle' }); break;
        case 'sand': this.noise({ dur: dur * 1.3, freq: 2600 * r, q: 0.5, type: 'highpass', gain: gg * 0.7, delay: d }); break;
        case 'snow': this.noise({ dur: dur * 1.2, freq: 1300 * r, q: 0.4, type: 'lowpass', gain: gg * 0.9, delay: d }); break;
        case 'leaves': this.noise({ dur: dur * 1.4, freq: 1900 * r, q: 0.6, type: 'highpass', gain: gg * 0.7, delay: d }); break;
        case 'glass':
          if (kind === 'break') { for (let k = 0; k < 6; k++) this.tone({ freq: 2200 + Math.random() * 3200, dur: 0.25 + Math.random() * 0.3, gain: 0.07 * gainMul, delay: Math.random() * 0.12 }); this.noise({ dur: 0.25, freq: 4000, type: 'highpass', gain: 0.25 * gainMul }); return; }
          this.noise({ dur: dur * 0.8, freq: 3000 * r, q: 2, gain: gg, delay: d }); break;
        case 'grass': this.noise({ dur, freq: 1100 * r, q: 0.6, type: 'lowpass', gain: gg * 1.1, delay: d }); this.noise({ dur: dur * 0.6, freq: 3000, type: 'highpass', gain: gg * 0.25, delay: d }); break;
        default: this.noise({ dur, freq: 750 * r, q: 0.7, type: 'lowpass', gain: gg * 1.1, delay: d });
      }
    }
  },
  // ---- gear ----
  anchorFire() {
    this.noise({ dur: 0.16, freq: 3400, q: 1.2, gain: 0.32, sweep: 0.35 });
    this.tone({ freq: 1900, end: 900, dur: 0.05, gain: 0.08, type: 'square' });
    this.noise({ dur: 0.05, freq: 6000, type: 'highpass', gain: 0.12 });
  },
  anchorHit(kind, dist = 10) {
    const g = Math.max(0.12, 1 - dist / 90);
    if (kind === 'flesh') { this.noise({ dur: 0.14, freq: 320, type: 'lowpass', gain: 0.5 * g }); this.tone({ freq: 130, end: 60, dur: 0.12, gain: 0.25 * g }); return; }
    if (kind === 'wood') { this.noise({ dur: 0.1, freq: 800, q: 2.5, gain: 0.4 * g }); this.tone({ freq: 240, end: 130, dur: 0.1, gain: 0.25 * g, type: 'triangle' }); return; }
    this.noise({ dur: 0.07, freq: 2600, type: 'highpass', gain: 0.35 * g }); this.tone({ freq: 1250, end: 700, dur: 0.07, gain: 0.12 * g, type: 'triangle' });
    this.tone({ freq: 3100, dur: 0.12, gain: 0.04 * g });
  },
  anchorMiss() { this.noise({ dur: 0.22, freq: 1800, q: 1, gain: 0.12, sweep: 0.4 }); },
  release() { this.tone({ freq: 700, end: 1400, dur: 0.06, gain: 0.06, type: 'triangle' }); this.noise({ dur: 0.08, freq: 3000, type: 'highpass', gain: 0.08 }); },
  boostBurst() { this.noise({ dur: 0.35, freq: 2400, type: 'highpass', gain: 0.32, attack: 0.01 }); this.noise({ dur: 0.25, freq: 300, type: 'lowpass', gain: 0.25 }); },
  jump() { this.noise({ dur: 0.1, freq: 600, type: 'lowpass', gain: 0.18 }); },
  land(h = 1) { this.noise({ dur: 0.14, freq: 260, q: 0.7, type: 'lowpass', gain: 0.35 * h }); },
  thud() { this.noise({ dur: 0.18, freq: 180, type: 'lowpass', gain: 0.55 }); this.tone({ freq: 90, end: 45, dur: 0.2, gain: 0.3 }); },
  // ---- blades ----
  slash(power = 1) {
    this.noise({ dur: 0.2, freq: 2400, q: 1.4, gain: 0.32 * power, sweep: 0.3, attack: 0.02 });
    this.tone({ freq: 2600 + Math.random() * 300, dur: 0.18, gain: 0.025, type: 'sine', delay: 0.02 });
    this.tone({ freq: 3900 + Math.random() * 300, dur: 0.14, gain: 0.015, type: 'sine', delay: 0.02 });
  },
  spin() {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.16, freq: 2600 - i * 200, q: 1.5, gain: 0.25, sweep: 0.4, delay: i * 0.1, attack: 0.03 });
    this.tone({ freq: 2900, dur: 0.6, gain: 0.03, delay: 0.05 });
  },
  hitFlesh(pan = 0) {
    this.noise({ dur: 0.12, freq: 700, type: 'lowpass', gain: 0.55, pan }); this.tone({ freq: 160, end: 70, dur: 0.12, gain: 0.25, pan });
    this.noise({ dur: 0.5, freq: 3500, type: 'highpass', gain: 0.12, attack: 0.03, delay: 0.05, pan });
  },
  napeKill() {
    this.noise({ dur: 0.35, freq: 900, type: 'lowpass', gain: 0.8 }); this.tone({ freq: 110, end: 38, dur: 0.5, gain: 0.5 });
    this.tone({ freq: 55, dur: 1.4, gain: 0.35, attack: 0.02, verb: 0.4 });
    this.noise({ dur: 1.8, freq: 2500, type: 'highpass', gain: 0.32, attack: 0.08, delay: 0.1, verb: 0.3 });
    this.tone({ freq: 2200, dur: 0.8, gain: 0.05, delay: 0.02, verb: 0.5 }); this.tone({ freq: 3300, dur: 0.6, gain: 0.03, delay: 0.02, verb: 0.5 });
  },
  armorClank(pan = 0) {
    [1830, 2690, 3950, 5210].forEach((f, i) => this.tone({ freq: f * (0.97 + Math.random() * 0.06), dur: 0.5 - i * 0.08, gain: 0.07, pan, verb: 0.2 }));
    this.noise({ dur: 0.08, freq: 5000, type: 'highpass', gain: 0.35, pan });
  },
  bladeBreak() { this.noise({ dur: 0.12, freq: 4200, type: 'highpass', gain: 0.4 }); [2100, 3300, 4700].forEach(f => this.tone({ freq: f, end: f * 0.8, dur: 0.3, gain: 0.05 })); },
  bladeDraw() { this.noise({ dur: 0.12, freq: 5200, q: 3, gain: 0.12, sweep: 1.6 }); this.tone({ freq: 2400, end: 3600, dur: 0.1, gain: 0.03, type: 'triangle' }); },
  bladeSwap() {
    this.noise({ dur: 0.04, freq: 3000, q: 4, gain: 0.3 }); this.noise({ dur: 0.04, freq: 2200, q: 4, gain: 0.3, delay: 0.16 });
    this.tone({ freq: 2950, dur: 0.45, gain: 0.05, delay: 0.3, verb: 0.3 }); this.tone({ freq: 4420, dur: 0.35, gain: 0.03, delay: 0.3 });
    this.noise({ dur: 0.2, freq: 5000, q: 1, gain: 0.1, delay: 0.28, sweep: 0.5 });
  },
  dry() { this.tone({ freq: 220, end: 180, dur: 0.12, gain: 0.08, type: 'square', filter: 900 }); },
  resupply() {
    [0, 4, 7, 12].forEach((s, i) => this.tone({ freq: mtof(74 + s), dur: 0.5, gain: 0.07, delay: i * 0.07, type: 'triangle', verb: 0.4 }));
    this.noise({ dur: 1.0, freq: 2500, type: 'highpass', gain: 0.15, attack: 0.1 });
  },
  // ---- titans ----
  titanStep(size, dist, pan) {
    const g = Math.min(1, size / 12) * Math.max(0, 1 - dist / 110);
    if (g < 0.02) return;
    this.tone({ freq: 70 - size, end: 32, dur: 0.35, gain: 0.5 * g, pan: pan * 0.6 });
    this.noise({ dur: 0.25, freq: 240, type: 'lowpass', gain: 0.4 * g, pan: pan * 0.6 });
  },
  titanGroan(size, dist, pan, abnormal) {
    if (!this.ctx) return;
    const g = Math.max(0, 1 - dist / 120) * 0.22; if (g < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 1.2 + Math.random() * 0.8;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const base = abnormal ? 160 : 95 - Math.min(40, size * 2);
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (abnormal ? 1.8 : 0.8), t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = abnormal ? 9 : 5; const vg = ctx.createGain(); vg.gain.value = base * 0.04; vib.connect(vg).connect(o.frequency); vib.start(t); vib.stop(t + dur);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = abnormal ? 900 : 520; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = abnormal ? 1500 : 850; f2.Q.value = 5;
    const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(g, t + 0.2); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const out = this.out(pan * 0.6);
    o.connect(f1).connect(gg); o.connect(f2).connect(gg); gg.connect(out);
    const vs = ctx.createGain(); vs.gain.value = 0.4; gg.connect(vs).connect(this.verbIn);
    o.start(t); o.stop(t + dur + 0.05);
  },
  windup(pan = 0) {
    this.tone({ freq: 70, end: 150, dur: 0.6, gain: 0.18, type: 'sawtooth', filter: 600, pan });
    this.tone({ freq: 880, end: 1320, dur: 0.12, gain: 0.05, type: 'triangle' });
    this.tone({ freq: 880, end: 1320, dur: 0.12, gain: 0.05, type: 'triangle', delay: 0.16 });
  },
  swipe(pan = 0) { this.noise({ dur: 0.45, freq: 700, q: 0.8, gain: 0.5, sweep: 0.3, attack: 0.08, pan }); },
  stomp() { this.tone({ freq: 60, end: 25, dur: 0.8, gain: 0.7 }); this.noise({ dur: 0.6, freq: 300, type: 'lowpass', gain: 0.6 }); },
  grabbed() { this.noise({ dur: 0.25, freq: 250, type: 'lowpass', gain: 0.6 }); this.tone({ freq: 140, end: 60, dur: 0.3, gain: 0.3 }); },
  crash(g = 1) { this.noise({ dur: 0.5, freq: 500, type: 'lowpass', gain: 0.5 * g }); this.noise({ dur: 0.3, freq: 1600, q: 0.8, gain: 0.25 * g, delay: 0.05 }); },
  collapse() { this.tone({ freq: 50, end: 22, dur: 1.4, gain: 0.7 }); this.noise({ dur: 1.5, freq: 260, type: 'lowpass', gain: 0.7, attack: 0.05 }); },
  steamBurst(g = 1) { this.noise({ dur: 1.6, freq: 2000, type: 'highpass', gain: 0.3 * g, attack: 0.05, verb: 0.2 }); this.noise({ dur: 0.8, freq: 500, type: 'lowpass', gain: 0.25 * g }); },
  thunder(g = 1) {
    if (!this.ctx) return;
    this.noise({ dur: 0.12, freq: 4200, q: 2.5, gain: 0.85 * g, attack: 0.001 });
    this.tone({ freq: 320, end: 40, dur: 0.3, gain: 0.7 * g, type: 'sawtooth' });
    this.tone({ freq: 95, end: 28, dur: 2.2, gain: 0.9 * g, type: 'sawtooth', filter: 320, delay: 0.04 });
    this.noise({ dur: 2.5, freq: 220, type: 'lowpass', gain: 0.8 * g, attack: 0.03, verb: 0.6, delay: 0.05 });
    this.steamBurst(1.8 * g);
  },
  // ---- shifters ----
  roar(size = 15) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 1.8, base = Math.max(55, 120 - size * 2);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.4); o.frequency.linearRampToValueAtTime(base * 0.8, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g); g.connect(this.sfx); const vs = ctx.createGain(); vs.gain.value = 0.6; g.connect(vs).connect(this.verbIn);
    o.start(t); o.stop(t + dur + 0.1);
    this.noise({ dur: 1.6, freq: 400, q: 0.6, gain: 0.35, attack: 0.1, verb: 0.4 });
  },
  scream(g = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 2.2;
    [0, 7, 12].forEach((k, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(76 + k), t); o.frequency.linearRampToValueAtTime(mtof(84 + k), t + 0.5); o.frequency.linearRampToValueAtTime(mtof(70 + k), t + dur);
      const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 18; vib.connect(vg).connect(o.frequency); vib.start(t); vib.stop(t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + i * 600; f.Q.value = 3;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.12 * g, t + 0.2); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(gg); gg.connect(this.sfx); const vs = ctx.createGain(); vs.gain.value = 0.7; gg.connect(vs).connect(this.verbIn);
      o.start(t); o.stop(t + dur + 0.05);
    });
  },
  siren() { for (let i = 0; i < 5; i++) { this.tone({ freq: 380, end: 760, dur: 0.5, gain: 0.12, type: 'sawtooth', filter: 1400, delay: i, verb: 0.3 }); this.tone({ freq: 760, end: 380, dur: 0.45, gain: 0.1, type: 'sawtooth', filter: 1400, delay: i + 0.5, verb: 0.3 }); } },
  // ---- guns (Interior Squad) ----
  gunshot(pan = 0, g = 1) { this.noise({ dur: 0.18, freq: 1400, q: 0.5, gain: 0.55 * g, attack: 0.001, pan, verb: 0.35 }); this.noise({ dur: 0.35, freq: 220, type: 'lowpass', gain: 0.45 * g, attack: 0.001, pan }); },
  reload() { this.noise({ dur: 0.06, freq: 3000, q: 4, gain: 0.15 }); this.noise({ dur: 0.07, freq: 2200, q: 4, gain: 0.15, delay: 0.25 }); this.tone({ freq: 900, dur: 0.04, gain: 0.05, delay: 0.45, type: 'square' }); },
  whiz(pan = 0) { this.noise({ dur: 0.16, freq: 3800, q: 6, gain: 0.25, sweep: 0.5, attack: 0.01, pan }); },
  deflect() { [3100, 4700, 6200].forEach((f, i) => this.tone({ freq: f, end: f * 0.85, dur: 0.35, gain: 0.07, delay: i * 0.01, verb: 0.3 })); this.noise({ dur: 0.08, freq: 5000, type: 'highpass', gain: 0.3 }); },
  bulletHit() { this.noise({ dur: 0.1, freq: 900, q: 1, gain: 0.4 }); this.tone({ freq: 200, end: 90, dur: 0.12, gain: 0.2 }); },
  hitTick(kill) { this.tone({ freq: kill ? 1500 : 2300, end: kill ? 900 : 2000, dur: kill ? 0.2 : 0.05, gain: kill ? 0.12 : 0.07, type: kill ? 'triangle' : 'square', filter: 3500 }); if (kill) this.noise({ dur: 0.12, freq: 3000, q: 2, gain: 0.12 }); },
  thwack(g = 1) { this.noise({ dur: 0.14, freq: 320, type: 'lowpass', gain: 0.6 * g }); this.tone({ freq: 140, end: 60, dur: 0.16, gain: 0.3 * g }); this.noise({ dur: 0.05, freq: 2400, q: 1, gain: 0.15 * g, delay: 0.01 }); },
  // ---- match ----
  killDing() { this.tone({ freq: 1320, dur: 0.12, gain: 0.08, type: 'triangle' }); this.tone({ freq: 1980, dur: 0.18, gain: 0.06, type: 'triangle', delay: 0.06, verb: 0.3 }); },
  announce(n = 1) { this.brass([62, 69, 74, 78].slice(0, 2 + Math.min(2, n)), 0.12, 0.09); },
  countdown(last) { this.tone({ freq: last ? 1320 : 880, dur: last ? 0.5 : 0.12, gain: 0.08, type: 'triangle', verb: 0.2 }); },
  // ---- player ----
  bones(g = 1) { this.noise({ dur: 0.22, freq: 180, type: 'lowpass', gain: 0.7 * g }); this.noise({ dur: 0.09, freq: 2600, q: 2, gain: 0.25 * g, delay: 0.02 }); this.noise({ dur: 0.06, freq: 1700, q: 3, gain: 0.2 * g, delay: 0.07 }); this.tone({ freq: 120, end: 50, dur: 0.25, gain: 0.35 * g }); },
  fuel() { this.noise({ dur: 0.7, freq: 3200, type: 'highpass', gain: 0.18, attack: 0.02 }); [0, 5, 9].forEach((s, i) => this.tone({ freq: mtof(79 + s), dur: 0.3, gain: 0.06, delay: i * 0.05, type: 'triangle', verb: 0.3 })); },
  napeTick(k = 0) { this.tone({ freq: 900 + k * 900, end: 700 + k * 900, dur: 0.035, gain: 0.025 + k * 0.035, type: 'triangle' }); },
  napeReady() { this.tone({ freq: 1760, end: 2350, dur: 0.12, gain: 0.08, type: 'triangle', verb: 0.25 }); this.tone({ freq: 2640, dur: 0.18, gain: 0.04, type: 'sine', delay: 0.05, verb: 0.3 }); },
  hurt() { this.noise({ dur: 0.2, freq: 400, type: 'lowpass', gain: 0.6 }); this.tone({ freq: 180, end: 90, dur: 0.25, gain: 0.25, type: 'triangle' }); },
  // ---- horse sounds ----
  hoofstep(vol = 0.4) {
    if (!this.ctx) return;
    this.noise({ dur: 0.05, freq: 580, type: 'bandpass', q: 3.5, gain: 0.3 * vol, attack: 0.002 });
    this.tone({ freq: 110, end: 55, dur: 0.06, gain: 0.25 * vol, type: 'triangle' });
  },
  whinny() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.5);
    const vib = ctx.createOscillator(); vib.frequency.value = 16;
    const vg = ctx.createGain(); vg.gain.value = 45;
    vib.connect(vg).connect(o.frequency);
    vib.start(t); vib.stop(t + 0.55);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 0.55);
  },
  whistle() {
    // Sound removed as requested - silent steed whistle
  },
  // ---- mission / ui ----
  ring() { [0, 7, 12].forEach((s, i) => this.tone({ freq: mtof(81 + s), dur: 0.4, gain: 0.08, delay: i * 0.05, verb: 0.4 })); },
  rescue() { this.tone({ freq: 700, end: 2600, dur: 0.6, gain: 0.08, type: 'triangle' }); [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ freq: mtof(72 + s), dur: 0.5, gain: 0.07, delay: 0.3 + i * 0.07, verb: 0.5 })); },
  ui() { this.tone({ freq: 1200, end: 900, dur: 0.06, gain: 0.06, type: 'triangle' }); },
  combo(n) { this.tone({ freq: mtof(72 + Math.min(n, 12) * 2), dur: 0.25, gain: 0.07, type: 'triangle', verb: 0.3 }); },
  brass(notes, step = 0.22, gain = 0.09) {
    if (!this.ctx) return;
    notes.forEach((m, i) => {
      const t = this.ctx.currentTime + i * step, ctx = this.ctx, dur = i === notes.length - 1 ? 1.4 : step * 1.2;
      [0, 7].forEach((dt) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m) * (1 + dt * 0.0006);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2600, t + 0.08); f.frequency.linearRampToValueAtTime(1300, t + dur);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.05); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g); g.connect(this.sfx); const vs = ctx.createGain(); vs.gain.value = 0.5; g.connect(vs).connect(this.verbIn);
        o.start(t); o.stop(t + dur + 0.05);
      });
    });
  },
  horn() { this.brass([62, 69, 74], 0.36, 0.1); },
  fanfare() { this.brass([62, 66, 69, 74, 78, 81], 0.14, 0.08); },
  failSting() { this.brass([62, 61, 58, 50], 0.35, 0.08); },
  death() {
    if (!this.ctx) return;
    this.tone({ freq: 220, end: 55, dur: 1.6, gain: 0.25, type: 'sawtooth', filter: 800, verb: 0.5 });
  },
  // ---- continuous state ----
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.04 + Math.min(0.08, s.alt * 0.002), t, 0.5);
    const sp = Math.min(1, Math.max(0, (s.speed - 8) / 40));
    this.speedGain.gain.setTargetAtTime(sp * sp * 0.42, t, 0.08);
    this.speedF.frequency.setTargetAtTime(400 + sp * 1400, t, 0.1);
    this.gasGain.gain.setTargetAtTime(s.boost ? 0.16 : 0, t, s.boost ? 0.02 : 0.08);
    this.reelGain.gain.setTargetAtTime(s.reel > 0 ? 0.035 + s.reel * 0.07 : 0, t, 0.05);
    this.reelOsc.frequency.setTargetAtTime(110 + s.reel * 260, t, 0.05);
    this.steamGain.gain.setTargetAtTime(Math.min(0.12, s.steam * 0.05), t, 0.3);
    this.lp.frequency.setTargetAtTime(s.muffle ? 900 : 20000, t, 0.1);
    Music.update(dt);
  }
};

/* =========================================================================
   Adaptive score. 8-bar D-minor progression at 120 bpm; layers fade in as
   intensity rises: strings pad → bass → ostinato → drums → brass theme → choir.
   ========================================================================= */
const CHORDS = [
  { root: 38, tones: [50, 57, 62, 65] }, // Dm
  { root: 34, tones: [46, 53, 58, 62] }, // Bb
  { root: 41, tones: [53, 57, 60, 65] }, // F
  { root: 36, tones: [48, 55, 60, 64] }, // C
  { root: 38, tones: [50, 57, 62, 65] }, // Dm
  { root: 34, tones: [46, 53, 58, 62] }, // Bb
  { root: 43, tones: [55, 58, 62, 67] }, // Gm
  { root: 45, tones: [57, 61, 64, 69] }  // A
];
// heroic theme: [bar, beat, lengthBeats, midi]
const THEME = [
  [0, 0, 1, 69], [0, 1, 1.5, 74], [0, 2.5, 0.5, 76], [0, 3, 1, 77],
  [1, 0, 1.5, 77], [1, 1.5, 0.5, 76], [1, 2, 1, 74], [1, 3, 1, 72],
  [2, 0, 2, 72], [2, 2, 1, 77], [2, 3, 1, 81],
  [3, 0, 3, 79], [3, 3, 1, 76],
  [4, 0, 1, 77], [4, 1, 0.5, 76], [4, 1.5, 0.5, 74], [4, 2, 2, 81],
  [5, 0, 1.5, 82], [5, 1.5, 0.5, 81], [5, 2, 1, 79], [5, 3, 1, 77],
  [6, 0, 1, 79], [6, 1, 0.5, 77], [6, 1.5, 0.5, 76], [6, 2, 1, 74], [6, 3, 1, 70],
  [7, 0, 2, 73], [7, 2, 1, 76], [7, 3, 1, 69]
];
const OSTINATO = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 3, 1];
const savedMusic = (() => { try { const v = localStorage.getItem('ts_music'); return v === null ? 0.6 : +v; } catch (e) { return 0.6; } })();
export const Music = {
  ctx: null, on: false, intensity: 0, target: 0.15, step: 0, nextTime: 0, bpm: 120, vol: savedMusic,
  init(ctx, dest, verb) {
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    // music volume (player setting) sits after the mix bus, so it scales the dry signal and the reverb send together
    this.volNode = ctx.createGain(); this.volNode.gain.value = this.vol;
    this.bus.connect(this.volNode); this.volNode.connect(dest);
    const vs = ctx.createGain(); vs.gain.value = 0.9; this.volNode.connect(vs).connect(verb);
    this.layers = {};
    ['pad', 'bass', 'ost', 'drum', 'brass', 'choir'].forEach(k => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus); this.layers[k] = g; });
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900; this.padFilter.connect(this.layers.pad);
    this.timer = setInterval(() => this.schedule(), 40);
  },
  start() { if (!this.ctx) return; this.on = true; this.bus.gain.setTargetAtTime(0.55, this.ctx.currentTime, 1.2); if (this.nextTime < this.ctx.currentTime) { this.nextTime = this.ctx.currentTime + 0.1; this.step = 0; } },
  stop() { if (!this.ctx) return; this.on = false; this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8); },
  setVolume(v) {
    this.vol = Math.max(0, Math.min(1.2, v));
    try { localStorage.setItem('ts_music', String(this.vol)); } catch (e) { /* ignore */ }
    if (this.volNode) this.volNode.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.05);
  },
  update(dt) {
    if (!this.ctx) return;
    const k = 1 - Math.exp(-dt * (this.target > this.intensity ? 1.5 : 0.35));
    this.intensity += (this.target - this.intensity) * k;
    const t = this.ctx.currentTime, I = this.intensity;
    const lv = (th, max) => Math.max(0, Math.min(1, (I - th) / 0.15)) * max;
    this.layers.pad.gain.setTargetAtTime(0.5 + I * 0.3, t, 0.3);
    this.layers.bass.gain.setTargetAtTime(lv(0.2, 0.55), t, 0.3);
    this.layers.ost.gain.setTargetAtTime(lv(0.32, 0.4), t, 0.3);
    this.layers.drum.gain.setTargetAtTime(lv(0.48, 0.9), t, 0.3);
    this.layers.brass.gain.setTargetAtTime(lv(0.62, 0.5), t, 0.3);
    this.layers.choir.gain.setTargetAtTime(lv(0.82, 0.35), t, 0.3);
    this.padFilter.frequency.setTargetAtTime(700 + I * 2600, t, 0.4);
  },
  schedule() {
    if (!this.ctx || !this.on) return;
    const spb = 60 / this.bpm, s16 = spb / 4;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, s16);
      this.nextTime += s16; this.step++;
    }
  },
  osc(type, freq, t, dur, gain, dest, { attack = 0.01, release = 0.1, detune = 0, filter = 0, fq = 1, fenv = 0 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (filter) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = fq;
      if (fenv) { f.frequency.setValueAtTime(filter * 0.4, t); f.frequency.linearRampToValueAtTime(filter * fenv, t + attack + 0.04); f.frequency.linearRampToValueAtTime(filter, t + dur); } else f.frequency.value = filter;
      o.connect(f); n = f;
    }
    n.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  },
  drum(t, kind, gain) {
    const ctx = this.ctx, dest = this.layers.drum;
    if (kind === 'taiko' || kind === 'low') {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(kind === 'low' ? 70 : 110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.6);
      const s = ctx.createBufferSource(); s.buffer = Sfx.white; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(gain * 0.5, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.connect(f).connect(g2).connect(dest); s.start(t, Math.random()); s.stop(t + 0.15);
    } else if (kind === 'snare') {
      const s = ctx.createBufferSource(); s.buffer = Sfx.white; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + 0.16);
    } else if (kind === 'cym') {
      const s = ctx.createBufferSource(); s.buffer = Sfx.white; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
      s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + 2.2);
    }
  },
  playStep(step, t, s16) {
    const bar = Math.floor(step / 16) % 8, st = step % 16, ch = CHORDS[bar], I = this.intensity;
    const barDur = s16 * 16;
    // strings pad: whole-bar chords
    if (st === 0) {
      ch.tones.forEach((m, i) => {
        this.osc('sawtooth', mtof(m), t, barDur + 0.25, 0.028, this.padFilter, { attack: 0.35, release: 0.4, detune: -7 });
        this.osc('sawtooth', mtof(m), t, barDur + 0.25, 0.028, this.padFilter, { attack: 0.35, release: 0.4, detune: 7 });
        if (i === 0) this.osc('triangle', mtof(m + 12), t, barDur, 0.03, this.padFilter, { attack: 0.5, release: 0.4 });
      });
      // choir "aah" an octave up
      if (I > 0.75) ch.tones.slice(1).forEach(m => {
        const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12);
        const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain(); vg.gain.value = 3; vib.connect(vg).connect(o.detune); vib.start(t); vib.stop(t + barDur + 0.3);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 780; f1.Q.value = 6;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 7;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.6); g.gain.setValueAtTime(0.09, t + barDur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + barDur + 0.25);
        o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(this.layers.choir); o.start(t); o.stop(t + barDur + 0.3);
      });
      if (bar === 7 && I > 0.5) this.drum(t, 'cym', 0.08);
    }
    // bass: driving eighths when intense, half notes when calm
    if (I > 0.18) {
      const eighth = I > 0.55;
      if ((eighth && st % 2 === 0) || (!eighth && (st === 0 || st === 8))) {
        const len = eighth ? s16 * 1.8 : s16 * 7.5;
        const m = ch.root + ((eighth && st % 8 === 6) ? 12 : 0);
        this.osc('sawtooth', mtof(m), t, len, 0.12, this.layers.bass, { attack: 0.01, release: 0.06, filter: 380, fq: 2 });
        this.osc('sine', mtof(m), t, len, 0.14, this.layers.bass, { attack: 0.01, release: 0.06 });
      }
    }
    // staccato string ostinato
    if (I > 0.3) {
      const m = ch.tones[OSTINATO[st]] + 12;
      this.osc('sawtooth', mtof(m), t, s16 * 0.9, 0.045, this.layers.ost, { attack: 0.005, release: 0.05, filter: 1800, fq: 1, fenv: 2 });
    }
    // percussion
    if (I > 0.45) {
      if (st === 0) this.drum(t, 'low', 0.7);
      if (st === 8) this.drum(t, 'taiko', 0.5);
      if (st === 10 && I > 0.7) this.drum(t, 'taiko', 0.35);
      if ((st === 4 || st === 12)) this.drum(t, 'snare', 0.12 + I * 0.1);
      if (bar % 2 === 1 && st >= 12 && I > 0.65) this.drum(t, 'snare', 0.08 + (st - 12) * 0.04);
    }
    // brass theme + stabs
    if (I > 0.6) {
      for (const n of THEME) if (n[0] === bar && Math.round(n[1] * 4) === st) {
        const dur = n[2] * s16 * 4;
        this.osc('sawtooth', mtof(n[3] - 12), t, dur, 0.06, this.layers.brass, { attack: 0.05, release: 0.12, filter: 1500, fq: 1.5, fenv: 1.8, detune: -5 });
        this.osc('sawtooth', mtof(n[3] - 12), t, dur, 0.06, this.layers.brass, { attack: 0.05, release: 0.12, filter: 1500, fq: 1.5, fenv: 1.8, detune: 6 });
        this.osc('square', mtof(n[3] - 24), t, dur, 0.025, this.layers.brass, { attack: 0.06, release: 0.12, filter: 900 });
      }
      if (st === 0 && I > 0.85) ch.tones.forEach(m => this.osc('sawtooth', mtof(m), t, s16 * 3, 0.03, this.layers.brass, { attack: 0.02, release: 0.1, filter: 2000, fenv: 1.5 }));
    }
  }
};
