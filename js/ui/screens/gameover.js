import { h, ROLE_LABEL } from '../dom.js';

export function gameoverScreen(view, ctx) {
  const wolves = view.winner === 'wolves';
  const me = view.you;
  const won = (me.team === view.winner);
  return h('main', { class: 'screen gameover' },
    h('h1', { class: wolves ? 'wolfwin' : 'villwin' }, wolves ? 'The wolves win!' : 'The village wins!'),
    h('p', { class: 'sub' }, won ? 'Your team won.' : 'Your team lost.'),
    h('ul', { class: 'players' }, view.players.map((p) =>
      h('li', null, h('div', { class: `player${p.alive ? '' : ' dead'}` },
        h('span', { class: 'pname' }, p.name, p.id === me.id ? ' (you)' : ''),
        h('span', { class: `tag role${p.role === 'werewolf' ? ' wolf' : ''}` }, ROLE_LABEL[p.role]))))),
    h('h3', null, 'What happened'),
    h('ul', { class: 'log' }, view.log.map((l) => h('li', null, l.text))),
    view.isHost
      ? h('button', { class: 'btn primary', onClick: () => ctx.send('playAgain') }, 'Play again')
      : h('p', { class: 'sub' }, 'Waiting for the host to start another game…'),
  );
}
