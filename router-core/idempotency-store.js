class IdempotencyStore {
  constructor(ttlMs = 60 * 60 * 1000, cleanupIntervalMs = 5 * 60 * 1000) {
    this.store = new Map();
    this.ttlMs = ttlMs;
    setInterval(() => this._cleanup(), cleanupIntervalMs).unref();
  }

  checkAndSet(key) {
    const now = Date.now();
    const existing = this.store.get(key);
    if (existing !== undefined && now - existing <= this.ttlMs) return false;
    this.store.set(key, now);
    return true;
  }

  _cleanup() {
    const now = Date.now();
    for (const [k, ts] of this.store) {
      if (now - ts > this.ttlMs) this.store.delete(k);
    }
  }

  clear() { this.store.clear(); }
}

export default new IdempotencyStore();
