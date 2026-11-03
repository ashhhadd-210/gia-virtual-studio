import { Howl, Howler } from "howler";

const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;
const MASTER_AUDIO_GAIN = 1.85;
const SOFT_CLIP_DRIVE = 1.3;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function applyMasterGain(value) {
  const driven = value * MASTER_AUDIO_GAIN;
  return Math.tanh(driven * SOFT_CLIP_DRIVE) / Math.tanh(SOFT_CLIP_DRIVE);
}

function envelope(t, duration, attack = 0.02, release = 0.18) {
  const fadeIn = Math.min(1, t / attack);
  const fadeOut = Math.min(1, (duration - t) / release);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function smoothNoise1d(t, rate, salt = 0) {
  const x = t * rate;
  const x0 = Math.floor(x);
  const f = x - x0;
  const smooth = f * f * (3 - 2 * f);
  const rand = (n) => {
    const value = Math.sin((n + salt) * 127.1) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };
  return rand(x0) * (1 - smooth) + rand(x0 + 1) * smooth;
}

function makeWavDataUri(duration, synth) {
  const frameCount = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const bytesPerSample = 2;
  const dataSize = frameCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / SAMPLE_RATE;
    const sample = clampSample(applyMasterGain(synth(t, duration)));
    view.setInt16(44 + i * bytesPerSample, sample * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function clickSynth(t, duration) {
  const heelDecay = Math.exp(-t * 28);
  const heelBody = Math.sin(TAU * 180 * t) * heelDecay * 0.24;
  const heelKnock = Math.sin(TAU * 320 * t) * Math.exp(-t * 38) * 0.065;
  const toeDelay = Math.max(0, t - 0.045);
  const toeBody = Math.sin(TAU * 138 * toeDelay) * Math.exp(-toeDelay * 20) * 0.1;
  const toeLeather = smoothNoise1d(toeDelay, 58, 13) * Math.exp(-toeDelay * 26) * 0.03;
  const env = envelope(t, duration, 0.002, 0.24);
  return (heelBody + heelKnock + toeBody + toeLeather) * env * 0.74;
}

function mainHallSynthMoodSynth(t, duration) {
  const loopFade = Math.min(1, t / 2.2, (duration - t) / 2.4);
  const drift = Math.sin(TAU * 0.019 * t) * 0.5 + 0.5;
  const chordIndex = Math.floor((t / 5.8) % 4);
  const roots = [82.41, 92.5, 98.0, 87.31];
  const root = roots[chordIndex];
  const pulsePhase = (t * 0.36) % 1;
  const pulseEnv = Math.exp(-pulsePhase * 3.8);
  const lowBody =
    Math.sin(TAU * root * 0.5 * t + drift * 0.3) * 0.026 +
    Math.sin(TAU * root * 0.75 * t + 0.8) * 0.018;
  const fashionPad =
    Math.sin(TAU * root * 1.25 * t + Math.sin(t * 0.11) * 0.26) * 0.018 +
    Math.sin(TAU * root * 1.75 * t + 1.3) * 0.011;
  const synthPulse =
    (Math.sin(TAU * root * 2 * t + 0.24) * 0.012 + Math.sin(TAU * root * 2.5 * t + 1.05) * 0.006) *
    pulseEnv;
  const air = smoothNoise1d(t, 26, 401) * 0.008 + smoothNoise1d(t, 44, 419) * 0.004;
  return (lowBody + fashionPad + synthPulse + air) * loopFade * 0.62;
}

function movePulseSynth(t, duration) {
  const env = envelope(t, duration, 0.003, 0.34);
  const sweep = t / duration;
  const body =
    Math.sin(TAU * (92 - sweep * 18) * t) * Math.exp(-t * 7.5) * 0.15 +
    Math.sin(TAU * (138 - sweep * 26) * t + 0.2) * Math.exp(-t * 10.5) * 0.06;
  const sub = Math.sin(TAU * 54 * t) * Math.exp(-t * 5.2) * 0.08;
  const air = smoothNoise1d(t, 180, 303) * Math.exp(-t * 14) * 0.012;
  return (body + sub + air) * env * 0.8;
}

function showcaseAccentSynth(t, duration) {
  const env = envelope(t, duration, 0.006, 0.42);
  const sweep = t / duration;
  const velvet =
    Math.sin(TAU * (156 - sweep * 18) * t + Math.sin(t * 5.4) * 0.35) * Math.exp(-t * 4.6) * 0.11;
  const bloom = Math.sin(TAU * (228 - sweep * 28) * t + 0.6) * Math.exp(-t * 6.2) * 0.055;
  const air = smoothNoise1d(t, 220, 313) * Math.exp(-t * 9.2) * 0.016;
  return (velvet + bloom + air) * env * 0.76;
}

function focusBloomSynth(t, duration) {
  const env = envelope(t, duration, 0.05, 0.48);
  const rise = Math.min(1, t / 0.18);
  const fade = Math.exp(-t * 2.8);
  const body =
    Math.sin(TAU * 132 * t + Math.sin(t * 2.2) * 0.3) * 0.12 +
    Math.sin(TAU * 198 * t + 0.7) * 0.055;
  const halo = smoothNoise1d(t, 82, 331) * 0.018;
  return (body * rise * fade + halo * Math.exp(-t * 4.2)) * env * 0.74;
}

function flySynth(t, duration) {
  const loopT = t % duration;
  const env = envelope(loopT, duration, 0.18, 0.42);
  const sweep = loopT / duration;
  const air = smoothNoise1d(loopT, 34, 17) * 0.24 + smoothNoise1d(loopT, 71, 31) * 0.11;
  const lowSweep = Math.sin(TAU * (56 + sweep * 28) * loopT) * 0.18;
  const body = Math.sin(TAU * (112 + sweep * 36) * loopT + Math.sin(loopT * 2.1) * 0.65) * 0.075;
  return (air + lowSweep + body) * env * 0.72;
}

function flyWhooshSynth(t, duration) {
  const rise = Math.min(1, t / 0.18);
  const fall = Math.min(1, (duration - t) / 0.62);
  const env = Math.max(0, Math.min(rise, fall));
  const sweep = t / duration;
  const air = smoothNoise1d(t, 48 + sweep * 70, 71) * 0.33 + smoothNoise1d(t, 115 + sweep * 90, 103) * 0.13;
  const lowPassFeel = Math.sin(TAU * (72 + sweep * 78) * t) * 0.16;
  const pressure = Math.sin(TAU * 34 * t) * Math.sin(TAU * 0.85 * t) * 0.12;
  return (air + lowPassFeel + pressure) * env * 0.84;
}

function flyWhooshNearSynth(t, duration) {
  const rise = Math.min(1, t / 0.08);
  const fall = Math.min(1, (duration - t) / 0.32);
  const env = Math.max(0, Math.min(rise, fall));
  const sweep = t / duration;
  const air = smoothNoise1d(t, 38 + sweep * 34, 41) * 0.18;
  const lowPassFeel = Math.sin(TAU * (82 + sweep * 34) * t) * 0.08;
  return (air + lowPassFeel) * env * 0.62;
}

function flyWhooshMidSynth(t, duration) {
  const rise = Math.min(1, t / 0.12);
  const fall = Math.min(1, (duration - t) / 0.48);
  const env = Math.max(0, Math.min(rise, fall));
  const sweep = t / duration;
  const air = smoothNoise1d(t, 44 + sweep * 54, 61) * 0.24 + smoothNoise1d(t, 92 + sweep * 62, 67) * 0.08;
  const lowPassFeel = Math.sin(TAU * (74 + sweep * 54) * t) * 0.12;
  const pressure = Math.sin(TAU * 36 * t) * Math.sin(TAU * 0.8 * t) * 0.055;
  return (air + lowPassFeel + pressure) * env * 0.72;
}

function ambientSynth(t, duration) {
  const loopFade = Math.min(1, t / 2, (duration - t) / 2);
  const drift = Math.sin(TAU * 0.026 * t) * 0.5 + 0.5;
  const chordIndex = Math.floor((t / 5.5) % 4);
  const roots = [65.41, 73.42, 82.41, 98.0];
  const root = roots[chordIndex];
  const pad =
    Math.sin(TAU * root * t + drift * 0.35) * 0.048 +
    Math.sin(TAU * root * 1.5 * t + 1.1) * 0.034 +
    Math.sin(TAU * root * 2 * t + Math.sin(t * 0.13) * 0.42) * 0.021;
  const shimmer =
    Math.sin(TAU * (root * 4.5 + drift * 6) * t + 0.3) * 0.01 +
    Math.sin(TAU * (root * 6 + 1.7) * t) * 0.008;
  const fashionBloom =
    Math.sin(TAU * 0.11 * t) * Math.sin(TAU * 220 * t + Math.sin(t * 0.22) * 0.9) * 0.014;
  const roomTone = smoothNoise1d(t, 12, 83) * 0.006;
  return (pad + shimmer + fashionBloom + roomTone) * loopFade * 0.56;
}

function hallAtmosphereSynth(t, duration) {
  const loopFade = Math.min(1, t / 2.4, (duration - t) / 2.6);
  const drift = Math.sin(TAU * 0.018 * t) * 0.5 + 0.5;
  const chordIndex = Math.floor((t / 6.5) % 4);
  const roots = [49.0, 55.0, 61.74, 65.41];
  const root = roots[chordIndex];
  const subDrone =
    Math.sin(TAU * root * 0.5 * t + drift * 0.3) * 0.034 +
    Math.sin(TAU * root * 0.75 * t + 0.8) * 0.022;
  const airBed = smoothNoise1d(t, 18, 111) * 0.014 + smoothNoise1d(t, 37, 137) * 0.01;
  const corridorWash =
    smoothNoise1d(t, 54 + drift * 8, 163) * 0.01 + smoothNoise1d(t, 92 + drift * 10, 197) * 0.006;
  const swellPhase = (t * 0.18) % 1;
  const swellEnv = Math.exp(-swellPhase * 3.1);
  const swell =
    (smoothNoise1d(t, 24, 227) * 0.012 + smoothNoise1d(t, 46, 241) * 0.008) * swellEnv;
  return (subDrone + airBed + corridorWash + swell) * loopFade * 0.58;
}

function corridorAtmosphereSynth(t, duration) {
  const loopFade = Math.min(1, t / 2.1, (duration - t) / 2.4);
  const drift = Math.sin(TAU * 0.021 * t) * 0.5 + 0.5;
  const chordIndex = Math.floor((t / 4.8) % 4);
  const roots = [73.42, 82.41, 69.3, 77.78];
  const root = roots[chordIndex];
  const phraseRate = 1.32;
  const phrasePhase = (t * phraseRate) % 1;
  const phraseStep = Math.floor(t * phraseRate) % 8;
  const phraseEnv = Math.exp(-phrasePhase * 3.3);
  const phraseRatios = [1, 1.25, 1.5, 1.333, 1.667, 1.5, 1.25, 1.125];
  const melodyFreq = root * phraseRatios[phraseStep];
  const melody =
    (Math.sin(TAU * melodyFreq * t + Math.sin(t * 0.14) * 0.18) * 0.02 +
      Math.sin(TAU * melodyFreq * 2 * t + 0.6) * 0.006) *
    phraseEnv;
  const answerRate = 0.66;
  const answerPhase = (t * answerRate) % 1;
  const answerStep = Math.floor(t * answerRate) % 4;
  const answerEnv = Math.exp(-answerPhase * 2.7);
  const answerRatios = [0.75, 1, 0.75, 0.667];
  const answerFreq = root * answerRatios[answerStep];
  const answer =
    (Math.sin(TAU * answerFreq * t + 1.05) * 0.014 + Math.sin(TAU * answerFreq * 1.5 * t + 0.24) * 0.005) *
    answerEnv;
  const pad =
    Math.sin(TAU * root * 0.5 * t + drift * 0.26) * 0.024 +
    Math.sin(TAU * root * 0.75 * t + 1.1) * 0.015;
  const air = smoothNoise1d(t, 28, 353) * 0.01 + smoothNoise1d(t, 52, 379) * 0.004;
  return (pad + melody + answer + air) * loopFade * 0.6;
}

function shopEnergySynth(t, duration) {
  const loopFade = Math.min(1, t / 1.4, (duration - t) / 1.6);
  const bpm = 104;
  const beat = (t * bpm) / 60;
  const beatPhase = beat % 1;
  const halfBeatPhase = (beat * 2) % 1;
  const drumStepPhase = (beat * 4) % 1;
  const bars = beat / 4;
  const barIndex = Math.floor(bars) % 16;
  const beatInBar = Math.floor(beat) % 4;
  const chordIndex = Math.floor(barIndex / 2) % 8;
  const chordRoots = [49.0, 55.0, 58.27, 61.74, 49.0, 55.0, 58.27, 65.41];
  const root = chordRoots[chordIndex];
  const sidechain = 0.78 + Math.exp(-beatPhase * 7.5) * -0.1;
  const beatTime = beatPhase * (60 / bpm);
  const kickEnv = Math.exp(-beatPhase * 8.8);
  const kick =
    Math.sin(TAU * (41 - beatPhase * 8) * beatTime) * kickEnv * 0.072 +
    Math.sin(TAU * (58 - beatPhase * 10) * beatTime + 0.2) * Math.exp(-beatPhase * 15) * 0.01 +
    smoothNoise1d(beatTime, 140, 151) * Math.exp(-beatPhase * 34) * 0.002;
  const snareEnv = beatInBar === 1 || beatInBar === 3 ? Math.exp(-beatPhase * 15) : 0;
  const snare =
    (smoothNoise1d(t, 1700, 191) * 0.03 +
      smoothNoise1d(t, 980, 211) * 0.018 +
      smoothNoise1d(t, 420, 233) * 0.006) *
    snareEnv;
  const hiHat =
    (smoothNoise1d(t, 3200, 29) * 0.011 + smoothNoise1d(t, 2200, 47) * 0.006) *
    Math.exp(-drumStepPhase * 24);
  const bassNote = chordRoots[(chordIndex + (barIndex >= 12 ? 1 : 0)) % chordRoots.length] * 0.5;
  const bassGate = 0.34 + Math.exp(-beatPhase * 5.2) * 0.44;
  const warmBass =
    (Math.sin(TAU * bassNote * t) * 0.06 + Math.sin(TAU * bassNote * 2 * t + 0.35) * 0.012) *
    bassGate;
  const synthLift = barIndex >= 8 ? 1.08 : 0.94;
  const synthGate = Math.exp(-halfBeatPhase * 4.4);
  const synth =
    (Math.sin(TAU * root * t + 0.2) * 0.022 +
      Math.sin(TAU * root * 0.5 * t + 1.2) * 0.016 +
      Math.sin(TAU * root * 1.25 * t + 0.6) * 0.008) *
    synthGate *
    synthLift;
  const drums = kick + snare + hiHat;
  return (drums + warmBass + synth * sidechain) * loopFade * 0.62;
}

export class AudioManager {
  constructor() {
    this.enabled = typeof window !== "undefined";
    this.unlocked = false;
    this.flyId = null;
    this.shopEnergyActive = false;
    this.hallAtmosphereActive = false;
    this.corridorAtmosphereActive = false;
    this.mainHallSynthActive = false;
    this.sounds = null;
  }

  unlock() {
    if (!this.enabled) {
      return;
    }
    if (!this.sounds) {
      this._createSounds();
    }
    Howler.volume(1);
    if (Howler.ctx?.state === "suspended") {
      Howler.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    this.startAmbient();
  }

  playClick() {
    if (!this.unlocked) {
      this.unlock();
    }
    this.sounds?.click.play();
  }

  playMoveAccent() {
    if (!this.unlocked) {
      this.unlock();
    }
    this.sounds?.movePulse.play();
  }

  playShowcaseAccent() {
    if (!this.unlocked) {
      this.unlock();
    }
    this.sounds?.showcaseAccent.play();
  }

  playFocusBloom() {
    if (!this.unlocked) {
      this.unlock();
    }
    this.sounds?.focusBloom.play();
  }

  startFly(distance = 18) {
    if (!this.unlocked) {
      this.unlock();
    }
    if (!this.sounds?.fly || this.flyId != null) {
      return;
    }
    const profile = this._getFlyProfile(distance);
    this.sounds[profile.whoosh]?.play();
    this.flyId = this.sounds.fly.play();
    this.sounds.fly.fade(0, profile.volume, profile.fadeMs, this.flyId);
  }

  _getFlyProfile(distance) {
    if (distance < 7.5) {
      return { whoosh: "whooshNear", volume: 0.28, fadeMs: 180 };
    }
    if (distance < 18) {
      return { whoosh: "whooshMid", volume: 0.38, fadeMs: 220 };
    }
    return { whoosh: "whoosh", volume: 0.5, fadeMs: 260 };
  }

  stopFly() {
    if (!this.sounds?.fly || this.flyId == null) {
      return;
    }
    const id = this.flyId;
    this.flyId = null;
    this.sounds.fly.fade(this.sounds.fly.volume(id), 0, 260, id);
    window.setTimeout(() => this.sounds?.fly.stop(id), 280);
  }

  startAmbient() {
    if (!this.sounds?.ambient) {
      return;
    }
    if (!this.sounds.ambient.playing()) {
      const id = this.sounds.ambient.play();
      this.sounds.ambient.fade(0, 0.42, 1200, id);
    }
    if (this.sounds.shopEnergy && !this.sounds.shopEnergy.playing()) {
      this.sounds.shopEnergy.play();
      this.sounds.shopEnergy.volume(0);
    }
    if (this.sounds.hallAtmosphere && !this.sounds.hallAtmosphere.playing()) {
      this.sounds.hallAtmosphere.play();
      this.sounds.hallAtmosphere.volume(0);
    }
    if (this.sounds.corridorAtmosphere && !this.sounds.corridorAtmosphere.playing()) {
      this.sounds.corridorAtmosphere.play();
      this.sounds.corridorAtmosphere.volume(0);
    }
    if (this.sounds.mainHallSynth && !this.sounds.mainHallSynth.playing()) {
      this.sounds.mainHallSynth.play();
      this.sounds.mainHallSynth.volume(0);
    }
  }

  setShopEnergy(active) {
    if (!this.unlocked || !this.sounds?.shopEnergy || this.shopEnergyActive === active) {
      return;
    }
    this.shopEnergyActive = active;
    if (!this.sounds.shopEnergy.playing()) {
      this.sounds.shopEnergy.play();
      this.sounds.shopEnergy.volume(0);
    }
    this.sounds.shopEnergy.fade(this.sounds.shopEnergy.volume(), active ? 0.46 : 0, active ? 850 : 1000);
  }

  setHallAtmosphere(active) {
    if (!this.unlocked || !this.sounds?.hallAtmosphere || this.hallAtmosphereActive === active) {
      return;
    }
    this.hallAtmosphereActive = active;
    if (!this.sounds.hallAtmosphere.playing()) {
      this.sounds.hallAtmosphere.play();
      this.sounds.hallAtmosphere.volume(0);
    }
    this.sounds.hallAtmosphere.fade(
      this.sounds.hallAtmosphere.volume(),
      active ? 0.3 : 0,
      active ? 950 : 1100,
    );
  }

  setCorridorAtmosphere(active) {
    if (!this.unlocked || !this.sounds?.corridorAtmosphere || this.corridorAtmosphereActive === active) {
      return;
    }
    this.corridorAtmosphereActive = active;
    if (!this.sounds.corridorAtmosphere.playing()) {
      this.sounds.corridorAtmosphere.play();
      this.sounds.corridorAtmosphere.volume(0);
    }
    this.sounds.corridorAtmosphere.fade(
      this.sounds.corridorAtmosphere.volume(),
      active ? 0.34 : 0,
      active ? 820 : 980,
    );
  }

  setMainHallSynth(active) {
    if (!this.unlocked || !this.sounds?.mainHallSynth || this.mainHallSynthActive === active) {
      return;
    }
    this.mainHallSynthActive = active;
    if (!this.sounds.mainHallSynth.playing()) {
      this.sounds.mainHallSynth.play();
      this.sounds.mainHallSynth.volume(0);
    }
    this.sounds.mainHallSynth.fade(this.sounds.mainHallSynth.volume(), active ? 0.2 : 0, active ? 1100 : 900);
  }

  _createSounds() {
    this.sounds = {
      click: new Howl({
        src: [makeWavDataUri(0.34, clickSynth)],
        volume: 0.13,
        html5: false,
      }),
      movePulse: new Howl({
        src: [makeWavDataUri(0.46, movePulseSynth)],
        volume: 0.18,
        html5: false,
      }),
      showcaseAccent: new Howl({
        src: [makeWavDataUri(0.62, showcaseAccentSynth)],
        volume: 0.2,
        html5: false,
      }),
      focusBloom: new Howl({
        src: [makeWavDataUri(0.82, focusBloomSynth)],
        volume: 0.24,
        html5: false,
      }),
      fly: new Howl({
        src: [makeWavDataUri(1.8, flySynth)],
        volume: 0,
        loop: true,
        html5: false,
      }),
      whoosh: new Howl({
        src: [makeWavDataUri(1.25, flyWhooshSynth)],
        volume: 0.72,
        html5: false,
      }),
      whooshNear: new Howl({
        src: [makeWavDataUri(0.62, flyWhooshNearSynth)],
        volume: 0.48,
        html5: false,
      }),
      whooshMid: new Howl({
        src: [makeWavDataUri(0.9, flyWhooshMidSynth)],
        volume: 0.6,
        html5: false,
      }),
      ambient: new Howl({
        src: [makeWavDataUri(16, ambientSynth)],
        volume: 0,
        loop: true,
        html5: false,
      }),
      hallAtmosphere: new Howl({
        src: [makeWavDataUri(20, hallAtmosphereSynth)],
        volume: 0,
        loop: true,
        html5: false,
      }),
      corridorAtmosphere: new Howl({
        src: [makeWavDataUri(18, corridorAtmosphereSynth)],
        volume: 0,
        loop: true,
        html5: false,
      }),
      mainHallSynth: new Howl({
        src: [makeWavDataUri(16, mainHallSynthMoodSynth)],
        volume: 0,
        loop: true,
        html5: false,
      }),
      shopEnergy: new Howl({
        src: [makeWavDataUri((60 / 104) * 4 * 16, shopEnergySynth)],
        volume: 0,
        loop: true,
        html5: false,
      }),
    };
  }
}
