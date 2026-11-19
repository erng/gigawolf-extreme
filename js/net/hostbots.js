// Bots that run inside the host's page. A bot is just a player in the engine state (id `bot-N`) with no
// connection: when a new phase starts, each bot waits a random moment, looks at its own view once, and
// acts through host.apply(). No per-bot Client or views are kept, so a room full of bots stays cheap.
//
// Smart bots (the default) each keep a BotMind (js/bots/mind.js): memory, suspicions and a personality.
// They also talk: lines during the day, a reply when a line names them or claims Seer, and their vote said
// out loud. With the host's "Dumb bots" setting they act at random and stay silent, as before v1.29.0.
// A mind only ever sees viewFor(state, its own id), the same view that bot's phone would get.
import { viewFor } from '../game/views.js';
import { botAction } from '../dev/bots.js';
import { isBotId } from '../game/setup.js';
import { BotMind, PERSONA } from '../bots/mind.js';

// The table as a whole talks at most this many lines per round outside the vote, so a big bot room does
// not bury the phones in chatter. Votes said out loud are not counted.
export const TABLE_LINES = (bots) => Math.min(14, 5 + Math.round(2 * Math.sqrt(bots)));
const SEER_KEYS = new Set(['claimWolf', 'claimClean', 'reportWolf', 'reportClean', 'counter']);
const REPLY_KEYS = new Set(['accuse', 'agree', 'claimWolf', 'claimClean', 'reportWolf', 'reportClean', 'counter', 'detective']);

export class HostBots {
  constructor(host, { minDelay = 600, maxDelay = 4000, rand = Math.random } = {}) {
    this.host = host; this.minDelay = minDelay; this.maxDelay = maxDelay; this.rand = rand;
    this.key = null; this.timers = new Set();
    this.minds = new Map(); this.chatSeq = null;
  }

  smart() { return !this.host.state?.settings?.dumbBots; }

  // Everything that changes what a bot should do: phase, round, vote stage, who is shooting.
  _key(s) { return [s.phase, s.round, s.vote?.stage, s.shots?.[0]].join(':'); }

  _mind(p) {
    let m = this.minds.get(p.id);
    if (!m) { m = new BotMind(p.id, p.persona, this.rand); this.minds.set(p.id, m); }
    return m;
  }

  // Called by the host after every applied action (cheap: only does work when the key or the talk changes).
  onChange() {
    const s = this.host.state;
    if (!s || this.host.closed) return;
    if (s.phase === 'lobby' || (s.phase === 'reveal' && s.round === 0 && this.key?.split(':')[0] !== 'reveal')) this.minds.clear(); // a new game
    const smart = this.smart();
    if (smart) this._watchChat(s);
    const key = this._key(s);
    if (key === this.key) return;
    this.key = key;
    this.stop();
    const bots = s.players.filter((p) => isBotId(p.id));
    // Every mind looks at the new phase at once, so a fast host cannot make it miss a vote result.
    if (smart) for (const p of bots) { const v = viewFor(s, p.id); if (v) this._mind(p).observe(v); }
    for (const p of bots) this._schedule(p.id, key);
    if (smart && s.phase === 'day') {
      for (const p of bots) {
        if (!p.alive) continue;
        const speed = PERSONA[this._mind(p).persona].speed;
        this._later(key, this._delay(speed * 1.2), () => this._talk(p.id, 'day'));
        this._later(key, this._delay(speed * 1.2) + this.maxDelay, () => this._talk(p.id, 'day'));
      }
    }
  }

  _delay(scale = 1) { return (this.minDelay + this.rand() * (this.maxDelay - this.minDelay)) * scale; }

  _later(key, ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.key !== key || this.host.closed) return;
      fn();
    }, ms);
    t.unref?.();
    this.timers.add(t);
  }

  // New lines give bots a chance to answer: the player a line names, and anyone when it is about the Seer.
  _watchChat(s) {
    const chat = s.chat ?? [];
    const last = chat.at(-1)?.seq ?? 0;
    if (this.chatSeq === null || last < this.chatSeq) { this.chatSeq = last; return; } // first look, or a new game
    const fresh = chat.filter((c) => c.seq > this.chatSeq);
    this.chatSeq = last;
    if (!fresh.length) return;
    const key = this._key(s);
    const alive = s.players.filter((p) => isBotId(p.id) && p.alive);
    for (const c of fresh) {
      if (!REPLY_KEYS.has(c.key)) continue;
      const seerTalk = c.key !== 'accuse' && c.key !== 'agree' && c.key !== 'detective';
      // Everyone gets the chance to react to Seer talk, so whether a bot answers says nothing about its role.
      const named = new Set(c.ids);
      const listeners = seerTalk ? alive : alive.filter((p) => named.has(p.id) || this.rand() < 0.25);
      for (const p of listeners) {
        if (p.id === c.by) continue;
        this._later(key, this._delay(PERSONA[this._mind(p).persona].speed * 0.8), () => this._talk(p.id, 'reply'));
      }
    }
  }

  _talk(id, moment) {
    const s = this.host.state;
    const p = s.players.find((x) => x.id === id);
    if (!p?.alive || !this.smart()) return;
    const view = viewFor(s, id);
    if (!view) return;
    const s2 = this.host.state;
    const bots = s2.players.filter((x) => isBotId(x.id) && x.alive).length;
    const said = (s2.chat ?? []).filter((c) => c.round === s2.round && c.key !== 'voteFor' && c.key !== 'voteSkip').length;
    if (said >= TABLE_LINES(bots) + 3) return; // room for a few Seer lines past the cap
    const line = this._mind(p).talk(view, moment);
    if (line && said >= TABLE_LINES(bots) && !SEER_KEYS.has(line.key)) return; // Seer talk still gets through
    this._say(id, line);
  }

  _say(id, line) {
    if (line) this.host.apply({ kind: 'botSay', by: id, now: this.host.now(), key: line.key, v: line.v, ids: line.ids });
  }

  _schedule(id, key, tries = 0) {
    const s0 = this.host.state;
    const p0 = s0.players.find((x) => x.id === id);
    const speed = this.smart() && p0 ? PERSONA[this._mind(p0).persona].speed : 1;
    // Smart bots take their time in the vote (people talk first), hotheads less than quiet ones.
    const scale = this.smart() && s0.phase === 'vote' ? 1.5 * speed : 1;
    this._later(key, this._delay(scale), () => {
      const view = viewFor(this.host.state, id);
      if (!view) return;
      const smart = this.smart();
      const p = this.host.state.players.find((x) => x.id === id);
      let a;
      if (smart) a = this._mind(p).act(view);
      else { const pick = (arr) => arr[Math.floor(this.rand() * arr.length)]; a = botAction(view, pick); }
      if (a === 'wait') { if (tries < 600) this._schedule(id, key, tries + 1); return; }
      if (!a) return;
      if (smart && a.kind === 'vote') this._say(id, this._mind(p).voteLine(view, a.extra.targetId));
      this.host.apply({ kind: a.kind, by: id, now: this.host.now(), ...a.extra });
    });
  }

  stop() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); }
}
