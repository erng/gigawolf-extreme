import { h, ROLE_LABEL, ROLE_BLURB } from '../dom.js';
import { t } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';
import { roleSprite } from '../pixel.js';

export function revealScreen(view, ctx) {
  const me = view.you; const ui = ctx.ui;
  const mates = me.private.teammates ?? [];
  const meP = view.players.find((p) => p.id === me.id);
  const readyCount = view.players.filter((p) => p.ready).length;
  const card = h('div', { class: `rolecard${ui.holding ? ' shown' : ''}`, id: 'rolecard', tabindex: '0', role: 'button', 'aria-label': t('reveal.hold'),
      onPointerdown: (e) => { e.preventDefault(); ctx.hold(true); },
      onKeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') ctx.hold(true); },
      onKeyup: () => ctx.hold(false),
      onContextmenu: (e) => e.preventDefault() },
    h('div', { class: 'front' }, t('reveal.hold')),
    h('div', { class: `back role-${me.role}` },
      roleSprite(me.role, { scale: 8 }),
      h('div', { class: 'rolename' }, ROLE_LABEL[me.role]),
      h('p', { class: 'roledesc' }, ROLE_BLURB[me.role]),
      mates.length > 0 && h('p', { class: 'mates' }, t('reveal.pack'), mates.map((t) => t.name).join(', ')),
    ));
  return h('main', { class: 'screen reveal' },
    h('h2', null, t('reveal.title')),
    card,
    h('p', { class: 'sub' }, t('reveal.privacy')),
    meP.ready
      ? h('p', { class: 'sub' }, t('reveal.waiting', { a: readyCount, b: view.players.length }))
      : h('button', { class: 'btn primary', onClick: () => ctx.send('ready') }, t('reveal.ready')),
    hostAdvance(view, ctx),
  );
}
