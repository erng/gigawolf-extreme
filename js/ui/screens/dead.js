import { h, playerList } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';


export function deadScreen(view, ctx) {
  return h('main', { class: 'screen dead' },
    h('h2', null, t('dead.title')),
    h('p', { class: 'sub' }, t('dead.sub')),
    h('div', { class: 'phase' }, `${t('phase.' + view.phase)}${view.round ? ' ' + view.round : ''}`),
    hostAdvance(view, ctx),
    playerList(view),
    h('h3', null, t('dead.log')),
    h('ul', { class: 'log' }, view.log.length ? view.log.map((l) => h('li', null, tr(l.text))) : h('li', null, t('dead.nothing'))),
  );
}
