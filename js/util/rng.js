// Seedable RNG (mulberry32). rng() -> [0,1). rng.getState()/setState() allow
// saving and resuming the sequence (used by host resume in milestone 4).
export function createRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState = () => s;
  rng.setState = (v) => { s = v >>> 0; };
  return rng;
}

export function randInt(rng, min, max) { // inclusive
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
