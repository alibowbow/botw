'use strict';
/* audio.js — procedural sound effects and gentle ambient music via WebAudio.
   Nothing is loaded from the network. All sounds are synthesized. */

class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicOn = true;
    this.started = false;
    this._noiseBuf = null;
    this._musicTimer = 0;
    this._step = 0;
  }

  // Must be called from within a user gesture (browsers block otherwise).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.master);
    // pre-build a noise buffer
    const n = 2 * this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    this.started = true;
    if (this.musicOn) this.musicGain.gain.linearRampToValueAtTime(0.32, this.ctx.currentTime + 3);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicGain) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(this.musicOn ? 0.32 : 0.0, t + 1.2);
    }
    return this.musicOn;
  }

  _osc(type, freq, t0, dur, gainPeak, dest, detune) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return { o, g };
  }

  _noise(t0, dur, gainPeak, filterType, freq, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(freq || 1200, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
    return { src, f, g };
  }

  play(name) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    switch (name) {
      case 'swing': {
        this._noise(t, 0.16, 0.25, 'bandpass', 1700, this.sfxGain);
        const s = this._noise(t, 0.16, 0.2, 'highpass', 900, this.sfxGain);
        s.f.frequency.exponentialRampToValueAtTime(400, t + 0.16);
        break;
      }
      case 'hit': {
        this._noise(t, 0.12, 0.4, 'bandpass', 500, this.sfxGain);
        this._osc('square', 160, t, 0.1, 0.18);
        break;
      }
      case 'hurt': {
        const s = this._osc('sawtooth', 320, t, 0.28, 0.28);
        s.o.frequency.exponentialRampToValueAtTime(90, t + 0.28);
        break;
      }
      case 'enemyDie': {
        const s = this._osc('square', 300, t, 0.3, 0.22);
        s.o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
        this._noise(t, 0.3, 0.2, 'lowpass', 800, this.sfxGain);
        break;
      }
      case 'pickup': {
        this._osc('triangle', 660, t, 0.09, 0.25);
        this._osc('triangle', 990, t + 0.06, 0.1, 0.22);
        break;
      }
      case 'rupee': {
        this._osc('sine', 1050, t, 0.08, 0.2);
        this._osc('sine', 1400, t + 0.05, 0.1, 0.18);
        break;
      }
      case 'heart': {
        this._osc('triangle', 520, t, 0.1, 0.24);
        this._osc('triangle', 780, t + 0.08, 0.12, 0.22);
        this._osc('triangle', 1040, t + 0.16, 0.14, 0.2);
        break;
      }
      case 'korok': {
        const notes = [880, 1174, 1318, 1760];
        notes.forEach((f, i) => this._osc('sine', f, t + i * 0.09, 0.16, 0.22));
        break;
      }
      case 'bow': {
        const s = this._osc('triangle', 220, t, 0.12, 0.2);
        s.o.frequency.exponentialRampToValueAtTime(520, t + 0.12);
        this._noise(t, 0.08, 0.12, 'highpass', 2000, this.sfxGain);
        break;
      }
      case 'bomb': {
        this._osc('sine', 440, t, 0.06, 0.16);
        break;
      }
      case 'explode': {
        const s = this._noise(t, 0.5, 0.6, 'lowpass', 900, this.sfxGain);
        s.f.frequency.exponentialRampToValueAtTime(120, t + 0.5);
        const o = this._osc('sine', 90, t, 0.4, 0.4);
        o.o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
        break;
      }
      case 'menu': { this._osc('square', 440, t, 0.05, 0.14); break; }
      case 'select': { this._osc('square', 660, t, 0.07, 0.16); break; }
      case 'activate': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this._osc('sine', f, t + i * 0.12, 0.4, 0.2, this.sfxGain));
        break;
      }
      case 'break': {
        this._noise(t, 0.2, 0.35, 'highpass', 1500, this.sfxGain);
        break;
      }
      case 'climb': {
        this._noise(t, 0.07, 0.12, 'bandpass', 700, this.sfxGain);
        break;
      }
      case 'splash': {
        this._noise(t, 0.25, 0.3, 'lowpass', 1400, this.sfxGain);
        break;
      }
      case 'glide': {
        const s = this._osc('sine', 300, t, 0.5, 0.1);
        s.o.frequency.linearRampToValueAtTime(360, t + 0.5);
        break;
      }
    }
  }

  // Ambient, sparse exploration melody (pentatonic) — called each frame with dt.
  updateMusic(dt, nightAmt) {
    if (!this.started || !this.musicOn) return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = 2.1; // seconds between phrases
    const ctx = this.ctx, t = ctx.currentTime;
    // Pentatonic scale (A minor pentatonic-ish), lower & sparser at night.
    const scale = nightAmt > 0.5
      ? [220, 261.63, 293.66, 349.23, 392]
      : [329.63, 392, 440, 523.25, 587.33];
    this._step = (this._step + 1) % 8;
    const rootIdx = (this._step * 3) % scale.length;
    const f = scale[rootIdx];
    // soft plucked note
    const o = this._osc('triangle', f, t, 1.6, 0.16, this.musicGain);
    o.g.gain.cancelScheduledValues(t);
    o.g.gain.setValueAtTime(0.0001, t);
    o.g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    o.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    // occasional harmony a fifth up
    if (this._step % 2 === 0) {
      this._osc('sine', f * 1.5, t + 0.25, 1.2, 0.08, this.musicGain);
    }
    // low pad
    if (this._step % 4 === 0) {
      this._osc('sine', f / 2, t, 2.0, 0.1, this.musicGain);
    }
  }
}
