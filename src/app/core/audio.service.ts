import { Injectable, signal } from '@angular/core';
import type { WeaponType } from '../../../shared/game-types';

export type SoundName =
  | 'shot'
  | 'shot-heavy'
  | 'shot-energy'
  | 'shot-flame'
  | 'shot-frost'
  | 'shot-rocket'
  | 'shot-tesla'
  | 'explosion'
  | 'hit'
  | 'zombie-death'
  | 'boss-roar'
  | 'reload'
  | 'ui'
  | 'build'
  | 'wave'
  | 'hurt'
  | 'deflect'
  | 'heal'
  | 'engine'
  | 'gameover'
  | 'victory';

export type MusicTrack = 'none' | 'build' | 'combat' | 'boss';

const WEAPON_SOUND: Record<WeaponType, SoundName> = {
  pistol: 'shot',
  smg: 'shot',
  rifle: 'shot',
  shotgun: 'shot-heavy',
  nailgun: 'shot-heavy',
  magnum: 'shot-heavy',
  sniper: 'shot-heavy',
  acid: 'shot-flame',
  lmg: 'shot-heavy',
  elephant: 'shot-heavy',
  flamer: 'shot-flame',
  cryo: 'shot-frost',
  rocket: 'shot-rocket',
  firerocket: 'shot-rocket',
  tesla: 'shot-tesla',
  laser: 'shot-energy',
  railgun: 'shot-energy',
  gravity: 'shot-tesla',
  nova: 'shot-energy',
};

/** Minor scale steps used by the generated soundtrack. */
const SCALE = [0, 3, 5, 7, 10, 12, 15];

@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly enabled = signal(this.readFlag('zombie-defense-audio', true));
  readonly musicEnabled = signal(this.readFlag('zombie-defense-music', true));
  readonly volume = signal(this.readNumber('zombie-defense-volume', 0.7));

  private context?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private track: MusicTrack = 'none';
  private musicTimer?: number;
  private nextBeatTime = 0;
  private beat = 0;
  private budget = 0;
  private budgetStamp = 0;

  toggleSound() {
    this.enabled.update((value) => !value);
    localStorage.setItem('zombie-defense-audio', this.enabled() ? '1' : '0');
    if (!this.enabled()) this.stopMusic();
    else if (this.musicEnabled()) this.setTrack(this.track, true);
  }

  toggleMusic() {
    this.musicEnabled.update((value) => !value);
    localStorage.setItem('zombie-defense-music', this.musicEnabled() ? '1' : '0');
    if (!this.musicEnabled()) this.stopMusic();
    else this.setTrack(this.track, true);
  }

  setVolume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    this.volume.set(clamped);
    localStorage.setItem('zombie-defense-volume', String(clamped));
    if (this.master) this.master.gain.value = clamped;
  }

  /** Must be called from a user gesture before any sound can play. */
  unlock() {
    if (!this.enabled()) return;
    const context = this.ensureContext();
    if (context && context.state === 'suspended') void context.resume();
  }

  play(name: SoundName, volume = 1) {
    if (!this.enabled()) return;
    const context = this.ensureContext();
    if (!context || context.state !== 'running') return;
    if (!this.spend()) return;
    const at = context.currentTime;
    switch (name) {
      case 'shot':
        this.burst(at, 0.07, 1800, 0.45 * volume, 'highpass');
        this.tone(at, 'square', 220, 90, 0.09, 0.16 * volume);
        break;
      case 'shot-heavy':
        this.burst(at, 0.16, 900, 0.6 * volume, 'lowpass');
        this.tone(at, 'sawtooth', 150, 48, 0.18, 0.28 * volume);
        break;
      case 'shot-energy':
        this.tone(at, 'sawtooth', 1400, 420, 0.11, 0.16 * volume, 'bandpass', 2200);
        break;
      case 'shot-flame':
        this.burst(at, 0.2, 620, 0.22 * volume, 'lowpass');
        break;
      // A hiss that falls away, so frost sounds nothing like fire.
      case 'shot-frost':
        this.burst(at, 0.18, 2400, 0.24 * volume, 'highpass');
        this.tone(at, 'sine', 1200, 480, 0.14, 0.1 * volume, 'bandpass', 1800);
        break;
      case 'shot-rocket':
        this.burst(at, 0.32, 700, 0.5 * volume, 'lowpass');
        this.tone(at, 'sawtooth', 320, 110, 0.3, 0.2 * volume);
        break;
      case 'shot-tesla':
        this.burst(at, 0.14, 3200, 0.34 * volume, 'highpass');
        this.tone(at, 'square', 900, 1700, 0.12, 0.12 * volume);
        break;
      case 'explosion':
        this.burst(at, 0.75, 420, 0.85 * volume, 'lowpass');
        this.tone(at, 'sine', 120, 34, 0.6, 0.5 * volume);
        this.tone(at + 0.02, 'triangle', 90, 28, 0.75, 0.3 * volume);
        break;
      case 'hit':
        this.burst(at, 0.05, 2600, 0.16 * volume, 'bandpass');
        break;
      case 'zombie-death':
        this.tone(at, 'sawtooth', 190, 60, 0.32, 0.16 * volume, 'lowpass', 900);
        this.burst(at, 0.12, 700, 0.16 * volume, 'lowpass');
        break;
      case 'boss-roar':
        this.tone(at, 'sawtooth', 90, 55, 1.5, 0.55 * volume, 'lowpass', 700);
        this.tone(at + 0.05, 'square', 130, 70, 1.2, 0.3 * volume, 'lowpass', 500);
        this.burst(at, 1.1, 380, 0.4 * volume, 'lowpass');
        break;
      case 'reload':
        this.burst(at, 0.05, 2400, 0.2 * volume, 'bandpass');
        this.burst(at + 0.16, 0.06, 1500, 0.22 * volume, 'bandpass');
        break;
      case 'ui':
        this.tone(at, 'triangle', 620, 880, 0.08, 0.13 * volume);
        break;
      case 'build':
        this.tone(at, 'square', 320, 420, 0.12, 0.16 * volume);
        this.burst(at, 0.1, 1200, 0.18 * volume, 'lowpass');
        break;
      case 'wave':
        this.tone(at, 'sawtooth', 110, 220, 0.9, 0.32 * volume, 'lowpass', 1200);
        this.tone(at + 0.25, 'sawtooth', 165, 330, 0.7, 0.24 * volume, 'lowpass', 1400);
        break;
      case 'hurt':
        this.tone(at, 'sine', 320, 90, 0.24, 0.3 * volume);
        this.burst(at, 0.1, 500, 0.24 * volume, 'lowpass');
        break;
      // Hit while dashing: a bright metallic swipe instead of the dull thud,
      // so a dodge is audible even with the eyes somewhere else.
      case 'deflect':
        this.tone(at, 'triangle', 1500, 2400, 0.09, 0.16 * volume, 'bandpass', 2600);
        this.burst(at, 0.09, 4200, 0.2 * volume, 'highpass');
        break;
      case 'heal':
        this.tone(at, 'sine', 420, 880, 0.34, 0.24 * volume);
        break;
      // A short rev, so getting in is audible without a sample.
      case 'engine':
        this.tone(at, 'sawtooth', 90, 150, 0.32, 0.22 * volume, 'lowpass', 600);
        this.burst(at, 0.22, 420, 0.2 * volume, 'lowpass');
        break;
      case 'gameover':
        this.tone(at, 'sawtooth', 220, 55, 1.8, 0.4 * volume, 'lowpass', 800);
        break;
      case 'victory':
        [0, 4, 7, 12].forEach((step, index) => {
          this.tone(
            at + index * 0.16,
            'triangle',
            330 * Math.pow(2, step / 12),
            330 * Math.pow(2, step / 12),
            0.4,
            0.26 * volume,
          );
        });
        break;
    }
  }

  weaponSound(weapon: WeaponType) {
    return WEAPON_SOUND[weapon];
  }

  setTrack(track: MusicTrack, force = false) {
    if (this.track === track && !force) return;
    this.track = track;
    this.stopMusic();
    if (track === 'none' || !this.enabled() || !this.musicEnabled()) return;
    const context = this.ensureContext();
    if (!context) return;
    this.beat = 0;
    this.nextBeatTime = context.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic() {
    if (this.musicTimer !== undefined) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  // ------------------------------------------------------------------ engine

  private ensureContext() {
    if (this.context) return this.context;
    if (typeof window === 'undefined') return undefined;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    const context = new Ctor();
    const master = context.createGain();
    master.gain.value = this.volume();
    master.connect(context.destination);
    const music = context.createGain();
    music.gain.value = 0.32;
    music.connect(master);
    const sfx = context.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);

    const length = Math.floor(context.sampleRate * 1.2);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;

    this.context = context;
    this.master = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    this.noiseBuffer = buffer;
    return context;
  }

  /** Keeps machine-gun fire from stacking hundreds of voices. */
  private spend() {
    const now = performance.now();
    if (now - this.budgetStamp > 100) {
      this.budgetStamp = now;
      this.budget = 8;
    }
    if (this.budget <= 0) return false;
    this.budget -= 1;
    return true;
  }

  private burst(
    at: number,
    duration: number,
    frequency: number,
    gain: number,
    filter: BiquadFilterType,
  ) {
    const context = this.context;
    if (!context || !this.noiseBuffer || !this.sfxGain) return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const biquad = context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.value = frequency;
    biquad.Q.value = 0.9;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(biquad).connect(envelope).connect(this.sfxGain);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  private tone(
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
    filter?: BiquadFilterType,
    cutoff = 1200,
  ) {
    const context = this.context;
    if (!context || !this.sfxGain) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, from), at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    if (filter) {
      const biquad = context.createBiquadFilter();
      biquad.type = filter;
      biquad.frequency.value = cutoff;
      oscillator.connect(biquad).connect(envelope).connect(this.sfxGain);
    } else {
      oscillator.connect(envelope).connect(this.sfxGain);
    }
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  private scheduleMusic() {
    const context = this.context;
    if (!context || !this.musicGain) return;
    if (context.state !== 'running') {
      // Nothing may be queued while the context is suspended, otherwise every
      // missed beat fires at once as soon as the browser unlocks audio.
      this.nextBeatTime = context.currentTime + 0.08;
      return;
    }
    const tempo = this.track === 'boss' ? 148 : this.track === 'combat' ? 116 : 74;
    const beatLength = 60 / tempo;
    while (this.nextBeatTime < context.currentTime + 0.35) {
      this.playBeat(this.nextBeatTime, this.beat);
      this.beat = (this.beat + 1) % 16;
      this.nextBeatTime += beatLength;
    }
  }

  private playBeat(at: number, beat: number) {
    const context = this.context;
    const output = this.musicGain;
    if (!context || !output) return;
    const root = this.track === 'boss' ? 55 : this.track === 'combat' ? 65.4 : 49;

    // bass drone on every bar
    if (beat % 8 === 0) {
      this.musicVoice(
        at,
        'sawtooth',
        root,
        root * 0.99,
        this.track === 'build' ? 3.4 : 2,
        0.16,
        260,
      );
    }
    if (this.track === 'build') {
      if (beat % 4 === 0) {
        const step = SCALE[(beat / 4) % SCALE.length];
        this.musicVoice(
          at,
          'triangle',
          root * 4 * Math.pow(2, step / 12),
          root * 4 * Math.pow(2, step / 12),
          1.6,
          0.07,
          1800,
        );
      }
      return;
    }

    // kick
    if (beat % 4 === 0 || (this.track === 'boss' && beat % 2 === 0)) {
      const kick = context.createOscillator();
      const envelope = context.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(160, at);
      kick.frequency.exponentialRampToValueAtTime(42, at + 0.16);
      envelope.gain.setValueAtTime(0.5, at);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      kick.connect(envelope).connect(output);
      kick.start(at);
      kick.stop(at + 0.3);
    }
    // hat
    if (beat % 2 === 1 && this.noiseBuffer) {
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;
      const biquad = context.createBiquadFilter();
      biquad.type = 'highpass';
      biquad.frequency.value = 6800;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.09, at);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      source.connect(biquad).connect(envelope).connect(output);
      source.start(at);
      source.stop(at + 0.08);
    }
    // arpeggio
    const step = SCALE[beat % SCALE.length];
    const frequency = root * 4 * Math.pow(2, step / 12);
    this.musicVoice(
      at,
      this.track === 'boss' ? 'square' : 'triangle',
      frequency,
      frequency,
      0.24,
      0.06,
      2400,
    );
  }

  private musicVoice(
    at: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
    cutoff: number,
  ) {
    const context = this.context;
    const output = this.musicGain;
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.linearRampToValueAtTime(to, at + duration);
    const biquad = context.createBiquadFilter();
    biquad.type = 'lowpass';
    biquad.frequency.value = cutoff;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.06);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(biquad).connect(envelope).connect(output);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
  }

  private readFlag(key: string, fallback: boolean) {
    if (typeof localStorage === 'undefined') return fallback;
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === '1';
  }

  private readNumber(key: string, fallback: number) {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored >= 0 ? Math.min(1, stored) : fallback;
  }
}
