// localStorage wrapper: every call guarded; falls back to memory (private browsing).
const mem = new Map();
export const storage = {
  get(key) {
    try { const v = localStorage.getItem(key); return v == null ? null : JSON.parse(v); }
    catch { return mem.has(key) ? mem.get(key) : null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { mem.set(key, val); }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    mem.delete(key);
  },
};
