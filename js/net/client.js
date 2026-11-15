// Thin client: connects (to a PeerJS host or an in-memory loopback), says hello,
// renders whatever view it is sent, and reconnects when the link drops.
import { msg, randomId, validate, FATAL_ERRORS } from './protocol.js';
import {
  PEER_ID_PREFIX, PEER_OPTIONS, CONNECT_TIMEOUT_MS, RETRY_DELAYS_MS, PING_INTERVAL_MS, DEAD_AFTER_MS,
} from '../config.js';

// A connector returns a Promise<conn>. This one dials a PeerJS host by room code.
export function peerConnector(Peer, roomCode, peerOptions = PEER_OPTIONS) {
  return () => new Promise((resolve, reject) => {
    let peer; let settled = false;
    const done = (fn, arg) => { if (settled) return; settled = true; clearTimeout(to); fn(arg); };
    const fail = (e) => { try { peer?.destroy(); } catch {} done(reject, e); };
    const to = setTimeout(() => fail({ type: 'timeout' }), CONNECT_TIMEOUT_MS);
    try { peer = new Peer(undefined, peerOptions); } catch (e) { fail(e); return; }
    peer.on('error', fail);
    peer.on('open', () => {
      const conn = peer.connect(PEER_ID_PREFIX + roomCode, { reliable: true, serialization: 'json' });
      conn.on('error', fail);
      conn.on('open', () => {
        const origClose = conn.close.bind(conn);
        conn.close = () => { origClose(); try { peer.destroy(); } catch {} };
        conn.on('close', () => { try { peer.destroy(); } catch {} });
        done(resolve, conn);
      });
    });
  });
}

export class Client {
  /**
   * @param {object} o
   * @param {Function} o.connector   () => Promise<conn>
   * @param {string}   o.playerId
   * @param {string}   o.name
   * @param {boolean}  [o.retryFirst]  keep retrying even if the very first connect fails (session rejoin)
   * callbacks: onView(view), onStatus(status), onError({code,message}), onWelcome(w)
   * status: 'connecting' | 'connected' | 'reconnecting' | 'failed'
   */
  constructor({ connector, playerId = randomId(), name, retryFirst = false, visibilityReconnect = true, onView = () => {}, onStatus = () => {}, onError = () => {}, onWelcome = () => {}, delays = RETRY_DELAYS_MS, pingMs = PING_INTERVAL_MS, deadMs = DEAD_AFTER_MS }) {
    Object.assign(this, { visibilityReconnect, connector, playerId, name, retryFirst, onView, onStatus, onError, onWelcome, delays, pingMs, deadMs });
    this.conn = null;
    this.status = null;
    this.everWelcomed = false;
    this.attempt = 0;
    this.stopped = false;
    this.retryTimer = null;
    this.pingTimer = null;
    this.lastSeen = 0;
    this.nonceN = 0;
    this._vis = () => { if (this.visibilityReconnect && document.visibilityState === 'visible') this.reconnectNow(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._vis);
  }

  _setStatus(s) { if (s !== this.status) { this.status = s; this.onStatus(s); } }

  start() { this.stopped = false; return this._connect(); }

  async _connect() {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    this._setStatus(this.everWelcomed || this.retryFirst ? 'reconnecting' : 'connecting');
    const gen = (this.gen = (this.gen ?? 0) + 1);
    let conn;
    try {
      conn = await this.connector();
    } catch (e) {
      if (gen !== this.gen || this.stopped) return;
      return this._failed(e);
    }
    if (gen !== this.gen || this.stopped) { try { conn.close(); } catch {} return; }
    this.conn = conn;
    this.lastSeen = Date.now();
    conn.on('data', (d) => this._onData(conn, d));
    conn.on('close', () => this._onDrop(conn));
    conn.on('error', () => this._onDrop(conn));
    conn.send(msg.hello(this.playerId, this.name));
    this._startPing();
  }

  _onData(conn, data) {
    if (conn !== this.conn || validate(data)) return;
    this.lastSeen = Date.now();
    switch (data.type) {
      case 'welcome':
        this.everWelcomed = true; this.attempt = 0;
        this._setStatus('connected');
        this.onWelcome(data);
        break;
      case 'view': this.onView(data.view); break;
      case 'error':
        this.onError(data);
        if (FATAL_ERRORS.includes(data.code)) this.stop();
        break;
    }
  }

  _onDrop(conn) {
    if (conn !== this.conn) return;
    this._teardownConn();
    if (!this.stopped) this._failed({ type: 'closed' });
  }

  _failed(e) {
    if (this.stopped) return;
    if (!this.everWelcomed && !this.retryFirst) { // initial join failed: tell the user
      this._setStatus('failed');
      this.onError({ code: 'unreachable', message: "Can't reach the host. Make sure everyone is on the same Wi-Fi, or join one phone's hotspot." , cause: e });
      this.stopped = true;
      return;
    }
    this._setStatus('reconnecting');
    const d = this.delays[Math.min(this.attempt, this.delays.length - 1)];
    this.attempt++;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this._connect(), d);
    this.retryTimer.unref?.();
  }

  _teardownConn() {
    clearInterval(this.pingTimer);
    const c = this.conn; this.conn = null;
    if (c) { try { c.close(); } catch {} }
  }

  _startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.conn) return;
      if (Date.now() - this.lastSeen > this.deadMs) { this._onDrop(this.conn); return; }
      try { this.conn.send(msg.ping()); } catch { this._onDrop(this.conn); }
    }, this.pingMs);
    this.pingTimer.unref?.(); // lets Node tests exit; no-op in browsers
  }

  reconnectNow() {
    if (this.stopped) return;
    // Phones can freeze sockets without a close event; always start a fresh connection.
    this._teardownConn();
    this.attempt = 0;
    this._connect();
  }

  send(kind, extra = {}) {
    if (!this.conn) return false;
    this.nonceN++;
    try { this.conn.send(msg.action(kind, { nonce: `${this.playerId}-${Date.now()}-${this.nonceN}`, ...extra })); return true; }
    catch { return false; }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this._teardownConn();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._vis);
  }
}
