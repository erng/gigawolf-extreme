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


export function playerList(view, { selectable = [], selected = null, onPick, tags = {}, showRole = false } = {}) {
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
      !p.alive && h('span', { class: 'tag' }, t('dead')),
      p.role && (showRole || !p.alive || p.revealed) && roleSprite(p.role, { scale: 2 }),
      p.role && (showRole || !p.alive || p.revealed) && h('span', { class: 'tag role' }, ROLE_LABEL[p.role]),
      (tags[p.id] ?? []).map((t) => h('span', { class: 'tag wolf' }, t)),
    );
    return h('li', null, row);
  }));
}
