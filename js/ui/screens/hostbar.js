import { h } from '../dom.js';

// The host's "advance the game" button for the current phase (null for non-hosts / phases without one).
export function hostAdvance(view, ctx) {
  if (!view.isHost) return null;
  const pr = (word) => (view.progress ? ` (${view.progress.done}/${view.progress.total} ${word})` : '');
  const go = (label, kind = 'nextPhase') =>
    h('button', { class: 'btn primary hostbtn', onClick: () => ctx.send(kind) }, label);
  switch (view.phase) {
    case 'reveal': return go(`Start night${pr('ready')}`);
    case 'night': return go(`Dawn: end the night${pr('confirmed')}`);
    case 'day': return go('Start vote', 'startVote');
    case 'vote': return view.voteResult ? go('Next') : go(`End vote now${pr('voted')}`);
    default: return null;
  }
}
