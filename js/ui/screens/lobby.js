import { h, playerList } from '../dom.js';
import { MIN_PLAYERS } from '../../game/setup.js';
import { unlock } from '../narrator.js';

function stepper(label, value, onChange, min = 0, max = 15) {
  return h('div', { class: 'row' },
    h('span', null, label),
    h('div', { class: 'stepper' },
      h('button', { class: 'btn small', 'aria-label': `Fewer ${label}`, disabled: value <= min, onClick: () => onChange(value - 1) }, '−'),
      h('span', { class: 'num' }, value),
      h('button', { class: 'btn small', 'aria-label': `More ${label}`, disabled: value >= max, onClick: () => onChange(value + 1) }, '+'),
    ));
}
function toggle(label, on, onChange) {
  return h('label', { class: 'row toggle' }, h('span', null, label),
    h('input', { type: 'checkbox', checked: on ? true : null, onChange: (e) => onChange(e.target.checked) }));
}
function secs(label, value, onChange) {
  return stepper(label, value, onChange, 10, 1800);
}

export function lobbyScreen(view, ctx) {
  const s = view.settings; const n = view.players.length;
  const link = `${location.origin}${location.pathname}?join=${view.roomCode}`;
  const set = (patch) => ctx.send('settings', { patch });
  const c = s.counts;
  const setCounts = (k, val) => {
    const next = { ...c, [k]: val };
    if (k !== 'villagers') next.villagers = n - next.wolves - next.seer - next.bodyguard;
    set({ counts: next });
  };
  const host = view.isHost;
  return h('main', { class: 'screen lobby' },
    h('p', { class: 'sub' }, 'Room code'),
    h('div', { class: 'roomcode', 'aria-label': `Room code ${view.roomCode.split('').join(' ')}` }, view.roomCode),
    h('button', { class: 'btn small', onClick: async (e) => {
      try { if (navigator.share) await navigator.share({ url: link, title: 'Gigawolf Extreme' }); else { await navigator.clipboard.writeText(link); e.target.textContent = 'Link copied'; } } catch { /* cancelled */ }
    } }, 'Share invite link'),
    h('h2', null, `Players (${n})`),
    playerList(view),
    host
      ? h('section', { class: 'card settings' },
          h('h2', null, 'Game setup'),
          c && stepper('Werewolves', c.wolves, (v) => setCounts('wolves', v), 0, 7),
          c && stepper('Seer', c.seer, (v) => setCounts('seer', v), 0, 3),
          c && stepper('Bodyguard', c.bodyguard, (v) => setCounts('bodyguard', v), 0, 3),
          c && h('div', { class: 'row' }, h('span', null, 'Villagers'), h('span', { class: 'num' }, c.villagers)),
          h('button', { class: 'btn small', onClick: () => set({ counts: null }) }, 'Reset roles to auto'),
          toggle('Reveal role on death', s.revealOnDeath, (v) => set({ revealOnDeath: v })),
          toggle('Bodyguard can protect self', s.bodyguardSelfProtect, (v) => set({ bodyguardSelfProtect: v })),
          toggle('Narration (this phone speaks)', s.narration, (v) => set({ narration: v })),
          secs('Night (sec)', s.nightSecs, (v) => set({ nightSecs: v })),
          secs('Discussion (sec)', s.discussionSecs, (v) => set({ discussionSecs: v })),
          view.setup && !view.setup.ok && h('p', { class: 'error' }, view.setup.errors.join(' ')),
          h('button', { class: 'btn primary', disabled: !(view.setup?.ok) || n < MIN_PLAYERS, onClick: () => { unlock(); ctx.send('startGame'); } },
            n < MIN_PLAYERS ? `Need ${MIN_PLAYERS - n} more player${MIN_PLAYERS - n === 1 ? '' : 's'}` : 'Start game'))
      : h('p', { class: 'sub' }, 'Waiting for the host to start…'),
  );
}
