// speechSynthesis wrapper. iOS only allows speech after a user tap, so call unlock() from a tap.
let unlocked = false;
const synth = () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);

export function unlock() {
  const s = synth(); if (!s || unlocked) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u); unlocked = true; } catch { /* ignore */ }
}

export function speak(text) {
  const s = synth(); if (!s || !unlocked) return;
  try { s.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; s.speak(u); } catch { /* ignore */ }
}
