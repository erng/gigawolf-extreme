import { h, playerList } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';

export function voteScreen(view, ctx) {
  const ui = ctx.ui;
  const nameOf = (id) => id === 'skip' ? t('vote.skipName') : view.players.find((p) => p.id === id)?.name ?? '?';
  if (view.voteResult) {
    const r = view.voteResult;
    return h('main', { class: 'screen vote' },
      h('div', { class: 'phase' }, t('vote.result')),
      h('h2', { class: 'announce', role: 'status' }, tr(view.log.at(-1)?.text ?? '')),
      h('ul', { class: 'tally' }, Object.entries(r.votes).map(([voter, t]) =>
        h('li', null, h('strong', null, nameOf(voter)), ' → ', nameOf(t)))),
      view.isHost ? hostAdvance(view, ctx) : h('p', { class: 'sub' }, t('vote.waitHost')),
    );
  }
  const p = view.prompt; const done = p.done;
  const selected = done ? view.you.private.vote : ui.pick;
  const options = [...p.targets, 'skip'];
  return h('main', { class: 'screen vote' },
    h('div', { class: 'phase' }, t('vote.title')),
    h('h2', { class: 'prompt' }, tr(p.text)),
    playerList(view, { selectable: done ? [] : p.targets, selected, onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); } }),
    h('button', { class: `btn${selected === 'skip' ? ' selected' : ''}`, disabled: done, 'aria-pressed': String(selected === 'skip'),
      onClick: () => { ui.pick = ui.pick === 'skip' ? null : 'skip'; ctx.rerender(); } }, t('vote.skip')),
    done
      ? h('p', { class: 'sub' }, t('vote.locked'))
      : h('button', { class: 'btn primary', disabled: !options.includes(ui.pick), onClick: () => ctx.send('vote', { targetId: ui.pick }) }, t('vote.confirm')),
    hostAdvance(view, ctx),
  );
}
