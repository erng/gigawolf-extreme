// Balance model for Gigawolf Extreme random events.
// Classic preset (wolves, Seer, Bodyguard, villagers), engine rules: night first, wolves can't target wolves,
// Bodyguard can't repeat, self-protect on, plurality vote, tie = nobody out, win = no wolves / wolves >= others.
//
// Village players reason with a Bayesian belief over every possible wolf set (<= 455 sets at 15 players).
// Public evidence: night victims are never wolves, day "tells" (noisy behaviour signal), vote patterns
// (wolves rarely vote a teammate), Seer claims and wolf counterclaims, event announcements.
// Private evidence: own role, own noisy reads, Seer checks, a privately received rumor.

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const pickOne = (r, a) => a[Math.floor(r() * a.length)];
const shuffle = (r, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pop = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };

const CACHE = new Map();
function hyps(n, k) {
  const key = n * 100 + k;
  if (!CACHE.has(key)) {
    const masks = [];
    for (let m = 0; m < (1 << n); m++) if (pop(m) === k) masks.push(m);
    const mem = new Int8Array(masks.length * k);
    masks.forEach((m, h) => { let t = 0; for (let j = 0; j < n; j++) if ((m >> j) & 1) mem[h * k + t++] = j; });
    CACHE.set(key, { masks: Int32Array.from(masks), mem, k });
  }
  return CACHE.get(key);
}

export const wolvesFor = (n) => (n <= 6 ? 1 : n <= 10 ? 2 : 3);
const LOG_EPS = Math.log(1e-4); // "a village player would never say this"
const LOG_Q = Math.log(0.3);    // weight of a claim made by a wolf
const LOG_BUS = Math.log(0.15); // a wolf voting for a teammate

export const DEFAULTS = {
  n: 8, muPub: 0.25, muPriv: 0.35, reveal: false, event: null, eventChance: 0.5,
  eventDay: null, // when set, the event happens on exactly this day (1 = the morning after the first night)
  alpha: { letterW: 1, letterC: 1, whisper: 1, lwNight: 1, lwVote: 1 }, // listener trust (likelihood ratios)
  calib: null, // when set, collect { type, isWolf, prior } for every pointing signal
  // Muted players (seats 0..muted-1, so their roles are random): they give no day "tells", never claim Seer or
  // counterclaim, but still hear everything. muteMode 'silent' = they still reason and vote like anyone;
  // 'dumb' = what dumbBots do in the game: random votes, random Seer checks and Bodyguard guards.
  muted: 0, muteMode: 'silent',
};

export function playGame(opts, seed) {
  const o = { ...DEFAULTS, ...opts };
  const r = mulberry(seed);
  const er = mulberry(seed ^ 0x9e3779b9);
  const n = o.n; const W = wolvesFor(n);
  const { masks, mem, k } = hyps(n, W);
  const H = masks.length;
  const roles = shuffle(r, [...Array(W).fill('wolf'), 'seer', 'bg', ...Array(n - W - 2).fill('vil')]);
  const isW = (j) => roles[j] === 'wolf';
  const alive = Array(n).fill(true);
  const isMuted = (j) => j < o.muted;
  const isDumb = (j) => isMuted(j) && o.muteMode === 'dumb';
  const deaths = [];                        // [player, cause, day], for the muted-vs-talking comparison
  const lp = new Float64Array(H);           // public log-weights over wolf sets
  const priv = Array.from({ length: n }, () => new Float64Array(n)); // private separable log-LR
  const rumorPriv = Array.from({ length: n }, () => []); // [a, b, same]
  const seerIdx = roles.indexOf('seer');
  const checks = new Map();                 // seer's own checks j -> isWolf
  const announced = new Set();              // checks already claimed publicly
  const seerClaimants = [];                 // players who claimed Seer (real or fake)
  const rumorClaimants = [];
  let seerClaimed = false; let seerKnownDead = false;
  let lastProtect = null;
  const st = { days: 0, eventDay: null, blocked: 0, signals: 0, seerClaim: 0, counter: 0, saves: 0, seerNightKilled: 0 };

  // event state
  const ev = o.event;
  let fired = false; let todayEvent = false;
  let charm = null; let charmUsed = false; let charmClaimed = false;
  let ballotKind = null; let mayor = null; let silenced = null; let lastWordsArmed = false; let whispersTonight = false; let whisperNames = null;

  const livingIdx = () => alive.map((a, j) => (a ? j : -1)).filter((j) => j >= 0);
  const inH = (h, j) => (masks[h] >> j) & 1;
  const norm = () => { let m = -Infinity; for (let h = 0; h < H; h++) if (lp[h] > m) m = lp[h]; if (Number.isFinite(m)) for (let h = 0; h < H; h++) lp[h] -= m; };
  const pubAdd = (fn) => { for (let h = 0; h < H; h++) if (lp[h] !== -Infinity) lp[h] += fn(h); norm(); };
  const hard = (j, wolf) => pubAdd((h) => (!!inH(h, j) === wolf ? 0 : -Infinity));

  // Marginal P(j is a wolf) for observer i (null = public view only).
  function marginal(i) {
    const out = new Float64Array(n);
    const w = new Float64Array(H);
    let max = -Infinity;
    const village = i != null && !isW(i);
    for (let h = 0; h < H; h++) {
      let x = lp[h];
      if (x === -Infinity) { w[h] = -Infinity; continue; }
      if (i != null) {
        if (village && inH(h, i)) { w[h] = -Infinity; continue; }
        for (let t = 0; t < k; t++) x += priv[i][mem[h * k + t]];
        if (i === seerIdx) for (const [j, wolf] of checks) if (!!inH(h, j) !== wolf) { x = -Infinity; break; }
        for (const f of rumorPriv[i]) { x += f(h); if (x === -Infinity) break; }
      }
      w[h] = x; if (x > max) max = x;
    }
    let tot = 0;
    for (let h = 0; h < H; h++) {
      if (w[h] === -Infinity) continue;
      const p = Math.exp(w[h] - max); tot += p;
      for (let t = 0; t < k; t++) out[mem[h * k + t]] += p;
    }
    if (tot > 0) for (let j = 0; j < n; j++) out[j] /= tot;
    return out;
  }
  // Ties (within 1e-9) break at random: equal beliefs must not make everyone pick the same player.
  const bestOf = (m, cands, sign) => {
    let best = -Infinity; let pool = [];
    for (const j of cands) { const x = sign * m[j]; if (x > best + 1e-9) { best = x; pool = [j]; } else if (x > best - 1e-9) pool.push(j); }
    return pool.length ? pool[Math.floor(r() * pool.length)] : undefined;
  };
  const argmaxOf = (m, cands) => bestOf(m, cands, 1);
  const argminOf = (m, cands) => bestOf(m, cands, -1);
  const livingNonWolves = () => livingIdx().filter((j) => !isW(j));
  // The innocent the wolves want gone by day: the non-wolf the table already suspects most.
  const frameTarget = () => { const pm = marginal(null); return argmaxOf(pm, livingNonWolves()); };
  // What a village player (alive or dead) would point at.
  function villagePoint(i) {
    if (i === seerIdx) { const w = [...checks].find(([j, wolf]) => wolf && alive[j]); if (w) return w[0]; }
    const m = marginal(i); const c = livingIdx().filter((j) => j !== i);
    return c.length ? argmaxOf(m, c) : null;
  }
  // A pointing signal heard by the table: "X is a wolf" from a source of unknown trust.
  function pointSignal(type, j, sourceKnownWolf = false) {
    if (j == null || !alive[j]) return;
    st.signals++;
    if (o.calib) o.calib.push({ type, isWolf: isW(j), prior: marginal(null)[j] });
    if (sourceKnownWolf) return;
    const a = Math.log(o.alpha[type] ?? 1);
    if (a) pubAdd((h) => (inH(h, j) ? a : 0));
  }

  // Claims. A village claimant is truthful; a wolf claimant gets weight q; only one real Seer / rumor holder.
  function claimFrom(list, c, isNew, logQ = LOG_Q) {
    if (!isNew) return;
    for (const c2 of list) if (c2 !== c) pubAdd((h) => (!inH(h, c) && !inH(h, c2) ? LOG_EPS : 0));
    list.push(c);
    pubAdd((h) => (inH(h, c) ? logQ : 0));
  }
  function seerStatement(c, j, wolf) {
    const deadSeerBlock = seerKnownDead && c !== seerIdx;
    pubAdd((h) => (inH(h, c) ? 0 : deadSeerBlock || !!inH(h, j) !== wolf ? LOG_EPS : 0));
  }
  function rumorStatement(c, a, b, same) {
    pubAdd((h) => (inH(h, c) ? 0 : (inH(h, a) === inH(h, b)) !== same ? LOG_EPS : 0));
  }

  const votedOut = new Set();                // dead by vote (a mix of both teams), for restlessVoted
  function kill(j, cause) {
    alive[j] = false;
    deaths.push([j, cause, st.days]);
    if (cause === 'vote') votedOut.add(j);
    if (cause === 'night') hard(j, false);
    if (o.reveal) { hard(j, isW(j)); if (j === seerIdx) seerKnownDead = true; }
    if (lastWordsArmed && (ev === 'lastwords' || (ev === 'lastwordsVote' && cause === 'vote'))) {
      lastWordsArmed = false;
      const t = isW(j) ? frameTarget() : villagePoint(j);
      pointSignal(cause === 'night' ? 'lwNight' : 'lwVote', t, o.reveal && isW(j));
    }
  }
  function winner() {
    const wl = livingIdx().filter(isW).length; const ot = livingIdx().length - wl;
    if (wl === 0) return 'village';
    if (wl >= ot) return 'wolves';
    return null;
  }

  // ---------- night ----------
  function night(day) {
    const targets = livingNonWolves();
    let victim = null;
    if (targets.length) {
      let pool = targets;
      if (charmClaimed && !charmUsed && !isW(charm) && pool.length > 1) pool = pool.filter((j) => j !== charm);
      if (day === 0) victim = pickOne(r, pool);
      else if (seerClaimed && alive[seerIdx] && pool.includes(seerIdx) && r() < 0.85) victim = seerIdx;
      else victim = r() < 0.5 ? argminOf(marginal(null), pool) : pickOne(r, pool);
    }
    if (alive[seerIdx]) {
      const c = livingIdx().filter((j) => j !== seerIdx && !checks.has(j));
      if (c.length) { const t = day === 0 || isDumb(seerIdx) ? pickOne(r, c) : argmaxOf(marginal(seerIdx), c); checks.set(t, isW(t)); }
    }
    const bg = roles.indexOf('bg');
    let protect = null;
    if (alive[bg]) {
      const c = livingIdx().filter((j) => j !== lastProtect);
      const claim = isDumb(bg) ? [] : seerClaimants.filter((j) => alive[j]);
      if (isDumb(bg)) protect = pickOne(r, c);
      if (claim.length) { const m = marginal(bg); const best = argminOf(m, claim); if (c.includes(best)) protect = best; }
      if (protect == null) protect = c.includes(bg) && r() < 0.35 ? bg : pickOne(r, c);
    }
    lastProtect = protect;
    if (whispersTonight) {
      whispersTonight = false;
      const tally = new Map();
      for (let j = 0; j < n; j++) if (!alive[j]) { const t = isW(j) ? frameTarget() : villagePoint(j); if (t != null) tally.set(t, (tally.get(t) ?? 0) + 1); }
      const top = Math.max(0, ...tally.values());
      whisperNames = top >= 2 ? [...tally].filter(([, c]) => c === top).map(([j]) => j) : null;
    }
    if (victim != null) {
      if (victim === protect) { st.saves++; victim = null; }
      else if (victim === charm && !charmUsed) { charmUsed = true; st.blocked++; victim = null; }
    }
    if (victim === seerIdx) st.seerNightKilled = 1;
    if (victim != null) kill(victim, 'night');
  }

  // ---------- day ----------
  function tells() {
    for (const j of livingIdx()) {
      if (j === silenced || isMuted(j)) continue;
      const s = o.muPub * (isW(j) ? 1 : 0) + gauss(r);
      const l = o.muPub * s - o.muPub * o.muPub / 2;
      pubAdd((h) => (inH(h, j) ? l : 0));
      for (let i = 0; i < n; i++) {
        if (i === j || isW(i)) continue;
        const si = o.muPriv * (isW(j) ? 1 : 0) + gauss(r);
        priv[i][j] += o.muPriv * si - o.muPriv * o.muPriv / 2;
      }
    }
  }

  function seerClaims() {
    if (!alive[seerIdx] || silenced === seerIdx || isMuted(seerIdx)) return;
    const foundWolf = [...checks].some(([j, w]) => w && alive[j]);
    const pm = marginal(null); const liv = livingIdx();
    const threatened = argmaxOf(pm, liv) === seerIdx;
    if (!seerClaimed && !foundWolf && !threatened) return;
    const first = !seerClaimed;
    if (first) st.seerClaim = 1;
    seerClaimed = true;
    claimFrom(seerClaimants, seerIdx, first);
    for (const [j, w] of checks) if (!announced.has(j)) { announced.add(j); seerStatement(seerIdx, j, w); }
    if (first && r() < 0.5) { // a wolf counterclaims and accuses the real Seer
      const wolves = liv.filter((j) => isW(j) && j !== silenced && !isMuted(j));
      if (wolves.length) { st.counter = 1; const c = pickOne(r, wolves); claimFrom(seerClaimants, c, true); seerStatement(c, seerIdx, true); }
    }
  }

  function vote() {
    const ghosts = todayEvent && (ev === 'seance' || ev === 'restless') ? [...Array(n).keys()].filter((j) => !alive[j])
      : todayEvent && ev === 'restlessVoted' ? [...votedOut] : []; // variant: only the voted-out dead rise
    const voters = shuffle(r, [...livingIdx(), ...ghosts]);
    const bloc = frameTarget();
    const tally = new Map(); const votes = [];
    const open = todayEvent && (ev === 'open' || (ev === 'ballot' && ballotKind === 'open'));
    const mine = new Map();
    for (const v of voters) {
      let t;
      if (isDumb(v)) {
        const c = livingIdx().filter((j) => j !== v);
        t = c.length ? pickOne(r, c) : null;
      } else if (isW(v)) {
        t = bloc;
        if (open && tally.size) {
          const max = Math.max(...tally.values()); const leaders = [...tally].filter(([, c]) => c === max).map(([j]) => j);
          if (leaders.length === 1 && !isW(leaders[0]) && leaders[0] !== v) t = leaders[0];
          else if (leaders.length === 1 && isW(leaders[0])) { // make a tie so nobody goes out
            const tier = [...tally].filter(([j, c]) => c === max - 1 && !isW(j) && j !== v).map(([j]) => j);
            if (tier.length) t = tier[0];
          }
        }
      } else {
        t = villagePoint(v);
        if (open && tally.size && t != null) {
          const max = Math.max(...tally.values()); const leaders = [...tally].filter(([, c]) => c === max).map(([j]) => j);
          if (leaders.length === 1 && leaders[0] !== t && leaders[0] !== v) {
            const m = mine.get(v) ?? marginal(v); mine.set(v, m);
            if (m[leaders[0]] >= 0.6 * m[t]) t = leaders[0];
          }
        }
      }
      if (t == null || !alive[t] || t === v) continue;
      const wgt = todayEvent && ev === 'mayor' && v === mayor ? 2 : 1;
      tally.set(t, (tally.get(t) ?? 0) + wgt); votes.push([v, t]);
    }
    if (!(todayEvent && (ev === 'secret' || (ev === 'ballot' && ballotKind === 'secret')))) for (const [v, t] of votes) pubAdd((h) => (inH(h, v) && inH(h, t) ? LOG_BUS : 0));
    const max = Math.max(0, ...tally.values()); const top = [...tally].filter(([, c]) => c === max);
    if (top.length === 1) kill(top[0][0], 'vote');
  }

  function rollEvent() {
    todayEvent = false; mayor = null; silenced = null;
    if (!ev || fired || (o.eventDay != null && st.days !== o.eventDay) || er() >= o.eventChance) return;
    const liv = livingIdx(); const wl = liv.filter(isW).length;
    const close = wl >= liv.length - wl - 1;
    if (ev === 'mayor' && (liv.length < 6 || close)) return;
    fired = true; todayEvent = true; st.eventDay = st.days;
    switch (ev) {
      case 'horseshoe': case 'horseshoeClaimed':
        charm = pickOne(er, liv);
        if (ev === 'horseshoeClaimed' && !isW(charm)) charmClaimed = true; // the holder claims; wolves leave them alone
        break;
      case 'rumor': case 'rumorFakes': case 'rumorNoisy': case 'rumor3': {
        // rumor: true pair bit. rumorFakes: a wolf fakes one almost every time. rumorNoisy: the pair bit is
        // only right 70% of the time (nobody knows which). rumor3: "at least one of A, B, C is a wolf".
        const rec = pickOne(er, liv);
        const others = liv.filter((j) => j !== rec);
        if (others.length < 3) break;
        const acc = ev === 'rumorNoisy' ? 0.7 : 1;
        const soft = (ok) => (ok ? Math.log(acc) : acc === 1 ? -Infinity : Math.log(1 - acc));
        let fact; // log-factor over wolf sets for the statement, if the claimant is honest
        if (ev === 'rumor3') {
          const trip = shuffle(er, others).slice(0, 3);
          if (!trip.some(isW)) { const w = others.find(isW); if (w != null) trip[0] = w; } // must be true
          fact = (h) => (trip.some((j) => inH(h, j)) ? 0 : -Infinity);
        } else {
          const [a, b] = shuffle(er, others);
          let same = isW(a) === isW(b);
          if (er() >= acc) same = !same;
          fact = (h) => soft((inH(h, a) === inH(h, b)) === same);
        }
        const L = liv.length; const Wa = liv.filter(isW).length;
        const fp = ev === 'rumorFakes' ? [0.95, 0.9] : [0.6, 0.25];
        const RQ = o.rumorQ === 'naive' ? LOG_Q : Math.log(fp[0] + fp[1] * L / Wa);
        const honest = (c, f) => pubAdd((h) => (inH(h, c) ? 0 : Math.max(f(h), LOG_EPS)));
        if (!isW(rec)) { rumorPriv[rec].push(fact); claimFrom(rumorClaimants, rec, true, RQ); honest(rec, fact); }
        const fakeP = fp;
        const fakers = liv.filter((j) => isW(j) && (j === rec ? er() < fakeP[0] : er() < fakeP[1]));
        for (const f of fakers.slice(0, 1)) {
          const vill = shuffle(er, livingNonWolves());
          if (vill.length < 3) break;
          claimFrom(rumorClaimants, f, true, RQ);
          if (ev === 'rumor3') honest(f, (h) => (vill.slice(0, 3).some((j) => inH(h, j)) ? 0 : -Infinity));
          else honest(f, (h) => soft(inH(h, vill[0]) !== inH(h, vill[1]))); // frame two villagers
        }
        break;
      }
      case 'letter': case 'letterSmart': {
        const au = pickOne(er, liv);
        const W_ = ev === 'letterSmart' ? 'letterSW' : 'letterW'; const C_ = ev === 'letterSmart' ? 'letterSC' : 'letterC';
        if (isW(au) && ev === 'letterSmart') pointSignal(W_, seerClaimed && alive[seerIdx] ? seerIdx : frameTarget());
        else if (isW(au)) {
          const pm = marginal(null); const mates = liv.filter((j) => isW(j) && j !== au);
          const sus = mates.length ? argmaxOf(pm, mates) : null;
          if (sus != null && pm[sus] === Math.max(...liv.map((j) => pm[j])) && er() < 0.5) pointSignal(C_, sus);
          else pointSignal(W_, seerClaimed && alive[seerIdx] ? seerIdx : frameTarget());
        } else if (au === seerIdx && [...checks].some(([j, w]) => w && alive[j])) {
          pointSignal(W_, [...checks].find(([j, w]) => w && alive[j])[0]);
        } else if (au === seerIdx && [...checks].some(([j, w]) => !w && alive[j])) {
          pointSignal(C_, [...checks].find(([j, w]) => !w && alive[j])[0]); // vouch for a checked player
        } else if (er() < 0.3) {
          const m = marginal(au); const c = liv.filter((j) => j !== au);
          pointSignal(C_, argminOf(m, c)); // vouch for the player they trust most
        } else pointSignal(W_, villagePoint(au));
        break;
      }
      case 'whispers': whispersTonight = true; break;
      case 'lastwords': case 'lastwordsVote': lastWordsArmed = true; break;
      case 'mayor': mayor = pickOne(er, liv); break;
      case 'ballot': ballotKind = er() < 0.5 ? 'open' : 'secret'; break;
      case 'silence': silenced = pickOne(er, liv); break;
      default: break; // seance, secret, open act during the vote
    }
  }

  // ---------- loop ----------
  let day = 0; let win = null;
  for (;;) {
    night(day);
    if ((win = winner())) break;
    day++; st.days = day;
    if (whisperNames) { for (const j of whisperNames) pointSignal('whisper', j); whisperNames = null; }
    rollEvent();
    seerClaims();
    tells();
    vote();
    if ((win = winner())) break;
    if (day > 40) { win = 'stall'; break; }
  }
  return { win, days: day, fired, eventDay: st.eventDay, blocked: st.blocked, st, deaths, wolf: roles.map((x) => x === 'wolf') };
}
