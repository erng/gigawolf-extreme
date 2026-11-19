// Bot table talk on the day and vote screens. UI only: it reads view.chat, which every phone gets in full
// (the lines are public, like someone talking out loud at the table).
import { h } from './dom.js';
import { t } from '../i18n.js';
import { BOT_TAG } from '../game/setup.js';

const SEER = new Set(['claimWolf', 'claimClean', 'reportWolf', 'reportClean', 'counter']);
const short = (name) => (name?.endsWith(BOT_TAG) ? name.slice(0, -BOT_TAG.length) : name ?? '?');
let shown = { round: -1, seq: 0 }; // lines already on screen, so only new ones pop in

export function chatAuthor(view, c) { return short(view.players.find((p) => p.id === c.by)?.name); }

// The words of one line in this phone's language.
export function chatText(view, c) {
  const args = {};
  c.ids.forEach((id, i) => { args['ab'[i]] = short(view.players.find((p) => p.id === id)?.name); }); // the (bot) tag would repeat on every line
  return t(`chat.${c.key}.${c.v}`, args);
}

// The feed for the current round, newest last. Nothing at all when no bot can talk.
export function talkFeed(view, { limit = 8 } = {}) {
  if (view.settings?.dumbBots || !view.players.some((p) => p.persona)) return null;
  const lines = (view.chat ?? []).filter((c) => c.round === view.round).slice(-limit);
  if (shown.round !== view.round) shown = { round: view.round, seq: 0 };
  const seen = shown.seq;
  shown.seq = Math.max(seen, lines.at(-1)?.seq ?? 0);
  return h('section', { class: 'talk', 'aria-label': t('chat.title') },
    h('h3', null, t('chat.title')),
    lines.length
      ? h('ol', { class: 'bubbles', 'aria-live': 'polite' }, lines.map((c) =>
          h('li', { class: `bubble${SEER.has(c.key) ? ' seer' : ''}${c.seq > seen ? ' new' : ''}` },
            h('strong', null, chatAuthor(view, c)), ' ', chatText(view, c))))
      : h('p', { class: 'sub small' }, t('chat.empty')));
}
