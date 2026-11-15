import { h, playerList, ROLE_LABEL } from '../dom.js';
import { hostAdvance } from './hostbar.js';

export function nightScreen(view, ctx) {
  const { prompt, you } = view; const ui = ctx.ui;
  const priv = you.private;
  const tags = {};
  for (const t of priv.teammates ?? []) {
    if (t.pick) (tags[t.pick] ??= []).push(`${t.name}'s pick`);
  }
  const nameOf = (id) => view.players.find((p) => p.id === id)?.name ?? '?';
  const done = prompt.done;
  const selected = done ? priv.pick : ui.pick;
  const canConfirm = done ? false : (prompt.required ? !!ui.pick : true);
  return h('main', { class: 'screen night' },
    h('div', { class: 'phase' }, `Night ${view.round}`),
    h('h2', { class: 'prompt' }, prompt.text),
    playerList(view, {
      selectable: done ? [] : prompt.targets, selected, tags,
      onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); },
    }),
    priv.seerResult && h('div', { class: 'card result' },
      `${nameOf(priv.seerResult.targetId)} is `, h('strong', null, priv.seerResult.isWolf ? 'a Werewolf' : 'Not a werewolf')),
    done
      ? h('p', { class: 'sub' }, 'Confirmed. Waiting for the host to end the night…')
      : h('button', { class: 'btn primary', disabled: !canConfirm, onClick: () => ctx.send('nightPick', { targetId: ui.pick ?? null }) }, 'Confirm'),
    hostAdvance(view, ctx),
    h('p', { class: 'sub small' }, `You are the ${ROLE_LABEL[you.role]}.`),
  );
}
