import { h, playerList } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';
import { fxAnnounce } from '../fx.js';
import { talkFeed } from '../talk.js';

export function voteScreen(view, ctx) {
  const ui = ctx.ui;
  const nameOf = (id) => id === 'skip' ? t('vote.skipName') : view.players.find((p) => p.id === id)?.name ?? '?';
  if (view.voteResult) {
    const r = view.voteResult;
    return h('main', { class: 'screen vote' },
      h('div', { class: 'phase' }, t('vote.result')),
      fxAnnounce(view, view.announce?.length ? view.announce : [view.log.at(-1)?.text ?? ''], `vote:${view.round}`),
      r.hidden
        ? h('p', { class: 'sub' }, t('vote.hidden'))
        : h('ul', { class: 'tally' }, Object.entries(r.votes).map(([voter, t]) =>
            h('li', null, h('strong', null, nameOf(voter)), ' → ', nameOf(t)))),
      view.isHost ? hostAdvance(view, ctx) : h('p', { class: 'sub' }, t('vote.waitHost')),
    );
  }
  const p = view.prompt; const done = p.done;
  const selected = done ? view.you.private.vote : ui.pick;
  const options = [...p.targets, 'skip', ...(p.haunt ? ['pass'] : [])];
  return h('main', { class: 'screen vote' },
    h('div', { class: 'phase' }, t('vote.title')),
    view.you.private.promoted && h('div', { class: 'card result' }, t('role.promoted')),
    h('h2', { class: 'prompt' }, tr(p.text)),
    p.haunt && h('p', { class: 'sub' }, t('vote.hauntHint')),
    talkFeed(view, { limit: 4 }),
    playerList(view, { selectable: done ? [] : p.targets, selected, onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); } }),
    h('button', { class: `btn${selected === 'skip' ? ' selected' : ''}`, disabled: done, 'aria-pressed': String(selected === 'skip'),
      onClick: () => { ui.pick = ui.pick === 'skip' ? null : 'skip'; ctx.rerender(); } }, t('vote.skip')),
    p.haunt && h('button', { class: `btn${selected === 'pass' ? ' selected' : ''}`, disabled: done, 'aria-pressed': String(selected === 'pass'),
      onClick: () => { ui.pick = ui.pick === 'pass' ? null : 'pass'; ctx.rerender(); } }, t('vote.pass')),
    done
      ? h('p', { class: 'sub' }, t('vote.locked'))
      : h('button', { class: 'btn primary', disabled: !options.includes(ui.pick), onClick: () => ctx.send('vote', { targetId: ui.pick }) }, t('vote.confirm')),
    hostAdvance(view, ctx),
  );
}
