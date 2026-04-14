class MealTagCache {
  constructor({ ttlMs = 6 * 60 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(mealId, signature) {
    const entry = this.store.get(mealId);
    if (!entry) {
      return null;
    }

    if (signature && entry.signature !== signature) {
      return null;
    }

    if (Date.now() - entry.updatedAt > this.ttlMs) {
      this.store.delete(mealId);
      return null;
    }

    return entry;
  }

  set(mealId, signature, payload) {
    const entry = {
      mealId,
      signature,
      payload,
      updatedAt: Date.now(),
    };

    this.store.set(mealId, entry);
    return entry;
  }

  clear(mealId) {
    this.store.delete(mealId);
  }

  clearAll() {
    this.store.clear();
  }
}

module.exports = { MealTagCache };