import { h, playerList, ROLE_LABEL } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';

export function nightScreen(view, ctx) {
  const { prompt, you } = view; const ui = ctx.ui;
  const priv = you.private;
  const tags = {};
  for (const t of priv.teammates ?? []) {
    if (t.pick) (tags[t.pick] ??= []).push(t('pick', { name: t.name }));
  }
  const nameOf = (id) => view.players.find((p) => p.id === id)?.name ?? '?';
  const done = prompt.done;
  const selected = done ? priv.pick : ui.pick;
  const canConfirm = done ? false : (prompt.required ? !!ui.pick : true);
  return h('main', { class: 'screen night' },
    h('div', { class: 'phase' }, t('night.title', { n: view.round })),
    h('h2', { class: 'prompt' }, tr(prompt.text)),
    playerList(view, {
      selectable: done ? [] : prompt.targets, selected, tags,
      onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); },
    }),
    priv.seerResult && h('div', { class: 'card result' },
      t('night.isA', { name: nameOf(priv.seerResult.targetId) }), h('strong', null, priv.seerResult.isWolf ? t('night.werewolf') : t('night.notWerewolf'))),
    done
      ? h('p', { class: 'sub' }, t('night.confirmed'))
      : h('button', { class: 'btn primary', disabled: !canConfirm, onClick: () => ctx.send('nightPick', { targetId: ui.pick ?? null }) }, t('night.confirm')),
    hostAdvance(view, ctx),
    h('p', { class: 'sub small' }, t('night.youAre', { role: ROLE_LABEL[you.role] })),
  );
}
