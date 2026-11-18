import { h, playerList } from '../dom.js';
import { t } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';
import { fxAnnounce } from '../fx.js';

export function dayScreen(view, ctx) {
  const last = view.log.at(-1)?.text ?? '';
  return h('main', { class: 'screen day' },
    h('div', { class: 'phase' }, t('day.title', { n: view.round })),
    fxAnnounce(view, view.announce?.length ? view.announce : [last], `day:${view.round}`),
    view.you.private.promoted && h('div', { class: 'card result' }, t('role.promoted')),
    h('p', { class: 'sub' }, t('day.sub')),
    playerList(view),
    hostAdvance(view, ctx),
  );
}
