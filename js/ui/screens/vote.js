import { h, playerList } from '../dom.js';
import { hostAdvance } from './hostbar.js';

export function voteScreen(view, ctx) {
  const ui = ctx.ui;
  const nameOf = (id) => id === 'skip' ? 'Skip' : view.players.find((p) => p.id === id)?.name ?? '?';
  if (view.voteResult) {
    const r = view.voteResult;
    return h('main', { class: 'screen vote' },
      h('div', { class: 'phase' }, 'Vote result'),
      h('h2', { class: 'announce', role: 'status' }, view.log.at(-1)?.text ?? ''),
      h('ul', { class: 'tally' }, Object.entries(r.votes).map(([voter, t]) =>
        h('li', null, h('strong', null, nameOf(voter)), ' → ', nameOf(t)))),
      view.isHost ? hostAdvance(view, ctx) : h('p', { class: 'sub' }, 'Waiting for the host to continue…'),
    );
  }
  const p = view.prompt; const done = p.done;
  const selected = done ? view.you.private.vote : ui.pick;
  const options = [...p.targets, 'skip'];
  return h('main', { class: 'screen vote' },
    h('div', { class: 'phase' }, 'Vote'),
    h('h2', { class: 'prompt' }, p.text),
    playerList(view, { selectable: done ? [] : p.targets, selected, onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); } }),
    h('button', { class: `btn${selected === 'skip' ? ' selected' : ''}`, disabled: done, 'aria-pressed': String(selected === 'skip'),
      onClick: () => { ui.pick = ui.pick === 'skip' ? null : 'skip'; ctx.rerender(); } }, 'Skip (no elimination)'),
    done
      ? h('p', { class: 'sub' }, 'Vote locked in. Waiting for everyone…')
      : h('button', { class: 'btn primary', disabled: !options.includes(ui.pick), onClick: () => ctx.send('vote', { targetId: ui.pick }) }, 'Confirm vote'),
    hostAdvance(view, ctx),
  );
}
