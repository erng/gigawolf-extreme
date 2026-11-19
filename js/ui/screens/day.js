import { h, playerList } from '../dom.js';
import { t } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';
import { fxAnnounce } from '../fx.js';
import { talkFeed } from '../talk.js';

export function dayScreen(view, ctx) {
  // Round 0: the talk before the first night. Nobody has died, nothing is announced and there is no vote.
  if (view.round === 0) {
    return h('main', { class: 'screen day' },
      h('div', { class: 'phase' }, t('day.title0')),
      h('p', { class: 'sub' }, t('day.sub0')),
      talkFeed(view, ctx),
      playerList(view),
      hostAdvance(view, ctx),
    );
  }
  const last = view.log.at(-1)?.text ?? '';
  return h('main', { class: 'screen day' },
    h('div', { class: 'phase' }, t('day.title', { n: view.round })),
    fxAnnounce(view, view.announce?.length ? view.announce : [last], `day:${view.round}`),
    view.you.private.promoted && h('div', { class: 'card result' }, t('role.promoted')),
    view.you.private.horseshoe?.fresh && h('div', { class: 'card result' }, t(view.you.private.horseshoe.used ? 'horseshoe.used' : 'horseshoe.found')),
    h('p', { class: 'sub' }, t('day.sub')),
    talkFeed(view, ctx),
    playerList(view),
    hostAdvance(view, ctx),
  );
}
