import { h, playerList } from '../dom.js';
import { hostAdvance } from './hostbar.js';

export function dayScreen(view, ctx) {
  const last = view.log.at(-1)?.text ?? '';
  return h('main', { class: 'screen day' },
    h('div', { class: 'phase' }, `Day ${view.round}`),
    h('h2', { class: 'announce', role: 'status' }, last),
    h('p', { class: 'sub' }, 'Discuss. Who is a werewolf?'),
    playerList(view),
    hostAdvance(view, ctx),
  );
}
