import { PROTOCOL_VERSION } from '../config.js';

export const CLIENT_ACTION_KINDS = ['ready', 'nightPick', 'shoot', 'vote', 'startVote', 'nextPhase', 'startGame', 'settings', 'playAgain', 'endEarly', 'kick', 'say'];
// Errors after which retrying cannot help.
export const FATAL_ERRORS = ['gameStarted', 'roomFull', 'badName', 'badVersion'];

const m = (type, rest = {}) => ({ v: PROTOCOL_VERSION, type, ...rest });

export const msg = {
  hello: (playerId, name) => m('hello', { playerId, name }),
  action: (kind, extra = {}) => m('action', { kind, ...extra }),
  ping: () => m('ping'),
  welcome: (playerId, roomCode, isHost) => m('welcome', { playerId, roomCode, isHost }),
  view: (view) => m('view', { view }),
  error: (code, message) => m('error', { code, message }),
  pong: () => m('pong'),
};

export function randomId(len = 12) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const buf = new Uint32Array(len);
  (globalThis.crypto ?? { getRandomValues: (b) => b.map(() => Math.random() * 2 ** 32) }).getRandomValues(buf);
  for (const n of buf) out += a[n % a.length];
  return out;
}

// Returns an error string, or null if the message is acceptable.
export function validate(x) {
  if (!x || typeof x !== 'object') return 'not an object';
  if (x.v !== PROTOCOL_VERSION) return 'badVersion';
  switch (x.type) {
    case 'hello':
      if (typeof x.playerId !== 'string' || !/^[a-z0-9-]{4,40}$/.test(x.playerId)) return 'bad playerId';
      if (typeof x.name !== 'string') return 'bad name';
      return null;
    case 'action':
      if (!CLIENT_ACTION_KINDS.includes(x.kind)) return 'bad kind';
      if (x.targetId != null && typeof x.targetId !== 'string') return 'bad target';
      if (x.targetId2 != null && typeof x.targetId2 !== 'string') return 'bad target';
      if (x.nonce != null && typeof x.nonce !== 'string') return 'bad nonce';
      // A line's wording is `variant` on the wire: `v` is the protocol version of every message.
      if (x.kind === 'say' && !(typeof x.key === 'string' && x.key.length <= 24 && Number.isInteger(x.variant) && Array.isArray(x.ids) && x.ids.length <= 2 && x.ids.every((i) => typeof i === 'string'))) return 'bad line';
      if (x.kind === 'settings' && (typeof x.patch !== 'object' || x.patch === null)) return 'bad patch';
      return null;
    case 'ping': case 'pong': return null;
    case 'welcome': case 'view': case 'error': return null;
    default: return 'unknown type';
  }
}
