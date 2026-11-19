// Announcement cards for deaths and other outcomes (dawn, vote result, hunter shots).
// UI only. It reads nothing but the public announcement lines every phone already gets, so every phone
// shows the same thing and nothing private can leak. Night deaths look the same whatever killed them
// (wolves or poison), as the text already does.
//
// New news first plays full-screen (a big card per outcome: the grave drops, the name is struck out),
// then each big card shrinks into its small card on the screen while the dark fades. No button press:
// it lands by itself, and a tap only makes it land sooner.
import { h, ROLE_LABEL } from './dom.js';
import { t, tr } from '../i18n.js';
import { roleSprite, propSprite } from './pixel.js';
import { ROLES } from '../game/roles.js';
import { playSfx } from './sfx.js';

const ROLE_BY_NAME = Object.fromEntries(Object.values(ROLES).map((r) => [r.name, r.id]));
const roleOf = (name) => (name ? ROLE_BY_NAME[name] ?? null : null);
const REVEAL = String.raw`(?: They were a ([\w' ]+)\.)?`;
const RULES = [
  [new RegExp(`^(.+?) was killed in the night\\.${REVEAL}$`), (m) => ({ type: 'night', name: m[1], role: roleOf(m[2]) })],
  [new RegExp(`^(.+?) was eliminated by vote\\.${REVEAL}$`), (m) => ({ type: 'vote', name: m[1], role: roleOf(m[2]) })],
  [/^Nobody died\.$/, () => ({ type: 'calm' })],
  [/^Nobody was eliminated\.$/, () => ({ type: 'tie' })],
  [/^(.+?) is the Prince! The village cannot eliminate them\.$/, (m) => ({ type: 'prince', name: m[1], role: 'prince' })],
  [/^(.+?) was the Jester!$/, (m) => ({ type: 'jester', name: m[1], role: 'jester' })],
  [/^(.+?) lowered the (?:bow|gun)\.$/, (m) => ({ type: 'spared', name: m[1] })],
  [new RegExp(`^(.+?) shot (.+?)\\.${REVEAL}$`), (m) => ({ type: 'shot', by: m[1], name: m[2], role: roleOf(m[3]) })],
  [/^Someone found a lucky horseshoe\.$/, () => ({ type: 'horseshoe' })],
];
const DEATHS = new Set(['night', 'vote', 'shot']);
const SFX = { night: 'nightDeath', vote: 'voteOut', shot: 'shot', calm: 'calm', tie: 'tie', prince: 'prince', jester: 'jester', spared: 'spared', horseshoe: 'event' };
const EVENTS = { horseshoe: 'horseshoe' }; // random-event card -> its picture
const CARD_MS = (i) => 450 + i * 1000; // when big card i starts (its --d)
const GRAVE_LANDS_MS = 420;             // fx-drop reaches the ground at 56% of .75s
const CONFETTI = Array.from({ length: 14 }, (_, i) => ['#f472b6', '#facc15', '#60a5fa', '#4ade80'][i % 4]);

export function parseLine(text) {
  for (const [re, make] of RULES) {
    const m = re.exec(text);
    if (m) return { ...make(m), text };
  }
  return { type: 'info', text };
}

// Lines as cards. "X was the Jester!" (said when roles stay hidden) folds into X's vote-out card.
export function parseLines(lines) {
  const out = [];
  for (const text of lines) {
    const e = parseLine(text);
    const twist = e.type === 'jester' && out.find((x) => x.type === 'vote' && x.name === e.name);
    if (twist) { twist.role = 'jester'; twist.jester = true; twist.text += ` ${text}`; continue; }
    out.push(e);
  }
  return out;
}

// Which sound each big card plays, and when (ms after the news arrives). A death sounds as its grave
// lands. A voted-out Jester (twist card, or role shown) gets the Jester sound instead of the vote one.
export function sfxPlan(cards) {
  return cards.map((e, i) => {
    const name = e.type === 'vote' && e.role === 'jester' ? 'jester' : SFX[e.type];
    return name ? { name, at: CARD_MS(i) + (DEATHS.has(e.type) ? GRAVE_LANDS_MS : 0) } : null;
  }).filter(Boolean);
}

// The whole screen is rebuilt on every view, so each line remembers that it was already shown and
// only plays the first time.
const seen = new Set();
export function resetFx() { seen.clear(); } // preview: play again

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// lines: view.announce. scope: changes every round and phase (e.g. "day:3").
export function fxAnnounce(view, lines, scope) {
  const events = parseLines(lines);
  const fresh = [];
  events.forEach((e, i) => {
    e.key = `${scope}:${i}:${e.text}`;
    if (!seen.has(e.key)) { seen.add(e.key); fresh.push(e); }
  });
  if (fresh.some((e) => DEATHS.has(e.type))) {
    try { navigator.vibrate?.([70, 90, 70, 90, 450]); } catch { /* iOS has no vibration */ }
  }
  const big = fresh.filter((e) => e.type !== 'info');
  const motion = !reducedMotion() && typeof document !== 'undefined';
  if (big.length && motion) takeover(view, big, scope);
  // With the full-screen cards each sound lands on its card; without them, one sound for the news.
  for (const s of motion ? sfxPlan(big) : sfxPlan(big).slice(0, 1).map((s) => ({ ...s, at: 0 }))) playSfx(s.name, s.at);
  return h('div', { class: 'fxlist', role: 'status' }, events.map((e) => card(view, e)));
}

function card(view, e, { big = false, index = 0 } = {}) {
  const you = e.name && e.name === view.you?.name;
  const death = DEATHS.has(e.type);
  const cls = ['fx', `fx-${e.type}`, death && 'fx-death', you && 'fx-you', e.jester && 'fx-twist', big && 'fx-big fx-play'].filter(Boolean).join(' ');
  const attrs = { class: cls, 'data-fxkey': e.key, style: `--d:${big ? CARD_MS(index) : 0}ms`, 'aria-label': tr(e.text) };
  if (e.type === 'info') return h('div', attrs, h('div', { class: 'fx-text' }, tr(e.text)));
  if (EVENTS[e.type]) { // a random event: picture, "Random event", then the line
    return h('div', { ...attrs, class: `${cls} fx-event` },
      h('div', { class: 'fx-prop' }, propSprite(EVENTS[e.type], { scale: 4 })),
      h('div', { class: 'fx-body' },
        h('div', { class: 'fx-kicker' }, t('fx.event')),
        h('div', { class: 'fx-text' }, tr(e.text))));
  }
  if (e.type === 'calm' || e.type === 'tie' || e.type === 'spared') {
    return h('div', attrs,
      h('div', { class: 'fx-prop' }, propSprite(e.type === 'calm' ? 'sun' : e.type === 'tie' ? 'scales' : 'bowdown', { scale: 4 })),
      h('div', { class: 'fx-text' }, tr(e.text)));
  }
  const kicker = e.type === 'night' ? t('fx.night') : e.type === 'vote' ? t('fx.vote')
    : e.type === 'shot' ? t('fx.shot', { name: e.by }) : e.type === 'prince' ? t('fx.prince') : t('fx.jester');
  const prop = death ? propSprite('grave', { scale: 4 }) : e.role ? roleSprite(e.role, { scale: 4 }) : null;
  return h('div', attrs,
    h('div', { class: 'fx-prop' }, prop, death && big && h('i', { class: 'fx-dust' }, h('b'), h('b'), h('b'), h('b'))),
    h('div', { class: 'fx-body' },
      h('div', { class: 'fx-kicker' }, kicker),
      h('div', { class: 'fx-name' }, e.name, you ? h('span', { class: 'fx-me' }, t('you')) : null),
      e.role && h('div', { class: 'fx-role' }, roleSprite(e.role, { scale: 1.5 }), ROLE_LABEL[e.role]),
      e.jester && h('div', { class: 'fx-twistline' }, t('fx.jesterTwist'))),
    e.jester && big && h('i', { class: 'confetti', 'aria-hidden': 'true' },
      CONFETTI.map((c, i) => h('b', { style: `--x:${(i * 37) % 96}%;--c:${c};--w:${(i % 4) * 110}ms` }))),
  );
}

// ---------- the full-screen moment ----------
// Lives on <body>, so screen rebuilds don't cut it off. Lands on its own after the cards have played.
const LAND_MS = 750;
let current = null;
function takeover(view, events, scope) {
  if (current) { clearTimeout(current.timer); current.remove(); }
  const calm = events.every((e) => !DEATHS.has(e.type) && e.type !== 'prince' && e.type !== 'jester');
  const caption = calm ? '' : events.every((e) => e.type === 'shot') ? t('fx.capShot')
    : scope.startsWith('vote') ? t('fx.capVote') : t('fx.capNight');
  const el = h('div', { class: `fx-takeover${calm ? ' calm' : ''}${events.length > 2 ? ' many' : ''}`, role: 'presentation', onClick: () => land(el) },
    h('div', { class: 'tk-bg' }),
    h('div', { class: 'tk-stage' },
      caption && h('div', { class: 'tk-cap' }, caption),
      events.map((e, i) => card(view, e, { big: true, index: i }))));
  document.body.append(el);
  current = el;
  el.timer = setTimeout(() => land(el), calm ? 1300 + events.length * 1000 : 450 + events.length * 1000 + 1600);
}

// Each big card shrinks into its small card while the dark fades: the card's box moves onto the small
// card's box, and its grave, name and role each fly to the same part of the small card.
const PARTS = ['.fx-prop', '.fx-kicker', '.fx-name', '.fx-role', '.fx-twistline', '.fx-text'];
function land(el) {
  if (el.landing) return;
  el.landing = true;
  clearTimeout(el.timer);
  const smalls = [...document.querySelectorAll('#app .fxlist .fx')];
  for (const a of el.getAnimations({ subtree: true })) { try { a.finish(); } catch { /* ignore */ } }
  // Measure everything before moving anything.
  const moves = [...el.querySelectorAll('.fx-big')].map((b) => {
    const target = smalls.find((s) => s.dataset.fxkey === b.dataset.fxkey);
    const parts = target ? PARTS.map((sel) => [b.querySelector(sel), target.querySelector(sel)]).filter(([x, y]) => x && y)
      .map(([x, y]) => ({ x, rA: x.getBoundingClientRect(), rB: y.getBoundingClientRect() })) : [];
    return { b, r1: b.getBoundingClientRect(), r2: target?.getBoundingClientRect(), target, parts };
  });
  el.classList.add('landing');
  const opts = { duration: LAND_MS, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' };
  for (const { b, r1, r2, target, parts } of moves) {
    Object.assign(b.style, { position: 'fixed', margin: '0', left: `${r1.left}px`, top: `${r1.top}px`, width: `${r1.width}px`, height: `${r1.height}px` });
    if (!target) { b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAND_MS / 2, fill: 'forwards' }); continue; }
    target.style.visibility = 'hidden';
    for (const k of b.children) k.style.visibility = 'hidden';
    b.animate([
      { left: `${r1.left}px`, top: `${r1.top}px`, width: `${r1.width}px`, height: `${r1.height}px`, borderRadius: '18px' },
      { left: `${r2.left}px`, top: `${r2.top}px`, width: `${r2.width}px`, height: `${r2.height}px`, borderRadius: '14px' },
    ], opts);
    // The flying parts live in a layer with the big card's classes (so they keep its look) but no box.
    const layer = h('div', { class: `${b.className} tk-parts` });
    el.append(layer);
    for (const { x, rA, rB } of parts) {
      const c = x.cloneNode(true);
      Object.assign(c.style, { visibility: 'visible', position: 'fixed', margin: '0', left: `${rA.left}px`, top: `${rA.top}px`, width: `${rA.width}px`, height: `${rA.height}px`, transformOrigin: '0 0' });
      layer.append(c);
      // One scale for both axes (text keeps its shape), lined up on the small card's left edge.
      c.animate([{ transform: 'none' }, { transform: `translate(${rB.left - rA.left}px, ${rB.top - rA.top}px) scale(${rB.height / rA.height})` }], opts);
    }
  }
  setTimeout(() => {
    for (const { target } of moves) if (target) target.style.visibility = '';
    el.remove();
    if (current === el) current = null;
  }, LAND_MS + 40);
}
