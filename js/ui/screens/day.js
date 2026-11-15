import { h, playerList } from '../dom.js';

export function dayScreen(view, ctx) {
  const last = view.log.at(-1)?.text ?? '';
  return h('main', { class: 'screen day' },
    h('div', { class: 'phase' }, `Day ${view.round}`),
    h('h2', { class: 'announce', role: 'status' }, last),
    h('p', { class: 'sub' }, 'Discuss. Who is a werewolf?'),
    h('div', { class: 'timer big', 'data-deadline': view.deadline ?? '' }),
    playerList(view),
    view.isHost && h('button', { class: 'btn primary', onClick: () => ctx.send('startVote') }, 'Start vote now'),
  );
}
