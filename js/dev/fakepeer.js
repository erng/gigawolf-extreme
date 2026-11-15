// In-memory stand-in for PeerJS (same surface we use), for Node tests and offline dev.
import { createLoopbackPair } from '../net/loopback.js';

export function createFakeNetwork() {
  const registry = new Map();
  let n = 0;
  const net = {
    registry,
    blocked: false, // simulate client isolation: connect() never opens
    Peer: class FakePeer {
      constructor(id) {
        this.handlers = {}; this.conns = new Set(); this.destroyed = false;
        this.id = id ?? `anon-${++n}`;
        setTimeout(() => {
          if (this.destroyed) return;
          if (registry.has(this.id)) { this._emit('error', { type: 'unavailable-id' }); return; }
          registry.set(this.id, this);
          this._emit('open', this.id);
        }, 0);
      }
      on(ev, fn) { (this.handlers[ev] ??= []).push(fn); return this; }
      _emit(ev, a) { for (const f of this.handlers[ev] ?? []) f(a); }
      connect(target) {
        const [mine, theirs] = createLoopbackPair();
        setTimeout(() => {
          const t = registry.get(target);
          if (net.blocked || !t) { this._emit('error', { type: 'peer-unavailable' }); return; }
          this.conns.add(mine); t.conns.add(theirs);
          t._emit('connection', theirs);
          mine._emit('open');
        }, 0);
        return mine;
      }
      destroy() {
        this.destroyed = true;
        if (registry.get(this.id) === this) registry.delete(this.id);
        for (const c of this.conns) c.close();
      }
    },
  };
  return net;
}
