import { h } from '../dom.js';
import { t } from '../../i18n.js';

// The host's "advance the game" button for the current phase (null for non-hosts / phases without one).
export function hostAdvance(view, ctx) {
  if (!view.isHost) return null;
  const pr = (word) => (view.progress ? ` (${view.progress.done}/${view.progress.total} ${word})` : '');
  // Everyone has acted (or the vote result is up): the game is waiting on the host, so nudge them.
  const blocking = view.progress ? view.progress.total > 0 && view.progress.done >= view.progress.total
    : view.phase === 'vote' && !!view.voteResult;
  // Cutting a phase short while people are still acting is an exception: make it look discouraging.
  const premature = !!view.progress && !blocking;
  const go = (label, kind = 'nextPhase', green = false) =>
    h('button', { class: `btn primary hostbtn${green ? ' green' : ''}${blocking ? ' nudge' : ''}${premature ? ' premature' : ''}`, onClick: () => ctx.send(kind) }, label);
  switch (view.phase) {
    case 'reveal': return go(`${t('host.startTalk')}${pr(t('host.ready'))}`);
    case 'night': return go(`${t('host.endNight')}${pr(t('host.confirmedW'))}`);
    case 'day': return view.round === 0 ? go(t('host.startNight')) : go(t('host.startVote'), 'startVote', true);
    case 'shot': return go(t('host.skipShot'));
    case 'vote': {
      if (view.voteResult) return go(t('host.next'));
      const btn = go(`${t('host.endVote')}${pr(t('host.votedW'))}`);
      const waiting = view.progress?.waiting ?? [];
      if (!waiting.length) return btn;
      return h('div', { class: 'hostvote' }, btn, h('div', { class: 'waiting muted' }, `${t('host.waitingOn')}: ${waiting.join(', ')}`));
    }
    default: return null;
  }
}
