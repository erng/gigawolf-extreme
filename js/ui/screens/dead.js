import { h, playerList } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';
import { fxAnnounce } from '../fx.js';
import { talkFeed } from '../talk.js';


export function deadScreen(view, ctx) {
  return h('main', { class: 'screen dead' },
    h('h2', null, t('dead.title')),
    h('p', { class: 'sub' }, t('dead.sub')),
    h('div', { class: 'phase' }, `${t('phase.' + view.phase)}${view.round ? ' ' + view.round : ''}`),
    // Dawn news (including your own death) gets the same cards as the living see.
    view.phase === 'day' && view.announce?.length ? fxAnnounce(view, view.announce, `day:${view.round}`) : null,
    hostAdvance(view, ctx),
    (view.phase === 'day' || (view.phase === 'vote' && !view.voteResult)) && talkFeed(view, { limit: 6 }),
    playerList(view),
    h('h3', null, t('dead.log')),
    h('ul', { class: 'log' }, view.log.length ? view.log.map((l) => h('li', null, tr(l.text))) : h('li', null, t('dead.nothing'))),
  );
}
