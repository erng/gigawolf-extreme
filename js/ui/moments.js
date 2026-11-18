// Full-screen moments for nightfall and the end of the game (wolves, village or Jester). Same pattern as the outcome takeover in
// fx.js: lives on <body>, fades away by itself, a tap only ends it sooner. Public moments only: every
// phone shows the same thing (at game over every role is public).
import { h } from './dom.js';
import { t } from '../i18n.js';
import { roleSprite, propSprite } from './pixel.js';
import { teamOf } from '../game/roles.js';

const HOLD = { nightfall: 2800, wolves: 4600, village: 4600, jester: 4600 };
let current = null;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Same stars every time: an even spread (Halton sequence), not random.
const halton = (i, b) => { let f = 1; let r = 0; for (let n = i; n > 0; n = Math.floor(n / b)) { f /= b; r += f * (n % b); } return r; };
const STARS = Array.from({ length: 46 }, (_, i) => ({ x: Math.round(halton(i + 1, 2) * 98), y: Math.round(halton(i + 1, 3) * 64), s: 1 + (i % 3), d: (i * 173) % 1600 }));
const stars = () => h('div', { class: 'mo-stars' }, STARS.map((st) =>
  h('b', { style: `left:${st.x}%;top:${st.y}%;width:${st.s + 1}px;height:${st.s + 1}px;--tw:${st.d}ms` })));

// Paper confetti for the Jester's moment: an even spread across the width, each piece on its own delay.
const CONFETTI = ['#e0556b', '#2fb5b0', '#ffe14d', '#f472b6'];
const confetti = () => h('div', { class: 'mo-confetti', 'aria-hidden': 'true' }, Array.from({ length: 36 }, (_, i) =>
  h('b', { style: `left:${Math.round(halton(i + 1, 5) * 100)}%;--c:${CONFETTI[i % CONFETTI.length]};--d:${(i * 97) % 1800}ms;--s:${5 + (i % 3) * 2}px` })));

function team(view, side) {
  const list = view.players.filter((p) => p.role && teamOf(p.role) === side);
  const shown = list.slice(0, 8);
  return h('div', { class: 'mo-team' },
    shown.map((p, i) => h('div', { class: `mo-member${p.alive ? '' : ' dead'}`, style: `--i:${i}`, 'data-name': p.name }, roleSprite(p.role, { scale: 3 }), h('span', null, p.name))),
    list.length > shown.length && h('div', { class: 'mo-more' }, `+${list.length - shown.length}`));
}

function scene(kind, view) {
  if (kind === 'nightfall') {
    // Dusk falls on the screen, the town's windows go dark, the moon rises.
    return [h('div', { class: 'mo-sky' }), stars(), h('div', { class: 'mo-moon' }, propSprite('moon', { scale: 6 })),
      h('div', { class: 'mo-town' }, Array.from({ length: 9 }, (_, i) => h('i', { style: `--i:${i}` }))),
      h('div', { class: 'mo-title' }, h('div', { class: 'mo-big' }, t('night.title', { n: view.round })))];
  }
  if (kind === 'wolves') {
    // The moon turns to blood, then the pack.
    return [h('div', { class: 'mo-sky' }), stars(),
      h('div', { class: 'mo-moonwrap' }, h('div', { class: 'mo-white' }, propSprite('moon', { scale: 9 })), h('div', { class: 'mo-red' }, propSprite('bloodmoon', { scale: 9 }))),
      h('div', { class: 'mo-title' }, h('div', { class: 'mo-big' }, t('over.wolves'))), team(view, 'wolves')];
  }
  if (kind === 'jester') {
    // The curtains part on a lit stage, confetti falls and the Jester dances. The curtains come last in the
    // list so they cover everything until they open.
    return [h('div', { class: 'mo-sky' }), h('div', { class: 'mo-spot' }), confetti(),
      h('div', { class: 'mo-hero' }, roleSprite('jester', { scale: 9 })),
      h('div', { class: 'mo-title' }, h('div', { class: 'mo-big' }, t('over.jester'))), team(view, 'jester'),
      h('div', { class: 'mo-curtain mo-left' }), h('div', { class: 'mo-curtain mo-right' })];
  }
  // The night sky turns to dawn and the sun rises, then the villagers hop.
  return [h('div', { class: 'mo-sky' }), h('div', { class: 'mo-dawn' }), stars(), h('div', { class: 'mo-sun' }, propSprite('sun', { scale: 7 })),
    h('div', { class: 'mo-title' }, h('div', { class: 'mo-big' }, t('over.village'))), team(view, 'village')];
}

// kind: 'nightfall' | 'wolves' | 'village' | 'jester'.
export function playMoment(kind, view) {
  if (reducedMotion() || typeof document === 'undefined') return;
  if (current) { clearTimeout(current.timer); current.remove(); }
  const el = h('div', { class: `mo mo-${kind}`, role: 'presentation', onClick: () => end(el) }, scene(kind, view));
  document.body.append(el);
  current = el;
  el.timer = setTimeout(() => end(el), HOLD[kind]);
}

// Ends by folding into the screen underneath: the big title flies onto the screen's own heading
// ("Night 2" label, game-over title) and each team sprite onto that player's row, while the sky fades.
const FOLD_MS = 800;
function end(el) {
  if (el.ending) return;
  el.ending = true;
  clearTimeout(el.timer);
  for (const a of el.getAnimations({ subtree: true })) { try { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish(); } catch { /* ignore */ } }
  const app = document.getElementById('app');
  const pairs = [];
  const title = el.querySelector('.mo-big');
  const heading = app?.querySelector(el.classList.contains('mo-nightfall') ? '.phase' : 'h1');
  if (title && heading) pairs.push({ from: title, to: heading, text: true });
  const rows = [...(app?.querySelectorAll('.players .player') ?? [])];
  for (const m of el.querySelectorAll('.mo-member')) {
    const row = rows.find((r) => r.querySelector('.pname')?.firstChild?.textContent === m.dataset.name);
    const sprite = row?.querySelector('.sprite');
    if (sprite) pairs.push({ from: m.querySelector('.sprite'), to: sprite });
  }
  // Measure everything before moving anything.
  const moves = pairs.map((x) => ({ ...x, rA: x.from.getBoundingClientRect(), rB: x.to.getBoundingClientRect() }));
  const layer = h('div', { class: `${[...el.classList].filter((c) => c !== 'mo').join(' ')} mo-layer`, 'aria-hidden': 'true' });
  document.body.append(layer);
  const opts = { duration: FOLD_MS, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' };
  for (const { from, to, rA, rB, text } of moves) {
    const c = from.cloneNode(true);
    Object.assign(c.style, { position: 'fixed', margin: '0', left: `${rA.left}px`, top: `${rA.top}px`, width: `${rA.width}px`, height: `${rA.height}px`, transformOrigin: '50% 50%' });
    layer.append(c);
    from.style.visibility = 'hidden';
    const s = text ? parseFloat(getComputedStyle(to).fontSize) / parseFloat(getComputedStyle(from).fontSize) : rB.width / rA.width;
    const dx = rB.left + rB.width / 2 - (rA.left + rA.width / 2);
    const dy = rB.top + rB.height / 2 - (rA.top + rA.height / 2);
    c.animate([{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.65 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: text ? 0 : 1 }], opts);
    // The real heading fades in under the flying title, so its own colour and wrapping take over.
    if (text) to.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: FOLD_MS });
    else to.style.visibility = 'hidden';
  }
  el.classList.add('out');
  setTimeout(() => {
    for (const { to, text } of moves) if (!text) to.style.visibility = '';
    layer.remove(); el.remove();
    if (current === el) current = null;
  }, FOLD_MS + 40);
}

// The hunter's last shot, as everyone else waits: a crosshair drifts over the players. Not secret: the
// whole table sees the shot screen.
export function aimArt(list) {
  return h('div', { class: 'aim-wrap' }, list, h('div', { class: 'aim-cross', 'aria-hidden': 'true' }, propSprite('crosshair', { scale: 4 })));
}
