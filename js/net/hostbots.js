// Bots that run inside the host's page. A bot is just a player in the engine state (id `bot-N`) with no
// connection: when a new phase starts, each bot waits a random moment, looks at its own view once, and
// acts through host.apply(). No per-bot Client or views are kept, so 1000 bots stay cheap.
import { viewFor } from '../game/views.js';
import { botAction } from '../dev/bots.js';
import { isBotId } from '../game/setup.js';

export class HostBots {
  constructor(host, { minDelay = 600, maxDelay = 4000, rand = Math.random } = {}) {
    this.host = host; this.minDelay = minDelay; this.maxDelay = maxDelay; this.rand = rand;
    this.key = null; this.timers = new Set();
  }

  // Everything that changes what a bot should do: phase, round, vote stage, who is shooting.
  _key(s) { return [s.phase, s.round, s.vote?.stage, s.shots?.[0]].join(':'); }

  // Called by the host after every applied action (cheap: only does work when the key changes).
  onChange() {
    const s = this.host.state;
    if (!s || this.host.closed) return;
    const key = this._key(s);
    if (key === this.key) return;
    this.key = key;
    this.stop();
    for (const p of s.players) if (isBotId(p.id)) this._schedule(p.id, key);
  }

  _schedule(id, key, tries = 0) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.key !== key || this.host.closed) return;
      const view = viewFor(this.host.state, id);
      if (!view) return;
      const pick = (arr) => arr[Math.floor(this.rand() * arr.length)];
      const a = botAction(view, pick);
      if (a === 'wait') { if (tries < 600) this._schedule(id, key, tries + 1); return; }
      if (a) this.host.apply({ kind: a.kind, by: id, now: this.host.now(), ...a.extra });
    }, this.minDelay + this.rand() * (this.maxDelay - this.minDelay));
    t.unref?.();
    this.timers.add(t);
  }

  stop() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
}
