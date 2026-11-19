// speechSynthesis wrapper. iOS only allows speech after a user tap, so call unlock() from a tap.
import { tr, speechLang } from '../i18n.js';
import { afterSfx } from './sfx.js';
let unlocked = false;
let on = false;
let ticket = 0; // each new line (or turning the narrator off) cancels a line still waiting for its sound
const synth = () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis : null);

export function unlock() {
  const s = synth(); if (!s || unlocked) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u); unlocked = true; } catch { /* ignore */ }
}

export function setNarrator(want) {
  on = !!want;
  if (!on) { ticket++; try { synth()?.cancel(); } catch { /* ignore */ } }
}

// A bot's line, in a voice of its own. Only when nothing else is being said: it never talks over the
// narrator or another bot, so a busy table just drops lines from the voice (they are still on screen).
export function speakChat(text, voice = 0) {
  const s = synth(); if (!s || !unlocked || !on || s.speaking || s.pending) return;
  const mine = ticket;
  afterSfx(() => {
    if (mine !== ticket || !on || s.speaking || s.pending) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/\p{Extended_Pictographic}/gu, ''));
      u.lang = speechLang(); u.pitch = 0.6 + (voice % 7) * 0.15; u.rate = 1.05; s.speak(u);
    } catch { /* ignore */ }
  });
}

// Speaks after the sound effects scheduled for the same view have finished.
export function speak(text) {
  const s = synth(); if (!s || !unlocked || !on) return;
  const mine = ++ticket;
  afterSfx(() => {
    if (mine !== ticket || !on) return;
    try { s.cancel(); const u = new SpeechSynthesisUtterance(tr(text)); u.lang = speechLang(); u.rate = 0.95; s.speak(u); } catch { /* ignore */ }
  });
}
