import { h } from '../dom.js';
import { t } from '../../i18n.js';

// The host's "advance the game" button for the current phase (null for non-hosts / phases without one).
export function hostAdvance(view, ctx) {
  if (!view.isHost) return null;
  const pr = (word) => (view.progress ? ` (${view.progress.done}/${view.progress.total} ${word})` : '');
  const go = (label, kind = 'nextPhase') =>
    h('button', { class: 'btn primary hostbtn', onClick: () => ctx.send(kind) }, label);
  switch (view.phase) {
    case 'reveal': return go(`${t('host.startNight')}${pr(t('host.ready'))}`);
    case 'night': return go(`${t('host.endNight')}${pr(t('host.confirmedW'))}`);
    case 'day': return go(t('host.startVote'), 'startVote');
    case 'shot': return go(t('host.skipShot'));
    case 'vote': return view.voteResult ? go(t('host.next')) : go(`${t('host.endVote')}${pr(t('host.votedW'))}`);
    default: return null;
  }
}
