class DailyAiQuota {
  constructor({ db, log = console, maxPerDay = 18 }) {
    this.db = db;
    this.log = log;
    this.maxPerDay = maxPerDay;
    this.collection = "systemMetrics";
    this.docPrefix = "geminiUsage_";
  }

  _dayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _docRef(dayKey = this._dayKey()) {
    return this.db.collection(this.collection).doc(`${this.docPrefix}${dayKey}`);
  }

  async reserveSlot() {
    const dayKey = this._dayKey();
    const ref = this._docRef(dayKey);

    const result = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const currentCount = snap.exists ? Number(snap.data().count || 0) : 0;

      if (currentCount >= this.maxPerDay) {
        return { allowed: false, count: currentCount };
      }

      const nextCount = currentCount + 1;
      tx.set(
        ref,
        {
          count: nextCount,
          dayKey,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return { allowed: true, count: nextCount };
    });

    if (!result.allowed) {
      this.log.warn(`[meal-tagging] Gemini daily quota exhausted (${result.count}/${this.maxPerDay})`);
    }

    return result;
  }

  async getUsage() {
    const snap = await this._docRef().get();
    return snap.exists ? Number(snap.data().count || 0) : 0;
  }
}

module.exports = { DailyAiQuota };