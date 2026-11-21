// All of Vice Harbor's sound is synthesized with WebAudio — there are no audio
// files. An engine hum that follows the player's speed, two-tone sirens that swell
// as patrol cars close in, noise-burst gunshots and crashes, and a quiet synth pad
// that loops the harbor's chords underneath everything. Nothing starts until the
// first key or click (the browser's autoplay rule), and every call is safe before
// that: the whole module is a no-op until init() runs.
import { clamp } from './random.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = 0;
  let musicTimer = 0;
  let chordIndex = 0;

  const CHORDS = [
    [110.0, 164.81, 261.63, 329.63], // Am7
    [87.31, 174.61, 220.0, 261.63], // Fmaj7
    [130.81, 196.0, 261.63, 329.63], // Cmaj7
    [98.0, 196.0, 246.94, 293.66], // G6
  ];

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
  }

  function noiseBurst(duration, filterType, frequency, gainValue) {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone(type, from, to, duration, gainValue, delay = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function playChord() {
    if (!ctx) return;
    const chord = CHORDS[chordIndex % CHORDS.length];
    chordIndex += 1;
    for (const freq of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 640;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 0.6);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.9);
      osc.connect(filter).connect(gain).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 3);
    }
  }

  /** Per-frame: engine pitch from the player's car, siren swell from the nearest patrol car, the pad. */
  function update(game, dt) {
    if (!ctx) return;
    const player = game.player;
    if (engineGain) {
      const driving = player.car && game.screen === 'play';
      const target = driving ? 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      if (driving) {
        engineOsc.frequency.setTargetAtTime(52 + Math.abs(player.car.speed) * 0.32, ctx.currentTime, 0.08);
      }
    }
    if (sirenGain) {
      let nearest = Infinity;
      for (const cop of game.cops) {
        nearest = Math.min(nearest, Math.hypot(cop.x - player.x, cop.y - player.y));
      }
      const active = game.wanted.level > 0 && nearest < 760 && game.screen === 'play';
      sirenGain.gain.setTargetAtTime(active ? clamp(0.055 * (1 - nearest / 820), 0.008, 0.055) : 0, ctx.currentTime, 0.15);
      if (active) {
        sirenFlip -= dt;
        if (sirenFlip <= 0) {
          sirenFlip = 0.34;
          sirenOsc.frequency.setValueAtTime(sirenOsc.frequency.value === 720 ? 960 : 720, ctx.currentTime);
        }
      }
    }
    if (game.screen === 'play' || game.screen === 'title') {
      musicTimer -= dt;
      if (musicTimer <= 0) {
        musicTimer = 2.9;
        playChord();
      }
    }
  }

  return {
    init,
    update,
    shot() {
      noiseBurst(0.14, 'bandpass', 1500, 0.5);
      tone('square', 340, 60, 0.1, 0.16);
    },
    dryFire() { tone('square', 900, 700, 0.05, 0.08); },
    melee() {
      noiseBurst(0.07, 'lowpass', 500, 0.3);
      tone('sine', 110, 50, 0.09, 0.2);
    },
    crash(strength) {
      noiseBurst(0.22, 'lowpass', 300, clamp(strength, 0.1, 0.5));
      tone('sine', 90, 38, 0.22, clamp(strength, 0.1, 0.4));
    },
    honk() { tone('square', 392, 392, 0.16, 0.035); tone('square', 494, 494, 0.16, 0.03); },
    pickup() {
      tone('sine', 880, 880, 0.07, 0.12);
      tone('sine', 1318, 1318, 0.1, 0.12, 0.07);
    },
    cash() {
      tone('triangle', 1046, 1046, 0.08, 0.12);
      tone('triangle', 1318, 1318, 0.12, 0.12, 0.08);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((freq, index) => tone('triangle', freq, freq, 0.22, 0.14, index * 0.11));
    },
    sting() {
      [392, 330, 262].forEach((freq, index) => tone('sawtooth', freq, freq * 0.97, 0.3, 0.1, index * 0.16));
    },
    click() { tone('sine', 660, 660, 0.05, 0.08); },
  };
}
