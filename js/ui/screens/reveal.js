import { h, ROLE_LABEL, ROLE_BLURB } from '../dom.js';

export function revealScreen(view, ctx) {
  const me = view.you; const ui = ctx.ui;
  const mates = me.private.teammates ?? [];
  const meP = view.players.find((p) => p.id === me.id);
  const readyCount = view.players.filter((p) => p.ready).length;
  const card = h('div', { class: `rolecard${ui.holding ? ' shown' : ''}`, id: 'rolecard', tabindex: '0', role: 'button', 'aria-label': 'Press and hold to see your role',
      onPointerdown: (e) => { e.preventDefault(); ctx.hold(true); },
      onKeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') ctx.hold(true); },
      onKeyup: () => ctx.hold(false),
      onContextmenu: (e) => e.preventDefault() },
    h('div', { class: 'front' }, 'Press and hold', h('br'), 'to see your role'),
    h('div', { class: `back role-${me.role}` },
      h('div', { class: 'rolename' }, ROLE_LABEL[me.role]),
      h('p', null, ROLE_BLURB[me.role]),
      mates.length > 0 && h('p', { class: 'mates' }, 'Your pack: ', mates.map((t) => t.name).join(', ')),
    ));
  return h('main', { class: 'screen reveal' },
    h('h2', null, 'Your role'),
    card,
    h('p', { class: 'sub' }, 'Make sure nobody is looking over your shoulder.'),
    meP.ready
      ? h('p', { class: 'sub' }, `Waiting for others… (${readyCount}/${view.players.length} ready)`)
      : h('button', { class: 'btn primary', onClick: () => ctx.send('ready') }, 'Ready'),
    h('div', { class: 'timer', 'data-deadline': view.deadline ?? '' }),
  );
}
