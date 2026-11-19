// Say: a living player posts one preset line to the table talk. UI only. A small chip in the talk header
// opens a bottom sheet (no text box): tap a sentence, and for a sentence that names someone, tap who.
// The line is sent as the `say` action and lands in the same public feed as bot talk, with the same weight.
// The menu is the same for every role and every table, so it never shows who has a power or what the bots are.
import { h } from './dom.js';
import { t } from '../i18n.js';
import { CHAT, CHAT_PER_ROUND, HUMAN_KEYS } from '../game/chat.js';
import { BOT_TAG } from '../game/setup.js';

const short = (name) => (name?.endsWith(BOT_TAG) ? name.slice(0, -BOT_TAG.length) : name ?? '?');

// You may talk while you are alive, in the day and while the vote is open (the same window the engine allows).
export function canSay(view) {
  if (!view?.you?.alive) return false;
  return view.phase === 'day' || (view.phase === 'vote' && !view.voteResult && !!view.prompt && !view.prompt.haunt);
}

export function linesLeft(view) {
  const mine = (view.chat ?? []).filter((c) => c.by === view.you.id && c.round === view.round).length;
  return Math.max(0, CHAT_PER_ROUND - mine);
}

// The small control in the talk header. null when you can't talk right now.
export function sayChip(view, ctx) {
  if (!canSay(view)) return null;
  const open = () => { ctx.ui.sayOpen = true; ctx.ui.sayKey = null; ctx.rerender(); };
  return h('button', { type: 'button', class: 'talk-say', onClick: open, 'aria-haspopup': 'dialog' }, t('chat.say'));
}

// The sheet (main.js adds it on top of the screen while ctx.ui.sayOpen). Returns the backdrop and the sheet, or null.
export function saySheet(view, ctx) {
  const ui = ctx.ui;
  const on = !!ui.sayOpen && canSay(view);
  if (!on) { ui.sayOpen = false; ui.sayKey = null; return null; }
  document.documentElement.classList.add('sheet-open'); // the page behind does not scroll; talkSheet clears it when neither is open
  const close = () => { ui.sayOpen = false; ui.sayKey = null; ctx.rerender(); };
  const send = (key, ids) => {
    ui.sayOpen = false; ui.sayKey = null;
    ctx.send('say', { key, variant: 0, ids });
    ctx.rerender();
  };
  const left = linesLeft(view);
  const others = view.players.filter((p) => p.alive && p.id !== view.you.id && !p.kicked);
  const dots = '___'; // the blank where a name goes
  const textOf = (key) => t(`chat.${key}.0`, { a: dots });

  let body;
  if (ui.sayKey && CHAT[ui.sayKey]?.ids === 1) {
    // Step 2: who is it about?
    const key = ui.sayKey;
    body = [
      h('p', { class: 'say-line-preview' }, textOf(key)),
      h('p', { class: 'sub small say-who' }, t('chat.sayWho')),
      h('ul', { class: 'say-list' }, others.map((p) =>
        h('li', null, h('button', { type: 'button', class: 'btn say-pick', onClick: () => send(key, [p.id]) }, short(p.name))))),
      h('button', { type: 'button', class: 'btn', onClick: () => { ui.sayKey = null; ctx.rerender(); } }, t('chat.sayBack')),
    ];
  } else {
    // Step 1: pick a sentence.
    body = [
      h('p', { class: 'sub small say-left' }, t('chat.sayLeft', { n: left })),
      h('ul', { class: 'say-list' }, HUMAN_KEYS.map((key) => {
        const needsName = CHAT[key].ids === 1;
        const disabled = left === 0 || (needsName && !others.length);
        return h('li', null, h('button', {
          type: 'button', class: 'btn say-line', disabled,
          onClick: () => (needsName ? (() => { ui.sayKey = key; ctx.rerender(); })() : send(key, [])),
        }, textOf(key)));
      })),
      h('button', { type: 'button', class: 'btn', onClick: close }, t('chat.close')),
    ];
  }
  return [
    h('div', { class: 'sheet-backdrop', onClick: close }),
    h('div', { class: 'sheet say-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'say-title' },
      h('h3', { id: 'say-title' }, t('chat.sayTitle')),
      ...body),
  ];
}
