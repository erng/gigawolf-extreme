import { roleSprite } from './pixel.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

import { t } from '../i18n.js';

export const ROLE_LABEL = new Proxy({}, { get: (_, r) => t(`role.${String(r)}`) });
export const ROLE_BLURB = new Proxy({}, { get: (_, r) => t(`blurb.${String(r)}`) });


export function playerList(view, { selectable = [], selected = null, onPick, tags = {}, showRole = false, actions = null } = {}) {
  return h('ul', { class: 'players', role: 'list' }, view.players.map((p) => {
    const can = selectable.includes(p.id);
    const row = h(can ? 'button' : 'div', {
      class: `player${p.alive ? '' : ' dead'}${selected === p.id ? ' selected' : ''}${can ? ' pick' : ''}`,
      type: can ? 'button' : null,
      'aria-pressed': can ? String(selected === p.id) : null,
      onClick: can ? () => onPick(p.id) : null,
    },
      h('span', { class: `dot ${p.connected ? 'on' : 'off'}`, title: p.connected ? t('connected') : t('reconnecting') }),
      h('span', { class: 'pname' }, p.name, p.id === view.you.id ? t('you') : ''),
      !p.alive && h('span', { class: 'tag' }, p.kicked ? t('removed') : t('dead')),
      p.role && (showRole || !p.alive || p.revealed) && roleSprite(p.role, { scale: 2 }),
      p.role && (showRole || !p.alive || p.revealed) && h('span', { class: 'tag role' }, ROLE_LABEL[p.role]),
      p.persona && p.alive && h('span', { class: 'tag persona' }, t(`persona.${p.persona}`)),
      (tags[p.id] ?? []).map((t) => h('span', { class: 'tag wolf' }, t)),
    );
    const extra = actions ? actions(p) : null;
    return h('li', extra ? { class: 'withaction' } : null, row, extra);
  }));
}

// Host-only Remove control for one player: the first tap asks to confirm. Used in the lobby and in the
// Manage players sheet. The removed phone can come back, which is what a stuck phone needs.
export function kickControls(p, ctx) {
  if (ctx.ui.kickAsk !== p.id) {
    return h('button', { class: 'btn small kickbtn', type: 'button', 'aria-label': `${t('host.kick')} ${p.name}`,
      onClick: () => { ctx.ui.kickAsk = p.id; ctx.rerender(); } }, t('host.kick'));
  }
  return h('div', { class: 'kickask' },
    h('button', { class: 'btn small danger', type: 'button', onClick: () => { ctx.ui.kickAsk = null; ctx.send('kick', { targetId: p.id }); } }, t('host.kickConfirm')),
    h('button', { class: 'btn small', type: 'button', onClick: () => { ctx.ui.kickAsk = null; ctx.rerender(); } }, t('host.kickCancel')));
}
