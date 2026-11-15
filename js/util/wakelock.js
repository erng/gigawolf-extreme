let lock = null; let wanted = false; let tipShown = false;

async function acquire(onUnsupported) {
  if (!('wakeLock' in navigator)) {
    if (!tipShown) { tipShown = true; onUnsupported?.(); }
    return;
  }
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener?.('release', () => { lock = null; });
  } catch { /* denied or hidden: retry on next visibility change */ }
}

export function keepAwake(onUnsupported) {
  wanted = true;
  if (!lock) acquire(onUnsupported);
}
export function releaseAwake() { wanted = false; try { lock?.release(); } catch {} lock = null; }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted && !lock) acquire();
  });
}
