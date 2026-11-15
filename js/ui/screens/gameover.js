import { h, ROLE_LABEL } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { roleSprite } from '../pixel.js';

export function gameoverScreen(view, ctx) {
  const wolves = view.winner === 'wolves'; const jester = view.winner === 'jester'; const ended = view.winner === 'ended';
  const me = view.you;
  const won = (me.team === view.winner);
  return h('main', { class: 'screen gameover' },
    h('h1', { class: ended ? '' : wolves ? 'wolfwin' : jester ? 'jesterwin' : 'villwin' },
      ended ? t('over.ended') : wolves ? t('over.wolves') : jester ? t('over.jester') : t('over.village')),
    !ended && h('p', { class: 'sub' }, won ? t('over.won') : t('over.lost')),
    h('ul', { class: 'players' }, view.players.map((p) =>
      h('li', null, h('div', { class: `player${p.alive ? '' : ' dead'}` },
        h('span', { class: 'pname' }, p.name, p.id === me.id ? t('you') : ''),
        roleSprite(p.role, { scale: 2 }),
        h('span', { class: `tag role${p.role === 'werewolf' || p.role === 'wolfcub' ? ' wolf' : ''}` }, ROLE_LABEL[p.role]))))),
    h('h3', null, t('over.happened')),
    ...historyBlocks(view),
    view.isHost
      ? h('button', { class: 'btn primary', onClick: () => ctx.send('playAgain') }, t('over.again'))
      : h('p', { class: 'sub' }, t('over.waiting')),
  );
}

// Full detail, grouped under Night N / Day N headings. Falls back to the public log if no history was sent.
function historyBlocks(view) {
  if (!view.history?.length) return [h('ul', { class: 'log' }, view.log.map((l) => h('li', null, tr(l.text))))];
  const groups = [];
  for (const e of view.history) {
    const key = e.kind === 'end' ? 'end' : `${e.kind}${e.round}`;
    let g = groups.at(-1);
    if (!g || g.key !== key) { g = { key, e, items: [] }; groups.push(g); }
    g.items.push(e.text);
  }
  return groups.flatMap((g) => [
    g.e.kind === 'end' ? null : h('h4', null, t(g.e.kind === 'night' ? 'night.title' : 'day.title', { n: g.e.round })),
    h('ul', { class: 'log' }, g.items.map((x) => h('li', null, tr(x)))),
  ]).filter(Boolean);
}
