// Boot + screen routing. The UI only ever renders the view it is sent.
import { h } from './ui/dom.js';
import { Client, peerConnector } from './net/client.js';
import { Host } from './net/host.js';
import { randomId } from './net/protocol.js';
import { storage } from './util/storage.js';
import { keepAwake, releaseAwake } from './util/wakelock.js';
import { speak, unlock } from './ui/narrator.js';
import { addBots } from './dev/bots.js';
import { homeScreen } from './ui/screens/home.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { revealScreen } from './ui/screens/reveal.js';
import { nightScreen } from './ui/screens/night.js';
import { dayScreen } from './ui/screens/day.js';
import { voteScreen } from './ui/screens/vote.js';
import { deadScreen } from './ui/screens/dead.js';
import { gameoverScreen } from './ui/screens/gameover.js';

const $app = document.getElementById('app');
const $banner = document.getElementById('banner');
const $toast = document.getElementById('toast');
const params = new URLSearchParams(location.search);

const app = { client: null, host: null, view: null, status: null, error: null, offset: 0, prevKey: null, connecting: false };
const ui = { pick: null, holding: false, key: null };

const SESSION_KEY = 'gigawolf.session';
const NAME_KEY = 'gigawolf.name';
const pidKey = (code) => `gigawolf.pid.${code}`;
const getPid = (code) => { let id = storage.get(pidKey(code)); if (!id) { id = randomId(); storage.set(pidKey(code), id); } return id; };

function toast(text, ms = 6000) {
  $toast.textContent = text; $toast.hidden = false;
  setTimeout(() => { $toast.hidden = true; }, ms);
}

// ---------- sessions ----------
function resetToHome(error = null) {
  app.client?.stop(); app.host?.close();
  app.client = null; app.host = null; app.view = null; app.status = null; app.connecting = false;
  app.error = error;
  releaseAwake();
  render();
}

function leave() {
  storage.remove(SESSION_KEY); Host.clearSave(storage);
  resetToHome();
}

function wire(client) {
  app.client = client;
  client.onStatus = (s) => { app.status = s; render(); };
  client.onError = (e) => {
    if (e.code === 'unreachable') { storage.remove(SESSION_KEY); resetToHome(e.message); return; }
    if (['gameStarted', 'roomFull', 'badName', 'badVersion'].includes(e.code)) { storage.remove(SESSION_KEY); resetToHome(e.message); return; }
    toast(e.message);
  };
  client.onView = (view) => {
    app.offset = view.hostNow - Date.now();
    onViewChange(app.view, view);
    app.view = view;
    render();
  };
  client.onWelcome = () => { app.connecting = false; };
}

function onViewChange(prev, next) {
  const key = `${next.phase}:${next.round}:${next.you.alive}`;
  if (key !== app.prevKey) {
    if (app.prevKey) { try { navigator.vibrate?.(next.phase === 'gameover' ? [200, 100, 200] : 200); } catch { /* iOS */ } }
    app.prevKey = key;
  }
  if (next.phase !== 'lobby' && next.phase !== 'gameover') {
    keepAwake(() => toast('Tip: keep your screen on during the game (turn off auto-lock).'));
  }
}

async function hostGame(name, resume = null) {
  if (app.connecting) return;
  app.connecting = true; app.error = null; render();
  unlock(); // iOS: allow speech later
  storage.set(NAME_KEY, name);
  const hostId = resume?.hostId ?? randomId();
  const host = new Host({ Peer: window.Peer, hostPlayerId: hostId, storage, onNarrate: speak, resume });
  try { await host.start(); }
  catch (e) {
    app.connecting = false;
    resetToHome(resume
      ? "Couldn't reclaim the room. Check your connection and try again."
      : "Can't reach the matchmaking service. Check your internet connection and try again.");
    return;
  }
  app.host = host;
  storage.set(SESSION_KEY, { roomCode: host.roomCode, playerId: hostId, name, isHost: true });
  const hostName = resume ? (resume.state.players.find((p) => p.id === hostId)?.name ?? name) : name;
  const client = new Client({ playerId: hostId, name: hostName, visibilityReconnect: false, connector: async () => host.attachLoopback() });
  wire(client);
  client.start();
  const bots = parseInt(params.get('bots') ?? '0', 10);
  if (bots > 0 && !resume) addBots(host, Math.min(bots, 14));
}

function joinGame(code, name, retryFirst = false) {
  if (app.connecting) return;
  app.connecting = true; app.error = null; storage.set(NAME_KEY, name);
  const playerId = getPid(code);
  storage.set(SESSION_KEY, { roomCode: code, playerId, name, isHost: false });
  const client = new Client({ playerId, name, retryFirst, connector: peerConnector(window.Peer, code) });
  wire(client);
  client.start();
  render();
}

// ---------- rendering ----------
function chooseScreen(v, ctx) {
  const alive = v.you.alive;
  switch (v.phase) {
    case 'lobby': return lobbyScreen(v, ctx);
    case 'reveal': return revealScreen(v, ctx);
    case 'night': return alive ? nightScreen(v, ctx) : deadScreen(v, ctx);
    case 'day': return alive ? dayScreen(v, ctx) : deadScreen(v, ctx);
    case 'vote': return alive || v.voteResult ? voteScreen(v, ctx) : deadScreen(v, ctx);
    case 'gameover': return gameoverScreen(v, ctx);
    default: return h('main', { class: 'screen' }, 'Unknown phase');
  }
}

const ctx = {
  ui,
  send: (kind, extra) => app.client?.send(kind, extra),
  rerender: () => render(),
  hold(on) {
    ui.holding = on;
    document.getElementById('rolecard')?.classList.toggle('shown', on);
  },
};
document.addEventListener('pointerup', () => ctx.hold(false));
document.addEventListener('pointercancel', () => ctx.hold(false));
window.addEventListener('blur', () => ctx.hold(false));

function render() {
  // Reset per-phase UI state when the phase changes.
  const v = app.view;
  const key = v ? `${v.phase}:${v.round}` : 'home';
  if (key !== ui.key) { ui.key = key; ui.pick = null; if (v?.phase !== 'reveal') ui.holding = false; }

  const scrollY = window.scrollY;
  $app.replaceChildren();
  if (!v) {
    if (app.connecting) {
      $app.append(h('main', { class: 'screen' }, h('h2', null, app.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'),
        h('button', { class: 'btn', onClick: leave }, 'Cancel')));
    } else {
      const save = Host.loadSave(storage);
      $app.append(homeScreen({
        prefill: { name: storage.get(NAME_KEY) ?? '', code: params.get('join')?.toUpperCase().slice(0, 4) ?? '' },
        error: app.error, resumeAvailable: !!save,
        onHost: (name) => { Host.clearSave(storage); hostGame(name); },
        onJoin: (code, name) => joinGame(code, name),
        onResume: () => {
          const s = Host.loadSave(storage);
          const name = storage.get(NAME_KEY) ?? 'Host';
          if (s) hostGame(name, s);
        },
      }));
    }
  } else {
    $app.append(chooseScreen(v, ctx));
    $app.append(h('button', { class: 'btn leave', onClick: () => { if (confirm('Leave this game?')) leave(); } }, 'Leave'));
  }
  window.scrollTo(0, scrollY);

  const down = app.status === 'reconnecting' && !!v;
  $banner.hidden = !down;
  $banner.textContent = down ? 'Host disconnected, waiting…' : '';
  tickTimers();
}

function tickTimers() {
  const now = Date.now() + app.offset;
  for (const el of document.querySelectorAll('.timer')) {
    const d = Number(el.dataset.deadline);
    if (!d) { el.textContent = ''; continue; }
    const s = Math.max(0, Math.ceil((d - now) / 1000));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
setInterval(tickTimers, 250);

// ---------- boot ----------
function boot() {
  const session = storage.get(SESSION_KEY);
  // Non-host phones that reloaded mid-game rejoin automatically.
  if (session && !session.isHost && !params.get('join')) {
    joinGame(session.roomCode, session.name, true);
    return;
  }
  render();
}
boot();
window.__app = app; // handy for debugging / tests
