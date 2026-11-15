import { h, playerList } from '../dom.js';

const LABEL = { night: 'Night', day: 'Day', vote: 'Vote', reveal: 'Role reveal' };

export function deadScreen(view) {
  return h('main', { class: 'screen dead' },
    h('h2', null, 'You are out'),
    h('p', { class: 'sub' }, 'Spectating. Keep the secrets, no talking about the game with the living!'),
    h('div', { class: 'phase' }, `${LABEL[view.phase] ?? view.phase}${view.round ? ' ' + view.round : ''}`,
      h('div', { class: 'timer', 'data-deadline': view.deadline ?? '' })),
    playerList(view),
    h('h3', null, 'What has happened'),
    h('ul', { class: 'log' }, view.log.length ? view.log.map((l) => h('li', null, l.text)) : h('li', null, 'Nothing yet.')),
  );
}
