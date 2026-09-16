// Mini synthèse WebAudio — aucun asset externe.
let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());

function tone(freq: number, dur = 0.09, type: OscillatorType = 'square', vol = 0.04, delay = 0) {
  try {
    const c = ac();
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  } catch { /* audio indisponible */ }
}

export const sfx = {
  /** À appeler dans un handler de clic : débloque l'audio + la voix (Safari/iOS). */
  unlock() {
    try { void ac().resume(); } catch { /* noop */ }
    try { speechSynthesis?.speak(new SpeechSynthesisUtterance(' ')); } catch { /* noop */ }
  },
  score(big = false) {
    tone(620, 0.07, 'square', 0.035);
    if (big) { tone(930, 0.1, 'square', 0.05, 0.05); tone(1240, 0.12, 'sine', 0.05, 0.1); }
  },
  penalty() { tone(180, 0.16, 'sawtooth', 0.05); tone(120, 0.2, 'sawtooth', 0.04, 0.08); },
  combo() { tone(523, 0.07, 'triangle', 0.05); tone(784, 0.09, 'triangle', 0.05, 0.06); tone(1046, 0.12, 'triangle', 0.05, 0.12); },
  event() { tone(300, 0.1, 'sawtooth', 0.045); tone(450, 0.12, 'sawtooth', 0.045, 0.09); },
  count(final = false) { tone(final ? 880 : 440, final ? 0.3 : 0.1, 'sine', 0.06); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.055, i * 0.11)); },
  buzz() { tone(98, 0.5, 'sawtooth', 0.06); },
};
