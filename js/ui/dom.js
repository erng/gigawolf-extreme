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

export const ROLE_LABEL = { villager: 'Villager', werewolf: 'Werewolf', seer: 'Seer', bodyguard: 'Bodyguard' };
export const ROLE_BLURB = {
  villager: 'Find the wolves. You have no night power.',
  werewolf: 'Pick a victim each night with your pack. Do not get caught.',
  seer: 'Each night, learn if one player is a werewolf.',
  bodyguard: 'Each night, protect one player from the wolves.',
};


export function playerList(view, { selectable = [], selected = null, onPick, tags = {}, showRole = false } = {}) {
  return h('ul', { class: 'players', role: 'list' }, view.players.map((p) => {
    const can = selectable.includes(p.id);
    const row = h(can ? 'button' : 'div', {
      class: `player${p.alive ? '' : ' dead'}${selected === p.id ? ' selected' : ''}${can ? ' pick' : ''}`,
      type: can ? 'button' : null,
      'aria-pressed': can ? String(selected === p.id) : null,
      onClick: can ? () => onPick(p.id) : null,
    },
      h('span', { class: `dot ${p.connected ? 'on' : 'off'}`, title: p.connected ? 'connected' : 'reconnecting' }),
      h('span', { class: 'pname' }, p.name, p.id === view.you.id ? ' (you)' : ''),
      !p.alive && h('span', { class: 'tag' }, 'dead'),
      p.role && (showRole || !p.alive) && h('span', { class: 'tag role' }, ROLE_LABEL[p.role]),
      (tags[p.id] ?? []).map((t) => h('span', { class: 'tag wolf' }, t)),
    );
    return h('li', null, row);
  }));
}
