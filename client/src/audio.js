// Procedural soundtrack and sound effects (Web Audio, no asset files).
// The track is an original 122 BPM space synth-pop loop in A minor (Am-F-C-G) with a
// glassy bell hook, pulsing bass, shimmering arps and a breakdown before the drop.

let ctx = null, master, musicBus, sfxBus, reverb, delay;
let noiseBuf = null;
let musicOn = false, schedTimer = null, step = 0, nextTime = 0;
const settings = { music: 0.55, sfx: 0.85, master: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mgb_audio') || '{}')); } catch (e) { /* defaults */ }

const BPM = 122, STEP = 60 / BPM / 4;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// One chord per bar: Am, F, C, G
const CHORDS = [
    { root: 45, notes: [57, 60, 64] },
    { root: 41, notes: [57, 60, 65] },
    { root: 48, notes: [55, 60, 64] },
    { root: 43, notes: [55, 59, 62] },
];
// Bell hook, 4 bars x 16 steps: [step, midi, length in steps]
const HOOK = [
    [[0, 76, 2], [2, 79, 2], [4, 81, 3], [8, 79, 2], [10, 76, 2], [12, 72, 4]],
    [[0, 77, 2], [2, 76, 2], [4, 72, 2], [6, 69, 2], [8, 72, 3], [12, 74, 4]],
    [[0, 76, 2], [2, 79, 2], [4, 84, 3], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 74, 2], [2, 76, 2], [4, 79, 2], [6, 83, 2], [8, 86, 4], [12, 83, 2], [14, 79, 2]],
];

export function initAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9;
    comp.connect(master).connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    applyVolumes();

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Shared reverb (generated impulse) and a dotted-eighth echo
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    const revGain = ctx.createGain(); revGain.gain.value = 0.32;
    reverb.connect(revGain).connect(musicBus);
    // The sfx get their own (lighter) send so glass rings out in space
    const sfxRev = ctx.createGain(); sfxRev.gain.value = 0.18;
    reverb.connect(sfxRev).connect(sfxBus);
    delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dlGain = ctx.createGain(); dlGain.gain.value = 0.32;
    delay.connect(fb).connect(delay);
    delay.connect(dlGain).connect(musicBus);

    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
    });
}

function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = settings.master ?? 1;
    musicBus.gain.setTargetAtTime(settings.music * 0.5 * m * duck, t, 0.08);
    sfxBus.gain.setTargetAtTime(settings.sfx * m, t, 0.05);
}
let duck = 1;
// Music dips while you fall
export function duckMusic(on) { duck = on ? 0.35 : 1; applyVolumes(); }
export function getVolumes() { return { ...settings }; }
export function setVolume(kind, v) {
    settings[kind] = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('mgb_audio', JSON.stringify(settings)); } catch (e) { /* ignore */ }
    applyVolumes();
}

// ----- instruments -----
function env(g, t, a, peak, d, sustain, r, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
    if (end) { g.gain.setValueAtTime(Math.max(0.0001, sustain), end); g.gain.exponentialRampToValueAtTime(0.0001, end + r); }
}
function noise(t, dur, type, freq, q, gain, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out || musicBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return g;
}
function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.36);
}
function snare(t, gain) {
    noise(t, 0.18, 'bandpass', 1800, 0.9, gain || 0.38, musicBus);
    noise(t, 0.3, 'bandpass', 2200, 0.7, 0.12, reverb);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.12);
}
function hat(t, open) { noise(t, open ? 0.16 : 0.035, 'highpass', 8000, 0.7, open ? 0.14 : 0.1); }
function bass(t, n, dur) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = midi(n);
    o2.type = 'square'; o2.frequency.value = midi(n - 12);
    f.type = 'lowpass'; f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(200, t + dur); f.Q.value = 5;
    env(g, t, 0.005, 0.26, dur * 0.8, 0.1, 0.04, t + dur);
    o.connect(f); o2.connect(f); f.connect(g).connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
}
function pad(t, notes, dur, open) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(open ? 2800 : 900, t); f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.055, t + 0.3);
    g.gain.setValueAtTime(0.055, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    for (let b = 1; b < 4; b++) { const bt = t + b * STEP * 4; g.gain.setValueAtTime(0.018, bt); g.gain.linearRampToValueAtTime(0.055, bt + STEP * 2.5); }
    f.connect(g); g.connect(musicBus); g.connect(reverb);
    for (const n of notes) for (const det of [-10, 10]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.4);
    }
}
function pluck(t, n, cutoff) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.18);
    g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(f).connect(g); g.connect(musicBus); g.connect(delay);
    o.start(t); o.stop(t + 0.25);
}
// Glass bell: inharmonic partials with a long shimmering tail
function bell(t, n, gain, out) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain || 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    g.connect(out || musicBus); g.connect(reverb);
    for (const [mul, amp, dec] of [[1, 1, 1.4], [2.76, 0.35, 0.6], [5.4, 0.18, 0.3], [8.93, 0.08, 0.15]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.value = midi(n) * mul;
        og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(og).connect(g); o.start(t); o.stop(t + 1.5);
    }
}
function riser(t, dur) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur);
    src.connect(f).connect(g).connect(musicBus); src.start(t); src.stop(t + dur);
}

// One 16th-note step of the song
function playStep(s, t) {
    const bar = Math.floor(s / 16) % 16, i = s % 16, chord = CHORDS[bar % 4];
    const breakdown = bar >= 8 && bar < 12;
    const hookOn = (bar >= 4 && bar < 8) || bar >= 12;
    if (!breakdown && (i === 0 || i === 8 || (bar >= 12 && i === 10))) kick(t);
    if (breakdown && bar === 11 && i >= 8) { if (i % 2 === 0) snare(t, 0.12 + (i - 8) * 0.04); }
    else if (!breakdown && (i === 4 || i === 12)) snare(t, 0.36);
    if (!breakdown) hat(t, i % 4 === 2);
    else if (i % 4 === 2) hat(t, false);
    if (!breakdown && i % 2 === 0) bass(t, chord.root + (i % 4 === 2 ? 12 : 0), STEP * 1.6);
    if (i === 0) pad(t, chord.notes, STEP * 16, bar >= 12);
    const tones = chord.notes.concat(chord.notes.map((n) => n + 12));
    const cutoff = breakdown ? 700 + (bar - 8) * 800 + i * 50 : 2800;
    if (i % 2 === 0 || bar >= 12) pluck(t, tones[(i * 5) % tones.length] + 12, cutoff);
    if (hookOn) for (const [st, n] of HOOK[bar % 4]) if (st === i) bell(t, n, 0.1);
    if (breakdown && i % 4 === 0) bell(t, chord.notes[(i / 4) % 3] + 24, 0.05);
    if (bar === 11 && i === 0) riser(t, STEP * 16);
}

function scheduler() {
    while (nextTime < ctx.currentTime + 0.12) {
        playStep(step, nextTime);
        nextTime += STEP;
        step++;
    }
}
export function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true;
    step = 0; nextTime = ctx.currentTime + 0.1;
    schedTimer = setInterval(scheduler, 25);
}
export function stopMusic() { musicOn = false; clearInterval(schedTimer); }

// ----- sound effects -----
function tone(t, type, f0, f1, dur, gain, out) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
    click(t) { tone(t, 'triangle', 900, 500, 0.06, 0.22); },
    jump(t) { tone(t, 'sine', 260, 620, 0.14, 0.22); },
    deny(t) { tone(t, 'square', 220, 180, 0.12, 0.1); tone(t + 0.12, 'square', 180, 140, 0.16, 0.1); },
    land(t) { noise(t, 0.12, 'lowpass', 500, 1, 0.3, sfxBus); tone(t, 'sine', 120, 60, 0.1, 0.26); },
    step(t) { noise(t, 0.05, 'bandpass', 900 + Math.random() * 400, 2, 0.05, sfxBus); },
    // Footstep on glass: a tiny bright clink
    glassStep(t) {
        const f = 2400 + Math.random() * 900;
        tone(t, 'sine', f, f * 0.98, 0.09, 0.05);
        noise(t, 0.02, 'highpass', 6000, 0.8, 0.05, sfxBus);
    },
    coin(t) { tone(t, 'square', midi(88), null, 0.06, 0.06); tone(t + 0.06, 'square', midi(93), null, 0.14, 0.06); },
    // Glass cracks, then bursts into a shower of tinkles
    crack(t) {
        noise(t, 0.06, 'highpass', 2500, 1.2, 0.6, sfxBus);
        tone(t, 'sawtooth', 3200, 900, 0.05, 0.12);
        noise(t + 0.05, 0.4, 'bandpass', 4200, 0.8, 0.55, sfxBus);
        noise(t + 0.05, 0.3, 'lowpass', 900, 0.7, 0.35, sfxBus);
        for (let i = 0; i < 22; i++) {
            const at = t + 0.07 + Math.random() * 0.55, f = 3000 + Math.random() * 6000;
            tone(at, 'sine', f, f * 0.97, 0.05 + Math.random() * 0.12, 0.03 + Math.random() * 0.05);
        }
    },
    // Long falling whistle into the void
    fall(t) {
        tone(t, 'sine', 1300, 160, 1.6, 0.13);
        tone(t, 'triangle', 650, 80, 1.6, 0.06);
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
        f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(250, t + 1.6);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        src.connect(f).connect(g).connect(sfxBus); src.start(t); src.stop(t + 1.75);
    },
    wrong(t) { tone(t, 'square', 330, 300, 0.16, 0.1); tone(t + 0.16, 'square', 247, 220, 0.3, 0.1); },
    revive(t) {
        [69, 73, 76, 81, 85, 88].forEach((n, i) => bell(t + i * 0.05, n, 0.08, sfxBus));
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.5);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        src.connect(f).connect(g).connect(sfxBus); src.start(t); src.stop(t + 0.65);
    },
    gate(t) {
        tone(t, 'sawtooth', 110, 880, 0.4, 0.07);
        [72, 79, 84].forEach((n, i) => bell(t + 0.1 + i * 0.06, n, 0.06, sfxBus));
    },
    unlock(t) { [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.08, 'square', midi(n), null, 0.25, 0.1)); bell(t + 0.32, 88, 0.15, sfxBus); },
    buy(t) { [79, 84, 88, 91, 96].forEach((n, i) => tone(t + i * 0.05, 'sine', midi(n), null, 0.3, 0.14)); },
    whoosh(t) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        src.connect(f).connect(g).connect(sfxBus); src.start(t); src.stop(t + 0.55);
    },
    cheer(t) {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.42, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        src.connect(f).connect(g).connect(sfxBus); src.start(t); src.stop(t + 2.9);
        [72, 76, 79, 84, 88].forEach((n, i) => tone(t + 0.1 + i * 0.07, 'square', midi(n), null, 0.3, 0.07));
    },
    chest(t) {
        noise(t, 0.08, 'lowpass', 600, 1, 0.4, sfxBus);
        for (let i = 0; i < 14; i++) tone(t + 0.1 + i * 0.045 + Math.random() * 0.02, 'square', midi(86 + (i % 5) * 2), null, 0.08, 0.05);
        [84, 88, 91, 96].forEach((n, i) => bell(t + 0.15 + i * 0.09, n, 0.1, sfxBus));
    },
    firework(t) { tone(t, 'sine', 900, 200, 0.35, 0.05); noise(t + 0.35, 0.4, 'lowpass', 2500, 0.8, 0.3, sfxBus); },
    hatch(t) {
        noise(t, 0.12, 'bandpass', 2400, 3, 0.35, sfxBus);
        [76, 81, 84, 88, 93].forEach((n, i) => tone(t + 0.12 + i * 0.06, 'triangle', midi(n), null, 0.3, 0.13));
    },
    shake(t) { for (let i = 0; i < 4; i++) noise(t + i * 0.12, 0.06, 'bandpass', 1400, 2, 0.22, sfxBus); },
    tick(t) { tone(t, 'square', 1800, 1200, 0.025, 0.05); },
    alarm(t) { for (let i = 0; i < 3; i++) { tone(t + i * 0.3, 'sawtooth', 880, 440, 0.25, 0.08); } },
    calc(t) { tone(t, 'square', 1500 + Math.random() * 300, null, 0.03, 0.04); },
};
// A right answer: a glass chime that climbs a pentatonic scale as the streak grows
const PENTA = [0, 2, 4, 7, 9];
export function sfxRight(streak) {
    if (!ctx || settings.sfx <= 0) return;
    const t = ctx.currentTime + 0.005;
    const k = Math.max(0, streak - 1);
    const n = 72 + PENTA[k % 5] + 12 * Math.min(2, Math.floor(k / 5));
    bell(t, n, 0.16, sfxBus);
    bell(t + 0.07, n + 7, 0.09, sfxBus);
    tone(t, 'triangle', midi(n + 12), null, 0.12, 0.05);
}
export function sfx(name) {
    if (!ctx || !SFX[name] || settings.sfx <= 0) return;
    SFX[name](ctx.currentTime + 0.005);
}
