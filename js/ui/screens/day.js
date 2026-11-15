import { h, playerList } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';

export function dayScreen(view, ctx) {
  const last = view.log.at(-1)?.text ?? '';
  return h('main', { class: 'screen day' },
    h('div', { class: 'phase' }, t('day.title', { n: view.round })),
    h('div', { class: 'announce', role: 'status' }, (view.announce?.length ? view.announce : [last]).map((l) => h('h2', null, tr(l)))),
    view.you.private.promoted && h('div', { class: 'card result' }, t('role.promoted')),
    h('p', { class: 'sub' }, t('day.sub')),
    playerList(view),
    hostAdvance(view, ctx),
  );
}
