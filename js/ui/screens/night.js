import { h, playerList, ROLE_LABEL } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';

export function nightScreen(view, ctx) {
  const { prompt, you } = view; const ui = ctx.ui;
  const priv = you.private;
  const tags = {};
  for (const mate of priv.teammates ?? []) {
    for (const id of [mate.pick, mate.pick2]) if (id) (tags[id] ??= []).push(t('pick', { name: mate.name }));
  }
  const nameOf = (id) => view.players.find((p) => p.id === id)?.name ?? '?';
  const seerCard = priv.seerResult && h('div', { class: 'card result' },
    t('night.isA', { name: nameOf(priv.seerResult.targetId) }), h('strong', null, priv.seerResult.isWolf ? t('night.werewolf') : t('night.notWerewolf')));
  const footer = h('p', { class: 'sub small' }, t('night.youAre', { role: ROLE_LABEL[you.role] }));
  const head = [h('div', { class: 'phase' }, t('night.title', { n: view.round })), h('h2', { class: 'prompt' }, tr(prompt.text))];

  if (prompt.kind === 'witch') return witchNight(view, ctx, head, footer);

  const two = prompt.picks === 2;
  const done = prompt.done;
  const chosen = two ? (ui.picks ??= []) : null;
  const selected = done ? priv.pick : ui.pick;
  const selectedMany = done ? [priv.pick, priv.pick2].filter(Boolean) : chosen;
  const canConfirm = done ? false : two ? chosen.length === 2 : (prompt.required ? !!ui.pick : true);
  const onPick = two
    ? (id) => { ui.picks = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(-2); ctx.rerender(); }
    : (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); };
  const list = playerList(view, { selectable: done ? [] : prompt.targets, selected: two ? null : selected, tags, onPick });
  return h('main', { class: 'screen night' },
    ...head,
    two ? multiList(view, prompt, selectedMany, done, tags, onPick) : list,
    seerCard,
    done
      ? h('p', { class: 'sub' }, t('night.confirmed'))
      : h('button', { class: 'btn primary', disabled: !canConfirm,
          onClick: () => ctx.send('nightPick', two ? { targetId: chosen[0], targetId2: chosen[1] } : { targetId: ui.pick ?? null }) }, t('night.confirm')),
    hostAdvance(view, ctx),
    footer,
  );
}

// playerList highlights a single selection; for two picks, mark each chosen player ourselves.
function multiList(view, prompt, selectedMany, done, tags, onPick) {
  const ul = playerList(view, { selectable: done ? [] : prompt.targets, selected: null, tags, onPick });
  const order = view.players.map((p) => p.id);
  [...ul.children].forEach((li, i) => {
    if (selectedMany.includes(order[i])) li.firstChild.classList.add('selected');
  });
  return ul;
}

function witchNight(view, ctx, head, footer) {
  const { prompt, you } = view; const ui = ctx.ui; const priv = you.private;
  const done = prompt.done;
  const nameOf = (id) => view.players.find((p) => p.id === id)?.name ?? '?';
  const send = (targetId) => ctx.send('nightPick', { targetId });
  const victims = prompt.healTargets; // null = wolves undecided, [] = none / no potion
  const choose = (mode) => { ui.mode = ui.mode === mode ? null : mode; ui.pick = null; ctx.rerender(); };
  const mode = ui.mode ?? null;
  return h('main', { class: 'screen night witch' },
    ...head,
    h('p', { class: 'sub' }, t('witch.potions', { heal: priv.potions?.heal ? '✓' : '✗', poison: priv.potions?.poison ? '✓' : '✗' })),
    done
      ? h('p', { class: 'sub' }, t('night.confirmed'))
      : [
        prompt.canHeal && (victims === null
          ? h('div', { class: 'card' }, t('witch.waiting'))
          : victims.length
            ? h('div', { class: 'card' },
                h('p', null, t('witch.victims', { names: victims.map(nameOf).join(', ') })),
                victims.map((id) => h('button', { class: 'btn', onClick: () => send(`heal:${id}`) }, t('witch.heal', { name: nameOf(id) }))))
            : h('div', { class: 'card' }, t('witch.noVictim'))),
        prompt.canPoison && h('button', { class: `btn${mode === 'poison' ? ' selected' : ''}`, onClick: () => choose('poison') }, t('witch.poison')),
        mode === 'poison' && playerList(view, { selectable: prompt.targets, selected: ui.pick, onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); } }),
        mode === 'poison' && h('button', { class: 'btn primary', disabled: !ui.pick, onClick: () => send(`poison:${ui.pick}`) }, t('witch.confirmPoison')),
        h('button', { class: 'btn', onClick: () => send('pass') }, t('witch.pass')),
      ],
    hostAdvance(view, ctx),
    footer,
  );
}
