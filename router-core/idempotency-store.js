class IdempotencyStore {
  constructor(ttlMs = 60 * 60 * 1000) {
    this.store = new Map();
    this.ttlMs = ttlMs;
  }

  checkAndSet(key) {
    const now = Date.now();

    for (const [k, ts] of this.store) {
      if (now - ts > this.ttlMs) this.store.delete(k);
    }

    if (this.store.has(key)) return false;
    this.store.set(key, now);
    return true;
  }

  clear() { this.store.clear(); }
}

export default new IdempotencyStore();
