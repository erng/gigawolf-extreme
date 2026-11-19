// Bot table talk on the day and vote screens. UI only: it reads view.chat, which every phone gets in full
// (the lines are public, like someone talking out loud at the table).
import { h } from './dom.js';
import { t } from '../i18n.js';
import { BOT_TAG } from '../game/setup.js';

const SEER = new Set(['claimWolf', 'claimClean', 'reportWolf', 'reportClean', 'counter']);
const short = (name) => (name?.endsWith(BOT_TAG) ? name.slice(0, -BOT_TAG.length) : name ?? '?');
let shown = { round: -1, seq: 0 }; // lines already on screen, so only new ones pop in
// Where the feed is scrolled. Screens are rebuilt on every view, so the feed puts itself back: at the newest
// line while the reader is at the bottom, otherwise where they left it (until the next round).
let scroll = { round: -1, top: 0, stick: true, unread: false };

export function chatAuthor(view, c) { return short(view.players.find((p) => p.id === c.by)?.name); }

// The words of one line in this phone's language.
export function chatText(view, c) {
  const args = {};
  c.ids.forEach((id, i) => { args['ab'[i]] = short(view.players.find((p) => p.id === id)?.name); }); // the (bot) tag would repeat on every line
  return t(`chat.${c.key}.${c.v}`, args);
}

// The whole round's feed, newest last, in a box that scrolls. Nothing at all when no bot can talk.
// short: a lower box, for screens where the player list must stay in view (the vote).
export function talkFeed(view, { short: low = false } = {}) {
  if (view.settings?.dumbBots || !view.players.some((p) => p.persona)) return null;
  const lines = (view.chat ?? []).filter((c) => c.round === view.round);
  if (shown.round !== view.round) shown = { round: view.round, seq: 0 };
  if (scroll.round !== view.round) scroll = { round: view.round, top: 0, stick: true, unread: false };
  const seen = shown.seq;
  shown.seq = Math.max(seen, lines.at(-1)?.seq ?? 0);
  if (!lines.length) return h('section', { class: 'talk', 'aria-label': t('chat.title') }, h('h3', null, t('chat.title')), h('p', { class: 'sub small' }, t('chat.empty')));
  if (!scroll.stick && lines.at(-1).seq > seen) scroll.unread = true; // new lines below where the reader is
  const jump = h('button', { type: 'button', class: 'talk-new', hidden: !scroll.unread, onClick: () => { scroll.stick = true; scroll.unread = false; jump.hidden = true; list.scrollTop = list.scrollHeight; } }, t('chat.newLines'));
  const list = h('ol', {
    class: 'bubbles', 'aria-live': 'polite', tabindex: '0', 'aria-label': t('chat.title'),
    onScroll: () => {
      scroll.top = list.scrollTop;
      scroll.stick = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
      if (scroll.stick) { scroll.unread = false; jump.hidden = true; }
    },
  }, lines.map((c) =>
    h('li', { class: `bubble${SEER.has(c.key) ? ' seer' : ''}${c.seq > seen ? ' new' : ''}` },
      h('strong', null, chatAuthor(view, c)), ' ', chatText(view, c))));
  // The screen is attached right after it is built: put the scroll back before the frame is drawn.
  const { stick, top } = scroll;
  requestAnimationFrame(() => { list.scrollTop = stick ? list.scrollHeight : top; scroll.stick = stick; });
  return h('section', { class: `talk${low ? ' short' : ''}`, 'aria-label': t('chat.title') },
    h('h3', null, t('chat.title')),
    h('div', { class: 'talk-box' }, list, jump));
}
