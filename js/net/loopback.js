// In-memory connection pair with the same tiny interface as a PeerJS DataConnection:
// on(event, fn), send(obj), close(). Events: 'open', 'data', 'close', 'error'.
// Messages are JSON round-tripped so nothing is shared by reference.
function endpoint() {
  const handlers = {};
  return {
    peer: null, open: true, handlers,
    on(ev, fn) { (handlers[ev] ??= []).push(fn); return this; },
    emit(ev, arg) { for (const fn of handlers[ev] ?? []) fn(arg); },
  };
}

export function createLoopbackPair() {
  const a = endpoint(); const b = endpoint();
  const wrap = (me, other) => ({
    get open() { return me.open; },
    on: (ev, fn) => { me.on(ev, fn); return undefined; },
    _emit: (ev, arg) => me.emit(ev, arg), // test/fake-peer hook
    send(obj) {
      if (!me.open) return;
      const data = JSON.parse(JSON.stringify(obj));
      queueMicrotask(() => { if (other.open) other.emit('data', data); });
    },
    close() {
      if (!me.open) return;
      me.open = false; other.open = false;
      queueMicrotask(() => { me.emit('close'); other.emit('close'); });
    },
  });
  return [wrap(a, b), wrap(b, a)];
}
