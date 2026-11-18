import { h, playerList } from '../dom.js';
import { t, tr } from '../../i18n.js';
import { hostAdvance } from './hostbar.js';
import { aimArt } from '../moments.js';

// A dead Hunter picks one last victim; everybody else waits (the host can skip).
export function shotScreen(view, ctx) {
  const ui = ctx.ui; const p = view.prompt;
  if (!p) {
    return h('main', { class: 'screen shot' },
      h('div', { class: 'phase' }, t('shot.title')),
      h('h2', { class: 'announce', role: 'status' }, t(view.settings.revealOnDeath ? 'shot.waiting' : 'shot.waitingHidden', { name: view.shooter?.name ?? '?' })),
      aimArt(playerList(view)),
      hostAdvance(view, ctx),
    );
  }
  return h('main', { class: 'screen shot' },
    h('div', { class: 'phase' }, t('shot.title')),
    h('h2', { class: 'prompt' }, tr(p.text)),
    playerList(view, { selectable: p.targets, selected: ui.pick, onPick: (id) => { ui.pick = ui.pick === id ? null : id; ctx.rerender(); } }),
    h('button', { class: 'btn primary', disabled: !ui.pick, onClick: () => ctx.send('shoot', { targetId: ui.pick }) }, t('shot.fire')),
    hostAdvance(view, ctx),
  );
}
