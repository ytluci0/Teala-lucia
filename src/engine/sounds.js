// Short, locally synthesized UI cues. No audio files, network calls, or animation loop.
const STORAGE_KEY = 'lucia.sound-effects';
const LEVEL = .24;
const CUES = {
  open: [
    { from: 320, to: 640, duration: .17, level: .10 },
    { from: 784, to: 1046, duration: .23, level: .065, delay: .025 },
    { from: 1318, to: 1568, duration: .16, level: .025, delay: .06 },
  ],
  close: [
    { from: 620, to: 280, duration: .15, level: .095 },
    { from: 1046, to: 523, duration: .12, level: .035, delay: .015 },
  ],
  move: [{ from: 740, to: 470, duration: .055, level: .10 }],
  tap: [{ from: 880, to: 680, duration: .065, level: .085 }],
  confirm: [
    { from: 523, to: 659, duration: .12, level: .075 },
    { from: 784, to: 1046, duration: .17, level: .06, delay: .045 },
  ],
};

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export default class LuciaSounds {
  constructor({
    createContext = () => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context({ latencyHint: 'interactive' }) : null;
    },
    storage = browserStorage(),
    isHidden = () => !!globalThis.document?.hidden,
    now = () => performance.now(),
    onChange = () => {},
  } = {}) {
    this.createContext = createContext;
    this.storage = storage;
    this.isHidden = isHidden;
    this.now = now;
    this.onChange = onChange;
    this.enabled = true;
    try { this.enabled = storage?.getItem(STORAGE_KEY) !== 'off'; } catch { /* Private browsing may block storage. */ }
    this.context = null;
    this.master = null;
    this.resuming = null;
    this.suspending = null;
    this.pending = null;
    this.disposed = false;
    this.available = true;
    this.voices = new Set();
    this.lastCueAt = new Map();
    this.lastPlayedAt = -Infinity;
    this.played = 0;
    this.lastCue = null;
  }

  get status() {
    if (!this.available) return 'unavailable';
    if (!this.enabled) return 'muted';
    return this.context?.state || 'waiting-for-interaction';
  }

  // Call synchronously from a pointer/key/click gesture, never from the render loop.
  unlock() {
    if (this.disposed || !this.enabled || !this.available || this.isHidden()) return Promise.resolve(false);
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) { this.available = false; this.onChange(); return Promise.resolve(false); }
        this.master = this.context.createGain();
        this.master.gain.value = LEVEL;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'running' && !this.suspending) return Promise.resolve(true);
      if (this.resuming && !this.suspending) return this.resuming;
      const operation = this.context.resume().then(() => {
        if (this.resuming !== operation) return false;
        this.resuming = null;
        if (this.disposed || !this.enabled || this.isHidden()) {
          this.pending = null;
          if (!this.disposed) this.suspend();
          return false;
        }
        const pending = this.pending;
        this.pending = null;
        if (pending && this.now() - pending.at < 220) this.play(pending.cue, pending.direction);
        this.onChange();
        return this.context.state === 'running';
      }).catch(() => { if(this.resuming === operation){this.resuming = null;this.pending = null;}return false; });
      this.resuming = operation;
      return operation;
    } catch {
      this.available = false;
      this.onChange();
      return Promise.resolve(false);
    }
  }

  play(cue, direction = 0) {
    const notes = CUES[cue];
    if (!notes || this.disposed || !this.enabled || !this.available || this.isHidden() || !this.context) return false;
    const now = this.now();
    if (this.context.state !== 'running') {
      // Keep only the latest gesture while audio unlocks; never replay a backlog.
      if (this.resuming) this.pending = { cue, direction, at: now };
      return false;
    }
    const cooldown = cue === 'move' ? 95 : 65;
    if (now - (this.lastCueAt.get(cue) ?? -Infinity) < cooldown || now - this.lastPlayedAt < 20 || this.voices.size >= 4) return false;
    const context = this.context, at = context.currentTime;
    const voice = { nodes: [], sources: [], remaining: notes.length, cleaned: false };
    const cleanup = () => {
      if (voice.cleaned) return;
      voice.cleaned = true;
      voice.nodes.forEach(node => { try { node.disconnect(); } catch { /* Already released. */ } });
      this.voices.delete(voice);
    };
    voice.stop = () => {
      voice.sources.forEach(source => { try { source.stop(); } catch { /* Already stopped. */ } });
      cleanup();
    };
    this.voices.add(voice);
    try {
      let output = this.master;
      if (direction && context.createStereoPanner) {
        output = context.createStereoPanner();
        output.pan.value = Math.sign(direction) * .18;
        output.connect(this.master);
        voice.nodes.push(output);
      }
      for (const note of notes) {
        const oscillator = context.createOscillator(), envelope = context.createGain();
        const start = at + (note.delay || 0), end = start + note.duration;
        voice.sources.push(oscillator);
        voice.nodes.push(oscillator, envelope);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.from, start);
        oscillator.frequency.exponentialRampToValueAtTime(note.to, end);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(note.level, start + .008);
        envelope.gain.exponentialRampToValueAtTime(.0001, end - .008);
        envelope.gain.linearRampToValueAtTime(0, end);
        oscillator.connect(envelope);
        envelope.connect(output);
        oscillator.onended = () => { if (--voice.remaining === 0) cleanup(); };
        oscillator.start(start);
        oscillator.stop(end + .005);
      }
      this.lastCueAt.set(cue, now);
      this.lastPlayedAt = now;
      this.lastCue = cue;
      this.played++;
      this.onChange();
      return true;
    } catch {
      voice.stop();
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    try { this.storage?.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch { /* Preference still works for this visit. */ }
    this.pending = null;
    if (!this.enabled) this.suspend();
    this.onChange();
  }

  suspend() {
    this.pending = null;
    for (const voice of [...this.voices]) voice.stop();
    if (this.context && this.context.state !== 'closed') {
      const operation = this.context.suspend();
      this.suspending = operation;
      operation.catch(() => {}).finally(() => {
        if (this.suspending === operation) this.suspending = null;
        this.onChange();
      });
    }
  }

  destroy() {
    this.disposed = true;
    this.pending = null;
    for (const voice of [...this.voices]) voice.stop();
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.onChange = () => {};
  }
}
