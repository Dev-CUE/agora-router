const DEFAULT_TTL_MS = 60 * 60 * 1000;

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  getTtlMs(ttlMs) {
    return Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  }

  sweepExpired(ttlMs = DEFAULT_TTL_MS) {
    const cutoff = Date.now() - this.getTtlMs(ttlMs);
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.updatedAt < cutoff) {
        this.sessions.delete(sessionId);
      }
    }
  }

  getCounts(sessionId, ttlMs = DEFAULT_TTL_MS) {
    if (!sessionId) return {};

    this.sweepExpired(ttlMs);
    const session = this.sessions.get(sessionId);
    if (!session) return {};

    session.updatedAt = Date.now();
    return { ...session.speaker_counts };
  }

  setCounts(sessionId, speakerCounts, ttlMs = DEFAULT_TTL_MS) {
    if (!sessionId) return { ...speakerCounts };

    this.sweepExpired(ttlMs);
    const counts = { ...speakerCounts };
    this.sessions.set(sessionId, {
      speaker_counts: counts,
      updatedAt: Date.now()
    });
    return { ...counts };
  }

  increment(sessionId, speakerId, ttlMs = DEFAULT_TTL_MS) {
    const counts = this.getCounts(sessionId, ttlMs);
    counts[speakerId] = (counts[speakerId] ?? 0) + 1;
    return this.setCounts(sessionId, counts, ttlMs);
  }

  clear(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
  }

  clearAll() {
    this.sessions.clear();
  }
}

export default new SessionStore();
