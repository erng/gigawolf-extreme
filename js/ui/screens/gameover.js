import { h, ROLE_LABEL } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { roleSprite } from '../pixel.js';

export function gameoverScreen(view, ctx) {
  const wolves = view.winner === 'wolves'; const jester = view.winner === 'jester';
  const me = view.you;
  const won = (me.team === view.winner);
  return h('main', { class: 'screen gameover' },
    h('h1', { class: wolves ? 'wolfwin' : jester ? 'jesterwin' : 'villwin' }, wolves ? t('over.wolves') : jester ? t('over.jester') : t('over.village')),
    h('p', { class: 'sub' }, won ? t('over.won') : t('over.lost')),
    h('ul', { class: 'players' }, view.players.map((p) =>
      h('li', null, h('div', { class: `player${p.alive ? '' : ' dead'}` },
        h('span', { class: 'pname' }, p.name, p.id === me.id ? t('you') : ''),
        roleSprite(p.role, { scale: 2 }),
        h('span', { class: `tag role${p.role === 'werewolf' || p.role === 'wolfcub' ? ' wolf' : ''}` }, ROLE_LABEL[p.role]))))),
    h('h3', null, t('over.happened')),
    h('ul', { class: 'log' }, view.log.map((l) => h('li', null, tr(l.text)))),
    view.isHost
      ? h('button', { class: 'btn primary', onClick: () => ctx.send('playAgain') }, t('over.again'))
      : h('p', { class: 'sub' }, t('over.waiting')),
  );
}
